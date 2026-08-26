// DraGold — Catalog Reconciliation Pipeline
// Image taxonomy layer. STEP 3 dell'architettura descritta in
// CATALOG_RECOVERY_DRYRUN_DESIGN.md — wrapper sottile sopra l'infrastruttura
// HTTP/image-audit già esistente, per la Fase 4 (Image Audit Globale) della
// reconciliation su Pokémon EN/JA + One Piece EN/JA.
//
// ============================================================================
// Cosa riusa, cosa NON reinventa
// ============================================================================
// L'intera logica HTTP (HEAD -> GET-range, retry con backoff esponenziale,
// sniff dei magic bytes, distinzione 404/410 vs 403/401 vs 2xx-non-immagine vs
// transient) vive già in `scripts/image-audit/crawl-images.mjs#probeUrl` ed è
// già wrappata in un verdetto usable/reason da
// `scripts/sources/pokemon-jp/validate-image.mjs#validateImageUrl`. Questo
// file NON duplica nulla di quella logica: importa `validateImageUrl` così
// com'è e si limita a rimappare il suo verdetto (usable/reason) sulla
// tassonomia a 5 stati richiesta per la reconciliation globale (diversa da
// quella di `classify.mjs`, vedi sotto).
//
// Sull'import da scripts/sources/pokemon-jp/: il nome della cartella è
// storico (nata per la sola discovery Pokémon JP), ma `validate-image.mjs` in
// quella cartella è già esso stesso un wrapper generico — non contiene nulla
// specifico di Pokémon, JA, o discovery. Riusarlo da qui non introduce
// nessuna dipendenza reale da quel dominio, e reimplementarlo per "restare
// puliti" sui confini di cartella violerebbe esplicitamente la regola di
// questo step (non duplicare l'HTTP/retry/rate-limit esistente). Se in futuro
// quel file viene spostato in una posizione più neutra (es.
// scripts/image-audit/validate-image.mjs), questo import va aggiornato di
// conseguenza — non prima, per non toccare file fuori scope in questo step.
//
// ============================================================================
// Perché una tassonomia diversa da quella di classify.mjs (Pokémon JP)
// ============================================================================
// `scripts/sources/pokemon-jp/classify.mjs` ha già una tassonomia
// IMAGE_MISSING/IMAGE_INVALID, ma è più grossolana per design: pensata per
// decidere CHANGED/UNCHANGED durante la discovery JP, colloca 404/410,
// 403/401 e "2xx non-immagine" tutti sotto un unico IMAGE_INVALID, e tratta
// gli esiti transient (429/5xx/timeout) come AMBIGUOUS — corretto per il suo
// scopo, ma insufficiente per l'Image Audit Globale richiesto qui, che deve
// poter rispondere separatamente a "quante sono 404 vs quante sono
// content-type sbagliato vs quante sono errori di rete transitori" (Fase 4
// del task). Questo file introduce quindi una tassonomia più fine, esplicita
// e stabile, SENZA toccare classify.mjs (fuori scope, resta la tassonomia
// giusta per il suo consumer attuale, la discovery JP).
//
// IMAGE_OK          - HTTP riuscito, content-type/magic-bytes confermano
//                      un'immagine reale (probe.classification A o B).
// IMAGE_MISSING     - nessun URL da testare (image_url/image_url_hi assente in
//                      origine). Nessuna richiesta HTTP viene fatta in questo
//                      caso — non è un fetch fallito, è l'assenza stessa del
//                      dato da verificare.
// IMAGE_BROKEN      - risposta HTTP chiaramente definitiva e negativa: 404/410
//                      (risorsa non esiste) o 403/401 (bloccato/WAF — la
//                      risorsa non è raggiungibile in modo verificabile, non
//                      diverso nella pratica da "non disponibile" dal punto di
//                      vista della reconciliation, anche se la causa tecnica è
//                      diversa da un 404; decisione esplicita, non implicita —
//                      vedi mapVerdictToTaxonomy).
// IMAGE_INVALID     - HTTP 200, ma il contenuto non è davvero un'immagine
//                      (content-type non-image E i magic bytes campionati non
//                      corrispondono a nessun formato noto). Segnala un
//                      problema sui DATI (URL punta a qualcos'altro), non
//                      sulla rete.
// IMAGE_FETCH_ERROR - esito non deterministico: timeout, errore di rete, 429,
//                      5xx anche dopo i retry già gestiti da probeUrl. MAI
//                      confuso con IMAGE_BROKEN/IMAGE_INVALID: un errore di
//                      rete non prova che l'immagine non esista o sia
//                      malformata, prova solo che non siamo riusciti a
//                      verificarlo in questo run.
//
// Nota sul limite reale della sniffing esistente (onestà sui limiti, non
// promettere più di quanto l'infrastruttura riusata garantisca davvero):
// `probeUrl` considera "immagine" qualunque risposta 2xx con un header
// Content-Type che inizia per `image/`, SENZA verificare i magic-bytes in
// quel caso (li controlla solo quando il content-type è assente/ambiguo). Un
// server che rispondesse 200 con `Content-Type: image/jpeg` ma un body
// realmente corrotto/non-immagine verrebbe quindi classificato IMAGE_OK da
// questo wrapper — non un bug introdotto qui, è il comportamento reale
// dell'infrastruttura riusata, testato esplicitamente sotto
// (`__tests__/image-taxonomy.test.js`, blocco "limite noto") per non
// nasconderlo.
//
// ============================================================================
// Vocabolario di recovery (STEP 5, non implementato qui)
// ============================================================================
// Le costanti RECOVERY_STATUS sono dichiarate ora, stabili, così lo STEP 5
// (image-recovery, non ancora scritto) e qualunque consumer scritto nel
// frattempo possano riferirsi a un nome stabile invece di stringhe libere.
// Nessuna funzione in questo file calcola ancora questi valori — sono solo
// il vocabolario condiviso. Stessi nomi già usati da
// `scripts/image-audit/summarize.mjs#classifyFinal` (RECOVERABLE_TCGDEX/
// RECOVERABLE_OFFICIAL/RECOVERABLE_OTHER/AMBIGUOUS/UNRESOLVED), qui ristretti
// (summarize.mjs ha anche RECOVERABLE_SCRYDEX, qui volutamente accorpato in
// RECOVERABLE_OTHER per restare fedeli esattamente all'elenco richiesto dal
// task — nessuna aggiunta non richiesta).
//
// ============================================================================
// Garanzie di sola lettura
// ============================================================================
// Nessuna scrittura Supabase, nessuna scrittura di alcun tipo: questo modulo
// fa solo richieste HTTP GET/HEAD verso l'URL dell'immagine passata (via
// validateImageUrl -> probeUrl), mai verso Supabase, e non importa né usa
// alcuna credenziale (nessun process.env letto qui).

