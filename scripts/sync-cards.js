/**
 * DraGold - Card Sync Script
 * Risolve: immagini mancanti, set nuovi, versioni lingua mancanti.
 *
 * Fonti:
 *   Pokemon  -> TCGdex API (gratuita, multilingua, immagini incluse)
 *   MTG      -> Scryfall API (gratuita, set per set)
 *   YGO      -> YGOPRODeck API (gratuita)
 *   One Piece-> TCGdex API (serie "onepiece")
 *
 * Usage:
 *   node scripts/sync-cards.js [--tcg pokemon|mtg|ygo|op] [--lang en,ja,it,...] [--set sv3pt5]
 *                              [--force] [--force-detail] [--stale-days=N] [--dry-run] [--out=report.json]
 *   SUPABASE_URL e SUPABASE_SERVICE_KEY devono essere in env.
 *
 * ============================================================================
 * PIPELINE POKEMON (TCGdex) — HARDENING, vedi PRODUCT_SPEC/CLAUDE.md §8:
 * ============================================================================
 *
 * Ingestion a DUE STADI, mai uno solo (requisito 1 del task di hardening):
 *   1. DISCOVERY — `GET /v2/{lang}/sets/{id}` (già una chiamata sola per set,
 *      invariato). La risposta espone `cards[]` come CardBrief
 *      (https://tcgdex.dev/reference/card-brief): SOLO `id`,`localId`,`name`,
 *      `image`. Non contiene `rarity`/`variants`/`illustrator`/`category` in
 *      modo garantito — non lo si assume mai (era un bug della versione
 *      precedente di questo script, che leggeva `c.rarity` direttamente dal
 *      CardBrief).
 *   2. ENRICHMENT — `GET /v2/{lang}/cards/{id}` (Card completo, vedi
 *      https://tcgdex.dev/reference/card), chiamata SOLO quando serve
 *      davvero: carta nuova, metadata mancanti (rarity/illustrator null in
 *      DB), o `--force-detail`/`--stale-days` espliciti (requisito 2). Non si
 *      ri-scarica mai una carta già completa "perché sì".
 *
 * Logica di merge/diff/classificazione è in `scripts/lib/pokemon-sync.js`
 * (funzioni pure, testate in `scripts/lib/__tests__/pokemon-sync.test.js`) —
 * qui dentro c'è solo l'orchestrazione I/O (fetch + Supabase).
 *
 * Protezioni attive (vedi anche pokemon-sync.js):
 *   - MAI scrittura di `canonical_card_id` o altri campi `canonical_*`: non
 *     letti dalle righe esistenti oltre a MANAGED_FIELDS, non scritti nel
 *     payload upsert. `assertNoCanonicalFields` lancia un errore rumoroso se
 *     mai un campo canonical_* finisse nel payload — difesa attiva, non solo
 *     una promessa nei commenti.
 *   - Un campo assente/null nel payload TCGdex NON cancella mai un valore
 *     valido già in DB (`mergeRow`, scelta deliberatamente conservativa —
 *     vedi commento su `buildIncomingFromDetail`).
 *   - `print_variant`: MAI la vecchia serializzazione "normal,reverse"
 *     (scartata esplicitamente). Scritto solo quando la fonte dichiara
 *     esattamente UNA variante attiva; se ne dichiara più di una, il gap è
 *     documentato come warning nel report e il campo resta invariato — lo
 *     schema attuale (una riga per carta/lingua/fonte) non può rappresentare
 *     correttamente più finish disponibili sulla stessa riga, e non creiamo
 *     una migration per risolverlo qui.
 *
 * --force        : bypassa lo skip-se-già-completo A LIVELLO DI SET (vedi
 *                   countInDb/totalCards) — serve a rientrare in un set che il
 *                   conteggio righe considera già completo, per ri-valutare
 *                   le sue carte una per una (il merge/diff decide comunque
 *                   cosa cambia davvero, non forza scritture cieche).
 * --force-detail : forza il fetch "detail" (stadio 2) per OGNI carta
 *                   incontrata in questa run, anche se già completa in DB —
 *                   backfill/verifica mirata, non l'impostazione di default.
 * --stale-days=N : oltre a "nuova"/"incompleta", considera da ri-arricchire
 *                   anche una carta la cui riga non viene aggiornata da più
 *                   di N giorni (`cards.updated_at`). Assente di default:
 *                   nessuna nozione implicita di "scaduto" finché non è
 *                   esplicitamente richiesta.
 * --dry-run      : fetch -> normalize -> confronto con DB -> report. ZERO
 *                   scritture su Supabase. Il report classifica ogni carta
 *                   come NEW / UPDATED / UNCHANGED / BLOCKED e per UPDATED
 *                   elenca i campi cambiati con valore prima/dopo.
 * --out=file     : scrive anche il report completo (tutte le entry, non solo
 *                   il riepilogo troncato in console) su file locale JSON.
 */

