#!/usr/bin/env node
/**
 * DraGold — Image Audit: aggregatore finale READ-ONLY.
 *
 * Prende in input crawl-results.ndjson (da crawl-images.mjs) e, se presente,
 * resolve-results.ndjson (da resolve-fallback.mjs) e produce il breakdown richiesto:
 *   TOTAL, VALID, BROKEN, MISSING, RECOVERABLE_TCGDEX, RECOVERABLE_OFFICIAL,
 *   RECOVERABLE_SCRYDEX, RECOVERABLE_OTHER, AMBIGUOUS, UNRESOLVED
 * sia in aggregato sia per-carta (dettaglio completo in output).
 *
 * Nessuna chiamata di rete, nessuna scrittura Supabase — puro post-processing di file locali.
 *
 * Usage:
 *   node scripts/image-audit/summarize.mjs \
 *     --crawl=scripts/image-audit/data/crawl-results.ndjson \
 *     --resolve=scripts/image-audit/data/resolve-results.ndjson \
 *     --out=scripts/image-audit/data/final-summary.json
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs'

/**
 * Classifica UNA riga di crawl (già a livello field, es. image_url_hi) combinata con l'eventuale
 * esito di resolve-fallback per la stessa carta, nella tassonomia finale richiesta.
 *
 * Priorità di lettura (una carta è "MISSING" solo se l'URL non c'era in origine, "BROKEN" se
 * c'era ma l'HTTP fallisce, ecc. — la stessa distinzione D vs C del crawler, mappata sulla
 * tassonomia di output richiesta in questa fase):
 *
 * @param {{classification: 'A'|'B'|'C'|'D'|'E'|'F'}} crawlRec
 * @param {{resolved: boolean, source?: string, match_confidence?: string}|null} resolveRec
 * @returns {'VALID'|'BROKEN'|'MISSING'|'RECOVERABLE_TCGDEX'|'RECOVERABLE_OFFICIAL'|'RECOVERABLE_SCRYDEX'|'RECOVERABLE_OTHER'|'AMBIGUOUS'|'UNRESOLVED'}
 */
export function classifyFinal(crawlRec, resolveRec) {
  if (crawlRec.classification === 'A' || crawlRec.classification === 'B') return 'VALID'

  if (resolveRec && resolveRec.resolved) {
    if (['LOW', 'D'].includes(resolveRec.match_confidence)) return 'AMBIGUOUS'
    if (resolveRec.source === 'tcgdex_retry' || resolveRec.source === 'tcgdex_low') return 'RECOVERABLE_TCGDEX'
    if (resolveRec.source === 'scrydex') return 'RECOVERABLE_SCRYDEX'
    if (resolveRec.source === 'official_jp') return 'RECOVERABLE_OFFICIAL'
    return 'RECOVERABLE_OTHER'
  }

  if (crawlRec.classification === 'D') return 'MISSING'
  if (crawlRec.classification === 'C') return resolveRec ? 'UNRESOLVED' : 'BROKEN'
  if (crawlRec.classification === 'E' || crawlRec.classification === 'F') return resolveRec ? 'UNRESOLVED' : 'BROKEN'

  return 'UNRESOLVED'
}

export function summarize(crawlRecords, resolveRecords = []) {
  const resolveByCard = new Map(resolveRecords.map(r => [r.card_id, r]))
  const counts = {
    TOTAL: 0, VALID: 0, BROKEN: 0, MISSING: 0,
    RECOVERABLE_TCGDEX: 0, RECOVERABLE_OFFICIAL: 0, RECOVERABLE_SCRYDEX: 0, RECOVERABLE_OTHER: 0,
    AMBIGUOUS: 0, UNRESOLVED: 0,
  }
  const details = []

  for (const rec of crawlRecords) {
    if (rec.field !== 'image_url_hi') continue // una riga per carta (evita doppio conteggio su image_url + image_url_hi)
    const resolveRec = resolveByCard.get(rec.card_id) || null
    const finalClass = classifyFinal(rec, resolveRec)
    counts.TOTAL++
    counts[finalClass]++
    details.push({
      card_id: rec.card_id, lang: rec.lang, set_id: rec.set_id, card_number: rec.card_number,
      crawl_classification: rec.classification, final_classification: finalClass,
      recovered_via: resolveRec?.resolved ? resolveRec.source : null,
      match_confidence: resolveRec?.match_confidence || null,
      // già presente in DB in card_image_cache con status='ready' (vedi dump-cards.mjs) —
      // indipendente da final_classification: una carta può essere VALID sulla source URL
      // originale E avere già una cache pronta (cached_url), oppure essere BROKEN sulla source
      // ma comunque già servibile dalla cache. 'unknown' se dump-cards.mjs non ha popolato
      // cache_status (run più vecchi, prima di questa modifica).
      already_cached: rec.cache_status === 'ready',
      cache_status: rec.cache_status ?? 'unknown',
    })
  }

  return { counts, details }
}

async function main() {
  const args = process.argv.slice(2)
  const CRAWL = args.find(a => a.startsWith('--crawl='))?.split('=')[1] || 'scripts/image-audit/data/crawl-results.ndjson'
  const RESOLVE = args.find(a => a.startsWith('--resolve='))?.split('=')[1] || 'scripts/image-audit/data/resolve-results.ndjson'
  const OUT = args.find(a => a.startsWith('--out='))?.split('=')[1] || 'scripts/image-audit/data/final-summary.json'

  if (!existsSync(CRAWL)) {
    console.error(`ERROR: ${CRAWL} non trovato — esegui prima crawl-images.mjs`)
    process.exit(1)
  }
  const crawlRecords = readFileSync(CRAWL, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  const resolveRecords = existsSync(RESOLVE)
    ? readFileSync(RESOLVE, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
    : []

  const { counts, details } = summarize(crawlRecords, resolveRecords)
  writeFileSync(OUT, JSON.stringify({ counts, details }, null, 2))

  console.log('=== FINAL SUMMARY ===')
  for (const [k, v] of Object.entries(counts)) console.log(`${k}: ${v}`)
  console.log(`\nDettaglio completo (${details.length} carte) in ${OUT}`)
}

if (import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  main().catch(err => { console.error('FATAL:', err); process.exit(1) })
}
