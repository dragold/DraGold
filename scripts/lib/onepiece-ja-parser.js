// scripts/lib/onepiece-ja-parser.js
//
// Parser per la card list ufficiale di www.onepiece-cardgame.com (sito JP,
// stessa struttura su en.onepiece-cardgame.com per EN).
//
// Verificato dal vivo (agosto 2026) via browser reale contro
// https://www.onepiece-cardgame.com/cardlist/?freewords=<cardId>:
//   - la ricerca "freewords" e' server-side rendered: l'HTML di risposta al
//     GET contiene gia' tutti i dati delle carte trovate (nessuna XHR/JSON
//     separata da chiamare, nessun rendering JS necessario per i dati).
//   - ogni risultato e' un <dl class="modalCol"> dentro <div class="resultCol">.
//   - dentro <dt>: <div class="infoCol"><span>ID</span>|<span>RARITA'</span>
//     |<span>CATEGORIA</span></div> poi <div class="cardName">NOME</div>.
//   - dentro <dd>: <div class="cost">, <div class="attribute"><img alt="...">,
//     <div class="power">, <div class="counter">, <div class="color">,
//     <div class="block">, <div class="feature">, <div class="text">,
//     <div class="getInfo">.
//   - l'immagine e' lazy-load: <img class="lazy" src="dummy.gif"
//     data-src="../images/cardlist/card/{ID}.png?{ver}">, che risolve a
//     https://www.onepiece-cardgame.com/images/cardlist/card/{ID}.png
//     (stesso pattern gia' usato da scripts/sync-full.js per le immagini JA).
//
// Questo modulo NON fa fetch di rete: prende in input l'HTML gia' scaricato
// e ritorna dati strutturati. Tenerlo separato dal fetch rende la funzione
// di parsing testabile senza rete (vedi scripts/lib/__tests__ se presente).

import { parse as parseHtml } from 'node-html-parser'

const IMAGE_BASE = 'https://www.onepiece-cardgame.com/images/cardlist/card'

/**
 * Converte l'HTML interno di un nodo in testo preservando gli "a capo"
 * espliciti (<br>), che altrimenti .textContent di node-html-parser
 * collassa in un'unica riga. Il testo carta ("effect") su questo sito ha
 * quasi sempre piu' righe separate da <br>.
 */
function textWithBreaks(el) {
  if (!el) return null
  const html = el.innerHTML || ''
  const withBreaks = html.replace(/<br\s*\/?>/gi, '\n')
  const stripped = parseHtml(withBreaks).textContent || ''
  return stripped.replace(/ /g, ' ').trim() || null
}

function textOf(el) {
  if (!el) return null
  const t = (el.textContent || '').trim()
  return t.length ? t : null
}

/** "-" e stringa vuota sul sito indicano "nessun valore" (es. counter assente). */
function numOrNull(raw) {
  if (raw == null) return null
  const t = String(raw).trim()
  if (!t || t === '-' || t === '−') return null
  const n = parseInt(t.replace(/[^\d-]/g, ''), 10)
  return Number.isFinite(n) ? n : null
}

/**
 * Estrae tutte le entry carta da una pagina risultati (?freewords=... o
 * altro filtro). Ogni entry rappresenta UNA stampa/variante fisica: lo
 * stesso card_number (es. "OP01-001") puo' comparire piu' volte con
 * "acquisition" (入手情報) diverso — ristampe, promo, prodotti speciali.
 * Il chiamante decide come collassarle in un record canonico (vedi
 * scripts/sync-onepiece-ja.js).
 */
export function parseCardListPage(html) {
  if (!html || typeof html !== 'string') return []
  const root = parseHtml(html)
  const entries = root.querySelectorAll('.resultCol dl.modalCol')

  return entries.map((entry) => {
    const dt = entry.querySelector('dt')
    const dd = entry.querySelector('dd')

    const infoSpans = dt ? dt.querySelectorAll('.infoCol span') : []
    const cardId = infoSpans[0] ? textOf(infoSpans[0]) : null
    const rarityCode = infoSpans[1] ? textOf(infoSpans[1]) : null
    const category = infoSpans[2] ? textOf(infoSpans[2]) : null
    const name = dt ? textOf(dt.querySelector('.cardName')) : null

    const img = entry.querySelector('img.lazy') || entry.querySelector('img')
    const dataSrc = img ? img.getAttribute('data-src') : null
    // dataSrc tipico: "../images/cardlist/card/OP01-001.png?260806"
    const imageId = dataSrc ? (dataSrc.match(/card\/([^/?]+)\.(?:png|jpg|jpeg|webp)/i) || [])[1] : null
    const imageUrl = cardId ? `${IMAGE_BASE}/${cardId}.png` : null

    const attributeImg = dd ? dd.querySelector('.attribute img') : null

    return {
      cardId,
      rarityCode,
      category, // LEADER | CHARACTER | STAGE | EVENT
      name,
      // Per i LEADER questo campo e' la "vita" (ライフ), per gli altri il costo.
      costOrLife: dd ? numOrNull(textOf(dd.querySelector('.cost'))) : null,
      attribute: attributeImg ? attributeImg.getAttribute('alt') : null,
      power: dd ? numOrNull(textOf(dd.querySelector('.power'))) : null,
      counter: dd ? numOrNull(textOf(dd.querySelector('.counter'))) : null,
      color: dd ? textOf(dd.querySelector('.color')) : null,
      blockIcon: dd ? textOf(dd.querySelector('.block')) : null,
      traits: dd ? textOf(dd.querySelector('.feature')) : null,
      effectText: dd ? textWithBreaks(dd.querySelector('.text')) : null,
      acquisition: dd ? textOf(dd.querySelector('.getInfo')) : null,
      imageId,
      imageUrl,
    }
  }).filter((c) => c.cardId) // scarta eventuali blocchi malformati senza ID
}

/**
 * Da tutte le entry (stampe multiple) per uno stesso card_number, sceglie
 * un record canonico e rileva discrepanze tra stampe invece di ignorarle.
 *
 * Motivo: sul sito ufficiale la stessa ID carta puo' comparire piu' volte
 * (ristampe, promo) con lo STESSO testo, oppure — piu' raramente — con
 * testo leggermente diverso (errata/aggiornamento di bilanciamento tra
 * stampe). Scegliere una fonte alla cieca nasconderebbe il problema; qui
 * lo segnaliamo esplicitamente in `textVariantsDetected` invece di
 * decidere in autonomia quale versione sia "quella giusta".
 */
export function collapseVariants(entries) {
  if (!entries || !entries.length) return null
  const canonical = entries[0]
  const distinctTexts = new Set(entries.map((e) => e.effectText || ''))
  const distinctPower = new Set(entries.map((e) => e.power))
  const textVariantsDetected = distinctTexts.size > 1
  const statVariantsDetected = distinctPower.size > 1

  return {
    ...canonical,
    printCount: entries.length,
    acquisitionSources: [...new Set(entries.map((e) => e.acquisition).filter(Boolean))].slice(0, 10),
    textVariantsDetected,
    statVariantsDetected,
    textVariants: textVariantsDetected ? [...distinctTexts].slice(0, 3) : undefined,
  }
}
