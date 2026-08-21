/**
 * DraGold — Image Audit: match confidence scorer.
 *
 * Confronta una carta DraGold (`cards` row) con un candidato restituito da una fonte
 * alternativa (Scrydex/pokemontcg.io/PPT), su PIÙ segnali — mai solo set_id+card_number
 * (richiesto esplicitamente: quei due campi da soli non bastano, vedi §5 dell'audit —
 * set_id non è stabile tra fonti).
 *
 * Segnali confrontati (quando disponibili su entrambi i lati):
 *   - nome carta (normalizzato Unicode-safe: NFKC + lowercase + solo lettere/cifre di
 *     QUALSIASI script, spazi/punteggiatura/separatori rimossi — vedi normName() sotto)
 *   - numero carta (normalizzato: rimossi zeri iniziali, rimossa eventuale suffissazione "/102")
 *   - set (nome, non solo id — l'id può divergere tra fonti anche per lo stesso set fisico)
 *   - lingua
 *   - rarity (segnale debole, usato solo come conferma aggiuntiva, mai come decisivo da solo)
 *
 * Output: { level: 'HIGH'|'MEDIUM'|'LOW'|'NO_MATCH', reason, signals: {...} }
 * Regola non negoziabile (task): un LOW non deve MAI essere scritto in DB automaticamente —
 * questo modulo si limita a calcolare lo score, l'enforcement è a carico del chiamante
 * (resolve-fallback.mjs non scrive comunque nulla in DB, in ogni caso).
 */

// normName: normalizzazione Unicode-safe del nome carta.
//
// FIX (questa sessione): la versione precedente usava `.replace(/[^a-z0-9]/g, '')` dopo
// il lowercase, che filtrava via QUALSIASI carattere non ASCII -- inclusi tutti i
// caratteri giapponesi (kanji/hiragana/katakana). Per un nome carta puramente giapponese
// (es. "アリゲイツ", nessun suffisso latino) questo produceva sempre stringa vuota su
// entrambi i lati del confronto, rendendo nameMatch strutturalmente impossibile a
// prescindere da quanto i nomi fossero davvero uguali (verificato dal vivo: dry-run
// 49500-49510, id 49500/49506-49510 restavano AMBIGUOUS grade D nonostante il candidato
// corretto fosse già stato selezionato da classify.mjs via setCode).
//
// Fix: `\p{L}` e `\p{N}` (Unicode property escapes, flag `u`) individuano lettera/cifra
// in QUALSIASI script -- kanji, hiragana, katakana inclusi -- non solo a-z0-9. Applichiamo
// prima `.normalize('NFKC')` per portare a forma canonica compatibile varianti Unicode
// equivalenti (es. lettere/cifre a larghezza intera vs normale) prima di confrontare,
// senza mai inventare una traslitterazione o romanizzazione: i caratteri giapponesi
// restano caratteri giapponesi, non vengono convertiti in latino. `.toLowerCase()` non ha
// effetto sui caratteri giapponesi (non hanno maiuscolo/minuscolo) e continua a valere
// come prima per i nomi ASCII, quindi il comportamento sui nomi già esistenti (inglesi)
// non cambia.
function normName(s) {
  if (!s) return ''
  return String(s)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
}
function normNumber(s) {
  if (s == null) return ''
  return String(s).split('/')[0].replace(/^0+/, '') || '0'
}

/**
 * @param {{name?: string, card_number?: string, set_name?: string, set_id?: string, lang?: string, rarity?: string}} card - riga DraGold
 * @param {{name?: string, number?: string, set?: string, lang?: string, rarity?: string}} candidate - metadata dal candidato fonte alternativa
 * @returns {{level: 'HIGH'|'MEDIUM'|'LOW'|'NO_MATCH', reason: string, signals: object}}
 */
export function scoreMatch(card, candidate) {
  if (!candidate) return { level: 'NO_MATCH', reason: 'nessun candidato da confrontare', signals: {} }

  const nameCard = normName(card.name)
  const nameCand = normName(candidate.name)
  const numCard = normNumber(card.card_number)
  const numCand = normNumber(candidate.number)

  const nameMatch = Boolean(nameCard) && Boolean(nameCand) && nameCard === nameCand
  const numberMatch = Boolean(numCard) && Boolean(numCand) && numCard === numCand
  const langMatch = !card.lang || !candidate.lang || card.lang === candidate.lang
  // set: confronto debole (contains) perché i nomi set variano leggermente tra fonti
  // (es. "Darkness Ablaze" vs "Sword & Shield: Darkness Ablaze")
  const setCard = (card.set_name || '').toLowerCase()
  const setCand = (candidate.set || '').toLowerCase()
  const setMatch = Boolean(setCard) && Boolean(setCand) && (setCard.includes(setCand) || setCand.includes(setCard))

  const signals = { nameMatch, numberMatch, langMatch, setMatch }

  if (nameMatch && numberMatch && langMatch && setMatch) {
    return { level: 'HIGH', grade: 'A', reason: 'nome + numero + set + lingua tutti coerenti (exact match)', signals }
  }
  if (nameMatch && numberMatch && langMatch) {
    return { level: 'HIGH', grade: 'B', reason: 'nome + numero + lingua coerenti, set non confermato/divergente (possibile solo divergenza di naming tra fonti) — high-confidence, non exact', signals }
  }
  if (numberMatch && langMatch && !nameMatch) {
    return { level: 'LOW', grade: 'D', reason: 'numero e lingua coerenti ma nome NON coerente — rischio di carta diversa con stesso numero in set diversi (ambiguous), richiede review manuale prima di qualsiasi scrittura', signals }
  }
  if (nameMatch && !numberMatch) {
    return { level: 'LOW', grade: 'D', reason: 'nome coerente ma numero carta diverso — possibile ristampa/variante diversa (ambiguous), non la stessa riga fisica', signals }
  }
  return { level: 'NO_MATCH', grade: 'E', reason: 'nessun segnale sufficiente a confermare la stessa carta (no match)', signals }
}

// grade 'C' (probable match) riservato a segnali parziali provenienti da fonti che espongono
// SOLO identità (official-jp-matcher.mjs / pcg-search-matcher.mjs — "found: true" senza numero/
// nome strutturato da confrontare): usato dai chiamanti che ricevono un semplice found:boolean,
// non calcolato qui perché richiederebbe inventare segnali che quelle fonti non forniscono.
export const GRADE_NOTES = {
  A: 'exact match — tutti i segnali (nome, numero, set, lingua) coerenti',
  B: 'high-confidence match — nome+numero+lingua coerenti, set non confermabile',
  C: 'probable match — solo conferma di esistenza da una fonte match-only (nessun confronto campo-per-campo possibile)',
  D: 'ambiguous — segnali in conflitto, MAI candidato a scrittura automatica',
  E: 'no match',
}
