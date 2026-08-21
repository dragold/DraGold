#!/usr/bin/env node
/**
 * DraGold — Image Audit: crawler HTTP READ-ONLY per public.cards (Pokemon EN+JA).
 *
 * SOLA LETTURA verso Supabase (nessuna chiamata Supabase in questo file — legge l'NDJSON
 * prodotto da dump-cards.mjs). Fa richieste HTTP verso gli host delle immagini (TCGdex,
 * pokemontcg.io, scrydex, ...) — MAI verso Supabase. Non scrive nulla in nessun database.
 *
 * NOTA AMBIENTE (vedi IMAGE_AUDIT_REPORT_v2.md): questo script è pensato per girare in un
 * ambiente con accesso di rete generico reale (il tuo terminale, una CI, una VM con egress
 * pieno) — NON nella sandbox Cowork usata per produrre questo audit, che ha un proxy egress
 * allowlist-only e non raggiunge assets.tcgdex.net/images.pokemontcg.io/images.scrydex.com.
 * Il probe in quella sessione è stato fatto con un numero limitato di richieste one-off via
 * uno strumento di fetch indiretto — questo script è la versione reale, a piena scala,
 * pensata per l'esecuzione locale.
 *
 * Strategia per ogni URL:
 *   1. HEAD (timeout breve). Se risposta e headers sembrano affidabili (status + content-type
 *      coerenti), usa quella.
 *   2. Se HEAD fallisce, ritorna 405/501, o content-type mancante/sospetto -> GET con
 *      `Range: bytes=0-2047` (scarica solo i primi ~2KB, sufficiente per leggere i magic bytes
 *      e il content-type reale senza scaricare l'immagine intera).
 *   3. Verifica che la risposta sia REALMENTE un'immagine: content-type `image/*` E/O magic
 *      bytes noti (JPEG FFD8FF, PNG 89504E47, WEBP RIFF....WEBP, GIF GIF8). Un 200 con
 *      content-type text/html è quasi sempre una pagina di errore/WAF travestita da OK.
 *   4. Retry con backoff esponenziale (base 500ms, factor 2, jitter, max 3 tentativi) SOLO per
 *      errori transient (429, 5xx, timeout/network error). Mai retry su 404/403 (deterministici).
 *
 * Classificazione (schema richiesto):
 *   A = immagine valida (2xx, content-type/magic-bytes image reali)
 *   B = redirect/URL recuperabile (3xx risolto con successo verso un'immagine valida — loggato
 *       separatamente da A perché segnala un URL da aggiornare in DB, anche se funziona oggi)
 *   C = 404 / asset inesistente
 *   D = URL mancante in DB (image_url e image_url_hi entrambi null — nessuna richiesta HTTP fatta)
 *   E = 403 / WAF / hotlink-protection (blocco esplicito, non 404)
 *   F = 429 / 5xx / transient failure (anche dopo i retry) — da ritentare in un run successivo
 *
 * Rate limit: concorrenza limitata per host (default 4), pausa minima tra richieste allo stesso
 * host (default 150ms). Resumable: append-only su NDJSON di output, righe già presenti (per
 * card_id+field) vengono saltate al riavvio (checkpoint via Set caricato dall'output esistente).
 *
 * Usage:
 *   node scripts/image-audit/crawl-images.mjs \
 *     --in=scripts/image-audit/data/cards-pokemon-en-ja.ndjson \
 *     --out=scripts/image-audit/data/crawl-results.ndjson \
 *     [--concurrency=4] [--limit=N] [--only-lang=ja] [--only-set=MC,PCG1]
 */
import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const args = process.argv.slice(2)
const IN = args.find(a => a.startsWith('--in='))?.split('=')[1] || 'scripts/image-audit/data/cards-pokemon-en-ja.ndjson'
const OUT = args.find(a => a.startsWith('--out='))?.split('=')[1] || 'scripts/image-audit/data/crawl-results.ndjson'
const CONCURRENCY = Number(args.find(a => a.startsWith('--concurrency='))?.split('=')[1] || 4)
const LIMIT = args.find(a => a.startsWith('--limit='))?.split('=')[1]
const ONLY_LANG = args.find(a => a.startsWith('--only-lang='))?.split('=')[1]
const ONLY_SET = args.find(a => a.startsWith('--only-set='))?.split('=')[1]?.split(',')
const MIN_DELAY_MS = Number(args.find(a => a.startsWith('--delay-ms='))?.split('=')[1] || 150)

