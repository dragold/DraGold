import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchCardsPage,
  fetchAllCardsForReconciliation,
  fetchDbCatalogSlice,
  safeErrorMessage,
  SupabaseReadError,
  DEFAULT_COLUMNS,
} from '../supabase-read.js';

// ============================================================================
// Mock client Supabase: replica solo la parte di query builder usata da
// supabase-read.js (.from().select().eq().order().range(), thenable) e
// registra ogni chiamata per poter fare assert sulle query effettivamente
// costruite. I metodi di scrittura (.insert/.update/.upsert/.delete) sono
// spie che NON eseguono nulla e incrementano un contatore condiviso — la
// "garanzia di sola lettura" richiesta dal task si verifica controllando che
// quel contatore resti 0 dopo operazioni normali (vedi blocco dedicato sotto).
// ============================================================================

function createMockClient({ responses } = {}) {
  const calls = [];
  const writeAttempts = { insert: 0, update: 0, upsert: 0, delete: 0 };
  let callIndex = 0;

  const client = {
    from(table) {
      const state = { table, selectCols: null, filters: [], order: null, range: null };
      const builder = {
        select(cols) {
          state.selectCols = cols;
          return builder;
        },
        eq(k, v) {
          state.filters.push([k, v]);
          return builder;
        },
        order(k, o) {
          state.order = [k, o];
          return builder;
        },
        range(a, b) {
          state.range = [a, b];
          calls.push({ ...state, filters: [...state.filters] });
          const idx = callIndex++;
          const resp =
            typeof responses === 'function'
              ? responses(idx, state)
              : (responses && responses[idx]) || { data: [], error: null };
          builder._promise = Promise.resolve(resp);
          return builder;
        },
        then(resolve, reject) {
          return (builder._promise || Promise.resolve({ data: [], error: null })).then(resolve, reject);
        },
        insert(...args) {
          writeAttempts.insert += 1;
          return builder;
        },
        update(...args) {
          writeAttempts.update += 1;
          return builder;
        },
        upsert(...args) {
          writeAttempts.upsert += 1;
          return builder;
        },
        delete(...args) {
          writeAttempts.delete += 1;
          return builder;
        },
      };
      return builder;
    },
  };

  return { client, calls, writeAttempts };
}

// ---- fetchCardsPage: validazione parametri ----

test('fetchCardsPage: lancia TypeError se client non ha .from()', async () => {
  await assert.rejects(() => fetchCardsPage({}, { tcg: 'pokemon', lang: 'en' }), TypeError);
});

test('fetchCardsPage: lancia TypeError se tcg mancante', async () => {
  const { client } = createMockClient({ responses: [{ data: [], error: null }] });
  await assert.rejects(() => fetchCardsPage(client, { lang: 'en' }), TypeError);
});

test('fetchCardsPage: lancia TypeError se lang mancante', async () => {
  const { client } = createMockClient({ responses: [{ data: [], error: null }] });
  await assert.rejects(() => fetchCardsPage(client, { tcg: 'pokemon' }), TypeError);
});

test('fetchCardsPage: lancia TypeError su offset/limit invalidi', async () => {
  const { client } = createMockClient({ responses: [{ data: [], error: null }] });
  await assert.rejects(() => fetchCardsPage(client, { tcg: 'pokemon', lang: 'en', offset: -1 }), TypeError);
  await assert.rejects(() => fetchCardsPage(client, { tcg: 'pokemon', lang: 'en', limit: 0 }), TypeError);
  await assert.rejects(() => fetchCardsPage(client, { tcg: 'pokemon', lang: 'en', limit: 1.5 }), TypeError);
});

// ---- fetchCardsPage: forma della query costruita ----

