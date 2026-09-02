/**
 * DraGold - Resolver immagini multi-sorgente
 *
 * Priorita di risoluzione per l'URL immagine di una carta:
 *   1. TCGdex (fonte primaria, gia usata dagli script di sync)
 *   2. pokemontcg.io - solo lang 'en' (nessuna copertura JA), gratuita anche
 *      senza key (rate limit piu' basso senza POKEMONTCG_API_KEY) - nessuna
 *      key richiesta per essere attiva, a differenza degli stadi sotto
 *   3. Fonte alternativa a pagamento/free-tier (Scrydex, PokemonPriceTracker)
 *      - attiva SOLO se le relative API key sono configurate come env var
 *      - nessuna key configurata = questo stadio viene saltato, nessun costo
 *   4. Cache interna DraGold (card_image_cache / api/cache-image.js) - gestita
 *      a valle da chi consuma image_url, non da questo modulo
 *   5. Nessuna soluzione automatica: ritorna null, la carta va in coda per
 *      revisione manuale (vedi query in fondo al file)
 *
 * Nessuna fonte qui restituisce mai un URL "indovinato": se una fonte non ha
 * dati reali per la carta, ritorna null e si passa alla fonte successiva.
 *
 * Stessa cascata (a parte l'ordine Scrydex/pokemontcg.io) gia' validata in
 * scripts/image-audit/resolve-fallback.mjs — qui replicata per il path di
 * produzione (sync), non solo per il tool di audit read-only.
 */

const SCRYDEX_API_KEY = process.env.SCRYDEX_API_KEY || null
const SCRYDEX_TEAM_ID = process.env.SCRYDEX_TEAM_ID || null
const PPT_API_KEY = process.env.POKEMONPRICETRACKER_API_KEY || null
const POKEMONTCG_API_KEY = process.env.POKEMONTCG_API_KEY || null

const MAX_FETCH_ATTEMPTS = 4
const BASE_BACKOFF_MS = 500

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

// Rate-limit resilience: 429/5xx sono transitori e vengono ritentati con
// backoff esponenziale (rispettando Retry-After se presente) invece di far
// fallire subito lo stadio — un 429 momentaneo di Scrydex/PPT non deve far
// saltare a torto la fonte successiva nella cascata.
async function safeJsonFetch(url, options) {
    for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
          try {
                const res = await fetch(url, options)
                if (res.ok) return await res.json()
                const retryable = res.status === 429 || res.status >= 500
                if (!retryable || attempt === MAX_FETCH_ATTEMPTS) return null
                const retryAfter = Number(res.headers.get('retry-after'))
                const delay = Number.isFinite(retryAfter) && retryAfter > 0
                      ? retryAfter * 1000
                      : BASE_BACKOFF_MS * 2 ** (attempt - 1)
                await sleep(delay)
          } catch (err) {
                return null
          }
    }
    return null
}

// Gratuita anche senza key (rate limit piu' basso senza POKEMONTCG_API_KEY),
// quindi provata PRIMA degli stadi a key (Scrydex/PPT) nella cascata sotto.
// Solo EN: pokemontcg.io non ha copertura JA (stesso limite documentato in
// scripts/image-audit/resolve-fallback.mjs#tryPokemonTcgIo).
async function resolveFromPokemonTcgIo(card, langCode) {
    if (langCode !== 'en') return null
    const q = encodeURIComponent(`name:"${card.name}"`)
    const url = `https://api.pokemontcg.io/v2/cards?q=${q}`
    const headers = POKEMONTCG_API_KEY ? { 'X-Api-Key': POKEMONTCG_API_KEY } : {}
    const json = await safeJsonFetch(url, { headers })
    const list = json && json.data ? json.data : []
    const hit = list.find(c => String(c.number) === String(card.localId)) || list[0]
    if (!hit || !hit.images) return null
    return hit.images.large || hit.images.small || null
}

async function resolveFromScrydex(card, langCode) {
    if (!SCRYDEX_API_KEY || !SCRYDEX_TEAM_ID) return null
    const lang = langCode === 'ja' ? 'ja' : 'en'
    const q = encodeURIComponent(`name:"${card.name}"`)
    const url = `https://api.scrydex.com/pokemon/v1/${lang}/cards?q=${q}&page_size=5`
    const json = await safeJsonFetch(url, {
          headers: { 'X-Api-Key': SCRYDEX_API_KEY, 'X-Team-ID': SCRYDEX_TEAM_ID },
    })
    const list = json && json.data ? json.data : []
        const hit = list.find(c => String(c.number) === String(card.localId)) || list[0]
    if (!hit || !hit.images || !hit.images.length) return null
    const img = hit.images.find(i => i.type === 'front') || hit.images[0]
    return (img && (img.large || img.medium)) || null
}

async function resolveFromPokemonPriceTracker(card, langCode) {
      if (!PPT_API_KEY) return null
      const language = langCode === 'ja' ? 'japanese' : 'english'
      const search = encodeURIComponent(card.name)
      const url = `https://www.pokemonpricetracker.com/api/v2/cards?search=${search}&language=${language}&limit=20&lightweight=true`
      const json = await safeJsonFetch(url, {
              headers: { Authorization: `Bearer ${PPT_API_KEY}` },
      })
      const list = json && json.data ? json.data : []
      const wanted = String(card.localId || '').replace(/^0+/, '')
      const hit = list.find(c => {
              const num = String(c.cardNumber || '').split('/')[0].replace(/^0+/, '')
              return num === wanted && wanted !== ''
      })
      if (!hit) return null
      return hit.imageCdnUrl || null
}

/**
 * Risolve l'URL immagine per una carta con priorita di fonti.
 * @param {object} card - carta come restituita da TCGdex (deve avere .name, .localId, .image opzionale)
 * @param {string} langCode - 'ja' | 'en'
 * @returns {Promise<{url: string|null, source: string|null}>}
 */
async function resolveCardImage(card, langCode) {
    if (card.image) {
          return { url: `${card.image}/high.webp`, source: 'tcgdex' }
    }

  const pokemonTcgIoUrl = await resolveFromPokemonTcgIo(card, langCode)
    if (pokemonTcgIoUrl) return { url: pokemonTcgIoUrl, source: 'pokemontcg.io' }

  const scrydexUrl = await resolveFromScrydex(card, langCode)
    if (scrydexUrl) return { url: scrydexUrl, source: 'scrydex' }

  const pptUrl = await resolveFromPokemonPriceTracker(card, langCode)
    if (pptUrl) return { url: pptUrl, source: 'pokemonpricetracker' }

  return { url: null, source: null }
}

export { resolveCardImage }
