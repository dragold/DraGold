import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MANAGED_FIELDS,
  buildCardId,
  resolvePrintVariant,
  assertNoCanonicalFields,
  mergeRow,
  classifyRow,
  needsDetailFetch,
  isIncompleteRow,
  computeNullProtection,
  buildIncomingFromBrief,
  buildIncomingFromDetail,
  buildDiffReportEntry,
  buildBlockedEntry,
  processSupabaseReadResult,
  SupabaseReadError,
} from '../pokemon-sync.js';

// ─── Fixtures (requisito 8 del task di hardening) ────────────────────────────
// Forme reali secondo la documentazione ufficiale TCGdex (verificate in
// sessione precedente): https://tcgdex.dev/reference/card-brief e
// https://tcgdex.dev/reference/card

const CARD_BRIEF = {
  id: 'swsh3-136',
  localId: '136',
  name: 'Furret',
  image: 'https://assets.tcgdex.net/en/swsh/swsh3/136',
  // NB: nessun rarity/variants/illustrator qui — CardBrief non li espone.
};

const CARD_BRIEF_NO_IMAGE = {
  id: 'swsh3-137',
  localId: '137',
  name: 'Sentret',
  // image assente: capita, TCGdex a volte non ha ancora l'asset.
};

const SET_META_BRIEF = { id: 'swsh3', name: 'Darkness Ablaze' }; // da GET /sets (lista)

const SET_DATA_FULL = {
  id: 'swsh3',
  name: 'Darkness Ablaze',
  serie: { id: 'swsh', name: 'Sword & Shield' },
  cards: [CARD_BRIEF],
}; // da GET /sets/{id}

const CARD_FULL_SINGLE_VARIANT = {
  id: 'swsh3-136',
  name: 'Furret',
  rarity: 'Uncommon',
  illustrator: 'tetsuya koizumi',
  category: 'Pokemon',
  variants: { firstEdition: false, holo: false, normal: false, reverse: true, wPromo: false },
};

const CARD_FULL_MULTI_VARIANT = {
  id: 'swsh3-136',
  name: 'Furret',
  rarity: 'Uncommon',
  illustrator: 'tetsuya koizumi',
  variants: { firstEdition: false, holo: false, normal: true, reverse: true, wPromo: false },
};

const CARD_FULL_NO_VARIANT_INFO = {
  id: 'swsh3-136',
  name: 'Furret',
  rarity: 'Rare',
  illustrator: 'someone',
  // variants assente dalla risposta (capita per carte molto vecchie/edge case)
};

const DB_ROW_COMPLETE = {
  id: 'pokemon:tcgdex:swsh3-136:en',
  lang: 'en', tcg: 'pokemon', source: 'tcgdex', source_id: 'swsh3-136',
  name: 'Furret', set_id: 'swsh3', set_name: 'Darkness Ablaze', card_number: '136',
  rarity: 'Uncommon', illustrator: 'tetsuya koizumi',
  image_url: 'https://assets.tcgdex.net/en/swsh/swsh3/136/high.webp',
  image_url_hi: 'https://assets.tcgdex.net/en/swsh/swsh3/136/high.webp',
  series_id: 'swsh', series_name: 'Sword & Shield',
  print_variant: 'reverse',
  updated_at: '2026-08-01T00:00:00.000Z',
};

const DB_ROW_NULL_METADATA = {
  id: 'pokemon:tcgdex:swsh3-136:en',
  lang: 'en', tcg: 'pokemon', source: 'tcgdex', source_id: 'swsh3-136',
  name: 'Furret', set_id: 'swsh3', set_name: 'Darkness Ablaze', card_number: '136',
  rarity: null, illustrator: null,
  image_url: null, image_url_hi: null,
  series_id: null, series_name: null,
  print_variant: null,
  updated_at: '2026-08-01T00:00:00.000Z',
};

const DB_ROW_WITH_CANONICAL = {
  ...DB_ROW_COMPLETE,
  canonical_card_id: '34e65567-97b9-4007-98ea-b94ccd82e75e',
};

// ─── buildCardId ──────────────────────────────────────────────────────────────

test('buildCardId: formato identico a quello storico usato in produzione', () => {
  assert.equal(buildCardId('swsh3', '136', 'en'), 'pokemon:tcgdex:swsh3-136:en');
  assert.equal(buildCardId('sv3pt5', '160', 'ja'), 'pokemon:tcgdex:sv3pt5-160:ja');
});

// ─── resolvePrintVariant ───────────────────────────────────────────────────────

test('resolvePrintVariant: variants assente (CardBrief) -> present:false, nulla inventato', () => {
  const r = resolvePrintVariant(undefined);
  assert.deepEqual(r, { value: null, ambiguous: false, present: false, availableFinishes: [] });
});

