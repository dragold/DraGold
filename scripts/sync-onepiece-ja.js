/**
 * DraGold — One Piece JA: enrichment da fonte ufficiale
 *
 * Colma il gap descritto in DraGold_Patrimonio_Dati_TCG_Report.md: le righe
 * One Piece con lang='ja' create da scripts/sync-full.js hanno oggi solo
 * l'immagine ufficiale + il NOME INGLESE come placeholder (la card list JA
 * derivava da optcgapi.com, che e' EN-only). Questo script sostituisce il
 * placeholder con dati reali presi direttamente dal sito ufficiale JP.
 *
 * Fonte: https://www.onepiece-cardgame.com/cardlist/?freewords={cardId}
 *   Verificato dal vivo (10/08/2026, vedi report):
 *   - GET semplice, HTML server-rendered, nessuna XHR/JSON separata.
 *   - Nessun robots.txt (404 = nessuna restrizione dichiarata).
 *   - Nessuna Cloudflare/JS challenge incontrata.
 *   - Il parametro "freewords" fa match esatto sull'ID carta se l'ID e'
 *     passato per intero (es. "OP01-001"): risultato piccolo e controllato,
 *     non l'intero catalogo.
 *   - "jp.onepiece-cardgame.com" (dominio citato nel commento originale di
 *     sync-full.js) risulta NON raggiungibile / non e' piu' il dominio
 *     corrente: il sito JP ufficiale oggi e' www.onepiece-cardgame.com,
 *     che NON blocca le richieste semplici.
 *
 * Cosa scrive:
 *   - name (SOLO se il valore attuale e' un placeholder EN riconoscibile —
 *     nessun carattere giapponese — o se --force e' passato)
 *   - rarity (SOLO se attualmente null: non sovrascrive mai un valore gia'
 *     presente, dato che non conosciamo con certezza la convenzione usata
 *     dalla pipeline EN esistente per questo campo)
 *   - metadata.ja_official: { source, source_url, fetched_at, cost_or_life,
 *     attribute, power, counter, color, block_icon, traits, effect_text,
 *     category, rarity_code, acquisition_sources, print_count,
 *     text_variants_detected, confidence }
 *
 * Cosa NON fa:
 *   - non inserisce nuove righe: aggiorna solo carte gia' presenti in
 *     `cards` con tcg='onepiece' lang='ja' (l'inserimento resta compito di
 *     sync-full.js — questo script arricchisce, non popola da zero).
 *   - non tocca mai `image_url` (gia' corretto: CDN ufficiale via
 *     sync-full.js) ne' righe con lang diverso da 'ja'.
 *   - non fa scraping "di massa" per numero di pagina: interroga una carta
 *     alla volta con --delay tra le richieste (default 3.5s).
 *
 * Usage:
 *   node scripts/sync-onepiece-ja.js --test-fetch=OP01-001   Smoke test:
 *       una sola richiesta reale, stampa il risultato parsato, NESSUNA
 *       connessione al DB. Da eseguire per primo in un ambiente con rete
 *       vera prima di qualunque run massivo (vedi report, sezione Test).
 *   node scripts/sync-onepiece-ja.js --dry-run --limit=20      Verifica
 *       cosa verrebbe scritto, senza scrivere.
 *   node scripts/sync-onepiece-ja.js --set=OP-01               Solo un set.
 *   node scripts/sync-onepiece-ja.js --card=OP01-001,OP01-002  Carte specifiche.
 *   node scripts/sync-onepiece-ja.js --limit=200                Batch limitato.
 *   node scripts/sync-onepiece-ja.js --force                    Ri-arricchisce
 *       anche righe che sembrano gia' avere un nome JP reale.
 *
 * Env richiesti (tranne in modalita' --test-fetch):
 *   SUPABASE_URL (o VITE_SUPABASE_URL)
 *   SUPABASE_SERVICE_KEY
 */

import { parseCardListPage, collapseVariants } from './lib/onepiece-ja-parser.js'

const CARDLIST_BASE = 'https://www.onepiece-cardgame.com/cardlist/'
const DEFAULT_DELAY_MS = 3500
const FETCH_TIMEOUT_MS = 20000
const MAX_RETRIES = 2
const USER_AGENT = 'DraGold-Sync/1.0 (+https://dragold.org; enrichment bot, low-rate, one card per request)'