import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'
import {
  MANAGED_FIELDS,
  buildCardId,
  mergeRow,
  needsDetailFetch,
  isIncompleteRow,
  computeNullProtection,
  buildIncomingFromBrief,
  buildIncomingFromDetail,
  buildDiffReportEntry,
  buildBlockedEntry,
  assertNoCanonicalFields,
  processSupabaseReadResult,
  SupabaseReadError,
} from './lib/pokemon-sync.js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: SUPABASE_URL e SUPABASE_SERVICE_KEY mancanti')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const BATCH_SIZE   = 100
const DELAY_MS     = 120
const PKM_LANGS    = ['en','ja','it','fr','de','es','pt','id']
// Override solo per verifiche locali (smoke test contro un mock HTTP, mai in
// produzione — nessun workflow/env di produzione imposta questa variabile).
const TCGDEX_BASE  = process.env.TCGDEX_BASE_OVERRIDE || 'https://api.tcgdex.net/v2'
const SCRYFALL_BASE= 'https://api.scryfall.com'
const YGOPRO_BASE  = 'https://db.ygoprodeck.com/api/v7'

const args = process.argv.slice(2)
const argTcg  = args.find(a => a.startsWith('--tcg='))?.split('=')[1]
const argLang = args.find(a => a.startsWith('--lang='))?.split('=')[1]?.split(',')
const argSet  = args.find(a => a.startsWith('--set='))?.split('=')[1]
const argForce  = args.includes('--force')
const argForceDetail = args.includes('--force-detail')
const argStaleDaysRaw = args.find(a => a.startsWith('--stale-days='))?.split('=')[1]
const argStaleDays = argStaleDaysRaw != null && argStaleDaysRaw !== '' ? Number(argStaleDaysRaw) : null
const argOut    = args.find(a => a.startsWith('--out='))?.split('=')[1]
const DRY_RUN   = args.includes('--dry-run')

const TCG_FILTER  = argTcg  ? argTcg.split(',') : ['pokemon','mtg','ygo','onepiece']
const LANG_FILTER = argLang || PKM_LANGS

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function safeFetch(url, timeout = 15000) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeout) })
    if (!r.ok) return null
    return r.json()
  } catch { return null }
}

async function upsertBatch(rows) {
  if (!rows.length) return
  if (DRY_RUN) return
  const { error } = await supabase.from('cards').upsert(rows, { onConflict: 'id', ignoreDuplicates: false })
  if (error) console.warn('  upsert error:', error.message)
}

async function countInDb(setId, lang) {
  const { count } = await supabase.from('cards').select('id', { count: 'exact', head: true }).eq('set_id', setId).eq('lang', lang).eq('tcg', 'pokemon')
  return count || 0
}

/**
 * Legge in un colpo solo (per set+lingua, non per carta) le righe già in DB
 * per poter fare merge/diff senza una query per carta. Seleziona
 * MANAGED_FIELDS + identity + updated_at, più `canonical_card_id` in SOLA
 * LETTURA a scopo diagnostico (task "DRY-RUN SAFETY + REPORT HARDENING",
 * requisito 6: sapere se una carta ha già un canonical_card_id serve al
 * report — `canonicalProtected` — ma quel campo non deve mai finire nella Map
 * usata per il merge). `processSupabaseReadResult` (pura, in pokemon-sync.js)
 * lo rimuove subito dalla riga prima di metterla in `map` e lo tiene solo
 * nel secondo valore ritornato, `canonicalIds`.
 *
 * SICUREZZA (requisito 1 — CRITICAL SAFETY FIX): un errore Supabase qui NON
 * significa più "nessuna riga esistente". Prima di questo task, `if (error) {
 * console.warn(...); return new Map() }` trasformava silenziosamente un
 * fallimento infrastrutturale in "questo set non ha carte", classificando poi
 * ogni carta incontrata come NEW — il comportamento esattamente vietato dal
 * task. Ora `processSupabaseReadResult` lancia `SupabaseReadError` se
 * `error` è presente: la funzione NON intercetta quell'eccezione, la lascia
 * propagare fino a `syncPokemon()` e da lì al catch di livello top (fondo
 * file), che interrompe l'intero run (BLOCKED_RUN) prima che qualunque
 * upsert possa partire per questo o per i set successivi.
 *
 * @param {string} setId
 * @param {string} lang
 * @returns {Promise<{map: Map<string, object>, canonicalIds: Set<string>}>}
 * @throws {SupabaseReadError} se la lettura Supabase fallisce
 */