test('resolvePrintVariant: variants null -> stesso comportamento di assente', () => {
  const r = resolvePrintVariant(null);
  assert.equal(r.present, false);
  assert.equal(r.value, null);
});

test('resolvePrintVariant: nessuna chiave true -> present:true, value:null (non ambiguo)', () => {
  const r = resolvePrintVariant({ normal: false, holo: false, reverse: false, firstEdition: false });
  assert.equal(r.present, true);
  assert.equal(r.ambiguous, false);
  assert.equal(r.value, null);
  assert.deepEqual(r.availableFinishes, []);
});

test('resolvePrintVariant: esattamente una variante true -> value scalare corretto, non ambiguo', () => {
  const r = resolvePrintVariant(CARD_FULL_SINGLE_VARIANT.variants);
  assert.equal(r.value, 'reverse');
  assert.equal(r.ambiguous, false);
  assert.deepEqual(r.availableFinishes, ['reverse']);
});

test('resolvePrintVariant: più varianti true -> ambiguous:true, value:null, MAI concatenato/inventato', () => {
  const r = resolvePrintVariant(CARD_FULL_MULTI_VARIANT.variants);
  assert.equal(r.ambiguous, true);
  assert.equal(r.value, null); // non "normal,reverse" — quello è il pattern esplicitamente vietato
  assert.deepEqual(r.availableFinishes, ['normal', 'reverse']);
});

test('resolvePrintVariant: chiavi non-booleane vere non contano come variante attiva', () => {
  const r = resolvePrintVariant({ normal: 'true', holo: 1 });
  assert.equal(r.value, null);
  assert.equal(r.ambiguous, false);
});

// ─── assertNoCanonicalFields ────────────────────────────────────────────────────

test('assertNoCanonicalFields: riga pulita non lancia', () => {
  assert.doesNotThrow(() => assertNoCanonicalFields(DB_ROW_COMPLETE));
});

test('assertNoCanonicalFields: canonical_card_id presente -> lancia sempre', () => {
  assert.throws(() => assertNoCanonicalFields(DB_ROW_WITH_CANONICAL), /canonical/);
});

test('assertNoCanonicalFields: qualsiasi campo canonical_* (non solo canonical_card_id) -> lancia', () => {
  assert.throws(() => assertNoCanonicalFields({ id: 'x', canonical_group_id: 'y' }), /canonical/);
});

// ─── mergeRow — il cuore del requisito 4 (protezione NULL) ──────────────────────

test('mergeRow: carta nuova (existingRow null) -> usa i valori in arrivo, nessun errore', () => {
  const incoming = buildIncomingFromBrief(CARD_BRIEF, SET_META_BRIEF, SET_DATA_FULL);
  const merged = mergeRow(null, incoming, { id: 'pokemon:tcgdex:swsh3-136:en', lang: 'en', tcg: 'pokemon', source: 'tcgdex', source_id: 'swsh3-136' });
  assert.equal(merged.name, 'Furret');
  assert.equal(merged.series_id, 'swsh');
  assert.equal(merged.rarity, null); // non ancora fetchato il detail: legittimamente null
});

test('mergeRow: campo assente nel payload in arrivo NON cancella un valore già valido in DB (requisito 4)', () => {
  // Solo dati da discovery (stage 1): rarity/illustrator/print_variant assenti dall'incoming.
  const incoming = buildIncomingFromBrief(CARD_BRIEF, SET_META_BRIEF, SET_DATA_FULL);
  const merged = mergeRow(DB_ROW_COMPLETE, incoming, { id: DB_ROW_COMPLETE.id, lang: 'en', tcg: 'pokemon', source: 'tcgdex', source_id: 'swsh3-136' });
  assert.equal(merged.rarity, 'Uncommon', 'rarity esistente deve sopravvivere, non essere azzerata');
  assert.equal(merged.illustrator, 'tetsuya koizumi');
  assert.equal(merged.print_variant, 'reverse');
});

test('mergeRow: campo remoto esplicitamente null (detail fetchato ma senza rarity) -> valore esistente protetto comunque (scelta conservativa)', () => {
  const incomingDetail = buildIncomingFromDetail({ id: 'x', rarity: null, illustrator: null, variants: undefined });
  const merged = mergeRow(DB_ROW_COMPLETE, incomingDetail, { id: DB_ROW_COMPLETE.id, lang: 'en', tcg: 'pokemon', source: 'tcgdex', source_id: 'swsh3-136' });
  // mergeRow non distingue "null perché il detail non ha trovato nulla" da
  // "campo assente perché non abbiamo chiamato il detail": in entrambi i casi
  // un valore già valido in DB non viene mai cancellato da questo script.
  // Vedi commento su buildIncomingFromDetail per la motivazione della scelta.
  assert.equal(merged.rarity, 'Uncommon');
  assert.equal(merged.illustrator, 'tetsuya koizumi');
});

