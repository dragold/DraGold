import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchOptcgSet,
  cardToRow,
  SUPPORTED_LANGS,
  OptcgFetchError,
  OptcgSourceNotImplementedError,
} from '../fetch-optcg.js';

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

describe('cardToRow (pura)', () => {
  test('mappa una card optcgapi.com reale (shape verificata via WebFetch, 2026-08-17) nella forma riga cards grezza', () => {
    const card = {
      card_name: 'Perona',
      set_name: 'Romance Dawn',
      set_id: 'OP-01',
      rarity: 'UC',
      card_set_id: 'OP01-077',
      card_image: 'https://optcgapi.com/media/static/Card_Images/OP01-077.jpg',
    };
    const row = cardToRow(card, 'en');
    assert.equal(row.id, null);
    assert.equal(row.tcg, 'onepiece');
    assert.equal(row.source, 'optcg');
    assert.equal(row.source_id, 'OP01-077');
    assert.equal(row.set_id, 'OP-01');
    assert.equal(row.set_name, 'Romance Dawn');
    assert.equal(row.lang, 'en');
    assert.equal(row.name, 'Perona');
    assert.equal(row.card_number, 'OP01-077');
    assert.equal(row.rarity, 'UC');
    assert.equal(row.image_url, 'https://optcgapi.com/media/static/Card_Images/OP01-077.jpg');
    assert.equal(row.image_url_hi, null);
    assert.deepEqual(row._raw, card);
  });
});

describe('fetchOptcgSet', () => {
  test('caso reale (2 card verificate via WebFetch su /api/sets/OP-01/): 2 righe, URL corretto', async () => {
    const fetchImpl = mockFetch([
      { body: [
        { card_name: 'Perona', set_name: 'Romance Dawn', set_id: 'OP-01', rarity: 'UC', card_set_id: 'OP01-077', card_image: 'https://x/OP01-077.jpg' },
        { card_name: 'Tony Tony.Chopper', set_name: 'Romance Dawn', set_id: 'OP-01', rarity: 'UC', card_set_id: 'OP01-015', card_image: 'https://x/OP01-015.jpg' },
      ] },
    ]);
    const result = await fetchOptcgSet({ setId: 'OP-01', lang: 'en', fetchImpl });
    assert.equal(result.setId, 'OP-01');
    assert.equal(result.lang, 'en');
    assert.equal(result.setName, 'Romance Dawn');
    assert.equal(result.rows.length, 2);
    assert.equal(result.rows[0].source_id, 'OP01-077');
    assert.equal(fetchImpl.calls[0], 'https://optcgapi.com/api/sets/OP-01/');
  });

  test('lang="ja" -> OptcgSourceNotImplementedError, NESSUNA richiesta di rete effettuata (nessun dato inventato)', async () => {
    const fetchImpl = mockFetch([{ body: [] }]);
    await assert.rejects(
      () => fetchOptcgSet({ setId: 'OP-01', lang: 'ja', fetchImpl }),
      (err) => {
        assert.ok(err instanceof OptcgSourceNotImplementedError);
        assert.match(err.message, /lang=ja/);
        return true;
      }
    );
    assert.equal(fetchImpl.calls.length, 0, 'nessuna fetch deve partire per una lingua non supportata');
  });

  test('SUPPORTED_LANGS è esattamente ["en"], verificato contro la fonte reale', () => {
    assert.deepEqual(SUPPORTED_LANGS, ['en']);
  });

  test('set senza card (array vuoto) -> rows vuoto, setName null, non un errore', async () => {
    const fetchImpl = mockFetch([{ body: [] }]);
    const result = await fetchOptcgSet({ setId: 'ST-99', lang: 'en', fetchImpl });
    assert.deepEqual(result.rows, []);
    assert.equal(result.setName, null);
  });

  test('risposta non-array -> trattata come nessuna carta, non un crash', async () => {
    const fetchImpl = mockFetch([{ body: { error: 'not found' } }]);
    const result = await fetchOptcgSet({ setId: 'X', lang: 'en', fetchImpl });
    assert.deepEqual(result.rows, []);
  });

  test('HTTP non-ok -> OptcgFetchError', async () => {
    const fetchImpl = mockFetch([{ ok: false, status: 500 }]);
    await assert.rejects(
      () => fetchOptcgSet({ setId: 'OP-01', lang: 'en', fetchImpl }),
      (err) => {
        assert.ok(err instanceof OptcgFetchError);
        assert.match(err.message, /HTTP 500/);
        return true;
      }
    );
  });

  test('errore di rete -> OptcgFetchError con messaggio propagato', async () => {
    const fetchImpl = mockFetch([{ networkError: 'ETIMEDOUT' }]);
    await assert.rejects(
      () => fetchOptcgSet({ setId: 'OP-01', lang: 'en', fetchImpl }),
      (err) => {
        assert.ok(err instanceof OptcgFetchError);
        assert.match(err.message, /ETIMEDOUT/);
        return true;
      }
    );
  });

  test('JSON non valido -> OptcgFetchError', async () => {
    const fetchImpl = mockFetch([{ badJson: true }]);
    await assert.rejects(() => fetchOptcgSet({ setId: 'OP-01', lang: 'en', fetchImpl }), OptcgFetchError);
  });

  test('setId mancante -> TypeError, nessuna richiesta di rete', async () => {
    const fetchImpl = mockFetch([]);
    await assert.rejects(() => fetchOptcgSet({ lang: 'en', fetchImpl }), TypeError);
    assert.equal(fetchImpl.calls.length, 0);
  });

  test('lang mancante -> TypeError, nessuna richiesta di rete', async () => {
    const fetchImpl = mockFetch([]);
    await assert.rejects(() => fetchOptcgSet({ setId: 'OP-01', fetchImpl }), TypeError);
    assert.equal(fetchImpl.calls.length, 0);
  });

  test('nessuna scrittura: il modulo non referenzia mai insert/update/upsert/delete nel sorgente', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const src = readFileSync(fileURLToPath(new URL('../fetch-optcg.js', import.meta.url)), 'utf8');
    const stripped = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const method of ['.insert(', '.update(', '.upsert(', '.delete(']) {
      assert.ok(!stripped.includes(method), `fetch-optcg.js non deve contenere "${method}"`);
    }
  });
});
