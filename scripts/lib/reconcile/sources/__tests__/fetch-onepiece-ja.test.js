import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fetchOnePieceBandaiSet, OnePieceBandaiFetchError, SERIES_BY_SET_CODE } from '../fetch-onepiece-ja.js';

function mockFetchHtml(html, { ok = true, status = 200 } = {}) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    return { ok, status, text: async () => html };
  };
  impl.calls = calls;
  return impl;
}

const FIXTURE_HTML = `
<dl class="modalCol">
  <dt>
    <span>OP01-001</span>
    <span>L</span>
    <span>Leader</span>
  </dt>
  <dd>
    <div class="cardName">Roronoa Zoro</div>
  </dd>
</dl>
<dl class="modalCol">
  <dt>
    <span>OP01-002</span>
    <span>SR</span>
    <span>Character</span>
  </dt>
  <dd>
    <div class="cardName">Trafalgar Law</div>
  </dd>
</dl>
`;

describe('fetchOnePieceBandaiSet', () => {
  test('parsa un set noto (EN): 2 carte, image_url costruito su BANDAI_EN', async () => {
    const fetchImpl = mockFetchHtml(FIXTURE_HTML);
    const { rows } = await fetchOnePieceBandaiSet({ setId: 'OP-01', lang: 'en', fetchImpl });
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], {
      card_number: 'OP01-001', name: 'Roronoa Zoro', rarity: 'L', supertype: 'Leader',
      image_url: 'https://en.onepiece-cardgame.com/images/cardlist/card/OP01-001.png',
    });
    assert.equal(rows[1].card_number, 'OP01-002');
    assert.match(fetchImpl.calls[0], /^https:\/\/en\.onepiece-cardgame\.com\/cardlist\/\?series=569101$/);
  });

  test('lang=ja usa BANDAI_JA come base url e per image_url', async () => {
    const fetchImpl = mockFetchHtml(FIXTURE_HTML);
    const { rows } = await fetchOnePieceBandaiSet({ setId: 'OP-01', lang: 'ja', fetchImpl });
    assert.match(fetchImpl.calls[0], /^https:\/\/www\.onepiece-cardgame\.com\/cardlist\/\?series=569101$/);
    assert.equal(rows[0].image_url, 'https://www.onepiece-cardgame.com/images/cardlist/card/OP01-001.png');
  });

  test('set sconosciuto alla tabella -> rows vuoto, nessuna chiamata di rete', async () => {
    const fetchImpl = mockFetchHtml(FIXTURE_HTML);
    const { rows } = await fetchOnePieceBandaiSet({ setId: 'NOT-A-REAL-SET', lang: 'en', fetchImpl });
    assert.deepEqual(rows, []);
    assert.equal(fetchImpl.calls.length, 0);
  });

  test('HTTP non-ok -> OnePieceBandaiFetchError', async () => {
    const fetchImpl = mockFetchHtml('', { ok: false, status: 503 });
    await assert.rejects(
      () => fetchOnePieceBandaiSet({ setId: 'OP-01', lang: 'en', fetchImpl }),
      OnePieceBandaiFetchError
    );
  });

  test('HTML senza <dl class="modalCol"> ricade sul parsing <dt>', async () => {
    const dtOnly = `
      <dt>
        <span>ST01-001</span>
        <span>C</span>
        <span>Character</span>
        <div class="cardName">Nami</div>
      </dt>
    `;
    const fetchImpl = mockFetchHtml(dtOnly);
    const { rows } = await fetchOnePieceBandaiSet({ setId: 'ST-01', lang: 'en', fetchImpl });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, 'Nami');
  });

  test('tabella serie copre i set JA-only (OP-17, EB-04)', () => {
    assert.equal(SERIES_BY_SET_CODE['OP-17'], 400401);
    assert.equal(SERIES_BY_SET_CODE['EB-04'], 569204);
  });
});