test('fetchCardsPage: filtra su tcg/lang, seleziona solo DEFAULT_COLUMNS, mai select("*")', async () => {
  const { client, calls } = createMockClient({ responses: [{ data: [], error: null }] });
  await fetchCardsPage(client, { tcg: 'onepiece', lang: 'ja' });
  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.equal(call.table, 'cards');
  assert.equal(call.selectCols, DEFAULT_COLUMNS.join(','));
  assert.notEqual(call.selectCols, '*');
  assert.deepEqual(call.filters, [
    ['tcg', 'onepiece'],
    ['lang', 'ja'],
  ]);
});

test('fetchCardsPage: setId opzionale aggiunge un filtro eq("set_id", ...) solo se presente', async () => {
  const { client, calls } = createMockClient({ responses: [{ data: [], error: null }, { data: [], error: null }] });
  await fetchCardsPage(client, { tcg: 'pokemon', lang: 'en' });
  await fetchCardsPage(client, { tcg: 'pokemon', lang: 'en', setId: 'svp' });
  assert.deepEqual(calls[0].filters, [
    ['tcg', 'pokemon'],
    ['lang', 'en'],
  ]);
  assert.deepEqual(calls[1].filters, [
    ['tcg', 'pokemon'],
    ['lang', 'en'],
    ['set_id', 'svp'],
  ]);
});

test('fetchCardsPage: usa range(offset, offset+limit-1) e order deterministico su id', async () => {
  const { client, calls } = createMockClient({ responses: [{ data: [], error: null }] });
  await fetchCardsPage(client, { tcg: 'pokemon', lang: 'en', offset: 500, limit: 250 });
  assert.deepEqual(calls[0].range, [500, 749]);
  assert.deepEqual(calls[0].order, ['id', { ascending: true }]);
});

test('fetchCardsPage: orderById default true -> chiama .order("id", {ascending:true}), comportamento invariato per ogni chiamante esistente', async () => {
  const { client, calls } = createMockClient({ responses: [{ data: [], error: null }] });
  await fetchCardsPage(client, { tcg: 'pokemon', lang: 'ja' });
  assert.deepEqual(calls[0].order, ['id', { ascending: true }]);
});

test('fetchCardsPage: orderById=false -> NON chiama .order() affatto (fix statement timeout reale, vedi commento in supabase-read.js)', async () => {
  const { client, calls } = createMockClient({ responses: [{ data: [], error: null }] });
  await fetchCardsPage(client, { tcg: 'pokemon', lang: 'ja', orderById: false });
  assert.equal(calls[0].order, null, 'con orderById:false il builder non deve mai ricevere una chiamata .order()');
});

test('fetchCardsPage: orderById=false funziona insieme a un filtro set_id (comunque valido, anche se qui l\'ordinamento sarebbe economico)', async () => {
  const { client, calls } = createMockClient({ responses: [{ data: [], error: null }] });
  await fetchCardsPage(client, { tcg: 'pokemon', lang: 'ja', setId: 'SVLN', orderById: false });
  assert.equal(calls[0].order, null);
  assert.deepEqual(calls[0].filters, [
    ['tcg', 'pokemon'],
    ['lang', 'ja'],
    ['set_id', 'SVLN'],
  ]);
});

test('fetchCardsPage: colonne personalizzate sostituiscono DEFAULT_COLUMNS quando fornite', async () => {
  const { client, calls } = createMockClient({ responses: [{ data: [], error: null }] });
  await fetchCardsPage(client, { tcg: 'pokemon', lang: 'en', columns: ['id', 'name'] });
  assert.equal(calls[0].selectCols, 'id,name');
});

// ---- fetchCardsPage: risultato e hasMore ----

test('fetchCardsPage: hasMore=true quando la pagina è piena, false quando è più corta del limit', async () => {
  const rowsFull = Array.from({ length: 3 }, (_, i) => ({ id: `c${i}` }));
  const rowsShort = Array.from({ length: 2 }, (_, i) => ({ id: `c${i}` }));
  const { client } = createMockClient({
    responses: [
      { data: rowsFull, error: null },
      { data: rowsShort, error: null },
    ],
  });
  const full = await fetchCardsPage(client, { tcg: 'pokemon', lang: 'en', limit: 3 });
  assert.equal(full.hasMore, true);
  assert.equal(full.rows.length, 3);

  const short = await fetchCardsPage(client, { tcg: 'pokemon', lang: 'en', limit: 3 });
  assert.equal(short.hasMore, false);
  assert.equal(short.rows.length, 2);
});