async function fetchExistingRowsForSet(setId, lang) {
  const columns = ['id', ...MANAGED_FIELDS, 'updated_at', 'canonical_card_id'].join(',')
  const { data, error } = await supabase
    .from('cards')
    .select(columns)
    .eq('tcg', 'pokemon').eq('set_id', setId).eq('lang', lang)
  return processSupabaseReadResult(data, error, { setId, lang })
}

/**
 * Stadio 2 — fetch del Card completo per una singola carta
 * (https://tcgdex.dev/reference/card). Chiamato solo da needsDetailFetch()
 * in poi, mai in massa.
 */
async function fetchCardDetail(lang, setId, localId) {
  return safeFetch(`${TCGDEX_BASE}/${lang}/cards/${setId}-${localId}`)
}

/**
 * Elabora un intero set (per una lingua): discovery (già fetchata dal
 * chiamante come `setData`), lettura righe esistenti, decisione detail
 * carta-per-carta, merge, classificazione. Ritorna le entry di report e (se
 * non dry-run) i batch pronti per l'upsert — separati così il chiamante può
 * decidere se scrivere o solo riportare, senza duplicare la logica.
 *
 * @returns {Promise<{entries: object[], rowsToWrite: object[], detailFetchCount: number, detailFailCount: number}>}
 */
async function processSetCards(setMeta, setData, lang) {
  const setId = setMeta.id
  const { map: existingMap, canonicalIds } = await fetchExistingRowsForSet(setId, lang)
  const briefs = (setData.cards || []).filter(c => c.localId && c.name)

  const entries = []
  const rowsToWrite = []
  let detailFetchCount = 0
  let detailFailCount = 0

  for (const brief of briefs) {
    const id = buildCardId(setId, brief.localId, lang)
    const existingRow = existingMap.get(id) || null
    const existed = Boolean(existingRow)
    const incomplete = isIncompleteRow(existingRow)
    const canonicalProtected = canonicalIds.has(id)

    const wantsDetail = needsDetailFetch(existingRow, {
      forceDetail: argForceDetail,
      staleDays: argStaleDays,
    })

    const incomingBrief = buildIncomingFromBrief(brief, setMeta, setData)
    let incomingDetail = {}
    let detailFetched = false

    if (wantsDetail) {
      await sleep(DELAY_MS)
      const fullCard = await fetchCardDetail(lang, setId, brief.localId)
      detailFetchCount++
      if (!fullCard) {
        // Fetch fallito: NON tocchiamo questa carta in questo giro. Nessun
        // merge, nessun upsert — la riga esistente (se c'è) resta esattamente
        // com'era, esplicitamente riportata come BLOCKED così il gap è
        // visibile invece di sparire silenziosamente in un "UNCHANGED".
        detailFailCount++
        entries.push(buildBlockedEntry(id, { existed, incomplete, canonicalProtected }))
        continue
      }
      incomingDetail = buildIncomingFromDetail(fullCard)
      detailFetched = true
    }

    const incoming = { ...incomingBrief, ...incomingDetail }
    const { nullProtected } = computeNullProtection(existingRow, incoming)
    const merged = mergeRow(existingRow, incoming, { id, lang, tcg: 'pokemon' })
    const entry = buildDiffReportEntry(id, existingRow, merged, {
      printVariantInfo: incomingDetail._printVariantInfo,
      detailFetched,
      detailFetchRequired: wantsDetail,
      canonicalProtected,
      nullProtected,
      existed,
      incomplete,
    })
    entries.push(entry)

    if (entry.classification !== 'UNCHANGED') rowsToWrite.push(merged)
  }

  return { entries, rowsToWrite, detailFetchCount, detailFailCount }
}

