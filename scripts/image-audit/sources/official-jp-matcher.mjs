/**
 * DraGold — Image Audit: adapter per pokemon-card.com (sito ufficiale Pokémon Card Game Japan).
 *
 * RUOLO: SOURCE OF TRUTH / MATCHING per carte JA moderne — MAI IMAGE SOURCE.
 *
 * Perché MAI image source (verificato in sessione, non assunto):
 *  1. Copertura: verificato via browser reale (Chrome, sessione interattiva) che l'indice di
 *     ricerca del sito, anche con filtro "すべてのレギュレーション" (tutte le regolamentazioni:
 *     Standard+Extra+殿堂/Hall of Fame — 594 pagine, migliaia di carte), NON contiene set legacy
 *     (VS/e/ADV/neo/web/PCG/PMCG, 1996-2010). Le carte più vecchie trovate sfogliando fino
 *     all'ultima pagina risultante sono dell'era Sun & Moon (2016-2017: "タイプ：ヌル", "イリマ",
 *     "ハウ", "ラプラスGX") — cioè esattamente NESSUNO dei set legacy problematici in DraGold
 *     (MC, PCG1, PCG4, neo1, VS1, E1, M1-M5, web1, ecc.) è indicizzato dal card-search ufficiale.
 *  2. Anche per le carte che COPRE, il footer del sito dichiara esplicitamente:
 *     "このホームページに掲載された画像その他の内容の無断転載はお断りします"
 *     ("La riproduzione non autorizzata delle immagini e degli altri contenuti pubblicati su
 *     questo sito non è consentita.") — un divieto esplicito di riproduzione, non un'assenza di
 *     policy. Usare queste immagini come CDN di produzione (anche solo hotlink) violerebbe
 *     esplicitamente i termini dichiarati dal titolare dei diritti.
 *
 * Cosa fa quindi questo modulo: SOLO verifica di esistenza/identità per carte JA moderne
 * (SM-era in poi), utile per confermare che una carta DraGold corrisponde a una carta reale nel
 * catalogo ufficiale (nome, set, numero) — MAI per ottenere un URL immagine da usare in DraGold.
 * `verifyOfficial()` non ritorna mai un campo `image`.
 *
 * Pattern URL osservati (verificati via browser reale in questa sessione, NON assunti):
 *   - Ricerca:        https://www.pokemon-card.com/card-search/index.php?keyword=...&regulation_sidebar_form=...
 *   - Dettaglio carta: https://www.pokemon-card.com/card-search/details.php/card/{cardId}/regu/all
 *   - Immagine (SOLO per riferimento — MAI da usare come image source, vedi sopra):
 *     https://www.pokemon-card.com/assets/images/card_images/large/{setCode}/{cardId}_P_{NAME}.jpg
 *
 * NOTA: `cardId` è un identificatore interno del sito, non deducibile da set_id+card_number
 * DraGold — serve una ricerca per nome/set per trovarlo, questo modulo non lo inventa mai.
 */

const KNOWN_UNSUPPORTED_LEGACY_PATTERN = /^(MC|PCG\d*|VS\d*|E\d*|M\d+|neo\d*|web\d*|PMCG\d*)$/i

/**
 * Determina se, sulla base della copertura verificata in questa sessione, ci si aspetta che il
 * sito ufficiale NON copra questo set (pura euristica su set_id, non una nuova chiamata di rete
 * — evita di sprecare richieste su set che sappiamo già essere fuori copertura).
 * @param {string} setId
 * @returns {boolean}
 */
export function isKnownUnsupportedByOfficialSite(setId) {
  if (!setId) return false
  return KNOWN_UNSUPPORTED_LEGACY_PATTERN.test(setId)
}

/**
 * Verifica (SOLA identità, mai immagine) se una carta DraGold ha un corrispondente nel catalogo
 * ufficiale. Ritorna sempre `image: null` — vedi commento in cima al file sul perché.
 *
 * @param {{name?: string, set_name?: string, card_number?: string, set_id?: string, lang?: string}} card
 * @param {{fetchImpl?: Function}} [opts]
 * @returns {Promise<{checked: boolean, skippedReason?: string, found: boolean, officialCardId: string|null, image: null, note: string}>}
 */
export async function verifyOfficial(card, { fetchImpl = fetch } = {}) {
  if (card.lang !== 'ja') {
    return { checked: false, skippedReason: 'sito ufficiale JA irrilevante per carte non-JA', found: false, officialCardId: null, image: null, note: '' }
  }
  if (isKnownUnsupportedByOfficialSite(card.set_id)) {
    return {
      checked: false,
      skippedReason: `set_id="${card.set_id}" corrisponde al pattern dei set legacy verificati come NON indicizzati dal card-search ufficiale (vedi commento in cima al file) — richiesta HTTP non effettuata per non sprecarla`,
      found: false,
      officialCardId: null,
      image: null,
      note: 'nessuna chiamata di rete fatta: esito noto per struttura del set_id',
    }
  }

  const q = encodeURIComponent(card.name || '')
  const url = `https://www.pokemon-card.com/card-search/index.php?keyword=${q}&regulation_sidebar_form=all`
  try {
    const res = await fetchImpl(url, { method: 'GET' })
    if (!res.ok) return { checked: true, found: false, officialCardId: null, image: null, note: `HTTP ${res.status}` }
    const html = await res.text()
    // Verifica debole (solo presenza di un link a una scheda dettaglio) — un vero matching
    // nome+numero+set va fatto a valle con match-confidence.mjs sul risultato effettivo, questo
    // adapter si limita a dire "esiste almeno un risultato", non sceglie quale.
    const match = html.match(/details\.php\/card\/(\d+)/)
    return {
      checked: true,
      found: Boolean(match),
      officialCardId: match ? match[1] : null,
      image: null, // MAI valorizzato — vedi commento in cima al file
      note: match ? 'trovato un cardId candidato, va confermato con match-confidence.mjs' : 'nessun risultato',
    }
  } catch (err) {
    return { checked: true, found: false, officialCardId: null, image: null, note: `errore: ${err?.message || err}` }
  }
}