// Vero se il nome NON contiene alcun carattere giapponese (hiragana,
// katakana, kanji) — cioe' e' quasi certamente ancora il placeholder EN
// scritto dalla sync precedente (vedi sync-full.js: `name: c.card_name`
// EN usato anche per le righe lang='ja').
const JP_CHAR_RE = /[぀-ヿ㐀-鿿]/
function looksLikeEnPlaceholder(name) {
  if (!name) return true
  return !JP_CHAR_RE.test(name)
}

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const FORCE = args.includes('--force')
const argSet = args.find((a) => a.startsWith('--set='))?.split('=')[1] || null
const argCards = args.find((a) => a.startsWith('--card='))?.split('=')[1]
const argLimit = parseInt(args.find((a) => a.startsWith('--limit='))?.split('=')[1] || '0', 10)
const argDelay = parseInt(args.find((a) => a.startsWith('--delay='))?.split('=')[1] || String(DEFAULT_DELAY_MS), 10)
const argTestFetch = args.find((a) => a.startsWith('--test-fetch='))?.split('=')[1] || null

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (msg) => process.stdout.write(msg + '\n')

async function fetchCardListHtml(cardId, attempt = 0) {
  const url = `${CARDLIST_BASE}?freewords=${encodeURIComponent(cardId)}`
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
    })
    if (!res.ok) {
      log(`  HTTP ${res.status} -> ${url}`)
      return null
    }
    return await res.text()
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      const backoff = 1000 * (attempt + 1)
      log(`  fetch error (${err.message}), retry tra ${backoff}ms...`)
      await sleep(backoff)
      return fetchCardListHtml(cardId, attempt + 1)
    }
    log(`  fetch fallito dopo ${MAX_RETRIES} retry: ${err.message}`)
    return null
  }
}

/**
 * Recupera e normalizza i dati JP per una singola carta.
 * Ritorna null se la carta non e' stata trovata sul sito, o se l'ID
 * risultante non corrisponde esattamente a quello richiesto (protezione
 * contro match parziali imprevisti di "freewords").
 */
async function fetchCanonicalCard(cardId) {
  const html = await fetchCardListHtml(cardId)
  if (!html) return { ok: false, reason: 'fetch-failed' }

  const allEntries = parseCardListPage(html)
  const entries = allEntries.filter((e) => e.cardId === cardId)
  if (!entries.length) {
    return { ok: false, reason: allEntries.length ? 'id-mismatch' : 'not-found' }
  }

  const canonical = collapseVariants(entries)
  return { ok: true, canonical }
}

function buildMetadataPatch(existingMetadata, canonical, sourceUrl) {
  return {
    ...(existingMetadata || {}),
    ja_official: {
      source: 'onepiece-cardgame.com',
      source_url: sourceUrl,
      fetched_at: new Date().toISOString(),
      rarity_code: canonical.rarityCode,
      category: canonical.category,
      cost_or_life: canonical.costOrLife,
      attribute: canonical.attribute,
      power: canonical.power,
      counter: canonical.counter,
      color: canonical.color,
      block_icon: canonical.blockIcon,
      traits: canonical.traits,
      effect_text: canonical.effectText,
      acquisition_sources: canonical.acquisitionSources,
      print_count: canonical.printCount,
      text_variants_detected: canonical.textVariantsDetected,
      text_variants: canonical.textVariants,
      confidence: canonical.textVariantsDetected ? 'medium' : 'high',
    },
  }
}

async function testFetchMode(cardId) {
  log(`[test-fetch] Richiesta reale contro il sito ufficiale per: ${cardId}`)
  log(`[test-fetch] URL: ${CARDLIST_BASE}?freewords=${encodeURIComponent(cardId)}`)
  const result = await fetchCanonicalCard(cardId)
  if (!result.ok) {
    log(`[test-fetch] FALLITO: ${result.reason}`)
    process.exit(1)
  }
  log('[test-fetch] OK — dato parsato:')
  log(JSON.stringify(result.canonical, null, 2))
  log('\n[test-fetch] Nessuna scrittura DB in questa modalita\'.')
}

