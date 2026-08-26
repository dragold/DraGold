// parse-card.mjs
// Parses a pokemon-card.com detail page into a normalized record.
//
// Prototype note: operates on rendered TEXT (tags stripped), matching what was
// actually verified via live browser extraction in this session (get_page_text-style
// output), not on raw HTML DOM structure. fetch-card.mjs's htmlToText() mirrors this.
// A production version should parse the DOM directly (more robust to text-order
// changes) -- flagged as a known follow-up, not implemented here to avoid guessing
// at DOM structure we have not inspected element-by-element.

export function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    // FIX (diagnosticato dal vivo sul dry-run 49500-49510): <head>/<title> non erano
    // esclusi -- venivano convertiti in newline come ogni altro tag, quindi il testo del
    // <title> (formato reale del sito: "{NomeCarta} | ポケモンカードゲーム公式ホームページ")
    // diventava la prima riga del testo estratto, e parseCardText() la usava come
    // nameLine/discovered.name al posto del vero nome carta nel <body>. Rimosso l'intero
    // blocco <head>...</head> PRIMA della conversione generica dei tag, stesso pattern
    // già usato sopra per <script>/<style>.
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')
}

export function parseCardText(text, { id } = {}) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  // Not-found / redirected-to-search pages never carry a card number or set line.
  const looksLikeSearchPage = lines.some((l) => l.includes('カード検索')) && !lines.some((l) => /^\d+\s*\/\s*\d+$/.test(l))

  const nameLine = lines[0] || null

  let cardNumber = null
  for (const l of lines) {
    const m = l.match(/^(\d+)\s*\/\s*(\d+)$/)
    if (m) { cardNumber = `${m[1]}/${m[2]}`; break }
  }

  let illustrator = null
  const illIdx = lines.indexOf('イラストレーター')
  if (illIdx !== -1 && lines[illIdx + 1]) illustrator = lines[illIdx + 1]

  // Set name(s): every 「...」 block. NOTE: full-width brackets 「」 are also used
  // inside attack/ability rule text for emphasis (e.g. 「-30」される), so a naive
  // first-match picks up rules text, not the set/product name. Verified live: the
  // real set/product name block always appears as the LAST 「...」 occurrence on
  // the page, immediately before the CLOSE marker -- so all matches are kept, but
  // the last one is treated as primary. Reprinted staples (basic energy, etc.)
  // list every set they've appeared in as separate lines; those are all kept too.
  const setNames = []
  const setRe = /[「『]([^」』]+)[」』]/g
  for (const l of lines) {
    let m
    while ((m = setRe.exec(l))) setNames.push(m[1])
  }

  const isEnergyOrTrainer = /エネルギー|トレーナーズ/.test(nameLine || '') || (!cardNumber && setNames.length > 0)

  return {
    officialSourceId: id != null ? String(id) : null,
    name: looksLikeSearchPage ? null : nameLine,
    cardNumber,
    illustrator,
    setNames,
    primarySetName: setNames[setNames.length - 1] || null,
    supertypeGuess: isEnergyOrTrainer ? (nameLine && nameLine.includes('エネルギー') ? 'energy' : 'trainer_or_energy') : 'pokemon',
    found: !looksLikeSearchPage && !!nameLine,
  }
}
