import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extFieldValue, mapTcgcsvGroup, mapTcgcsvProduct,
  listTcgcsvGroups, listTcgcsvGroupCards, listTcgcsvGroupPrices,
  TCGCSV_CATEGORY, TcgcsvFetchError,
} from '../sources/tcgcsv-catalog.js';

// Fixture: group + product reali (OP-17, prodotto 705922), verificati 2026-09-02.
const OP17_GROUP = { groupId: 24736, name: "The World's Strongest Warriors", abbreviation: 'OP17', isSupplemental: false, publishedOn: '2026-08-28T00:00:00', modifiedOn: 'x', categoryId: 68 };
const SHANKS = {
  productId: 705922, name: 'Shanks (020)', imageUrl: 'https://tcgplayer-cdn.tcgplayer.com/product/705922_200w.jpg',
  categoryId: 68, groupId: 24736, presaleInfo: { isPresale: false, releasedOn: '2026-08-28T00:00:00', note: null },
  extendedData: [
    { name: 'Rarity', displayName: 'Rarity', value: 'L' },
    { name: 'Number', displayName: 'Number', value: 'OP17-020' },
    { name: 'Color', displayName: 'Color', value: 'Green' },
  ],
};

test('extFieldValue', () => {
  assert.equal(extFieldValue(SHANKS.extendedData, 'Number'), 'OP17-020');
  assert.equal(extFieldValue(SHANKS.extendedData, 'Rarity'), 'L');
  assert.equal(extFieldValue(SHANKS.extendedData, 'Nope'), null);
  assert.equal(extFieldValue(null, 'Number'), null);
});

test('mapTcgcsvGroup: publishedOn troncato a data', () => {
  const g = mapTcgcsvGroup(OP17_GROUP);
  assert.equal(g.groupId, 24736);
  assert.equal(g.abbreviation, 'OP17');
  assert.equal(g.publishedOn, '2026-08-28');
  assert.equal(g.isSupplemental, false);
});

test('mapTcgcsvProduct: number/rarity/image da extendedData', () => {
  const p = mapTcgcsvProduct(SHANKS);
  assert.equal(p.productId, 705922);
  assert.equal(p.number, 'OP17-020');
  assert.equal(p.rarity, 'L');
  assert.equal(p.releasedOn, '2026-08-28');
  assert.ok(p.imageUrl.includes('tcgplayer-cdn'));
});

test('TCGCSV_CATEGORY: One Piece = 68', () => {
  assert.equal(TCGCSV_CATEGORY.onepiece, 68);
});

const mkFetch = (body, { ok = true, status = 200 } = {}) => async () => ({
  ok, status, json: async () => body,
});

test('listTcgcsvGroups', async () => {
  const groups = await listTcgcsvGroups(68, { fetchImpl: mkFetch({ results: [OP17_GROUP] }) });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].abbreviation, 'OP17');
});

test('listTcgcsvGroupCards', async () => {
  const cards = await listTcgcsvGroupCards(68, 24736, { fetchImpl: mkFetch({ results: [SHANKS] }) });
  assert.equal(cards[0].number, 'OP17-020');
});

test('listTcgcsvGroupPrices: raggruppati per productId, Normal + Foil', async () => {
  const body = { results: [
    { productId: 705922, marketPrice: 31.49, lowPrice: 30, midPrice: 37, highPrice: 332, subTypeName: 'Foil' },
    { productId: 705922, marketPrice: 5, lowPrice: 4, midPrice: 6, highPrice: 9, subTypeName: 'Normal' },
  ] };
  const map = await listTcgcsvGroupPrices(68, 24736, { fetchImpl: mkFetch(body) });
  assert.equal(map.get('705922').length, 2);
  assert.equal(map.get('705922').find((e) => e.subType === 'Foil').market, 31.49);
});

test('errore HTTP -> TcgcsvFetchError, mai [] silenzioso', async () => {
  await assert.rejects(
    () => listTcgcsvGroups(68, { fetchImpl: mkFetch({}, { ok: false, status: 401 }) }),
    TcgcsvFetchError,
  );
});

test('risposta senza results -> TcgcsvFetchError', async () => {
  await assert.rejects(
    () => listTcgcsvGroups(68, { fetchImpl: mkFetch({ nope: true }) }),
    TcgcsvFetchError,
  );
});