async function main() {
  if (argTestFetch) {
    await testFetchMode(argTestFetch)
    return
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('ERROR: SUPABASE_URL (o VITE_SUPABASE_URL) e SUPABASE_SERVICE_KEY richiesti.')
    console.error('       (per un test senza DB usa --test-fetch=OP01-001)')
    process.exit(1)
  }
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  log('===========================================')
  log('DraGold — One Piece JA enrichment (fonte ufficiale)')
  log('===========================================')
  log(`Avvio: ${new Date().toISOString()}`)
  log(`Dry-run: ${DRY_RUN ? 'si' : 'no'}  |  Force: ${FORCE ? 'si' : 'no'}  |  Delay: ${argDelay}ms`)
  if (argSet) log(`Filtro set: ${argSet}`)
  if (argCards) log(`Filtro carte: ${argCards}`)
  if (argLimit) log(`Limit: ${argLimit}`)
  log('')

  let query = supabase
    .from('cards')
    .select('id, source, source_id, card_number, set_id, name, rarity, metadata')
    .eq('tcg', 'onepiece')
    .eq('lang', 'ja')

  if (argSet) {
    const setCode = argSet.replace('-', '').toLowerCase()
    query = query.eq('set_id', setCode)
  }
  if (argCards) {
    const wanted = argCards.split(',').map((c) => c.trim()).filter(Boolean)
    query = query.in('card_number', wanted)
  }
  // Sovra-fetch quando c'e' un limit, perche' filtriamo i placeholder lato
  // client dopo aver scaricato le righe (vedi looksLikeEnPlaceholder).
  query = query.limit(argLimit && !FORCE ? Math.max(argLimit * 3, 200) : (argLimit || 5000))

  const { data: rows, error } = await query
  if (error) {
    console.error('Errore query Supabase:', error.message)
    process.exit(1)
  }
  if (!rows?.length) {
    log('Nessuna riga trovata con questi filtri.')
    return
  }

  let candidates = FORCE ? rows : rows.filter((r) => looksLikeEnPlaceholder(r.name))
  const skippedAlreadyGood = rows.length - candidates.length
  if (argLimit) candidates = candidates.slice(0, argLimit)

  log(`Righe trovate: ${rows.length}  |  Da arricchire: ${candidates.length}  |  Gia' con nome JP (skip): ${skippedAlreadyGood}`)
  log('')

  let enriched = 0
  let notFound = 0
  let idMismatch = 0
  let fetchFailed = 0
  let ambiguous = 0
  const errors = []

  for (const row of candidates) {
    const cardId = row.card_number
    if (!cardId) {
      log(`  [skip] ${row.id}: card_number mancante`)
      continue
    }

    await sleep(argDelay)
    process.stdout.write(`  ${cardId} ... `)

    const result = await fetchCanonicalCard(cardId)
    if (!result.ok) {
      if (result.reason === 'not-found') notFound++
      else if (result.reason === 'id-mismatch') idMismatch++
      else fetchFailed++
      log(result.reason)
      continue
    }

    const { canonical } = result
    if (canonical.textVariantsDetected) ambiguous++

    const patch = {
      metadata: buildMetadataPatch(row.metadata, canonical, `${CARDLIST_BASE}?freewords=${encodeURIComponent(cardId)}`),
    }
    if (canonical.name && (FORCE || looksLikeEnPlaceholder(row.name))) {
      patch.name = canonical.name
    }
    if (!row.rarity && canonical.rarityCode) {
      patch.rarity = canonical.rarityCode
    }

    log(`OK  name="${canonical.name}"  rarity=${canonical.rarityCode}  variants=${canonical.printCount}${canonical.textVariantsDetected ? ' [AMBIGUO: testo diverso tra stampe]' : ''}`)

    if (!DRY_RUN) {
      const { error: updErr } = await supabase.from('cards').update(patch).eq('id', row.id)
      if (updErr) {
        errors.push(`${row.id}: ${updErr.message}`)
        log(`    update error: ${updErr.message}`)
        continue
      }
    }
    enriched++
  }

  log('')
  log('===============================================')
  log('Riepilogo')
  log('===============================================')
  log(`Arricchite:            ${enriched}${DRY_RUN ? ' (dry-run, nessuna scrittura reale)' : ''}`)
  log(`Gia' buone (skip):     ${skippedAlreadyGood}`)
  log(`Non trovate sul sito:  ${notFound}`)
  log(`ID mismatch:           ${idMismatch}`)
  log(`Fetch falliti:         ${fetchFailed}`)
  log(`Ambigue (testo vario): ${ambiguous}  (salvate comunque, marcate confidence="medium")`)
  if (errors.length) {
    log(`Errori update: ${errors.length}`)
    errors.slice(0, 20).forEach((e) => log(`  - ${e}`))
  }
  log('===============================================')
}

main().catch((err) => {
  console.error('Errore fatale:', err)
  process.exit(1)
})
