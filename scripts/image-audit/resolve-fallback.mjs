#!/usr/bin/env node
/**
 * DraGold — Image Audit: resolver di recovery READ-ONLY, cascata multi-fonte.
 *
 * SOLA LETTURA/VERIFICA: nessuna scrittura su Supabase, nessun upsert. Per ogni carta con
 * un problema di immagine (URL mancante/404/bloccato — vedi crawl-results.ndjson), prova le
 * fonti alternative IN ORDINE e verifica ogni candidato via HTTP reale (stesso `probeUrl` del
 * crawler) prima di accettarlo. Non genera MAI un URL "indovinato": se una fonte non può
 * confermare via una risposta reale, si passa alla successiva.
 *
 * Cascata (stessa priorità già presente in scripts/lib/image-resolver.js, estesa):
 *   1. TCGdex — retry dello stesso URL (gestisce transient/cache CDN) + un secondo tentativo
 *      sulla variante 'low' invece di 'high' (nel caso 'high' manchi ma 'low' esista — non
 *      osservato nel campione di questa sessione, ma non costa nulla verificarlo).
 *   2. Scrydex — richiede SCRYDEX_API_KEY + SCRYDEX_TEAM_ID in env. Query per set+numero+lingua,
 *      poi verifica via HTTP l'URL immagine restituito prima di accettarlo.
 *   3. Pokémon TCG API (pokemontcg.io) — SOLO lang='en' (nessuna copertura JA, verificato in
 *      IMAGE_AUDIT_REPORT_v2.md §Scrydex/fonti). Richiede opzionalmente POKEMONTCG_API_KEY
 *      (funziona anche senza, con rate limit più basso).
 *   4. PokemonPriceTracker — richiede POKEMONPRICETRACKER_API_KEY in env.
 *
 * Ogni riga di output ha un `match_confidence` (HIGH/MEDIUM/LOW/NO_MATCH, vedi
 * match-confidence.mjs) — un LOW non deve MAI essere scritto in DB automaticamente:
 * questo script si ferma alla produzione del report, non scrive nulla.
 *
 * Usage:
 *   node scripts/image-audit/resolve-fallback.mjs \
 *     --broken=scripts/image-audit/data/crawl-results.ndjson \
 *     --cards=scripts/image-audit/data/cards-pokemon-en-ja.ndjson \
 *     --out=scripts/image-audit/data/resolve-results.ndjson
 */
import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { probeUrl } from './crawl-images.mjs'
import { scoreMatch } from './match-confidence.mjs'
import { fetchOptcgSet, OptcgSourceNotImplementedError } from '../lib/reconcile/sources/fetch-optcg.js'
import { fetchOnePieceBandaiSet, OnePieceBandaiFetchError } from '../lib/reconcile/sources/fetch-onepiece-ja.js'

const SCRYDEX_API_KEY = process.env.SCRYDEX_API_KEY || null
const SCRYDEX_TEAM_ID = process.env.SCRYDEX_TEAM_ID || null
const POKEMONTCG_API_KEY = process.env.POKEMONTCG_API_KEY || null
const PPT_API_KEY = process.env.POKEMONPRICETRACKER_API_KEY || null

const MAX_FETCH_ATTEMPTS = 4
const BASE_BACKOFF_MS = 500

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// 429/5xx sono transitori: ritentati con backoff esponenziale (Retry-After
// se presente) prima di dichiarare la fonte non disponibile per questa
// carta — stesso principio di scripts/lib/image-resolver.js.
async function safeJson(url, options, fetchImpl = fetch) {
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
    try {
      const res = await fetchImpl(url, options)
      if (res.ok) return { ok: true, status: res.status, json: await res.json() }
      const retryable = res.status === 429 || res.status >= 500
      if (!retryable || attempt === MAX_FETCH_ATTEMPTS) {
        return { ok: false, status: res.status, json: null }
      }
      const retryAfter = Number(res.headers.get('retry-after'))
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : BASE_BACKOFF_MS * 2 ** (attempt - 1)
      await sleep(delay)
    } catch (err) {
      if (attempt === MAX_FETCH_ATTEMPTS) {
        return { ok: false, status: null, json: null, error: err?.message || String(err) }
      }
      await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1))
    }
  }
}