test('mergeRow: campo remoto null e valore esistente GIA\' null -> resta null (nessun errore, nessuna scrittura fantasma)', () => {
  const incomingDetail = buildIncomingFromDetail({ id: 'x', rarity: null, illustrator: null, variants: undefined });
  const merged = mergeRow(DB_ROW_NULL_METADATA, incomingDetail, { id: DB_ROW_NULL_METADATA.id, lang: 'en', tcg: 'pokemon', source: 'tcgdex', source_id: 'swsh3-136' });
  assert.equal(merged.rarity, null);
  assert.equal(merged.illustrator, null);
});

test('mergeRow: metadata già null in DB, incoming da detail li popola -> UPDATED atteso a valle', () => {
  const incoming = buildIncomingFromDetail(CARD_FULL_SINGLE_VARIANT);
  const merged = mergeRow(DB_ROW_NULL_METADATA, incoming, { id: DB_ROW_NULL_METADATA.id, lang: 'en', tcg: 'pokemon', source: 'tcgdex', source_id: 'swsh3-136' });
  assert.equal(merged.rarity, 'Uncommon');
  assert.equal(merged.print_variant, 'reverse');
});

test('mergeRow: non scrive MAI canonical_card_id anche se existingRow lo contiene', () => {
  const incoming = buildIncomingFromBrief(CARD_BRIEF, SET_META_BRIEF, SET_DATA_FULL);
  const merged = mergeRow(DB_ROW_WITH_CANONICAL, incoming, { id: DB_ROW_WITH_CANONICAL.id, lang: 'en', tcg: 'pokemon', source: 'tcgdex', source_id: 'swsh3-136' });
  assert.equal('canonical_card_id' in merged, false);
  assert.doesNotThrow(() => assertNoCanonicalFields(merged));
});

test('mergeRow: risultato contiene solo id/lang/tcg/source/source_id + MANAGED_FIELDS, nessun campo extra', () => {
  const incoming = buildIncomingFromBrief(CARD_BRIEF, SET_META_BRIEF, SET_DATA_FULL);
  const merged = mergeRow(null, incoming, { id: 'x', lang: 'en', tcg: 'pokemon', source: 'tcgdex', source_id: 'swsh3-136' });
  const allowed = new Set(['id', 'lang', 'tcg', 'source', 'source_id', ...MANAGED_FIELDS]);
  for (const k of Object.keys(merged)) assert.ok(allowed.has(k), `campo inatteso nel merge: ${k}`);
});

// ─── FIX bug strutturale: source/source_id NOT NULL senza default ─────────────
// Regressione riprodotta prima del fix: un batch di upsert con almeno una
// carta NEW falliva per intero (violazione vincolo NOT NULL su
// `cards.source`/`cards.source_id`) perché mergeRow non li scriveva mai.
// Questi test bloccano la regressione: un identity incompleta deve fallire
// RUMOROSAMENTE qui, in memoria, mai silenziosamente arrivare a un upsert
// Supabase con `source`/`source_id` assenti.

test('mergeRow: identity senza source -> lancia (mai una riga upsert senza source)', () => {
  const incoming = buildIncomingFromBrief(CARD_BRIEF, SET_META_BRIEF, SET_DATA_FULL);
  assert.throws(
    () => mergeRow(null, incoming, { id: 'x', lang: 'en', tcg: 'pokemon', source_id: 'swsh3-136' }),
    /assertCompleteIdentity/,
  );
});

test('mergeRow: identity senza source_id -> lancia (mai una riga upsert senza source_id)', () => {
  const incoming = buildIncomingFromBrief(CARD_BRIEF, SET_META_BRIEF, SET_DATA_FULL);
  assert.throws(
    () => mergeRow(null, incoming, { id: 'x', lang: 'en', tcg: 'pokemon', source: 'tcgdex' }),
    /assertCompleteIdentity/,
  );
});

test('mergeRow: identity completa (source/source_id inclusi) -> merged.source e merged.source_id sempre valorizzati, per carta NEW', () => {
  const incoming = buildIncomingFromBrief(CARD_BRIEF, SET_META_BRIEF, SET_DATA_FULL);
  const merged = mergeRow(null, incoming, { id: 'pokemon:tcgdex:swsh3-136:en', lang: 'en', tcg: 'pokemon', source: 'tcgdex', source_id: 'swsh3-136' });
  assert.equal(merged.source, 'tcgdex');
  assert.equal(merged.source_id, 'swsh3-136');
});

