// Scraper HTML per onepiece-cardgame.com (Bandai) — EN + JA.
//
// optcgapi.com (vedi fetch-optcg.js) copre solo EN: nessuna fonte API
// pubblica ha dati One Piece JA. Questo modulo fetcha ed effettua il parsing
// diretto delle pagine "cardlist" ufficiali Bandai, stessa tecnica gia'
// verificata e in produzione in scripts/sync-cards.js#syncOnePiece (parsing
// regex sui blocchi <dl class="modalCol">, fallback su <dt> se assenti).
//
// Duplicato deliberatamente qui invece di importato da sync-cards.js:
// sync-cards.js e' uno script CLI standalone (DRY_RUN, upsertBatch, sleep
// tra richieste, gestione argv) non pensato per essere un modulo importabile
// — estrarlo in un modulo condiviso userebbe entrambi i chiamanti ma
// rischierebbe una regressione silenziosa sulla sync di produzione one piece
// per un cambio non necessario a questo task (che serve solo un fallback di
// SOLA LETTURA per scripts/image-audit/resolve-fallback.mjs). La logica di
// parsing e la tabella serie sono copiate 1:1 da sync-cards.js (stesso
// comportamento, stesso output), non reinventate.
//
// Stesso shape di ritorno di fetchOptcgSet (fetch-optcg.js) — { rows: [...] }
// con card_number/name/rarity/image_url — cosi' resolve-fallback.mjs puo'
// consumarlo con lo stesso pattern gia' usato per lo stage optcgapi.

export class OnePieceBandaiFetchError extends Error {}

const BANDAI_EN = 'https://en.onepiece-cardgame.com'
const BANDAI_JA = 'https://www.onepiece-cardgame.com'

// setCode (es. "OP-05", "ST-01") -> seriesId numerico Bandai. Tabella
// identica a EN_SERIES/JA_SERIES in sync-cards.js (fonte: verificata via
// WebFetch sul sito Bandai in quella sessione). I set JA-only (OP-17, EB-04)
// sono inclusi qui in aggiunta a quelli EN.
const SERIES_BY_SET_CODE = {
  'OP-16': 569116, 'OP-15': 569115, 'OP-14': 569114, 'OP-13': 569113,
  'OP-12': 569112, 'OP-11': 569111, 'OP-10': 569110, 'OP-09': 569109,
  'OP-08': 569108, 'OP-07': 569107, 'OP-06': 569106, 'OP-05': 569105,
  'OP-04': 569104, 'OP-03': 569103, 'OP-02': 569102, 'OP-01': 569101,
  'ST-30': 569030, 'ST-29': 569029, 'ST-28': 569028, 'ST-27': 569027,
  'ST-26': 569026, 'ST-25': 569025, 'ST-24': 569024, 'ST-23': 569023,
  'ST-22': 569022, 'ST-21': 569021, 'ST-20': 569020, 'ST-19': 569019,
  'ST-18': 569018, 'ST-17': 569017, 'ST-16': 569016, 'ST-15': 569015,
  'ST-14': 569014, 'ST-13': 569013, 'ST-12': 569012, 'ST-11': 569011,
  'ST-10': 569010, 'ST-09': 569009, 'ST-08': 569008, 'ST-07': 569007,
  'ST-06': 569006, 'ST-05': 569005, 'ST-04': 569004, 'ST-03': 569003,
  'ST-02': 569002, 'ST-01': 569001,
  'EB-03': 569203, 'EB-02': 569202, 'EB-01': 569201, 'EB-04': 569204,
  'PRB-02': 569302, 'PRB-01': 569301,
  'P': 569901, 'OTHER': 569801,
  'OP-17': 400401,
}

const DL_RE = /<dl[^>]*class="[^"]*modalCol[^"]*"[^>]*>([\s\S]*?)<\/dl>/gi
const DT_RE = /<dt[\s\S]*?<\/dt>/gi
const SPAN_RE = /<span[^>]*>([^<]*)<\/span>/gi
const NAME_RE = /class="cardName"[^>]*>\s*([^<]+)/

function parseBlocks(html, blockRe) {
  const seen = new Set()
  const rows = []
  let blockMatch
  const re = new RegExp(blockRe.source, blockRe.flags)
  while ((blockMatch = re.exec(html)) !== null) {
    const blockHtml = blockMatch[1] ?? blockMatch[0]
    const spans = []
    let sm
    const spanRe = new RegExp(SPAN_RE.source, SPAN_RE.flags)
    while ((sm = spanRe.exec(blockHtml)) !== null) spans.push(sm[1].trim())

    const cardNumber = spans[0]
    const rarity = spans[1] || null
    const supertype = spans[2] || null
    const nameMatch = blockHtml.match(NAME_RE)
    const name = nameMatch ? nameMatch[1].trim() : null

    if (!cardNumber || !name || !/^[A-Z0-9]/.test(cardNumber)) continue
    const key = cardNumber
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({ card_number: cardNumber, name, rarity, supertype })
  }
  return rows
}

/**
 * Fetcha ed effettua il parsing della pagina cardlist Bandai per un set.
 * @param {{setId: string, lang: 'en'|'ja', fetchImpl?: typeof fetch}} opts
 * @returns {Promise<{rows: Array<{card_number: string, name: string, rarity: string|null, image_url: string}>}>}
 */
export async function fetchOnePieceBandaiSet({ setId, lang, fetchImpl = fetch }) {
  const seriesId = SERIES_BY_SET_CODE[setId]
  // Set non presente nella tabella nota: nessun dato, non un errore (stesso
  // principio di "skip esplicito" degli altri stage della cascata — non
  // inventare mai un fallback per un set che non conosciamo davvero).
  if (!seriesId) return { rows: [] }

  const baseUrl = lang === 'ja' ? BANDAI_JA : BANDAI_EN
  const url = `${baseUrl}/cardlist/?series=${seriesId}`
  let html
  try {
    const res = await fetchImpl(url, { headers: { 'User-Agent': 'Mozilla/5.0 DraGold/1.0' } })
    if (!res.ok) throw new OnePieceBandaiFetchError(`HTTP ${res.status} for ${url}`)
    html = await res.text()
  } catch (err) {
    if (err instanceof OnePieceBandaiFetchError) throw err
    throw new OnePieceBandaiFetchError(err?.message || String(err))
  }

  let parsed = parseBlocks(html, DL_RE)
  if (parsed.length === 0) parsed = parseBlocks(html, DT_RE)

  const rows = parsed.map((r) => ({
    ...r,
    image_url: `${baseUrl}/images/cardlist/card/${r.card_number}.png`,
  }))
  return { rows }
}

export { SERIES_BY_SET_CODE }
