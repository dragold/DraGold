// DraGold — Market Valuation (Fase 2)
// Trasformazione fonte -> riga market_observations. Puro.

import { toEur } from './fx.js';

/**
 * @param {object} opts
 * @param {string} opts.cardId
 * @param {string|null} [opts.canonicalId]
 * @param {string} opts.tcg
 * @param {{subType?:string, market?:number, low?:number, mid?:number, high?:number}} opts.priceEntry
 *   - da listTcgcsvGroupPrices
 * @param {number} opts.eurRate - 1 EUR = eurRate USD
 * @param {string} [opts.capturedAt] - ISO, uno per run
 * @returns {object|null} riga market_observations (null se nessun prezzo utile)
 */
export function tcgcsvPriceToObservation({ cardId, canonicalId = null, tcg, priceEntry, eurRate, capturedAt } = {}) {
  if (!priceEntry) return null;
  const price = Number.isFinite(priceEntry.market) ? priceEntry.market
    : Number.isFinite(priceEntry.mid) ? priceEntry.mid
      : null;
  if (price == null || price <= 0) return null;
  // Placeholder TCGplayer: un unico annuncio assurdo, nessun mercato reale
  // (low == mid == high, valore alto). Non e' un prezzo di mercato -> scarta.
  if (priceEntry.low != null && priceEntry.low === priceEntry.mid && priceEntry.mid === priceEntry.high && price >= 1000) {
    return null;
  }

  const rates = { USD: eurRate };
  return {
    card_id: cardId,
    canonical_card_id: canonicalId,
    tcg,
    source: 'tcgcsv',
    kind: 'market',
    sub_type: priceEntry.subType || null,
    condition: null,
    price,
    currency: 'USD',
    price_eur: toEur(price, 'USD', rates),
    fx_rate: Number.isFinite(eurRate) ? eurRate : null,
    observed_at: capturedAt || new Date().toISOString(),
    raw: { provider: 'tcgcsv/tcgplayer', low: priceEntry.low ?? null, mid: priceEntry.mid ?? null, high: priceEntry.high ?? null },
  };
}

/**
 * @param {object} opts
 * @param {string} opts.cardId
 * @param {{price:number, currency:string, condition?:string, url?:string, title?:string}} opts.listing
 * @param {Record<string,number>} opts.ratesMap - {USD: 1.16, ...}, 1 EUR = ratesMap[quote]
 * @param {string} [opts.capturedAt]
 * @returns {object|null}
 */
export function ebayListingToObservation({ cardId, canonicalId = null, tcg, listing, ratesMap = {}, capturedAt } = {}) {
  if (!listing || !Number.isFinite(listing.price) || listing.price <= 0) return null;
  const cur = String(listing.currency || 'EUR').toUpperCase();
  return {
    card_id: cardId,
    canonical_card_id: canonicalId,
    tcg,
    source: 'ebay_browse',
    kind: 'listing',
    sub_type: null,
    condition: listing.condition || null,
    price: listing.price,
    currency: cur,
    price_eur: toEur(listing.price, cur, ratesMap),
    fx_rate: cur === 'EUR' ? 1 : (ratesMap[cur] ?? null),
    observed_at: capturedAt || new Date().toISOString(),
    raw: { title: listing.title || null, url: listing.url || null },
  };
}