test('mergeRow: identity completa -> merged.source/source_id valorizzati anche per carta esistente (UPDATE), coerenti con identity, non con existingRow', () => {
  const incoming = buildIncomingFromBrief(CARD_BRIEF, SET_META_BRIEF, SET_DATA_FULL);
  const merged = mergeRow(DB_ROW_COMPLETE, incoming, { id: DB_ROW_COMPLETE.id, lang: 'en', tcg: 'pokemon', source: 'tcgdex', source_id: 'swsh3-136' });
  assert.equal(merged.source, 'tcgdex');
  assert.equal(merged.source_id, 'swsh3-136');
});

// ─── classifyRow ────────────────────────────────────────────────────────────────

test('classifyRow: nessuna riga esistente -> NEW, changes = tutti i campi non-null del merge', () => {
  const incoming = buildIncomingFromBrief(CARD_BRIEF, SET_META_BRIEF, SET_DATA_FULL);
  const merged = mergeRow(null, incoming, { id: 'x', lang: 'en', tcg: 'pokemon', source: 'tcgdex', source_id: 'swsh3-136' });
  const { classification, changes } = classifyRow(null, merged);
  assert.equal(classification, 'NEW');
  assert.ok(changes.some(c => c.field === 'name' && c.after === 'Furret'));
  assert.ok(changes.every(c => c.before === null));
});

test('classifyRow: riga esistente identica al merge -> UNCHANGED', () => {
  const { classification, changes } = classifyRow(DB_ROW_COMPLETE, { ...DB_ROW_COMPLETE });
  assert.equal(classification, 'UNCHANGED');
  assert.deepEqual(changes, []);
});

test('classifyRow: un solo campo diverso -> UPDATED con un solo change, before/after corretti', () => {
  const merged = { ...DB_ROW_COMPLETE, rarity: 'Rare' };
  const { classification, changes } = classifyRow(DB_ROW_COMPLETE, merged);
  assert.equal(classification, 'UPDATED');
  assert.equal(changes.length, 1);
  assert.deepEqual(changes[0], { field: 'rarity', before: 'Uncommon', after: 'Rare' });
});

test('classifyRow: undefined e null sono equivalenti nel confronto (nessun falso UPDATED)', () => {
  const existing = { ...DB_ROW_COMPLETE, illustrator: undefined };
  const merged = { ...DB_ROW_COMPLETE, illustrator: null };
  const { classification } = classifyRow(existing, merged);
  assert.equal(classification, 'UNCHANGED');
});

// ─── needsDetailFetch ───────────────────────────────────────────────────────────

test('needsDetailFetch: carta nuova (nessuna riga) -> sempre true', () => {
  assert.equal(needsDetailFetch(null), true);
  assert.equal(needsDetailFetch(undefined), true);
});

test('needsDetailFetch: metadata già presenti (rarity+illustrator non null) -> false, non ri-scarica', () => {
  assert.equal(needsDetailFetch(DB_ROW_COMPLETE), false);
});

test('needsDetailFetch: metadata null in DB -> true (rarity mancante)', () => {
  assert.equal(needsDetailFetch(DB_ROW_NULL_METADATA), true);
});

test('needsDetailFetch: solo illustrator null, resto completo -> true', () => {
  assert.equal(needsDetailFetch({ ...DB_ROW_COMPLETE, illustrator: null }), true);
});

test('needsDetailFetch: forceDetail=true forza il refetch anche se già completo', () => {
  assert.equal(needsDetailFetch(DB_ROW_COMPLETE, { forceDetail: true }), true);
});

test('needsDetailFetch: print_variant null da solo NON forza il refetch (gap dichiarato, non un trigger)', () => {
  const row = { ...DB_ROW_COMPLETE, print_variant: null };
  assert.equal(needsDetailFetch(row), false);
});

test('needsDetailFetch: staleDays supera la soglia -> true', () => {
  const now = new Date('2026-08-13T00:00:00.000Z');
  const row = { ...DB_ROW_COMPLETE, updated_at: '2026-01-01T00:00:00.000Z' };
  assert.equal(needsDetailFetch(row, { staleDays: 30, now }), true);
});

test('needsDetailFetch: staleDays non superata -> false', () => {
  const now = new Date('2026-08-13T00:00:00.000Z');
  const row = { ...DB_ROW_COMPLETE, updated_at: '2026-08-10T00:00:00.000Z' };
  assert.equal(needsDetailFetch(row, { staleDays: 30, now }), false);
});

test('needsDetailFetch: staleDays non fornito (default) -> non attivo, nessun refetch "a tempo" implicito', () => {
  const now = new Date('2026-08-13T00:00:00.000Z');
  const row = { ...DB_ROW_COMPLETE, updated_at: '2020-01-01T00:00:00.000Z' };
  assert.equal(needsDetailFetch(row, { now }), false);
});

// ─── buildIncomingFromBrief / buildIncomingFromDetail ────────────────────────────