async function syncPokemon() {
  console.log('\nSincronizzazione Pokemon (TCGdex) — discovery + enrichment a due stadi...')
  const sets = await safeFetch(`${TCGDEX_BASE}/en/sets`)
  if (!Array.isArray(sets)) { console.warn('  TCGdex sets non disponibile'); return }
  const setsToProcess = argSet ? sets.filter(s => s.id === argSet) : sets
  console.log(`  ${setsToProcess.length} set da processare`)

  const allEntries = []
  let totalDetailFetch = 0, totalDetailFail = 0

  for (const setMeta of setsToProcess) {
    // FIX: la lista set (/v2/{lang}/sets) restituisce SetBrief, dove `cardCount` è
    // un oggetto {total, official} (vedi https://tcgdex.dev/reference/set-brief),
    // non un numero. Il confronto precedente (`setMeta.cardCount || 0` usato poi
    // come numero in `existing >= totalCards`) confrontava sempre un intero con un
    // oggetto: risultato sempre `false` per via della coercion JS (mai uno skip
    // valido, mai un backfill mirato). Corretto leggendo `.total` esplicitamente.
    const setId = setMeta.id, totalCards = setMeta.cardCount?.total ?? 0
    for (const lang of LANG_FILTER) {
      // Lo skip a livello di SET (evitare del tutto la discovery) va bypassato
      // non solo con --force ma anche con --force-detail/--stale-days: quei
      // flag chiedono esplicitamente di rientrare nelle carte di un set già
      // "completo" per conteggio righe, per rivalutarle una per una.
      const bypassSetSkip = argForce || argForceDetail || argStaleDays != null
      if (!argSet && !bypassSetSkip) {
        const existing = await countInDb(setId, lang)
        if (existing >= totalCards && totalCards > 0) { process.stdout.write('.'); continue }
      }
      await sleep(DELAY_MS)
      const setData = await safeFetch(`${TCGDEX_BASE}/${lang}/sets/${setId}`)
      if (!setData?.cards?.length) continue

      const { entries, rowsToWrite, detailFetchCount, detailFailCount } = await processSetCards(setMeta, setData, lang)
      allEntries.push(...entries)
      totalDetailFetch += detailFetchCount
      totalDetailFail += detailFailCount

      for (let i = 0; i < rowsToWrite.length; i += BATCH_SIZE) await upsertBatch(rowsToWrite.slice(i, i + BATCH_SIZE))

      const counts = summarizeEntries(entries)
      console.log(`  ${DRY_RUN ? 'DRY' : 'OK'} ${setId} (${lang}): ${entries.length} carte — NEW ${counts.NEW} UPDATED ${counts.UPDATED} UNCHANGED ${counts.UNCHANGED} BLOCKED ${counts.BLOCKED} (detail fetch: ${detailFetchCount}, falliti: ${detailFailCount})`)
    }
  }

  await fixMissingImages()
  printPokemonReport(allEntries, { totalDetailFetch, totalDetailFail })
}

/**
 * Conta le entry di report per classificazione. Pura, usata sia nel log
 * per-set sia nel riepilogo finale.
 */
function summarizeEntries(entries) {
  const counts = { NEW: 0, UPDATED: 0, UNCHANGED: 0, BLOCKED: 0 }
  for (const e of entries) counts[e.classification] = (counts[e.classification] || 0) + 1
  return counts
}

/**
 * Riepilogo diagnostico aggregato (task "DRY-RUN SAFETY + REPORT HARDENING",
 * requisito 3). Pura: somma solo i flag già calcolati da `buildDiffReportEntry`
 * per ogni entry, non ricalcola nulla di nuovo. `source_conflicts` resta
 * sempre 0/non applicabile — nessuna seconda fonte è collegata in questo
 * task, e non lo si inventa qui.
 *
 * @param {object[]} entries
 * @returns {object}
 */
function summarizeDiagnostics(entries) {
  const s = {
    existing_cards: 0,
    incomplete_cards: 0,
    detail_fetch_required: 0,
    detail_fetch_skipped: 0,
    cards_with_variants: 0,
    variant_ambiguous: 0,
    source_conflicts: 0, // sempre 0: nessuna seconda fonte collegata in questo task
    canonical_protected: 0,
    null_protected: 0,
  }
  for (const e of entries) {
    if (e.existed) s.existing_cards++
    if (e.incomplete) s.incomplete_cards++
    if (e.detailFetchRequired) s.detail_fetch_required++
    if (e.detailFetchSkipped) s.detail_fetch_skipped++
    if (e.variantPresent) s.cards_with_variants++
    if (e.variantAmbiguous) s.variant_ambiguous++
    if (e.canonicalProtected) s.canonical_protected++
    if (e.nullProtected) s.null_protected++
  }
  return s
}

/**
 * Stampa il riepilogo finale della sync Pokemon (requisito 7): conteggi
 * NEW/UPDATED/UNCHANGED/BLOCKED, ed elenco (troncato in console, completo se
 * --out=file) delle UPDATED con campo/valore-prima/valore-dopo e delle
 * BLOCKED con motivo. Non scrive nulla — solo output.
 */