/**
 * Stadio 1: retry TCGdex — stesso URL 'high', poi 'low' come variante.
 * @returns {Promise<{source: 'tcgdex_retry'|'tcgdex_low', url: string, verified: boolean}|null>}
 */
export async function tryTcgdexRetry(card, { fetchImpl = fetch } = {}) {
  const candidates = []
  if (card.image_url) candidates.push({ source: 'tcgdex_retry', url: card.image_url })
  if (card.image_url && card.image_url.includes('/high.')) {
    candidates.push({ source: 'tcgdex_low', url: card.image_url.replace('/high.', '/low.') })
  }
  for (const c of candidates) {
    const probe = await probeUrl(c.url, { fetchImpl, maxRetries: 1 })
    if (probe.classification === 'A' || probe.classification === 'B') {
      return { ...c, verified: true, probe }
    }
  }
  return null
}

/**
 * Stadio 2: Scrydex. Richiede credenziali; se assenti, ritorna null esplicito (skip, non errore)
 * — stesso pattern già in scripts/lib/image-resolver.js.
 */
export async function tryScrydex(card, { fetchImpl = fetch, apiKey = SCRYDEX_API_KEY, teamId = SCRYDEX_TEAM_ID } = {}) {
  if (!apiKey || !teamId) return { skipped: true, reason: 'SCRYDEX_API_KEY/SCRYDEX_TEAM_ID non configurate' }
  const lang = card.lang === 'ja' ? 'ja' : 'en'
  const q = encodeURIComponent(`number:"${card.card_number}" expansion.id:"${card.set_id}"`)
  const url = `https://api.scrydex.com/pokemon/v1/${lang}/cards?q=${q}&page_size=5`
  const { ok, json } = await safeJson(url, { headers: { 'X-Api-Key': apiKey, 'X-Team-ID': teamId } }, fetchImpl)
  if (!ok || !json?.data?.length) return null
  const hit = json.data[0]
  const imgUrl = hit?.images?.[0]?.large || hit?.images?.[0]?.medium || null
  if (!imgUrl) return null
  const probe = await probeUrl(imgUrl, { fetchImpl, maxRetries: 1 })
  if (probe.classification !== 'A' && probe.classification !== 'B') return null
  return {
    source: 'scrydex', url: imgUrl, verified: true, probe,
    candidateMeta: { name: hit.name, number: hit.number, set: hit.expansion?.name },
  }
}

/** Stadio 3: pokemontcg.io — solo EN. */
export async function tryPokemonTcgIo(card, { fetchImpl = fetch, apiKey = POKEMONTCG_API_KEY } = {}) {
  if (card.lang !== 'en') return { skipped: true, reason: 'pokemontcg.io copre solo EN' }
  const q = encodeURIComponent(`set.id:${card.set_id} number:${card.card_number}`)
  const url = `https://api.pokemontcg.io/v2/cards?q=${q}`
  const headers = apiKey ? { 'X-Api-Key': apiKey } : {}
  const { ok, json } = await safeJson(url, { headers }, fetchImpl)
  if (!ok || !json?.data?.length) return null
  const hit = json.data[0]
  const imgUrl = hit?.images?.large || hit?.images?.small || null
  if (!imgUrl) return null
  const probe = await probeUrl(imgUrl, { fetchImpl, maxRetries: 1 })
  if (probe.classification !== 'A' && probe.classification !== 'B') return null
  return { source: 'pokemontcg.io', url: imgUrl, verified: true, probe, candidateMeta: { name: hit.name, number: hit.number, set: hit.set?.name } }
}

