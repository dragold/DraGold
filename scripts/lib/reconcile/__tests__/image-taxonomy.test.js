import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  IMAGE_STATUS,
  RECOVERY_STATUS,
  mapVerdictToTaxonomy,
  auditImageUrl,
  auditCardImages,
} from '../image-taxonomy.js';

// Stesso fake response helper già usato in
// scripts/image-audit/__tests__/crawl-images.test.js — replicato qui (non
// importato) perché quel file è un file di test, non un modulo di libreria:
// non c'è un export riusabile da lì, e introdurne uno solo per questo
// varrebbe la pena solo se il fixture crescesse davvero in complessità.
function fakeRes({ status, contentType, redirected = false, url = 'https://x/y', body = null }) {
  return {
    status,
    redirected,
    url,
    headers: { get: (k) => (k.toLowerCase() === 'content-type' ? contentType : null) },
    arrayBuffer: async () => (body ? new Uint8Array(body).buffer : new ArrayBuffer(0)),
  };
}

// ============================================================================
// mapVerdictToTaxonomy: funzione pura, nessuna rete — copre la tabella di
// mapping dichiarata in testa a image-taxonomy.js.
// ============================================================================

test('mapVerdictToTaxonomy: usable=true -> IMAGE_OK, preserva httpStatus/contentType', () => {
  const verdict = { usable: true, reason: null, probe: { httpStatus: 200, contentType: 'image/jpeg', bytesSampled: 0 } };
  const r = mapVerdictToTaxonomy('https://assets.tcgdex.net/en/base1/1/high.png', verdict);
  assert.equal(r.status, IMAGE_STATUS.OK);
  assert.equal(r.httpStatus, 200);
  assert.equal(r.contentType, 'image/jpeg');
  assert.equal(r.errorCode, null);
  assert.equal(r.source, 'existing');
});

test('mapVerdictToTaxonomy: reason="not_found" -> IMAGE_BROKEN', () => {
  const verdict = { usable: false, reason: 'not_found', probe: { httpStatus: 404, contentType: null } };
  const r = mapVerdictToTaxonomy('https://x/gone.jpg', verdict);
  assert.equal(r.status, IMAGE_STATUS.BROKEN);
  assert.equal(r.httpStatus, 404);
});

test('mapVerdictToTaxonomy: reason="blocked" (403/401) -> IMAGE_BROKEN, errorCode preserva lo status', () => {
  const verdict = { usable: false, reason: 'blocked', probe: { httpStatus: 403, contentType: 'text/html' } };
  const r = mapVerdictToTaxonomy('https://x/img.jpg', verdict);
  assert.equal(r.status, IMAGE_STATUS.BROKEN);
  assert.equal(r.httpStatus, 403);
  assert.equal(r.errorCode, 'HTTP_403');
});

test('mapVerdictToTaxonomy: reason="not_an_image" -> IMAGE_INVALID', () => {
  const verdict = { usable: false, reason: 'not_an_image', probe: { httpStatus: 200, contentType: 'text/html' } };
  const r = mapVerdictToTaxonomy('https://x/img.jpg', verdict);
  assert.equal(r.status, IMAGE_STATUS.INVALID);
  assert.equal(r.httpStatus, 200);
  assert.equal(r.contentType, 'text/html');
});

test('mapVerdictToTaxonomy: reason="transient" -> IMAGE_FETCH_ERROR, mai BROKEN/INVALID', () => {
  const verdict = { usable: false, reason: 'transient', probe: { httpStatus: 503, contentType: null, error: 'transient HTTP 503' } };
  const r = mapVerdictToTaxonomy('https://x/img.jpg', verdict);
  assert.equal(r.status, IMAGE_STATUS.FETCH_ERROR);
  assert.equal(r.errorCode, 'HTTP_503');
});

test('mapVerdictToTaxonomy: transient di rete (nessun httpStatus, errore "timeout") -> errorCode TIMEOUT', () => {
  const verdict = { usable: false, reason: 'transient', probe: { httpStatus: null, contentType: null, error: 'timeout' } };
  const r = mapVerdictToTaxonomy('https://x/img.jpg', verdict);
  assert.equal(r.status, IMAGE_STATUS.FETCH_ERROR);
  assert.equal(r.errorCode, 'TIMEOUT');
});