import { validateImageUrl } from '../../sources/pokemon-jp/validate-image.mjs';

export const IMAGE_STATUS = Object.freeze({
  OK: 'IMAGE_OK',
  MISSING: 'IMAGE_MISSING',
  BROKEN: 'IMAGE_BROKEN',
  INVALID: 'IMAGE_INVALID',
  FETCH_ERROR: 'IMAGE_FETCH_ERROR',
});

export const RECOVERY_STATUS = Object.freeze({
  RECOVERABLE_TCGDEX: 'RECOVERABLE_TCGDEX',
  RECOVERABLE_OFFICIAL: 'RECOVERABLE_OFFICIAL',
  RECOVERABLE_OTHER: 'RECOVERABLE_OTHER',
  AMBIGUOUS: 'AMBIGUOUS',
  UNRESOLVED: 'UNRESOLVED',
});

/**
 * Deriva un errorCode leggibile per un esito non deterministico, dai campi
 * già prodotti da probeUrl (httpStatus/error) — non introduce nessuna nuova
 * classificazione, solo un'etichetta stabile per lo stesso dato già presente.
 *
 * @param {{httpStatus?: number|null, error?: string|null}|null} probe
 * @returns {string|null}
 */
function deriveErrorCode(probe) {
  if (!probe) return null;
  if (probe.httpStatus != null) return `HTTP_${probe.httpStatus}`;
  if (probe.error === 'timeout') return 'TIMEOUT';
  if (probe.error) return 'NETWORK_ERROR';
  return null;
}

/**
 * Funzione PURA (nessun I/O): rimappa un verdetto già calcolato da
 * `validateImageUrl`/`toImageVerdict` (scripts/sources/pokemon-jp/validate-image.mjs)
 * sulla tassonomia IMAGE_OK/IMAGE_MISSING/IMAGE_BROKEN/IMAGE_INVALID/
 * IMAGE_FETCH_ERROR. Separata dalla parte HTTP apposta (design richiesto dal
 * task): testabile senza rete, senza fetch mockato, passando direttamente un
 * verdetto costruito a mano.
 *
 * @param {string|null} url
 * @param {{usable: boolean|null, reason: string|null, probe: object|null}} verdict
 * @param {string} [source='existing']
 * @returns {{status: string, url: string|null, httpStatus: number|null,
 *   contentType: string|null, bytesSampled: number|null, errorCode: string|null,
 *   source: string}}
 */