const MAGIC_BYTES = [
  { sig: [0xff, 0xd8, 0xff], type: 'jpeg' },
  { sig: [0x89, 0x50, 0x4e, 0x47], type: 'png' },
  { sig: [0x47, 0x49, 0x46, 0x38], type: 'gif' },
  // WEBP: 'RIFF' .... 'WEBP' -- controlliamo solo 'RIFF' qui, il resto va verificato a parte
  { sig: [0x52, 0x49, 0x46, 0x46], type: 'riff/webp' },
]

function sniffImageType(buf) {
  for (const { sig, type } of MAGIC_BYTES) {
    if (buf.length >= sig.length && sig.every((b, i) => buf[i] === b)) return type
  }
  return null
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function backoffDelay(attempt) {
  const base = 500 * Math.pow(2, attempt)
  const jitter = Math.random() * 250
  return base + jitter
}

/**
 * Verifica un singolo URL con la strategia HEAD -> GET-range descritta in cima al file.
 * Pura I/O, nessuno stato condiviso: testabile isolatamente passando un `fetchImpl` custom
 * (vedi scripts/image-audit/__tests__/crawl-images.test.js).
 *
 * @returns {Promise<{classification: 'A'|'B'|'C'|'E'|'F', httpStatus: number|null,
 *   contentType: string|null, bytesSampled: number, redirected: boolean, finalUrl: string,
 *   error: string|null, attempts: number}>}
 */
export async function probeUrl(url, { fetchImpl = fetch, timeoutMs = 10000, maxRetries = 3 } = {}) {
  let attempt = 0
  let lastError = null

  while (attempt <= maxRetries) {
    try {
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), timeoutMs)

      // Stadio 1: HEAD
      let res = await fetchImpl(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal })
      clearTimeout(t)

      // Due casi distinti in cui la HEAD non è conclusiva:
      //  - la fonte non supporta proprio il metodo HEAD (405/501) -> va ritentata con GET
      //    indipendentemente dallo status (405/501 non è un errore sulla risorsa, è sul metodo)
      //  - la fonte risponde 2xx ma senza content-type utile -> non possiamo confermare che sia
      //    un'immagine, serve leggere i byte reali via GET
      const headMethodNotSupported = res.status === 405 || res.status === 501
      const headAmbiguous2xx = res.status < 400 && !res.headers.get('content-type')

      if (headMethodNotSupported || headAmbiguous2xx) {
        // Stadio 2: GET range minimale, solo se HEAD non è stato conclusivo (non è un vero errore)
        const controller2 = new AbortController()
        const t2 = setTimeout(() => controller2.abort(), timeoutMs)
        res = await fetchImpl(url, {
          method: 'GET',
          redirect: 'follow',
          headers: { Range: 'bytes=0-2047' },
          signal: controller2.signal,
        })
        clearTimeout(t2)
      }

      const status = res.status
      const contentType = res.headers.get('content-type') || null
      const redirected = Boolean(res.redirected)
      const finalUrl = res.url || url

      if (status === 429 || (status >= 500 && status < 600)) {
        lastError = `transient HTTP ${status}`
        attempt++
        if (attempt > maxRetries) {
          return { classification: 'F', httpStatus: status, contentType, bytesSampled: 0, redirected, finalUrl, error: lastError, attempts: attempt }
        }
        await sleep(backoffDelay(attempt))
        continue
      }

      if (status === 403 || status === 401) {
        return { classification: 'E', httpStatus: status, contentType, bytesSampled: 0, redirected, finalUrl, error: 'blocked (403/401 — WAF/hotlink protection sospetta)', attempts: attempt + 1 }
      }

      if (status === 404 || status === 410) {
        return { classification: 'C', httpStatus: status, contentType, bytesSampled: 0, redirected, finalUrl, error: null, attempts: attempt + 1 }
      }

      if (status >= 400) {
        return { classification: 'F', httpStatus: status, contentType, bytesSampled: 0, redirected, finalUrl, error: `HTTP ${status} non classificato altrove`, attempts: attempt + 1 }
      }

      // status 2xx: verifica che sia davvero un'immagine, non una pagina d'errore travestita
      let bytesSampled = 0
      let isImage = contentType != null && contentType.startsWith('image/')
      if (!isImage) {
        // content-type assente/sospetto: prova a leggere i primi byte per sniffare i magic bytes
        try {
          const buf = Buffer.from(await res.arrayBuffer())
          bytesSampled = buf.length
          isImage = sniffImageType(buf) != null
        } catch {
          // impossibile leggere il body (es. era già una HEAD senza body): non possiamo confermare
        }
      }

      if (!isImage) {
        return {
          classification: 'E',
          httpStatus: status,
          contentType,
          bytesSampled,
          redirected,
          finalUrl,
          error: `2xx ma content-type/magic-bytes non da immagine (content-type="${contentType}") — probabile pagina WAF/errore travestita da 200`,
          attempts: attempt + 1,
        }
      }

      return {
        classification: redirected ? 'B' : 'A',
        httpStatus: status,
        contentType,
        bytesSampled,
        redirected,
        finalUrl,
        error: null,
        attempts: attempt + 1,
      }
    } catch (err) {
      lastError = err?.name === 'AbortError' ? 'timeout' : (err?.message || String(err))
      attempt++
      if (attempt > maxRetries) {
        return { classification: 'F', httpStatus: null, contentType: null, bytesSampled: 0, redirected: false, finalUrl: url, error: lastError, attempts: attempt }
      }
      await sleep(backoffDelay(attempt))
    }
  }
  // irraggiungibile in teoria, rete di sicurezza
  return { classification: 'F', httpStatus: null, contentType: null, bytesSampled: 0, redirected: false, finalUrl: url, error: lastError || 'unknown', attempts: maxRetries + 1 }
}