test('mapVerdictToTaxonomy: transient di rete generico (errore diverso da timeout) -> errorCode NETWORK_ERROR', () => {
  const verdict = { usable: false, reason: 'transient', probe: { httpStatus: null, contentType: null, error: 'ECONNRESET' } };
  const r = mapVerdictToTaxonomy('https://x/img.jpg', verdict);
  assert.equal(r.errorCode, 'NETWORK_ERROR');
});

test('mapVerdictToTaxonomy: url assente o reason="no_url" -> IMAGE_MISSING, source="none", nessun httpStatus', () => {
  const r1 = mapVerdictToTaxonomy(null, { usable: null, reason: 'no_url', probe: null });
  assert.equal(r1.status, IMAGE_STATUS.MISSING);
  assert.equal(r1.url, null);
  assert.equal(r1.source, 'none');

  const r2 = mapVerdictToTaxonomy(null, null);
  assert.equal(r2.status, IMAGE_STATUS.MISSING);
});

test('mapVerdictToTaxonomy: reason non riconosciuto -> IMAGE_FETCH_ERROR, mai un esito deterministico inventato', () => {
  const verdict = { usable: false, reason: 'some_future_reason_not_yet_mapped', probe: { httpStatus: null, contentType: null } };
  const r = mapVerdictToTaxonomy('https://x/img.jpg', verdict);
  assert.equal(r.status, IMAGE_STATUS.FETCH_ERROR);
  assert.equal(r.errorCode, 'UNKNOWN_VERDICT_REASON');
});

test('mapVerdictToTaxonomy: source personalizzato viene preservato (per un futuro candidato di recovery)', () => {
  const verdict = { usable: true, reason: null, probe: { httpStatus: 200, contentType: 'image/png' } };
  const r = mapVerdictToTaxonomy('https://x/img.png', verdict, 'tcgdex');
  assert.equal(r.source, 'tcgdex');
});

test('mapVerdictToTaxonomy: deterministico — stesso input, stesso output, sempre', () => {
  const verdict = { usable: false, reason: 'not_found', probe: { httpStatus: 404, contentType: null } };
  const a = mapVerdictToTaxonomy('https://x/gone.jpg', verdict);
  const b = mapVerdictToTaxonomy('https://x/gone.jpg', verdict);
  assert.deepEqual(a, b);
});

// ============================================================================
// auditImageUrl: integra la parte HTTP reale (via fetchImpl mockato, mai la
// rete) — copre esattamente i casi richiesti dal task.
// ============================================================================

test('auditImageUrl: URL mancante -> IMAGE_MISSING, ZERO chiamate HTTP (nessun traffico per un URL assente)', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return fakeRes({ status: 200, contentType: 'image/jpeg' }); };
  const r = await auditImageUrl(null, { fetchImpl });
  assert.equal(r.status, IMAGE_STATUS.MISSING);
  assert.equal(r.url, null);
  assert.equal(r.source, 'none');
  assert.equal(calls, 0, 'un URL assente non deve mai generare una richiesta HTTP');
});

test('auditImageUrl: URL vuoto/undefined -> IMAGE_MISSING (stesso trattamento di null)', async () => {
  const r1 = await auditImageUrl(undefined, {});
  const r2 = await auditImageUrl('', {});
  assert.equal(r1.status, IMAGE_STATUS.MISSING);
  assert.equal(r2.status, IMAGE_STATUS.MISSING);
});

test('auditImageUrl: immagine valida (200 + content-type image/*) -> IMAGE_OK, source="existing" di default', async () => {
  const fetchImpl = async () => fakeRes({ status: 200, contentType: 'image/webp' });
  const url = 'https://assets.tcgdex.net/en/base1/4/high.webp';
  const r = await auditImageUrl(url, { fetchImpl });
  assert.equal(r.status, IMAGE_STATUS.OK);
  assert.equal(r.url, url);
  assert.equal(r.httpStatus, 200);
  assert.equal(r.contentType, 'image/webp');
  assert.equal(r.source, 'existing');
});