function printPokemonReport(entries, { totalDetailFetch, totalDetailFail }) {
  const counts = summarizeEntries(entries)
  const diagnostics = summarizeDiagnostics(entries)
  const warningsCount = entries.reduce((n, e) => n + (e.warnings?.length || 0), 0)

  console.log('\n  === Report Pokemon (TCGdex) ===')
  console.log(`  Modalita: ${DRY_RUN ? 'DRY-RUN (nessuna scrittura)' : 'WRITE'}`)
  console.log(`  Totale carte valutate: ${entries.length}`)
  console.log(`  NEW: ${counts.NEW}  UPDATED: ${counts.UPDATED}  UNCHANGED: ${counts.UNCHANGED}  BLOCKED: ${counts.BLOCKED}`)
  console.log(`  Fetch detail eseguiti: ${totalDetailFetch} (falliti: ${totalDetailFail})`)
  console.log(`  Warning non distruttivi (es. print_variant ambiguo): ${warningsCount}`)
  console.log('  --- Diagnostica ---')
  console.log(`  existing_cards: ${diagnostics.existing_cards}  incomplete_cards: ${diagnostics.incomplete_cards}`)
  console.log(`  detail_fetch_required: ${diagnostics.detail_fetch_required}  detail_fetch_skipped: ${diagnostics.detail_fetch_skipped}`)
  console.log(`  cards_with_variants: ${diagnostics.cards_with_variants}  variant_ambiguous: ${diagnostics.variant_ambiguous}`)
  console.log(`  source_conflicts: ${diagnostics.source_conflicts} (non applicabile — nessuna seconda fonte collegata)`)
  console.log(`  canonical_protected: ${diagnostics.canonical_protected}  null_protected: ${diagnostics.null_protected}`)

  const updated = entries.filter(e => e.classification === 'UPDATED')
  const blocked = entries.filter(e => e.classification === 'BLOCKED')
  const CONSOLE_CAP = 50

  if (updated.length) {
    console.log(`\n  --- UPDATED (prime ${Math.min(CONSOLE_CAP, updated.length)} di ${updated.length}) ---`)
    for (const e of updated.slice(0, CONSOLE_CAP)) {
      for (const c of e.changes) console.log(`  ${e.id} | ${c.field}: ${JSON.stringify(c.before)} -> ${JSON.stringify(c.after)}`)
      for (const w of e.warnings) console.log(`  ${e.id} | WARNING: ${w}`)
    }
  }
  if (blocked.length) {
    console.log(`\n  --- BLOCKED (prime ${Math.min(CONSOLE_CAP, blocked.length)} di ${blocked.length}) ---`)
    for (const e of blocked.slice(0, CONSOLE_CAP)) console.log(`  ${e.id} | ${e.reason || 'motivo non specificato'}`)
  }

  if (argOut) {
    const report = {
      mode: DRY_RUN ? 'DRY_RUN' : 'WRITE',
      generated_at: new Date().toISOString(),
      counts,
      diagnostics,
      totalDetailFetch, totalDetailFail, warningsCount,
      entries,
    }
    writeFileSync(argOut, JSON.stringify(report, null, 2), 'utf8')
    console.log(`\n  Report completo scritto su: ${argOut}`)
  }
}

async function fixMissingImages() {
  console.log('  Fix immagini mancanti...')
  let offset = 0, fixed = 0
  while (true) {
    const { data, error } = await supabase.from('cards').select('id, set_id, card_number, lang')
      .eq('tcg', 'pokemon').is('image_url', null).not('set_id', 'is', null).not('card_number', 'is', null).range(offset, offset + 199)
    if (error || !data?.length) break
    const updates = data.map(c => {
      const img = `https://assets.tcgdex.net/${c.lang}/${c.set_id}/${c.card_number}/high.webp`
      return { id: c.id, image_url: img, image_url_hi: img }
    })
    for (let i = 0; i < updates.length; i += BATCH_SIZE) await upsertBatch(updates.slice(i, i + BATCH_SIZE))
    fixed += data.length; offset += 200
    if (data.length < 200) break
  }
  if (fixed) console.log(`  OK ${fixed} immagini aggiornate`)
}