test('fetchCardsPage: data null viene trattato come array vuoto, mai un crash', async () => {
  const { client } = createMockClient({ responses: [{ data: null, error: null }] });
  const { rows, hasMore } = await fetchCardsPage(client, { tcg: 'pokemon', lang: 'en' });
  assert.deepEqual(rows, []);
  assert.equal(hasMore, false);
});

// ---- fetchCardsPage: gestione errori, mai una lettura fallita letta come "zero righe" ----

test('fetchCardsPage: error presente lancia SupabaseReadError (mai un array vuoto silenzioso)', async () => {
  const { client } = createMockClient({ responses: [{ data: null, error: { message: 'connection reset' } }] });
  await assert.rejects(
    () => fetchCardsPage(client, { tcg: 'pokemon', lang: 'en' }),
    (err) => {
      assert.ok(err instanceof SupabaseReadError);
      assert.equal(err.name, 'SUPABASE_READ_FAILED');
      assert.match(err.message, /connection reset/);
      assert.match(err.message, /tcg=pokemon/);
      assert.match(err.message, /lang=en/);
      return true;
    }
  );
});

test('fetchCardsPage: il messaggio di errore include set_id nello scope quando presente', async () => {
  const { client } = createMockClient({ responses: [{ data: null, error: { message: 'boom' } }] });
  await assert.rejects(
    () => fetchCardsPage(client, { tcg: 'pokemon', lang: 'en', setId: 'svp' }),
    (err) => {
      assert.match(err.message, /set_id=svp/);
      return true;
    }
  );
});

// ---- safeErrorMessage: nessun secret propagato ----

test('safeErrorMessage: estrae solo message/code/hint/details, mai altri campi dell\'oggetto errore', () => {
  const err = {
    message: 'invalid input',
    code: '22P02',
    hint: 'check the type',
    details: 'column x',
    apikey: 'sb-secret-service-role-key-do-not-leak',
    authorization: 'Bearer sb-secret-service-role-key-do-not-leak',
  };
  const msg = safeErrorMessage(err);
  assert.match(msg, /invalid input/);
  assert.match(msg, /22P02/);
  assert.doesNotMatch(msg, /sb-secret-service-role-key-do-not-leak/);
});

test('safeErrorMessage: gestisce null/stringa/oggetto vuoto senza lanciare', () => {
  assert.equal(safeErrorMessage(null), 'errore sconosciuto');
  assert.equal(safeErrorMessage('plain string error'), 'plain string error');
  assert.equal(safeErrorMessage({}), 'errore sconosciuto (nessun campo testuale riconosciuto)');
});

test('un eventuale secret nel messaggio di errore Supabase (mai osservato nei casi reali di questo repo, ma verificato per sicurezza) attraversa invariato solo se è dentro "message" — la funzione non fa redazione di contenuto, solo selezione di campi', () => {
  // Nota di design esplicita: se un giorno PostgREST dovesse mettere un secret
  // dentro il campo `message` stesso (non osservato, non previsto), questa
  // funzione non lo filtrerebbe — selezionare i campi giusti protegge dai
  // campi extra dell'oggetto errore (dove i secret di richiesta vivono
  // realisticamente), non dal contenuto testuale di `message`. Documentato
  // per non promettere una garanzia più forte di quella reale.
  const msg = safeErrorMessage({ message: 'no secret here' });
  assert.equal(msg, 'no secret here');
});

// ---- fetchAllCardsForReconciliation: paginazione ----