/** Stadio 4: PokemonPriceTracker. */
export async function tryPokemonPriceTracker(card, { fetchImpl = fetch, apiKey = PPT_API_KEY } = {}) {
  if (!apiKey) return { skipped: true, reason: 'POKEMONPRICETRACKER_API_KEY non configurata' }
  const language = card.lang === 'ja' ? 'japanese' : 'english'
  const search = encodeURIComponent(card.name || '')
  const url = `https://www.pokemonpricetracker.com/api/v2/cards?search=${search}&language=${language}&limit=20&lightweight=true`
  const { ok, json } = await safeJson(url, { headers: { Authorization: `Bearer ${apiKey}` } }, fetchImpl)
  if (!ok || !json?.data?.length) return null
  const wanted = String(card.card_number || '').split('/')[0].replace(/^0+/, '')
  const hit = json.data.find(c => String(c.cardNumber || '').split('/')[0].replace(/^0+/, '') === wanted)
  if (!hit?.imageCdnUrl) return null
  const probe = await probeUrl(hit.imageCdnUrl, { fetchImpl, maxRetries: 1 })
  if (probe.classification !== 'A' && probe.classification !== 'B') return null
  return { source: 'pokemonpricetracker', url: hit.imageCdnUrl, verified: true, probe, candidateMeta: { name: hit.name, number: hit.cardNumber } }
}

// Cache di processo: un set OPTCG richiesto una volta serve tutte le carte
// broken di quel set nella stessa run, invece di rifare la stessa GET per
// ogni carta (resolveCard gira una carta alla volta).
const optcgSetCache = new Map()

/**
 * Stadio One Piece (EN): optcgapi.com, SOLO lang='en' (limite reale della
 * fonte, vedi header di fetch-optcg.js — nessun dato JA inventato spacciandolo
 * per EN). Per lang='ja' ritorna `skipped` esplicito: il fallback JA reale e'
 * lo stadio successivo, tryOnePieceJaBandai (scraping diretto, nessuna API
 * pubblica ha dati One Piece JA).
 */
export async function tryOptcgOnePiece(card, { fetchImpl = fetch } = {}) {
  if (card.tcg !== 'onepiece') return null
  if (card.lang !== 'en') {
    return { skipped: true, reason: 'optcgapi.com copre solo EN (vedi fetch-optcg.js); il fallback JA e\' lo stadio successivo (tryOnePieceJaBandai)' }
  }
  if (!card.set_id) return null

  let setResult = optcgSetCache.get(card.set_id)
  if (!setResult) {
    try {
      setResult = await fetchOptcgSet({ setId: card.set_id, lang: 'en', fetchImpl })
    } catch (err) {
      if (err instanceof OptcgSourceNotImplementedError) {
        return { skipped: true, reason: err.message }
      }
      return null // OptcgFetchError: fonte non disponibile per questo set, si passa oltre
    }
    optcgSetCache.set(card.set_id, setResult)
  }

  const hit = setResult.rows.find(r => r.card_number === card.card_number)
  if (!hit || !hit.image_url) return null
  const probe = await probeUrl(hit.image_url, { fetchImpl, maxRetries: 1 })
  if (probe.classification !== 'A' && probe.classification !== 'B') return null
  return {
    source: 'optcgapi', url: hit.image_url, verified: true, probe,
    candidateMeta: { name: hit.name, number: hit.card_number, set: hit.set_name },
  }
}

// Cache di processo per lo stage Bandai JA — stesso motivo di optcgSetCache sopra.
const bandaiJaSetCache = new Map()

/**
 * Stadio One Piece (JA): onepiece-cardgame.com (Bandai), scraping diretto
 * delle pagine cardlist ufficiali — nessuna API pubblica copre One Piece JA
 * (vedi fetch-onepiece-ja.js). Solo lang='ja': per EN resta preferito lo
 * stadio precedente (optcgapi.com, fonte strutturata via API invece di
 * scraping HTML).
 */