test('auditImageUrl: 404 -> IMAGE_BROKEN', async () => {
  const fetchImpl = async () => fakeRes({ status: 404, contentType: 'text/plain' });
  const r = await auditImageUrl('https://x/gone.jpg', { fetchImpl });
  assert.equal(r.status, IMAGE_STATUS.BROKEN);
  assert.equal(r.httpStatus, 404);
});

test('auditImageUrl: 410 -> IMAGE_BROKEN', async () => {
  const fetchImpl = async () => fakeRes({ status: 410, contentType: 'text/plain' });
  const r = await auditImageUrl('https://x/gone-forever.jpg', { fetchImpl });
  assert.equal(r.status, IMAGE_STATUS.BROKEN);
  assert.equal(r.httpStatus, 410);
});

test('auditImageUrl: 403 (blocked/WAF) -> IMAGE_BROKEN, non IMAGE_INVALID', async () => {
  const fetchImpl = async () => fakeRes({ status: 403, contentType: 'text/html' });
  const r = await auditImageUrl('https://x/img.jpg', { fetchImpl });
  assert.equal(r.status, IMAGE_STATUS.BROKEN);
  assert.equal(r.httpStatus, 403);
});

test('auditImageUrl: 401 (blocked) -> IMAGE_BROKEN', async () => {
  const fetchImpl = async () => fakeRes({ status: 401, contentType: null });
  const r = await auditImageUrl('https://x/img.jpg', { fetchImpl });
  assert.equal(r.status, IMAGE_STATUS.BROKEN);
  assert.equal(r.httpStatus, 401);
});

test('auditImageUrl: 5xx persistente oltre i retry -> IMAGE_FETCH_ERROR, mai IMAGE_BROKEN', async () => {
  const fetchImpl = async () => fakeRes({ status: 503, contentType: null });
  const r = await auditImageUrl('https://x/img.jpg', { fetchImpl, maxRetries: 2 });
  assert.equal(r.status, IMAGE_STATUS.FETCH_ERROR);
  assert.equal(r.httpStatus, 503);
  assert.equal(r.errorCode, 'HTTP_503');
});

test('auditImageUrl: 429 rate-limited oltre i retry -> IMAGE_FETCH_ERROR', async () => {
  const fetchImpl = async () => fakeRes({ status: 429, contentType: null });
  const r = await auditImageUrl('https://x/img.jpg', { fetchImpl, maxRetries: 1 });
  assert.equal(r.status, IMAGE_STATUS.FETCH_ERROR);
  assert.equal(r.httpStatus, 429);
});

test('auditImageUrl: timeout/errore di rete oltre i retry -> IMAGE_FETCH_ERROR, mai interpretato come IMAGE_MISSING o IMAGE_BROKEN', async () => {
  const fetchImpl = async () => { throw new Error('ECONNRESET'); };
  const r = await auditImageUrl('https://x/img.jpg', { fetchImpl, maxRetries: 1 });
  assert.equal(r.status, IMAGE_STATUS.FETCH_ERROR);
  assert.equal(r.httpStatus, null);
  assert.equal(r.errorCode, 'NETWORK_ERROR');
});

test('auditImageUrl: AbortError (timeout reale) -> IMAGE_FETCH_ERROR con errorCode TIMEOUT', async () => {
  const fetchImpl = async () => {
    const err = new Error('The operation was aborted');
    err.name = 'AbortError';
    throw err;
  };
  const r = await auditImageUrl('https://x/img.jpg', { fetchImpl, maxRetries: 0 });
  assert.equal(r.status, IMAGE_STATUS.FETCH_ERROR);
  assert.equal(r.errorCode, 'TIMEOUT');
});

test('auditImageUrl: HTTP 200 ma content-type non-immagine e nessun magic byte riconosciuto -> IMAGE_INVALID', async () => {
  const fetchImpl = async (url, opts) => {
    if (opts.method === 'HEAD') return fakeRes({ status: 200, contentType: null });
    // GET range: body non riconducibile a nessun formato immagine noto
    return fakeRes({ status: 200, contentType: null, body: [0x00, 0x01, 0x02, 0x03] });
  };
  const r = await auditImageUrl('https://x/pagina-errore-travestita.jpg', { fetchImpl });
  assert.equal(r.status, IMAGE_STATUS.INVALID);
  assert.equal(r.httpStatus, 200);
});