async function syncOnePiece() {
  console.log('=== Sync One Piece (Bandai EN + JP) ===')

  const BANDAI_EN = 'https://en.onepiece-cardgame.com'
  const BANDAI_JA = 'https://www.onepiece-cardgame.com'

  const EN_SERIES = [
    [569116,'OP-16','THE TIME OF BATTLE'],
    [569115,'OP-15','PILLARS OF STRENGTH (EB04)'],
    [569114,'OP-14','THE AZURE SEA SEVEN'],
    [569113,'OP-13','CARRYING ON HIS WILL'],
    [569112,'OP-12','LEGACY OF THE MASTER'],
    [569111,'OP-11','A FIST OF DIVINE SPEED'],
    [569110,'OP-10','ROYAL BLOOD'],
    [569109,'OP-09','EMPERORS IN THE NEW WORLD'],
    [569108,'OP-08','TWO LEGENDS'],
    [569107,'OP-07','500 YEARS IN THE FUTURE'],
    [569106,'OP-06','WINGS OF THE CAPTAIN'],
    [569105,'OP-05','AWAKENING OF THE NEW ERA'],
    [569104,'OP-04','KINGDOMS OF INTRIGUE'],
    [569103,'OP-03','PILLARS OF STRENGTH'],
    [569102,'OP-02','PARAMOUNT WAR'],
    [569101,'OP-01','ROMANCE DAWN'],
    [569030,'ST-30','Luffy & Ace'],
    [569029,'ST-29','Egghead'],
    [569028,'ST-28','Straw Hat Crew (2)'],
    [569027,'ST-27','Navy'],
    [569026,'ST-26','Seven Warlords (2)'],
    [569025,'ST-25','FILM RED'],
    [569024,'ST-24','Big Mom Pirates'],
    [569023,'ST-23','Rocks Pirates'],
    [569022,'ST-22','Supernovas'],
    [569021,'ST-21','Navy (2)'],
    [569020,'ST-20','Three Captains'],
    [569019,'ST-19','WORST GENERATION (2)'],
    [569018,'ST-18','Charlotte Katakuri'],
    [569017,'ST-17','FORMER MEMBER OF THE SEVEN WARLORDS'],
    [569016,'ST-16','ULTRA DECK: THE THREE CAPTAINS'],
    [569015,'ST-15','KINGDOM OF INTRIGUE'],
    [569014,'ST-14','3D2Y'],
    [569013,'ST-13','THE THREE BROTHERS'],
    [569012,'ST-12','ZORO & SANJI'],
    [569011,'ST-11','UTA'],
    [569010,'ST-10','NAVY ABSOLUTE FORCE'],
    [569009,'ST-09','YAMATO'],
    [569008,'ST-08','MONKEY.D.LUFFY'],
    [569007,'ST-07','NAVY HEADQUARTERS'],
    [569006,'ST-06','ABSOLUTE JUSTICE'],
    [569005,'ST-05','THE WORST GENERATION'],
    [569004,'ST-04','ANIMAL KINGDOM PIRATES'],
    [569003,'ST-03','THE SEVEN WARLORDS OF THE SEA'],
    [569002,'ST-02','WORST GENERATION'],
    [569001,'ST-01','STRAW HAT CREW'],
    [569203,'EB-03','ONE PIECE HEROINES EDITION'],
    [569202,'EB-02','Anime 25th Collection'],
    [569201,'EB-01','MEMORIAL COLLECTION'],
    [569302,'PRB-02','ONE PIECE CARD THE BEST vol.2'],
    [569301,'PRB-01','ONE PIECE CARD THE BEST'],
    [569901,'P','Promotion'],
    [569801,'OTHER','Other Product']
  ]

  const JA_SERIES = [
    ...EN_SERIES,
    [400401,'OP-17','(JP Only - OP17)'],
    [569204,'EB-04','EGGHEAD CRISIS']
  ]

  async function parseBandaiPage(baseUrl, seriesId, setCode, setName, lang) {
    const url = `${baseUrl}/cardlist/?series=${seriesId}`
    let html = ''
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 DraGold/1.0' } })
      if (!res.ok) return []
      html = await res.text()
    } catch (e) {
      console.error(`  FETCH ERROR ${setCode}: ${e.message}`)
      return []
    }

    const seen = new Set()
    const cards = []

    // Match each <dl class="modalCol"> block
    const dlRe = /<dl[^>]*class="[^"]*modalCol[^"]*"[^>]*>([sS]*?)<\/dl>/gi
    const spanRe = /<span[^>]*>([^<]*)<\/span>/gi
    const nameRe = /class="cardName"[^>]*>\s*([^<]+)/

    let dlMatch
    while ((dlMatch = dlRe.exec(html)) !== null) {
      const dtHtml = dlMatch[1]
      const spans = []
      let sm
      const spanReCopy = new RegExp(spanRe.source, 'gi')
      while ((sm = spanReCopy.exec(dtHtml)) !== null) spans.push(sm[1].trim())

      const cardNum = spans[0]
      const rarity   = spans[1] || null
      const supertype= spans[2] || null
      const nm = dtHtml.match(nameRe)
      const name = nm ? nm[1].trim() : null

      if (!cardNum || !name || !/^[A-Z0-9]/.test(cardNum)) continue
      const id = `onepiece:optcg:${cardNum}:${lang}`
      if (seen.has(id)) continue
      seen.add(id)

      const imgBase = lang === 'en' ? BANDAI_EN : BANDAI_JA
      cards.push({
        id,
        tcg: 'onepiece',
        source: 'optcg',
        source_id: cardNum,
        card_number: cardNum,
        set_id: setCode,
        set_name: setName,
        lang,
        name,
        name_en: lang === 'en' ? name : null,
        supertype,
        rarity,
        image_url: `${imgBase}/images/cardlist/card/${cardNum}.png`,
        image_url_hi: `${imgBase}/images/cardlist/card/${cardNum}.png`
      })
    }

    // Fallback: match <dt> blocks if no <dl> found
    if (cards.length === 0) {
      const dtRe = /<dt[\s\S]*?<\/dt>/gi
      let dtMatch2
      while ((dtMatch2 = dtRe.exec(html)) !== null) {
        const dtHtml2 = dtMatch2[0]
        const spans = []
        let sm2
        const spanReCopy2 = new RegExp(spanRe.source, 'gi')
        while ((sm2 = spanReCopy2.exec(dtHtml2)) !== null) spans.push(sm2[1].trim())

        const cardNum = spans[0]
        const rarity   = spans[1] || null
        const supertype= spans[2] || null
        const nm2 = dtHtml2.match(nameRe)
        const name = nm2 ? nm2[1].trim() : null

        if (!cardNum || !name || !/^[A-Z0-9]/.test(cardNum)) continue
        const id = `onepiece:optcg:${cardNum}:${lang}`
        if (seen.has(id)) continue
        seen.add(id)

        const imgBase = lang === 'en' ? BANDAI_EN : BANDAI_JA
        cards.push({
          id,
          tcg: 'onepiece',
          source: 'optcg',
          source_id: cardNum,
          card_number: cardNum,
          set_id: setCode,
          set_name: setName,
          lang,
          name,
          name_en: lang === 'en' ? name : null,
          supertype,
          rarity,
          image_url: `${imgBase}/images/cardlist/card/${cardNum}.png`,
          image_url_hi: `${imgBase}/images/cardlist/card/${cardNum}.png`
        })
      }
    }

    return cards
  }

  const isJA = process.argv.includes('--ja')
  const series = isJA ? JA_SERIES : EN_SERIES
  const lang = isJA ? 'ja' : 'en'
  const baseUrl = isJA ? BANDAI_JA : BANDAI_EN

  let totalSynced = 0

  for (const [seriesId, setCode, setName] of series) {
    try {
      const cards = await parseBandaiPage(baseUrl, seriesId, setCode, setName, lang)
      if (cards.length === 0) {
        console.log(`  SKIP ${setCode} - no cards found`)
        continue
      }

      // FIX (dry-run reale per One Piece): prima chiamava supabase.from('cards')
      // .upsert(...) direttamente, bypassando l'unico punto che rispetta DRY_RUN
      // (upsertBatch(), già usato da syncPokemon/syncMTG/syncYGO — vedi riga 137).
      // Risultato: --dry-run non proteggeva mai questo ramo, scriveva comunque su
      // Supabase. Ora riusa upsertBatch(): stesso onConflict:'id', stessa semantica
      // di scrittura quando DRY_RUN=false, ma nessuna scrittura quando DRY_RUN=true —
      // nessuna seconda implementazione del check.
      for (let i = 0; i < cards.length; i += BATCH_SIZE) {
        await upsertBatch(cards.slice(i, i + BATCH_SIZE))
      }
      console.log(`  ${DRY_RUN ? 'DRY' : 'OK'} OP ${lang.toUpperCase()} ${setCode}: ${cards.length} cards ${DRY_RUN ? 'parsed (dry-run, nessuna scrittura)' : 'synced'}`)
      totalSynced += cards.length
    } catch (e) {
      console.error(`  ERROR ${setCode}: ${e.message}`)
    }
    await sleep(DELAY_MS)
  }
  console.log(`One Piece sync done: ${totalSynced} cards processed`)
}