test('buildIncomingFromBrief: mappa CardBrief + Set completo, mai rarity/illustrator/print_variant', () => {
  const incoming = buildIncomingFromBrief(CARD_BRIEF, SET_META_BRIEF, SET_DATA_FULL);
  assert.equal(incoming.name, 'Furret');
  assert.equal(incoming.set_id, 'swsh3');
  assert.equal(incoming.series_id, 'swsh');
  assert.equal(incoming.series_name, 'Sword & Shield');
  assert.equal(incoming.image_url, 'https://assets.tcgdex.net/en/swsh/swsh3/136/high.webp');
  assert.equal('rarity' in incoming, false);
  assert.equal('illustrator' in incoming, false);
  assert.equal('print_variant' in incoming, false);
});

test('buildIncomingFromBrief: card senza image -> image_url null, non un URL indovinato', () => {
  const incoming = buildIncomingFromBrief(CARD_BRIEF_NO_IMAGE, SET_META_BRIEF, SET_DATA_FULL);
  assert.equal(incoming.image_url, null);
  assert.equal(incoming.image_url_hi, null);
});

test('buildIncomingFromBrief: set_id maiuscolo (TCGdex /ja/sets) normalizzato a minuscolo, coerente col resto del catalogo', () => {
  // Verificato dal vivo 2026-09-02: TCGdex restituisce l'id dello stesso set
  // con casing diverso a seconda dell'endpoint/lingua interrogato (/en/sets
  // -> "sv10", /ja/sets -> "SV10") — senza normalizzare, questa funzione
  // scriveva duplicati sotto set_id maiuscolo. Vedi supabase/migrations/
  // 20260902140000_dedupe_ja_set_id_casing.sql per il cleanup delle righe
  // gia' duplicate da questo bug prima del fix.
  const incoming = buildIncomingFromBrief(CARD_BRIEF, { id: 'SV10', name: 'Team Rocket no Eikou' }, SET_DATA_FULL);
  assert.equal(incoming.set_id, 'sv10');
});

test('buildIncomingFromBrief: setData.serie assente -> series_id/series_name null, non inventati', () => {
  const incoming = buildIncomingFromBrief(CARD_BRIEF, SET_META_BRIEF, { name: 'Darkness Ablaze' });
  assert.equal(incoming.series_id, null);
  assert.equal(incoming.series_name, null);
});

test('buildIncomingFromDetail: Card completo con variante singola -> rarity/illustrator/print_variant popolati', () => {
  const incoming = buildIncomingFromDetail(CARD_FULL_SINGLE_VARIANT);
  assert.equal(incoming.rarity, 'Uncommon');
  assert.equal(incoming.illustrator, 'tetsuya koizumi');
  assert.equal(incoming.print_variant, 'reverse');
  assert.equal(incoming._printVariantInfo.ambiguous, false);
});

test('buildIncomingFromDetail: Card completo con più varianti -> print_variant null, info ambiguous per il report', () => {
  const incoming = buildIncomingFromDetail(CARD_FULL_MULTI_VARIANT);
  assert.equal(incoming.print_variant, null);
  assert.equal(incoming._printVariantInfo.ambiguous, true);
  assert.deepEqual(incoming._printVariantInfo.availableFinishes, ['normal', 'reverse']);
});

test('buildIncomingFromDetail: Card completo senza campo variants -> print_variant null, non ambiguo, non inventato', () => {
  const incoming = buildIncomingFromDetail(CARD_FULL_NO_VARIANT_INFO);
  assert.equal(incoming.print_variant, null);
  assert.equal(incoming._printVariantInfo.ambiguous, false);
  assert.equal(incoming._printVariantInfo.present, false);
});

test('buildIncomingFromDetail: _printVariantInfo non è un managed field, mergeRow lo ignora senza errori', () => {
  const incoming = buildIncomingFromDetail(CARD_FULL_SINGLE_VARIANT);
  const merged = mergeRow(DB_ROW_NULL_METADATA, incoming, { id: DB_ROW_NULL_METADATA.id, lang: 'en', tcg: 'pokemon', source: 'tcgdex', source_id: 'swsh3-136' });
  assert.equal('_printVariantInfo' in merged, false);
});

// ─── buildDiffReportEntry — forma del report --dry-run (requisito 7) ────────────

test('buildDiffReportEntry: NEW espone id/classification/changes/warnings/detailFetched', () => {
  const incoming = buildIncomingFromBrief(CARD_BRIEF, SET_META_BRIEF, SET_DATA_FULL);
  const merged = mergeRow(null, incoming, { id: 'x', lang: 'en', tcg: 'pokemon', source: 'tcgdex', source_id: 'swsh3-136' });
  const entry = buildDiffReportEntry('x', null, merged);
  assert.equal(entry.classification, 'NEW');
  assert.equal(Array.isArray(entry.changes), true);
  assert.deepEqual(entry.warnings, []);
});