test('fetchAllCardsForReconciliation: accumula più pagine finché una torna meno righe del pageSize', async () => {
  const page = (n, start) => Array.from({ length: n }, (_, i) => ({ id: `c${start + i}` }));
  const { client, calls } = createMockClient({
    responses: [
      { data: page(2, 0), error: null },
      { data: page(2, 2), error: null },
      { data: page(1, 4), error: null }, // ultima pagina, più corta di pageSize=2
    ],
  });
  const rows = await fetchAllCardsForReconciliation(client, { tcg: 'pokemon', lang: 'en', pageSize: 2 });
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.map((r) => r.id), ['c0', 'c1', 'c2', 'c3', 'c4']);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0].range, [0, 1]);
  assert.deepEqual(calls[1].range, [2, 3]);
  assert.deepEqual(calls[2].range, [4, 5]);
});

test('fetchAllCardsForReconciliation: orderById=false viene passato invariato a ogni pagina', async () => {
  const page = (n, start) => Array.from({ length: n }, (_, i) => ({ id: `c${start + i}` }));
  const { client, calls } = createMockClient({
    responses: [
      { data: page(2, 0), error: null },
      { data: page(1, 2), error: null },
    ],
  });
  await fetchAllCardsForReconciliation(client, { tcg: 'pokemon', lang: 'ja', pageSize: 2, orderById: false });
  assert.equal(calls.length, 2);
  assert.ok(calls.every((c) => c.order === null), 'nessuna pagina deve chiamare .order() quando orderById è false');
});

test('fetchAllCardsForReconciliation: una singola pagina vuota → array vuoto, una sola chiamata', async () => {
  const { client, calls } = createMockClient({ responses: [{ data: [], error: null }] });
  const rows = await fetchAllCardsForReconciliation(client, { tcg: 'onepiece', lang: 'en', pageSize: 500 });
  assert.deepEqual(rows, []);
  assert.equal(calls.length, 1);
});

test('fetchAllCardsForReconciliation: propaga SupabaseReadError se una pagina intermedia fallisce, senza perdere lo stato già letto in modo silenzioso', async () => {
  const page = (n, start) => Array.from({ length: n }, (_, i) => ({ id: `c${start + i}` }));
  const { client } = createMockClient({
    responses: [
      { data: page(2, 0), error: null },
      { data: null, error: { message: 'timeout' } },
    ],
  });
  await assert.rejects(
    () => fetchAllCardsForReconciliation(client, { tcg: 'pokemon', lang: 'en', pageSize: 2 }),
    (err) => {
      assert.ok(err instanceof SupabaseReadError);
      assert.match(err.message, /timeout/);
      return true;
    }
  );
});

test('fetchAllCardsForReconciliation: onPage viene invocato per ogni pagina con rows e pageInfo corretti', async () => {
  const page = (n, start) => Array.from({ length: n }, (_, i) => ({ id: `c${start + i}` }));
  const { client } = createMockClient({
    responses: [
      { data: page(2, 0), error: null },
      { data: page(1, 2), error: null },
    ],
  });
  const seen = [];
  await fetchAllCardsForReconciliation(client, {
    tcg: 'pokemon',
    lang: 'en',
    pageSize: 2,
    onPage: (rows, info) => seen.push({ n: rows.length, ...info }),
  });
  assert.deepEqual(seen, [
    { n: 2, offset: 0, pageIndex: 0 },
    { n: 1, offset: 2, pageIndex: 1 },
  ]);
});

test('fetchAllCardsForReconciliation: maxPages ferma la paginazione anche se hasMore sarebbe true', async () => {
  const page = (n, start) => Array.from({ length: n }, (_, i) => ({ id: `c${start + i}` }));
  const { client, calls } = createMockClient({
    responses: [
      { data: page(2, 0), error: null },
      { data: page(2, 2), error: null },
      { data: page(2, 4), error: null },
    ],
  });
  const rows = await fetchAllCardsForReconciliation(client, { tcg: 'pokemon', lang: 'en', pageSize: 2, maxPages: 2 });
  assert.equal(rows.length, 4);
  assert.equal(calls.length, 2);
});

