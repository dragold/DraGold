import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBrowseQuery, parseBrowseResponse, summarizeListings } from '../ebay-browse.js';

test('buildBrowseQuery', () => {
  assert.equal(
    buildBrowseQuery({ name: 'Umbreon ex', tcg: 'pokemon', setName: 'Prismatic Evolutions', number: '161/131' }),
    'Umbreon ex 161/131 Prismatic Evolutions pokemon card',
  );
  assert.equal(
    buildBrowseQuery({ name: 'Shanks', tcg: 'onepiece', number: 'OP17-020', lang: 'ja' }),
    'Shanks OP17-020 one piece card game japanese',
  );
});

test('parseBrowseResponse', () => {
  const json = {
    total: 87,
    itemSummaries: [
      { title: 'A', price: { value: '42.50', currency: 'EUR' }, condition: 'Used', itemWebUrl: 'http://a', seller: { username: 's1' }, image: { imageUrl: 'http://img' } },
      { title: 'B', price: { value: '0', currency: 'EUR' } },
    ],
  };
  const { listings, count } = parseBrowseResponse(json);
  assert.equal(count, 87);
  assert.equal(listings.length, 1);
  assert.equal(listings[0].price, 42.5);
  assert.equal(listings[0].imageUrl, 'http://img');
});

test('summarizeListings', () => {
  assert.deepEqual(summarizeListings([]), { count: 0, lowest: null, median: null, currency: null });
  const s = summarizeListings([{ price: 10, currency: 'EUR' }, { price: 20, currency: 'EUR' }, { price: 30, currency: 'EUR' }]);
  assert.equal(s.count, 3);
  assert.equal(s.lowest, 10);
  assert.equal(s.median, 20);
});
