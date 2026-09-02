import test from 'node:test';
import assert from 'node:assert/strict';
import { tcgcsvPriceToObservation, ebayListingToObservation } from '../observation-rows.js';
import { upsertValuations } from '../valuation-store.js';

test('tcgcsvPriceToObservation: market -> osservazione con price_eur', () => {
  const o = tcgcsvPriceToObservation({
    cardId: 'onepiece:tcgcsv:705922:en', tcg: 'onepiece',
    priceEntry: { subType: 'Normal', market: 11.578, low: 10, mid: 12, high: 20 },
    eurRate: 1.1578, capturedAt: '2026-09-02T00:00:00Z',
  });
  assert.equal(o.card_id, 'onepiece:tcgcsv:705922:en');
  assert.equal(o.kind, 'market');
  assert.equal(o.currency, 'USD');
  assert.equal(o.price, 11.578);
  assert.equal(o.price_eur, 10); // 11.578 / 1.1578
  assert.equal(o.fx_rate, 1.1578);
  assert.equal(o.sub_type, 'Normal');
});

test('tcgcsvPriceToObservation: nessun market/mid -> null', () => {
  assert.equal(tcgcsvPriceToObservation({ cardId: 'x', tcg: 'onepiece', priceEntry: { subType: 'Foil', low: 5 }, eurRate: 1.16 }), null);
  assert.equal(tcgcsvPriceToObservation({ cardId: 'x', tcg: 'onepiece', priceEntry: { market: 0 }, eurRate: 1.16 }), null);
});

test('tcgcsvPriceToObservation: placeholder (low==mid==high, alto) -> null', () => {
  assert.equal(tcgcsvPriceToObservation({
    cardId: 'x', tcg: 'onepiece',
    priceEntry: { subType: 'Foil', market: 29994.99, low: 29994.99, mid: 29994.99, high: 29994.99 }, eurRate: 1.16,
  }), null);
  // ma low==mid==high su valore piccolo (carta bulk davvero flat) resta valido
  assert.ok(tcgcsvPriceToObservation({
    cardId: 'x', tcg: 'onepiece',
    priceEntry: { subType: 'Normal', market: 0.1, low: 0.1, mid: 0.1, high: 0.1 }, eurRate: 1.16,
  }));
});

test('ebayListingToObservation: kind listing, EUR passthrough', () => {
  const o = ebayListingToObservation({
    cardId: 'c1', tcg: 'onepiece',
    listing: { price: 25, currency: 'EUR', condition: 'Used', url: 'http://x', title: 'Shanks' },
    ratesMap: { USD: 1.16 }, capturedAt: '2026-09-02T00:00:00Z',
  });
  assert.equal(o.kind, 'listing');
  assert.equal(o.source, 'ebay_browse');
  assert.equal(o.price_eur, 25);
  assert.equal(o.condition, 'Used');
});

test('upsertValuations: onConflict card_id,currency; [] -> nessuna chiamata', async () => {
  const calls = [];
  const fake = { from: () => ({ upsert: (rows, opts) => { calls.push({ rows, opts }); return Promise.resolve({ error: null }); } }) };
  assert.deepEqual(await upsertValuations(fake, []), { upserted: 0 });
  await upsertValuations(fake, [{ card_id: 'c', currency: 'EUR', estimated_value: 1 }]);
  assert.equal(calls[0].opts.onConflict, 'card_id,currency');
});