test('auditImageUrl: HTTP 200 con content-type text/html esplicito (pagina WAF travestita da OK) -> IMAGE_INVALID', async () => {
  const fetchImpl = async () => fakeRes({ status: 200, contentType: 'text/html' });
  const r = await auditImageUrl('https://x/img.jpg', { fetchImpl });
  assert.equal(r.status, IMAGE_STATUS.INVALID);
  assert.equal(r.contentType, 'text/html');
});

test('LIMITE NOTO (documentato in image-taxonomy.js, non un bug di questo file): un 200 con Content-Type: image/jpeg ma body realmente corrotto viene comunque classificato IMAGE_OK — l\'infrastruttura riusata non fa sniffing dei magic-bytes quando il content-type dichiara già "image/*"', async () => {
  const fetchImpl = async () => fakeRes({ status: 200, contentType: 'image/jpeg', body: [0x00, 0x01, 0x02, 0x03] });
  const r = await auditImageUrl('https://x/corrotta-ma-etichettata-come-immagine.jpg', { fetchImpl });
  assert.equal(r.status, IMAGE_STATUS.OK, 'comportamento reale ereditato da probeUrl, non introdotto qui — vedi commento "LIMITE NOTO" in image-taxonomy.js');
});

test('auditImageUrl: redirect risolto verso immagine valida -> IMAGE_OK (stesso trattamento di A/B in probeUrl)', async () => {
  const fetchImpl = async () => fakeRes({ status: 200, contentType: 'image/jpeg', redirected: true, url: 'https://x/final.jpg' });
  const r = await auditImageUrl('https://x/old-path.jpg', { fetchImpl });
  assert.equal(r.status, IMAGE_STATUS.OK);
});

test('auditImageUrl: preserva sempre httpStatus e contentType nel risultato, anche su esito negativo', async () => {
  const fetchImpl = async () => fakeRes({ status: 404, contentType: 'application/json' });
  const r = await auditImageUrl('https://x/gone.json', { fetchImpl });
  assert.equal(r.httpStatus, 404);
  assert.equal(r.contentType, 'application/json');
});

test('auditImageUrl: bytesSampled viene preservato quando probeUrl campiona byte reali (riuso del dato esistente, nessuna nuova validazione)', async () => {
  const fetchImpl = async (url, opts) => {
    if (opts.method === 'HEAD') return fakeRes({ status: 200, contentType: null });
    return fakeRes({ status: 200, contentType: null, body: [0x00, 0x01, 0x02, 0x03] });
  };
  const r = await auditImageUrl('https://x/img', { fetchImpl });
  assert.equal(r.bytesSampled, 4);
});

test('auditImageUrl: risultato è serializzabile in JSON senza perdita (nessun campo Symbol/funzione/circolare)', async () => {
  const fetchImpl = async () => fakeRes({ status: 200, contentType: 'image/png' });
  const r = await auditImageUrl('https://x/img.png', { fetchImpl });
  const json = JSON.parse(JSON.stringify(r));
  assert.deepEqual(json, r);
});

// ---- Compatibilità Pokémon + One Piece (nessuna logica specifica per TCG) ----

test('auditImageUrl: funziona identicamente su un URL One Piece (Bandai/optcgapi) e su uno Pokémon (TCGdex) — nessuna logica per-TCG', async () => {
  const fetchImpl = async () => fakeRes({ status: 200, contentType: 'image/jpeg' });
  const pokemon = await auditImageUrl('https://assets.tcgdex.net/en/base1/4/high.webp', { fetchImpl });
  const onePieceBandai = await auditImageUrl('https://en.onepiece-cardgame.com/images/cardlist/card/OP01-001.png', { fetchImpl });
  const onePieceOptcgapi = await auditImageUrl('https://optcgapi.com/media/static/Card_Images/OP01-001.jpg', { fetchImpl });
  assert.equal(pokemon.status, IMAGE_STATUS.OK);
  assert.equal(onePieceBandai.status, IMAGE_STATUS.OK);
  assert.equal(onePieceOptcgapi.status, IMAGE_STATUS.OK);
});