export function mapVerdictToTaxonomy(url, verdict, source = 'existing') {
  const probe = verdict?.probe || null;
  const httpStatus = probe?.httpStatus ?? null;
  const contentType = probe?.contentType ?? null;
  const bytesSampled = probe?.bytesSampled ?? null;

  if (verdict?.reason === 'no_url' || !url) {
    return { status: IMAGE_STATUS.MISSING, url: null, httpStatus: null, contentType: null, bytesSampled: null, errorCode: null, source: 'none' };
  }

  if (verdict?.usable === true) {
    return { status: IMAGE_STATUS.OK, url, httpStatus, contentType, bytesSampled, errorCode: null, source };
  }

  switch (verdict?.reason) {
    case 'not_found':
      // 404/410 — deterministico, la risorsa non esiste.
      return { status: IMAGE_STATUS.BROKEN, url, httpStatus, contentType, bytesSampled, errorCode: null, source };

    case 'blocked':
      // 403/401 — decisione esplicita (vedi commento di testa al file):
      // trattato come IMAGE_BROKEN ("risposta chiaramente non disponibile"),
      // non come IMAGE_INVALID (che è riservato ai problemi di CONTENUTO, non
      // di accesso) né come IMAGE_FETCH_ERROR (non è un esito transient/
      // riprovabile: probeUrl non ritenta MAI un 403/401, è deterministico
      // per costruzione). errorCode preserva comunque lo status HTTP esatto.
      return { status: IMAGE_STATUS.BROKEN, url, httpStatus, contentType, bytesSampled, errorCode: deriveErrorCode(probe), source };

    case 'not_an_image':
      // 2xx ma content-type/magic-bytes non da immagine — problema sui dati,
      // non sulla rete.
      return { status: IMAGE_STATUS.INVALID, url, httpStatus, contentType, bytesSampled, errorCode: null, source };

    case 'transient':
      // 429/5xx/timeout/network error anche dopo i retry di probeUrl — mai
      // interpretato come prova che l'immagine sia rotta o invalida.
      return { status: IMAGE_STATUS.FETCH_ERROR, url, httpStatus, contentType, bytesSampled, errorCode: deriveErrorCode(probe), source };

    default:
      // Motivo non riconosciuto esplicitamente (non dovrebbe accadere con
      // l'alfabeto attuale di toImageVerdict, ma se validate-image.mjs
      // aggiungesse un nuovo `reason` in futuro senza che questo file venga
      // aggiornato, il fallback corretto è "non possiamo dirlo con certezza",
      // MAI un IMAGE_BROKEN/IMAGE_INVALID inventato da un caso non previsto.
      return { status: IMAGE_STATUS.FETCH_ERROR, url, httpStatus, contentType, bytesSampled, errorCode: deriveErrorCode(probe) || 'UNKNOWN_VERDICT_REASON', source };
  }
}

/**
 * Punto di ingresso principale: audita UN URL immagine e ritorna un risultato
 * strutturato/serializzabile nella tassonomia a 5 stati. Fa una vera chiamata
 * HTTP (via validateImageUrl -> probeUrl) solo se `url` è presente — un URL
 * assente non genera mai traffico di rete, ritorna direttamente IMAGE_MISSING.
 *
 * @param {string|null|undefined} url
 * @param {object} [opts]
 * @param {typeof fetch} [opts.fetchImpl=fetch] - stesso meccanismo di DI già
 *   usato da probeUrl/validateImageUrl; mai la rete reale nei test.
 * @param {number} [opts.timeoutMs] - passato a probeUrl
 * @param {number} [opts.maxRetries] - passato a probeUrl
 * @param {string} [opts.source='existing'] - provenienza dell'URL testato
 *   (es. 'existing' per l'audit dell'URL già in DB; un futuro STEP 5 potrà
 *   passare 'tcgdex'/'official'/... per un candidato di recovery).
 * @returns {Promise<{status: string, url: string|null, httpStatus: number|null,
 *   contentType: string|null, bytesSampled: number|null, errorCode: string|null,
 *   source: string}>}
 */
export async function auditImageUrl(url, opts = {}) {
  const { fetchImpl = fetch, source = 'existing', ...probeOpts } = opts;

  if (!url) {
    return { status: IMAGE_STATUS.MISSING, url: null, httpStatus: null, contentType: null, bytesSampled: null, errorCode: null, source: 'none' };
  }

  const verdict = await validateImageUrl(url, { fetchImpl, ...probeOpts });
  return mapVerdictToTaxonomy(url, verdict, source);
}

/**
 * Scorciatoia per auditare entrambi i campi immagine di una riga `cards`
 * (image_url, image_url_hi) in un colpo solo — comodo per l'orchestratore
 * futuro, che vorrà un risultato per campo, non solo per carta. Non introduce
 * nessuna decisione nuova: chiama semplicemente auditImageUrl due volte.
 *
 * @param {{image_url?: string|null, image_url_hi?: string|null}} row
 * @param {object} [opts] - stessi di auditImageUrl, applicati a entrambe le chiamate
 * @returns {Promise<{image_url: object, image_url_hi: object}>}
 */
export async function auditCardImages(row, opts = {}) {
  const [imageUrl, imageUrlHi] = await Promise.all([
    auditImageUrl(row?.image_url ?? null, opts),
    auditImageUrl(row?.image_url_hi ?? null, opts),
  ]);
  return { image_url: imageUrl, image_url_hi: imageUrlHi };
}