test('fetchAllCardsForReconciliation: lancia TypeError su pageSize/maxPages invalidi', async () => {
  const { client } = createMockClient({ responses: [{ data: [], error: null }] });
  await assert.rejects(() => fetchAllCardsForReconciliation(client, { tcg: 'pokemon', lang: 'en', pageSize: 0 }), TypeError);
  await assert.rejects(() => fetchAllCardsForReconciliation(client, { tcg: 'pokemon', lang: 'en', maxPages: -1 }), TypeError);
});

// ---- fetchDbCatalogSlice: alias di comodo ----

test('fetchDbCatalogSlice: stesso comportamento di fetchAllCardsForReconciliation', async () => {
  const { client } = createMockClient({ responses: [{ data: [{ id: 'x' }], error: null }] });
  const rows = await fetchDbCatalogSlice(client, { tcg: 'onepiece', lang: 'ja', setId: 'OP-01' });
  assert.deepEqual(rows, [{ id: 'x' }]);
});

// ============================================================================
// Garanzia di sola lettura — la parte più importante di questo file.
// ============================================================================

test('GARANZIA SOLA LETTURA: un fetch normale (pagina singola) non chiama mai insert/update/upsert/delete', async () => {
  const { client, writeAttempts } = createMockClient({ responses: [{ data: [{ id: 'x' }], error: null }] });
  await fetchCardsPage(client, { tcg: 'pokemon', lang: 'en' });
  assert.deepEqual(writeAttempts, { insert: 0, update: 0, upsert: 0, delete: 0 });
});

test('GARANZIA SOLA LETTURA: fetchAllCardsForReconciliation su più pagine non chiama mai un metodo di scrittura', async () => {
  const page = (n, start) => Array.from({ length: n }, (_, i) => ({ id: `c${start + i}` }));
  const { client, writeAttempts } = createMockClient({
    responses: [
      { data: page(3, 0), error: null },
      { data: page(3, 3), error: null },
      { data: page(1, 6), error: null },
    ],
  });
  await fetchAllCardsForReconciliation(client, { tcg: 'onepiece', lang: 'en', pageSize: 3 });
  assert.deepEqual(writeAttempts, { insert: 0, update: 0, upsert: 0, delete: 0 });
});

test('GARANZIA SOLA LETTURA: anche un run che finisce in errore non ha mai chiamato un metodo di scrittura prima di lanciare', async () => {
  const { client, writeAttempts } = createMockClient({ responses: [{ data: null, error: { message: 'db down' } }] });
  await assert.rejects(() => fetchCardsPage(client, { tcg: 'pokemon', lang: 'en' }));
  assert.deepEqual(writeAttempts, { insert: 0, update: 0, upsert: 0, delete: 0 });
});

test('GARANZIA SOLA LETTURA: il codice sorgente di supabase-read.js non contiene alcuna chiamata letterale a .insert(/.update(/.upsert(/.delete( sul client', async () => {
  // Rete di sicurezza aggiuntiva, indipendente dal mock: verifica il testo del
  // modulo stesso, così un futuro refactor che aggiungesse per errore una
  // chiamata di scrittura fa fallire questo test anche se il mock sopra non
  // venisse aggiornato di pari passo.
  const url = new URL('../supabase-read.js', import.meta.url);
  const fs = await import('node:fs');
  const source = fs.readFileSync(url, 'utf8');
  // Rimuove i commenti (// ... e /* ... */) prima di cercare, per non far
  // scattare un falso positivo sulle parole "insert/update/upsert/delete"
  // usate nella prosa dei commenti stessi (che le nominano spesso, a scopo
  // esplicativo, in questo file).
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(withoutComments, /\.\s*insert\s*\(/);
  assert.doesNotMatch(withoutComments, /\.\s*update\s*\(/);
  assert.doesNotMatch(withoutComments, /\.\s*upsert\s*\(/);
  assert.doesNotMatch(withoutComments, /\.\s*delete\s*\(/);
});