async function syncMTG() {
  console.log('\nSincronizzazione MTG (Scryfall)...')
  let totalNew = 0
  const setsData = await safeFetch(`${SCRYFALL_BASE}/sets`)
  if (!setsData?.data) { console.warn('  Scryfall sets non disponibile'); return }
  const validTypes = ['core','expansion','masters','draft_innovation','commander','starter','funny']
  const sets = setsData.data.filter(s => validTypes.includes(s.set_type))
  const setsToProcess = argSet ? sets.filter(s => s.code === argSet) : sets
  console.log(`  ${setsToProcess.length} set da processare`)
  for (const set of setsToProcess) {
    const setCode = set.code
    if (!argSet) {
      const { count } = await supabase.from('cards').select('id', { count: 'exact', head: true }).eq('set_id', setCode).eq('tcg', 'mtg')
      if ((count || 0) >= set.card_count * 0.9) { process.stdout.write('.'); continue }
    }
    let page = 1, hasMore = true, setCards = []
    while (hasMore) {
      await sleep(100)
      const data = await safeFetch(`${SCRYFALL_BASE}/cards/search?q=set:${setCode}&order=set&page=${page}&unique=prints`)
      if (!data?.data?.length) break
      for (const c of data.data) {
        if (!c.name || c.layout === 'art_series' || c.layout === 'token') continue
        const imgUri = c.image_uris || c.card_faces?.[0]?.image_uris
        setCards.push({ id: `mtg:scryfall:${c.id}`, name: c.name, set_id: setCode, set_name: set.name,
          card_number: c.collector_number, rarity: c.rarity || null,
          image_url: imgUri?.normal || null, image_url_hi: imgUri?.large || null,
          lang: c.lang || 'en', tcg: 'mtg' })
      }
      hasMore = data.has_more; page++
    }
    if (!setCards.length) continue
    for (let i = 0; i < setCards.length; i += BATCH_SIZE) await upsertBatch(setCards.slice(i, i + BATCH_SIZE))
    totalNew += setCards.length
    console.log(`  OK ${setCode} (${set.name}): ${setCards.length} carte`)
  }
  console.log(`\n  MTG sync: +${totalNew} righe`)
}