test('auditImageUrl: 404 su URL One Piece JA -> IMAGE_BROKEN, stesso comportamento di Pokémon JA', async () => {
  const fetchImpl = async () => fakeRes({ status: 404, contentType: null });
  const r = await auditImageUrl('https://www.onepiece-cardgame.com/images/cardlist/card/OP17-001.png', { fetchImpl });
  assert.equal(r.status, IMAGE_STATUS.BROKEN);
});

// ============================================================================
// auditCardImages: entrambi i campi immagine di una riga cards
// ============================================================================

test('auditCardImages: audita image_url e image_url_hi indipendentemente', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('missing-does-not-matter')) return fakeRes({ status: 404, contentType: null });
    return fakeRes({ status: 200, contentType: 'image/webp' });
  };
  const row = { image_url: 'https://x/low.webp', image_url_hi: null };
  const r = await auditCardImages(row, { fetchImpl });
  assert.equal(r.image_url.status, IMAGE_STATUS.OK);
  assert.equal(r.image_url_hi.status, IMAGE_STATUS.MISSING);
});

test('auditCardImages: riga senza alcuna immagine -> entrambi i campi IMAGE_MISSING, zero richieste HTTP', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return fakeRes({ status: 200, contentType: 'image/png' }); };
  const r = await auditCardImages({ image_url: null, image_url_hi: null }, { fetchImpl });
  assert.equal(r.image_url.status, IMAGE_STATUS.MISSING);
  assert.equal(r.image_url_hi.status, IMAGE_STATUS.MISSING);
  assert.equal(calls, 0);
});

test('auditCardImages: riga undefined/senza campi non lancia, tratta come nessuna immagine', async () => {
  const r = await auditCardImages(undefined, {});
  assert.equal(r.image_url.status, IMAGE_STATUS.MISSING);
  assert.equal(r.image_url_hi.status, IMAGE_STATUS.MISSING);
});

// ============================================================================
// Vocabolario RECOVERY_STATUS: stabile, nessuna logica ancora (STEP 5)
// ============================================================================

test('RECOVERY_STATUS: espone esattamente i 5 nomi richiesti, congelato (nessuna mutazione accidentale)', () => {
  assert.deepEqual(Object.keys(RECOVERY_STATUS).sort(), [
    'AMBIGUOUS',
    'RECOVERABLE_OFFICIAL',
    'RECOVERABLE_OTHER',
    'RECOVERABLE_TCGDEX',
    'UNRESOLVED',
  ]);
  assert.throws(() => { RECOVERY_STATUS.NEW_FIELD = 'x'; }, TypeError, 'Object.freeze deve impedire aggiunte silenziose');
});

test('IMAGE_STATUS: espone esattamente i 5 nomi richiesti dal task, congelato', () => {
  assert.deepEqual(Object.keys(IMAGE_STATUS).sort(), ['BROKEN', 'FETCH_ERROR', 'INVALID', 'MISSING', 'OK']);
  assert.deepEqual(Object.values(IMAGE_STATUS).sort(), [
    'IMAGE_BROKEN',
    'IMAGE_FETCH_ERROR',
    'IMAGE_INVALID',
    'IMAGE_MISSING',
    'IMAGE_OK',
  ]);
});

// ============================================================================
// Garanzia di sola lettura / nessuna scrittura Supabase
// ============================================================================

test('GARANZIA SOLA LETTURA: image-taxonomy.js non importa né menziona Supabase, non chiama insert/update/upsert/delete', () => {
  const path = fileURLToPath(new URL('../image-taxonomy.js', import.meta.url));
  const source = fs.readFileSync(path, 'utf8');
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(withoutComments, /supabase/i);
  assert.doesNotMatch(withoutComments, /process\.env/);
  assert.doesNotMatch(withoutComments, /\.\s*insert\s*\(/);
  assert.doesNotMatch(withoutComments, /\.\s*update\s*\(/);
  assert.doesNotMatch(withoutComments, /\.\s*upsert\s*\(/);
  assert.doesNotMatch(withoutComments, /\.\s*delete\s*\(/);
});