/** Semplice pool di concorrenza per-host, con delay minimo tra richieste allo stesso host. */
function createHostLimiter(concurrency, minDelayMs) {
  const queues = new Map() // host -> { active, lastAt, pending: [] }
  function hostOf(url) { try { return new URL(url).host } catch { return 'unknown' } }

  return async function run(url, task) {
    const host = hostOf(url)
    if (!queues.has(host)) queues.set(host, { active: 0, lastAt: 0, pending: [] })
    const q = queues.get(host)

    while (q.active >= concurrency) await sleep(20)
    const wait = q.lastAt + minDelayMs - Date.now()
    if (wait > 0) await sleep(wait)

    q.active++
    q.lastAt = Date.now()
    try {
      return await task()
    } finally {
      q.active--
    }
  }
}

async function main() {
  if (!existsSync(IN)) {
    console.error(`ERROR: input non trovato: ${IN} — esegui prima dump-cards.mjs`)
    process.exit(1)
  }
  mkdirSync(dirname(OUT), { recursive: true })

  const already = new Set()
  if (existsSync(OUT)) {
    for (const line of readFileSync(OUT, 'utf8').split('\n')) {
      if (!line.trim()) continue
      try { already.add(JSON.parse(line).card_id + '|' + JSON.parse(line).field) } catch {}
    }
  }

  let rows = readFileSync(IN, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  if (ONLY_LANG) rows = rows.filter(r => r.lang === ONLY_LANG)
  if (ONLY_SET) rows = rows.filter(r => ONLY_SET.includes(r.set_id))
  if (LIMIT) rows = rows.slice(0, Number(LIMIT))

  const limiter = createHostLimiter(CONCURRENCY, MIN_DELAY_MS)
  let done = 0, total = 0
  const jobs = []

  for (const row of rows) {
    for (const field of ['image_url', 'image_url_hi']) {
      const key = row.id + '|' + field
      if (already.has(key)) continue
      const url = row[field]
      total++
      jobs.push(async () => {
        const ts = new Date().toISOString()
        let result
        if (!url) {
          result = { classification: 'D', httpStatus: null, contentType: null, bytesSampled: 0, redirected: false, finalUrl: null, error: null, attempts: 0 }
        } else {
          result = await limiter(url, () => probeUrl(url))
        }
        const record = {
          card_id: row.id, field, lang: row.lang, set_id: row.set_id, card_number: row.card_number,
          source: row.source, url, actual_host: url ? (() => { try { return new URL(url).host } catch { return null } })() : null,
          // cache_status (opzionale, presente solo se dump-cards.mjs l'ha popolato via join
          // card_image_cache — vedi summarizeCacheStatus in dump-cards.mjs): permette a
          // summarize.mjs di distinguere "già correttamente cached" da un semplice probe HTTP
          // riuscito sulla source URL, senza fare query aggiuntive a Supabase qui.
          cache_status: row.cache_status ?? null,
          ...result, timestamp: ts,
        }
        appendFileSync(OUT, JSON.stringify(record) + '\n')
        done++
        if (done % 50 === 0) process.stdout.write(`\r  processate: ${done}`)
      })
    }
  }

  console.log(`Righe da processare (nuove, non già in ${OUT}): ${jobs.length} (skip già presenti: ${total - jobs.length})`)

  // Esecuzione con limite di concorrenza globale (oltre a quello per-host)
  const GLOBAL_CONCURRENCY = CONCURRENCY * 3
  let idx = 0
  async function worker() {
    while (idx < jobs.length) {
      const job = jobs[idx++]
      await job()
    }
  }
  await Promise.all(Array.from({ length: GLOBAL_CONCURRENCY }, worker))

  console.log(`\nOK: crawl completato, risultati in ${OUT}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error('FATAL:', err); process.exit(1) })
}