test('buildDiffReportEntry: UPDATED riporta before/after per il campo cambiato', () => {
  const merged = { ...DB_ROW_COMPLETE, rarity: 'Rare' };
  const entry = buildDiffReportEntry(DB_ROW_COMPLETE.id, DB_ROW_COMPLETE, merged);
  assert.equal(entry.classification, 'UPDATED');
  assert.deepEqual(entry.changes, [{ field: 'rarity', before: 'Uncommon', after: 'Rare' }]);
});

test('buildDiffReportEntry: variant ambiguo produce un warning esplicito, print_variant resta invariato', () => {
  const incoming = buildIncomingFromDetail(CARD_FULL_MULTI_VARIANT);
  const merged = mergeRow(DB_ROW_NULL_METADATA, incoming, { id: DB_ROW_NULL_METADATA.id, lang: 'en', tcg: 'pokemon', source: 'tcgdex', source_id: 'swsh3-136' });
  const entry = buildDiffReportEntry(DB_ROW_NULL_METADATA.id, DB_ROW_NULL_METADATA, merged, {
    printVariantInfo: incoming._printVariantInfo,
    detailFetched: true,
  });
  assert.equal(entry.warnings.length, 1);
  assert.match(entry.warnings[0], /PRINT_VARIANT_AMBIGUOUS_MULTI_FINISH/);
  assert.equal(merged.print_variant, null);
  assert.equal(entry.detailFetched, true);
});

test('buildDiffReportEntry: UNCHANGED quando merge coincide con existing, nessun warning se variant non ambiguo', () => {
  const entry = buildDiffReportEntry(DB_ROW_COMPLETE.id, DB_ROW_COMPLETE, { ...DB_ROW_COMPLETE });
  assert.equal(entry.classification, 'UNCHANGED');
  assert.deepEqual(entry.warnings, []);
});

// ─── TASK "DRY-RUN SAFETY + REPORT HARDENING" — nuovi test ───────────────────

// A. Supabase read failure -> throw, mai una Map vuota, nessun falso NEW.

test('[A] processSupabaseReadResult: error presente -> lancia SupabaseReadError (mai una Map vuota silenziosa)', () => {
  assert.throws(
    () => processSupabaseReadResult(null, { message: 'network unreachable' }, { setId: 'swsh3', lang: 'en' }),
    (err) => {
      assert.ok(err instanceof SupabaseReadError);
      assert.equal(err.name, 'SUPABASE_READ_FAILED');
      assert.match(err.message, /SUPABASE_READ_FAILED/);
      assert.match(err.message, /swsh3\/en/);
      return true;
    }
  );
});

test('[A] processSupabaseReadResult: error presente -> la funzione non ritorna nulla di utilizzabile come classificazione NEW (throw impedisce qualunque uso a valle)', () => {
  // Non c'è un "return" da controllare: il punto del test è che l'eccezione
  // impedisce strutturalmente che il chiamante prosegua fino a costruire una
  // Map (vuota o no) da cui derivare falsi NEW — il throw stesso è la garanzia.
  assert.throws(() => processSupabaseReadResult(undefined, { message: 'timeout' }));
});

test('[A] processSupabaseReadResult: nessun errore -> Map popolata, canonical_card_id rimosso dalla riga ma tracciato in canonicalIds', () => {
  const data = [
    { id: 'a', name: 'X', canonical_card_id: 'uuid-1' },
    { id: 'b', name: 'Y', canonical_card_id: null },
  ];
  const { map, canonicalIds } = processSupabaseReadResult(data, null);
  assert.equal(map.size, 2);
  assert.equal('canonical_card_id' in map.get('a'), false);
  assert.equal(canonicalIds.has('a'), true);
  assert.equal(canonicalIds.has('b'), false);
  assert.doesNotThrow(() => assertNoCanonicalFields(map.get('a')));
});

test('[A] processSupabaseReadResult: data assente/null e nessun errore -> Map vuota LEGITTIMA (set davvero senza carte, non un fallimento mascherato)', () => {
  const { map, canonicalIds } = processSupabaseReadResult(null, null);
  assert.equal(map.size, 0);
  assert.equal(canonicalIds.size, 0);
});

// B. DETAIL_FETCH_REQUIRED: carta nuova, metadata mancanti, force detail.

