// DraGold — Catalog Freshness (Fase 1)
// Trasformazione product/price TCGCSV -> riga `cards` / riga `card_prices`.
// Puro (nessun I/O). One Piece EN.

const SEALED_RE = /\b(booster\s*box|booster\s*pack|sleeved|display|\bcase\b|double\s*pack|pack\s*set|starter\s*deck|structure\s*deck|ultra\s*deck|premium\s*(?:booster|collection)|gift\s*box|collection\s*box|\btin\b)\b/i;
const VARIANT_RE = /\((alternate art|alt art|parallel|manga|full art|special foil|special|super leader(?: alternate art)?|box topper|textured|jolly|gold)\)/i;

/** Prodotto sigillato (box/pack/deck) — NON una carta singola. */
export function isSealedProduct(name) {
  return SEALED_RE.test(String(name || ''));
}

/** print_variant da nome TCGCSV, o null per la stampa base. */
export function detectPrintVariant(name) {
  const m = String(name || '').match(VARIANT_RE);
  if (!m) return null;
  const t = m[1].toLowerCase();
  if (t.includes('manga')) return 'manga';
  if (t.includes('parallel') || t.includes('alternate art') || t.includes('alt art') || t.includes('super leader')) return 'parallel';
  if (t.includes('full art')) return 'full-art';
  return 'special';
}

const META_FIELDS = ['Color', 'CardType', 'Power', 'Cost', 'Life', 'Attribute', 'Subtypes', 'Counter'];

/**
 * @param {object} opts
 * @param {{productId,name,number,rarity,imageUrl,raw}} opts.product - da mapTcgcsvProduct
 * @param {string} opts.groupName
 * @param {string} opts.setCode - canonico (es. 'OP-17')
 * @param {string} [opts.lang='en']
 * @param {string} [opts.capturedAt] - ISO; usato per updated_at
 * @returns {object|null} riga `cards` (null se prodotto sigillato)
 */
export function tcgcsvProductToCardRow({ product, groupName, setCode, lang = 'en', capturedAt } = {}) {
  if (!product || product.productId == null) return null;
  if (isSealedProduct(product.name) && !product.number) return null;

  const productId = String(product.productId);
  const meta = {};
  for (const e of product.raw?.extendedData || []) {
    if (META_FIELDS.includes(e.name) && e.value != null && e.value !== '') meta[e.name.toLowerCase()] = String(e.value);
  }

  return {
    id: `onepiece:tcgcsv:${productId}:${lang}`,
    tcg: 'onepiece',
    source: 'tcgcsv',
    source_id: productId,
    lang,
    name: product.name || `Card ${productId}`,
    set_id: setCode,
    set_name: groupName || null,
    card_number: product.number || null,
    rarity: product.rarity || null,
    supertype: meta.cardtype || null,
    image_url: product.imageUrl || null,
    image_url_hi: product.imageUrl || null,
    print_variant: detectPrintVariant(product.name),
    metadata: Object.keys(meta).length ? meta : null,
    updated_at: capturedAt || new Date().toISOString(),
  };
}

/**
 * Sceglie UNA quotazione fra le subType disponibili (Normal/Foil) coerente con
 * la stampa, cosi' ogni carta ha una sola riga `card_prices` per run.
 * @param {{subType,market,low,mid,high}[]} entries
 * @param {string|null} printVariant
 * @returns {object|null}
 */
export function pickPrice(entries, printVariant) {
  const list = (entries || []).filter((e) => e && (e.market != null || e.low != null));
  if (!list.length) return null;
  const preferred = printVariant ? 'Foil' : 'Normal';
  return list.find((e) => e.subType === preferred) || list.find((e) => e.market != null) || list[0];
}

/**
 * @param {object} opts
 * @param {string} opts.cardId
 * @param {{subType,market,low,mid,high}[]} opts.priceEntries
 * @param {string|null} opts.printVariant
 * @param {string} [opts.capturedAt] - ISO (uno per run)
 * @returns {object|null} riga `card_prices` (null se nessun prezzo)
 */
export function tcgcsvPriceToPriceRow({ cardId, priceEntries, printVariant, capturedAt } = {}) {
  const p = pickPrice(priceEntries, printVariant);
  if (!p) return null;
  return {
    card_id: cardId,
    source: 'tcgcsv',
    currency: 'USD',
    price_market: p.market ?? null,
    price_low: p.low ?? null,
    price_high: p.high ?? null,
    price_median: p.mid ?? null,
    captured_at: capturedAt || new Date().toISOString(),
    timeframe: 'point',
    raw_response: { provider: 'tcgcsv/tcgplayer', sub_type: p.subType || null },
  };
}