async function syncYGO() {
  console.log('\nSincronizzazione YGO (YGOPRODeck)...')
  const data = await safeFetch(`${YGOPRO_BASE}/cardinfo.php?misc=yes`, 60000)
  if (!data?.data) { console.warn('  YGOPRODeck non disponibile'); return }
  const rows = data.data.map(c => {
    const s = c.card_sets?.[0]
    return { id: `ygo:ygoprodeck:${c.id}`, name: c.name,
      set_id: s?.set_code?.toLowerCase() || 'unknown', set_name: s?.set_name || 'Unknown',
      card_number: String(c.id), rarity: s?.set_rarity || null,
      image_url: c.card_images?.[0]?.image_url_small || null,
      image_url_hi: c.card_images?.[0]?.image_url || null,
      lang: 'en', tcg: 'ygo' }
  })
  let count = 0
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    await upsertBatch(rows.slice(i, i + BATCH_SIZE))
    count += Math.min(BATCH_SIZE, rows.length - i)
    if (count % 2000 === 0) console.log(`  YGO: ${count}/${rows.length}...`)
  }
  console.log(`  OK YGO sync: ${rows.length} carte`)
}

const start = Date.now()
console.log('DraGold Card Sync - start')
console.log(`   TCG: ${TCG_FILTER.join(', ')} | Set: ${argSet || 'tutti'} | Lingue: ${LANG_FILTER.join(', ')}`)
try {
  if (TCG_FILTER.includes('pokemon')) await syncPokemon()
  if (TCG_FILTER.includes('onepiece'))      await syncOnePiece()
  if (TCG_FILTER.includes('mtg'))     await syncMTG()
  if (TCG_FILTER.includes('ygo'))     await syncYGO()
} catch (err) {
  // Requisito 1 (CRITICAL SAFETY FIX): una lettura Supabase fallita durante
  // la sync Pokemon propaga fin qui come SupabaseReadError (mai come Map
  // vuota) e interrompe l'intero processo PRIMA di qualunque upsert per il
  // set/lingua in corso e per tutti quelli successivi non ancora processati.
  // Etichettato esplicitamente BLOCKED_RUN per essere distinguibile in log/CI
  // da un generico errore di programmazione.
  if (err instanceof SupabaseReadError || err?.name === 'SUPABASE_READ_FAILED') {
    console.error(`\nBLOCKED_RUN: ${err.message}`)
    console.error('Nessuna scrittura è stata effettuata per il set/lingua in corso o per quelli successivi.')
  } else {
    console.error('Errore critico:', err.message)
  }
  process.exit(1)
}
const elapsed = ((Date.now() - start) / 1000).toFixed(1)
console.log(`\nSync completato in ${elapsed}s`)