export async function tryOnePieceJaBandai(card, { fetchImpl = fetch } = {}) {
  if (card.tcg !== 'onepiece' || card.lang !== 'ja') return null
  if (!card.set_id) return null

  let setResult = bandaiJaSetCache.get(card.set_id)
  if (!setResult) {
    try {
      setResult = await fetchOnePieceBandaiSet({ setId: card.set_id, lang: 'ja', fetchImpl })
    } catch (err) {
      if (err instanceof OnePieceBandaiFetchError) return null // fonte non disponibile per questo set, si passa oltre
      throw err
    }
    bandaiJaSetCache.set(card.set_id, setResult)
  }

  const hit = setResult.rows.find(r => r.card_number === card.card_number)
  if (!hit || !hit.image_url) return null
  const probe = await probeUrl(hit.image_url, { fetchImpl, maxRetries: 1 })
  if (probe.classification !== 'A' && probe.classification !== 'B') return null
  return {
    source: 'onepiece-cardgame.com', url: hit.image_url, verified: true, probe,
    candidateMeta: { name: hit.name, number: hit.card_number },
  }
}

/**
 * Esegue l'intera cascata per una carta, ferma al primo candidato verificato via HTTP reale.
 * Calcola match_confidence contro i metadata del candidato (quando disponibili).
 */
export async function resolveCard(card, opts = {}) {
  const stages = card.tcg === 'onepiece'
    ? [tryTcgdexRetry, tryOptcgOnePiece, tryOnePieceJaBandai]
    : [tryTcgdexRetry, tryScrydex, tryPokemonTcgIo, tryPokemonPriceTracker]
  const attempts = []
  for (const stage of stages) {
    const result = await stage(card, opts)
    attempts.push({ stage: stage.name, result })
    if (result && result.verified) {
      const confidence = result.candidateMeta
        ? scoreMatch(card, result.candidateMeta)
        : { level: 'MEDIUM', reason: 'stessa fonte primaria (TCGdex), nessun metadata cross-fonte da confrontare' }
      return { resolved: true, ...result, match_confidence: confidence.level, match_reason: confidence.reason, attempts }
    }
  }
  return { resolved: false, attempts, match_confidence: 'NO_MATCH', match_reason: 'nessuna fonte ha restituito un candidato verificabile via HTTP' }
}

async function main() {
  const args = process.argv.slice(2)
  const BROKEN = args.find(a => a.startsWith('--broken='))?.split('=')[1] || 'scripts/image-audit/data/crawl-results.ndjson'
  const CARDS = args.find(a => a.startsWith('--cards='))?.split('=')[1] || 'scripts/image-audit/data/cards-pokemon-en-ja.ndjson'
  const OUT = args.find(a => a.startsWith('--out='))?.split('=')[1] || 'scripts/image-audit/data/resolve-results.ndjson'

  if (!existsSync(BROKEN) || !existsSync(CARDS)) {
    console.error('ERROR: input mancante — esegui prima dump-cards.mjs e crawl-images.mjs')
    process.exit(1)
  }
  mkdirSync(dirname(OUT), { recursive: true })

  const cardsById = new Map()
  for (const line of readFileSync(CARDS, 'utf8').split('\n').filter(Boolean)) {
    const row = JSON.parse(line)
    cardsById.set(row.id, row)
  }

  const broken = readFileSync(BROKEN, 'utf8').split('\n').filter(Boolean)
    .map(l => JSON.parse(l))
    .filter(r => ['C', 'D', 'E', 'F'].includes(r.classification) && r.field === 'image_url_hi')

  console.log(`Carte da tentare in recovery: ${broken.length}`)
  let n = 0
  for (const rec of broken) {
    const card = cardsById.get(rec.card_id)
    if (!card) continue
    const result = await resolveCard(card)
    appendFileSync(OUT, JSON.stringify({ card_id: rec.card_id, lang: card.lang, set_id: card.set_id, card_number: card.card_number, ...result }) + '\n')
    n++
    if (n % 20 === 0) process.stdout.write(`\r  risolte: ${n}/${broken.length}`)
  }
  console.log(`\nOK: risultati in ${OUT}`)
}

if (import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  main().catch(err => { console.error('FATAL:', err); process.exit(1) })
}