test('[B] needsDetailFetch + buildDiffReportEntry: carta nuova -> detailFetchRequired true, detailFetchSkipped false', () => {
  assert.equal(needsDetailFetch(null), true);
  const incoming = buildIncomingFromDetail(CARD_FULL_SINGLE_VARIANT);
  const merged = mergeRow(null, incoming, { id: 'x', lang: 'en', tcg: 'pokemon', source: 'tcgdex', source_id: 'swsh3-136' });
  const entry = buildDiffReportEntry('x', null, merged, {
    printVariantInfo: incoming._printVariantInfo, detailFetched: true, detailFetchRequired: true, existed: false,
  });
  assert.equal(entry.detailFetchRequired, true);
  assert.equal(entry.detailFetchSkipped, false);
});

test('[B] needsDetailFetch + buildDiffReportEntry: metadata mancanti in DB -> detailFetchRequired true', () => {
  assert.equal(needsDetailFetch(DB_ROW_NULL_METADATA), true);
  const incoming = buildIncomingFromDetail(CARD_FULL_SINGLE_VARIANT);
  const merged = mergeRow(DB_ROW_NULL_METADATA, incoming, { id: DB_ROW_NULL_METADATA.id, lang: 'en', tcg: 'pokemon', source: 'tcgdex', source_id: 'swsh3-136' });
  const entry = buildDiffReportEntry(DB_ROW_NULL_METADATA.id, DB_ROW_NULL_METADATA, merged, {
    printVariantInfo: incoming._printVariantInfo, detailFetched: true, detailFetchRequired: true, existed: true, incomplete: true,
  });
  assert.equal(entry.detailFetchRequired, true);
  assert.equal(entry.incomplete, true);
});

test('[B] needsDetailFetch: forceDetail=true -> true anche su riga già completa', () => {
  assert.equal(needsDetailFetch(DB_ROW_COMPLETE, { forceDetail: true }), true);
});

// C. DETAIL_FETCH_SKIPPED: record già completo, nessun fetch inutile.

test('[C] needsDetailFetch + buildDiffReportEntry: record già completo -> detailFetchSkipped true, nessun fetch richiesto', () => {
  assert.equal(needsDetailFetch(DB_ROW_COMPLETE), false);
  const entry = buildDiffReportEntry(DB_ROW_COMPLETE.id, DB_ROW_COMPLETE, { ...DB_ROW_COMPLETE }, {
    detailFetchRequired: false, existed: true, incomplete: false,
  });
  assert.equal(entry.detailFetchRequired, false);
  assert.equal(entry.detailFetchSkipped, true);
  assert.equal(entry.incomplete, false);
});

// D. VARIANT_AMBIGUOUS: più finish, nessuna concatenazione, print_variant preservato.

test('[D] buildDiffReportEntry: più finish veri -> variantAmbiguous booleano esplicito true, print_variant resta null (mai concatenato)', () => {
  const incoming = buildIncomingFromDetail(CARD_FULL_MULTI_VARIANT);
  const merged = mergeRow(DB_ROW_NULL_METADATA, incoming, { id: DB_ROW_NULL_METADATA.id, lang: 'en', tcg: 'pokemon', source: 'tcgdex', source_id: 'swsh3-136' });
  const entry = buildDiffReportEntry(DB_ROW_NULL_METADATA.id, DB_ROW_NULL_METADATA, merged, {
    printVariantInfo: incoming._printVariantInfo, detailFetched: true, detailFetchRequired: true,
  });
  assert.equal(entry.variantAmbiguous, true);
  assert.equal(entry.variantPresent, true);
  assert.equal(merged.print_variant, null);
  assert.notEqual(merged.print_variant, 'normal,reverse'); // pattern esplicitamente vietato
});

test('[D] buildDiffReportEntry: finish singolo -> variantPresent true, variantAmbiguous false', () => {
  const incoming = buildIncomingFromDetail(CARD_FULL_SINGLE_VARIANT);
  const merged = mergeRow(null, incoming, { id: 'x', lang: 'en', tcg: 'pokemon', source: 'tcgdex', source_id: 'swsh3-136' });
  const entry = buildDiffReportEntry('x', null, merged, { printVariantInfo: incoming._printVariantInfo, detailFetched: true });
  assert.equal(entry.variantPresent, true);
  assert.equal(entry.variantAmbiguous, false);
});

// E. CANONICAL_PROTECTED: input DB contiene canonical_card_id, output non lo modifica.

test('[E] canonical_card_id in DB -> canonicalProtected=true nel report, ma MAI presente/modificato nel merge', () => {
  const data = [{ ...DB_ROW_COMPLETE, canonical_card_id: '34e65567-97b9-4007-98ea-b94ccd82e75e' }];
  const { map, canonicalIds } = processSupabaseReadResult(data, null);
  const existingRow = map.get(DB_ROW_COMPLETE.id);
  assert.equal('canonical_card_id' in existingRow, false);
  assert.equal(canonicalIds.has(DB_ROW_COMPLETE.id), true);

  const incoming = buildIncomingFromBrief(CARD_BRIEF, SET_META_BRIEF, SET_DATA_FULL);
  const merged = mergeRow(existingRow, incoming, { id: DB_ROW_COMPLETE.id, lang: 'en', tcg: 'pokemon', source: 'tcgdex', source_id: 'swsh3-136' });
  assert.equal('canonical_card_id' in merged, false);
  assert.doesNotThrow(() => assertNoCanonicalFields(merged));

  const entry = buildDiffReportEntry(DB_ROW_COMPLETE.id, existingRow, merged, {
    canonicalProtected: canonicalIds.has(DB_ROW_COMPLETE.id),
  });
  assert.equal(entry.canonicalProtected, true);
});

