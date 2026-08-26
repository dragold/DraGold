#!/usr/bin/env node
/**
 * DraGold — Image Audit: dump READ-ONLY di public.cards su NDJSON locale.
 *
 * SOLA LETTURA: usa solo `.select()`. Nessun `.upsert()/.update()/.delete()` in questo file.
 * Richiede SUPABASE_URL + SUPABASE_SERVICE_KEY in env (stesse variabili già usate da
 * scripts/sync-cards.js — nessuna nuova credenziale).
 *
 * Perché esiste: il crawler (crawl-images.mjs) e il resolver (resolve-fallback.mjs) hanno
 * bisogno della lista completa (card_id, lang, set_id, card_number, image_url, image_url_hi,
 * source, cache_status) per un dato (tcg, lingue). Materializzarla qui, una volta, come NDJSON
 * locale, evita di rifare la query ad ogni run del crawler e permette di far girare crawler/
 * resolver anche offline rispetto a Supabase (utile per retry/resume).
 *
 * GENERALIZZATO (questa sessione — priorità 3 del task immagini): originariamente hardcoded
 * su tcg='pokemon'. Ora accetta --tcg e --langs per coprire anche One Piece (EN/JA), stessa
 * pipeline di crawl-images.mjs/summarize.mjs che era già TCG-agnostic. Il default resta
 * pokemon/en+ja per compatibilità con l'uso esistente (cards-pokemon-en-ja.ndjson).
 *
 * cache_status (nuovo campo, via left join su card_image_cache): permette a summarize.mjs di
 * distinguere "immagine già correttamente cached" (status='ready') dal resto, invece di dover
 * dedurlo solo dall'HTTP probe sulla source URL — rilevante soprattutto per One Piece, dove
 * scripts/cache-onepiece-images.js scrive già righe in card_image_cache.
 *
 * Usage:
 *   node scripts/image-audit/dump-cards.mjs [--tcg=pokemon] [--langs=en,ja] [--out=...]
 *   node scripts/image-audit/dump-cards.mjs --tcg=onepiece --langs=en,ja \
 *     --out=scripts/image-audit/data/cards-onepiece-en-ja.ndjson
 */
import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const COLUMNS = 'id,tcg,lang,source,source_id,set_id,set_name,card_number,name,rarity,image_url,image_url_hi,canonical_card_id,updated_at,card_image_cache(status)'
const PAGE_SIZE = 1000

/**
 * Parsing puro (nessuna I/O) degli argomenti CLI in una config di query validata.
 * Estratto a parte per essere testabile senza credenziali Supabase — vedi
 * scripts/image-audit/__tests__/dump-cards.test.js.
 *
 * @param {string[]} argv - es. ['--tcg=onepiece', '--langs=en,ja']
 * @returns {{tcg: string, langs: string[], out: string}}
 * @throws {Error} se --tcg è vuoto o --langs non contiene almeno una lingua valida
 */
export function parseDumpArgs(argv) {
  const args = argv || []
  const tcgArg = args.find(a => a.startsWith('--tcg='))
  const tcg = (tcgArg === undefined ? 'pokemon' : tcgArg.split('=')[1]).trim()
  const langsArg = args.find(a => a.startsWith('--langs='))
  const langsRaw = langsArg === undefined ? 'en,ja' : langsArg.split('=')[1]
  const langs = langsRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  const explicitOut = args.find(a => a.startsWith('--out='))?.split('=')[1]

  if (!tcg) throw new Error('parseDumpArgs: --tcg non può essere vuoto')
  if (langs.length === 0) throw new Error('parseDumpArgs: --langs deve contenere almeno una lingua')

  const out = explicitOut || `scripts/image-audit/data/cards-${tcg}-${langs.join('-')}.ndjson`
  return { tcg, langs, out }
}

/**
 * Estrae lo stato cache "migliore" da riga con join card_image_cache (array, una riga per
 * ogni combinazione source/language/variant già tentata) -> singolo stato riassuntivo:
 * 'ready' se ALMENO una riga è ready (l'immagine è servibile, anche se altre varianti sono in
 * errore), altrimenti 'error' se ne esiste almeno una in errore, altrimenti 'pending' se
 * esistono righe non ancora concluse, altrimenti 'none' (mai tentato).
 *
 * @param {Array<{status: string}>|null|undefined} cacheRows
 * @returns {'ready'|'error'|'pending'|'none'}
 */
export function summarizeCacheStatus(cacheRows) {
  if (!cacheRows || cacheRows.length === 0) return 'none'
  if (cacheRows.some(r => r.status === 'ready')) return 'ready'
  if (cacheRows.some(r => r.status === 'error')) return 'error'
  if (cacheRows.some(r => r.status === 'pending')) return 'pending'
  return 'none'
}

async function dumpAll({ tcg, langs, out }) {
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('ERROR: SUPABASE_URL e SUPABASE_SERVICE_KEY mancanti in env')
    process.exit(1)
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  mkdirSync(dirname(out), { recursive: true })
  let from = 0
  let total = 0
  const lines = []

  for (;;) {
    // Keyset semplice su `id` per stabilità di paginazione anche se il catalogo cambia
    // durante il dump (sola lettura, nessun lock necessario per questo scopo diagnostico).
    const { data, error } = await supabase
      .from('cards')
      .select(COLUMNS)
      .eq('tcg', tcg)
      .in('lang', langs)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) {
      console.error(`ERROR alla pagina from=${from}:`, error.message)
      process.exit(1)
    }
    if (!data || data.length === 0) break

    for (const row of data) {
      const { card_image_cache, ...rest } = row
      lines.push(JSON.stringify({ ...rest, cache_status: summarizeCacheStatus(card_image_cache) }))
    }
    total += data.length
    from += PAGE_SIZE
    process.stdout.write(`\r  righe scaricate: ${total}`)
    if (data.length < PAGE_SIZE) break
  }

  writeFileSync(out, lines.join('\n') + (lines.length ? '\n' : ''))
  console.log(`\nOK: ${total} righe scritte in ${out} (tcg=${tcg}, langs=${langs.join(',')})`)
}

if (import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  const config = parseDumpArgs(process.argv.slice(2))
  dumpAll(config).catch(err => {
    console.error('FATAL:', err)
    process.exit(1)
  })
}
