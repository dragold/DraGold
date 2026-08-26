import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fetchTcgdexSet, briefToRow, TcgdexFetchError } from '../fetch-tcgdex.js';

function mockFetch(responses) {
  let call = 0;
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    const r = responses[call++];
    if (!r) throw new Error('mockFetch: nessuna risposta configurata per questa chiamata');
    if (r.networkError) throw new Error(r.networkError);
    return {
      ok: r.ok !== false,
      status: r.status ?? 200,
      json: async () => {
        if (r.badJson) throw new Error('unexpected token');
        return r.body;
      },
    };
  };
  impl.calls = calls;
  return impl;
}

describe('briefToRow (pura)', () => {
  test('mappa un card brief nella forma riga cards grezza attesa da normalize-tcgdex.js', () => {
    const brief = { localId: '044', name: 'Pikachu', image: 'https://assets.tcgdex.net/en/sv/svp/044', rarity: 'Common' };
    const row = briefToRow(brief, { id: 'svp' }, { name: 'Scarlet & Violet Promos' }, 'en');
    assert.equal(row.id, null);
    assert.equal(row.tcg, 'pokemon');
    assert.equal(row.source, 'tcgdex');
    assert.equal(row.source_id, 'svp-044');
    assert.equal(row.set_id, 'svp');
    assert.equal(row.set_name, 'Scarlet & Violet Promos');
    assert.equal(row.lang, 'en');
    assert.equal(row.canonical_card_id, null);
    assert.equal(row.name, 'Pikachu');
    assert.equal(row.image_url, 'https://assets.tcgdex.net/en/sv/svp/044/low.webp');
    assert.equal(row.image_url_hi, 'https://assets.tcgdex.net/en/sv/svp/044/high.webp');
    assert.equal(row.card_number, '044');
    assert.equal(row.rarity, 'Common');
    assert.deepEqual(row._raw, brief);
  });

  test('brief senza image -> image_url/image_url_hi null, mai una stringa "undefined/low.webp"', () => {
    const row = briefToRow({ localId: '1', name: 'X' }, { id: 'svp' }, {}, 'ja');
    assert.equal(row.image_url, null);
    assert.equal(row.image_url_hi, null);
  });

  test('usa brief.id come fallback quando localId è assente', () => {
    const row = briefToRow({ id: '7', name: 'X' }, { id: 'svp' }, {}, 'en');
    assert.equal(row.card_number, '7');
    assert.equal(row.source_id, 'svp-7');
  });
});

describe('fetchTcgdexSet', () => {
  test('caso reale: set con 2 card briefs -> 2 righe, URL costruito correttamente', async () => {
    const fetchImpl = mockFetch([
      { body: { name: 'Scarlet & Violet Promos', cards: [
        { localId: '1', name: 'Sprigatito', image: 'https://x/svp/1' },
        { localId: '2', name: 'Charmander', image: 'https://x/svp/2' },
      ] } },
    ]);
    const result = await fetchTcgdexSet({ setId: 'svp', lang: 'en', fetchImpl });
    assert.equal(result.setId, 'svp');
    assert.equal(result.lang, 'en');
    assert.equal(result.setName, 'Scarlet & Violet Promos');
    assert.equal(result.rows.length, 2);
    assert.equal(result.rows[0].source_id, 'svp-1');
    assert.equal(fetchImpl.calls[0], 'https://api.tcgdex.net/v2/en/sets/svp');
  });

  test('rispetta TCGDEX_BASE_OVERRIDE (letto una sola volta al primo import del modulo in ESM: verificato qui con un import dinamico dedicato, cache-busted)', async () => {
    process.env.TCGDEX_BASE_OVERRIDE = 'https://fake-tcgdex.test/v2';
    try {
      const mod = await import(`../fetch-tcgdex.js?cachebust=${Date.now()}-${Math.random()}`);
      const fetchImpl = mockFetch([{ body: { name: 'X', cards: [] } }]);
      await mod.fetchTcgdexSet({ setId: 'svp', lang: 'en', fetchImpl });
      assert.equal(fetchImpl.calls[0], 'https://fake-tcgdex.test/v2/en/sets/svp');
    } finally {
      delete process.env.TCGDEX_BASE_OVERRIDE;
    }
  });

  test('set senza cards (array assente) -> rows vuoto, non un errore', async () => {
    const fetchImpl = mockFetch([{ body: { name: 'Set Vuoto' } }]);
    const result = await fetchTcgdexSet({ setId: 'x', lang: 'en', fetchImpl });
    assert.deepEqual(result.rows, []);
  });

  test('HTTP non-ok -> TcgdexFetchError, mai un set vuoto silenzioso', async () => {
    const fetchImpl = mockFetch([{ ok: false, status: 404 }]);
    await assert.rejects(
      () => fetchTcgdexSet({ setId: 'inesistente', lang: 'en', fetchImpl }),
      (err) => {
        assert.ok(err instanceof TcgdexFetchError);
        assert.match(err.message, /HTTP 404/);
        return true;
      }
    );
  });

  test('errore di rete -> TcgdexFetchError con messaggio propagato', async () => {
    const fetchImpl = mockFetch([{ networkError: 'ECONNRESET' }]);
    await assert.rejects(
      () => fetchTcgdexSet({ setId: 'svp', lang: 'en', fetchImpl }),
      (err) => {
        assert.ok(err instanceof TcgdexFetchError);
        assert.match(err.message, /ECONNRESET/);
        return true;
      }
    );
  });

  test('JSON non valido -> TcgdexFetchError, non un crash non gestito', async () => {
    const fetchImpl = mockFetch([{ badJson: true }]);
    await assert.rejects(() => fetchTcgdexSet({ setId: 'svp', lang: 'en', fetchImpl }), TcgdexFetchError);
  });

  test('setId mancante -> TypeError, nessuna richiesta di rete effettuata', async () => {
    const fetchImpl = mockFetch([]);
    await assert.rejects(() => fetchTcgdexSet({ lang: 'en', fetchImpl }), TypeError);
    assert.equal(fetchImpl.calls.length, 0);
  });

  test('lang mancante -> TypeError, nessuna richiesta di rete effettuata', async () => {
    const fetchImpl = mockFetch([]);
    await assert.rejects(() => fetchTcgdexSet({ setId: 'svp', fetchImpl }), TypeError);
    assert.equal(fetchImpl.calls.length, 0);
  });

  test('nessuna scrittura: il modulo non referenzia mai insert/update/upsert/delete nel sorgente', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const src = readFileSync(fileURLToPath(new URL('../fetch-tcgdex.js', import.meta.url)), 'utf8');
    const stripped = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const method of ['.insert(', '.update(', '.upsert(', '.delete(']) {
      assert.ok(!stripped.includes(method), `fetch-tcgdex.js non deve contenere "${method}"`);
    }
  });
});