test('[E] nessun canonical_card_id in DB -> canonicalProtected=false', () => {
  const data = [{ ...DB_ROW_COMPLETE, canonical_card_id: null }];
  const { canonicalIds } = processSupabaseReadResult(data, null);
  assert.equal(canonicalIds.has(DB_ROW_COMPLETE.id), false);
});

// F. NULL_PROTECTED: DB contiene valore, incoming null, valore preservato.

test('[F] computeNullProtection: incoming null su campo DB valido -> nullProtected true, campo elencato (es. illustrator="Ken Sugimori" preservato)', () => {
  const dbRow = { ...DB_ROW_COMPLETE, illustrator: 'Ken Sugimori' };
  const incoming = buildIncomingFromDetail({ id: 'x', rarity: null, illustrator: null, variants: undefined });
  const { nullProtected, fields } = computeNullProtection(dbRow, incoming);
  assert.equal(nullProtected, true);
  assert.ok(fields.includes('illustrator'));
  assert.ok(fields.includes('rarity'));

  // E il merge deve davvero preservare il valore, non solo segnalarlo:
  const merged = mergeRow(dbRow, incoming, { id: dbRow.id, lang: 'en', tcg: 'pokemon', source: 'tcgdex', source_id: 'swsh3-136' });
  assert.equal(merged.illustrator, 'Ken Sugimori');
});

test('[F] computeNullProtection: existingRow assente (carta nuova) -> mai protected, nulla da proteggere', () => {
  const incoming = buildIncomingFromBrief(CARD_BRIEF, SET_META_BRIEF, SET_DATA_FULL);
  const { nullProtected, fields } = computeNullProtection(null, incoming);
  assert.equal(nullProtected, false);
  assert.deepEqual(fields, []);
});

test('[F] computeNullProtection: incoming valorizza i campi -> quei campi non compaiono come protetti', () => {
  const incoming = buildIncomingFromDetail(CARD_FULL_SINGLE_VARIANT);
  const { fields } = computeNullProtection(DB_ROW_COMPLETE, incoming);
  assert.equal(fields.includes('rarity'), false);
  assert.equal(fields.includes('illustrator'), false);
});

// G. Detail fetch failure -> BLOCKED, nessun merge parziale, nessuna scrittura.

test('[G] buildBlockedEntry: detail fetch fallito -> BLOCKED, changes vuoto (nessun merge parziale), detailFetched false', () => {
  const entry = buildBlockedEntry('pokemon:tcgdex:swsh3-136:en', { existed: true, incomplete: true, canonicalProtected: true });
  assert.equal(entry.classification, 'BLOCKED');
  assert.deepEqual(entry.changes, []);
  assert.equal(entry.detailFetched, false);
  assert.equal(entry.reason, 'DETAIL_FETCH_FAILED');
  assert.equal(entry.canonicalProtected, true);
  assert.equal(entry.nullProtected, false); // nessun merge avvenuto, nulla è stato "protetto" perché nulla è stato scritto
});

test('[G] buildBlockedEntry: valori di default sicuri se non specificato altro (nessuna carta preesistente)', () => {
  const entry = buildBlockedEntry('x');
  assert.equal(entry.existed, false);
  assert.equal(entry.incomplete, false);
  assert.equal(entry.canonicalProtected, false);
  assert.equal(entry.classification, 'BLOCKED');
});

// ─── isIncompleteRow (estratta da needsDetailFetch, requisito 3) ─────────────

test('isIncompleteRow: existingRow assente -> false (una carta nuova non è "incompleta", è NEW)', () => {
  assert.equal(isIncompleteRow(null), false);
  assert.equal(isIncompleteRow(undefined), false);
});

test('isIncompleteRow: rarity o illustrator null -> true', () => {
  assert.equal(isIncompleteRow(DB_ROW_NULL_METADATA), true);
  assert.equal(isIncompleteRow({ ...DB_ROW_COMPLETE, illustrator: null }), true);
});

test('isIncompleteRow: rarity e illustrator entrambi presenti -> false', () => {
  assert.equal(isIncompleteRow(DB_ROW_COMPLETE), false);
});
