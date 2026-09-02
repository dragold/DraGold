import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isSealedProduct, detectPrintVariant, tcgcsvProductToCardRow, pickPrice, tcgcsvPriceToPriceRow,
} from '../onepiece-rows.js';

const SHANKS = {
  productId: 705922, name: 'Shanks (020)', number: 'OP17-020', rarity: 'L',
  imageUrl: 'https://tcgplayer-cdn.tcgplayer.com/product/705922_200w.jpg',
  raw: { extendedData: [
    { name: 'Color', value: 'Green' }, { name: 'CardType', value: 'Leader' },
    { name: 'Power', value: '5000' }, { name: 'Life', value: '5' },
  ] },
};

test('isSealedProduct', () => {
  assert.equal(isSealedProduct("The World's Strongest Warriors Booster Box"), true);
  assert.equal(isSealedProduct('Double Pack Set Vol. 12'), true);
  assert.equal(isSealedProduct('Shanks (020)'), false);
});

test('detectPrintVariant', () => {
  assert.equal(detectPrintVariant('Shanks (020)'), null);
  assert.equal(detectPrintVariant('Shanks (020) (Alternate Art)'), 'parallel');
  assert.equal(detectPrintVariant('Shanks (022) (Manga)'), 'manga');
  assert.equal(detectPrintVariant('Monkey.D.Luffy (079) (Super Leader Alternate Art)'), 'parallel');
});

test('tcgcsvProductToCardRow: base', () => {
  const r = tcgcsvProductToCardRow({ product: SHANKS, groupName: "The World's Strongest Warriors", setCode: 'OP-17', capturedAt: '2026-09-02T00:00:00Z' });
  assert.equal(r.id, 'onepiece:tcgcsv:705922:en');
  assert.equal(r.source, 'tcgcsv');
  assert.equal(r.source_id, '705922');
  assert.equal(r.set_id, 'OP-17');
  assert.equal(r.card_number, 'OP17-020');
  assert.equal(r.rarity, 'L');
  assert.equal(r.supertype, 'Leader');
  assert.equal(r.print_variant, null);
  assert.deepEqual(r.metadata, { color: 'Green', cardtype: 'Leader', power: '5000', life: '5' });
});

test('tcgcsvProductToCardRow: prodotto sigillato senza numero -> null', () => {
  assert.equal(tcgcsvProductToCardRow({ product: { productId: 1, name: 'Booster Box', number: null, raw: {} }, setCode: 'OP-17' }), null);
});

test('tcgcsvProductToCardRow: DON!! senza numero -> riga valida (non e\' sealed)', () => {
  const r = tcgcsvProductToCardRow({ product: { productId: 9, name: 'DON!! Card (Alternate Art)', number: null, raw: {} }, setCode: 'OP-17' });
  assert.equal(r.id, 'onepiece:tcgcsv:9:en');
  assert.equal(r.card_number, null);
  assert.equal(r.print_variant, 'parallel');
});

test('pickPrice: base -> Normal, variant -> Foil', () => {
  const entries = [
    { subType: 'Normal', market: 5, low: 4 },
    { subType: 'Foil', market: 30, low: 25 },
  ];
  assert.equal(pickPrice(entries, null).subType, 'Normal');
  assert.equal(pickPrice(entries, 'parallel').subType, 'Foil');
  assert.equal(pickPrice([], null), null);
});

test('tcgcsvPriceToPriceRow', () => {
  const row = tcgcsvPriceToPriceRow({
    cardId: 'onepiece:tcgcsv:705922:en',
    priceEntries: [{ subType: 'Normal', market: 31.49, low: 30, mid: 37, high: 332 }],
    printVariant: null,
    capturedAt: '2026-09-02T00:00:00Z',
  });
  assert.equal(row.card_id, 'onepiece:tcgcsv:705922:en');
  assert.equal(row.currency, 'USD');
  assert.equal(row.price_market, 31.49);
  assert.equal(row.price_median, 37);
  assert.equal(row.captured_at, '2026-09-02T00:00:00Z');
});

test('tcgcsvPriceToPriceRow: nessun prezzo -> null', () => {
  assert.equal(tcgcsvPriceToPriceRow({ cardId: 'x', priceEntries: [{ subType: 'Normal' }] }), null);
});
