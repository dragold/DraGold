// DraGold — Market Valuation (Fase 2). I/O verso market_valuations.

/**
 * Upsert batch di valutazioni (onConflict card_id,currency).
 * @param {object} sb
 * @param {object[]} rows - da computeValuation()
 * @returns {Promise<{upserted:number}>}
 */
export async function upsertValuations(sb, rows) {
  if (!rows || !rows.length) return { upserted: 0 };
  let upserted = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const { error } = await sb.from('market_valuations')
      .upsert(batch, { onConflict: 'card_id,currency', ignoreDuplicates: false });
    if (error) throw new Error(`upsertValuations: ${error.message}`);
    upserted += batch.length;
  }
  return { upserted };
}

/**
 * @param {object} sb
 * @param {string[]} cardIds
 * @param {string} [currency='EUR']
 * @returns {Promise<Map<string, object>>}
 */
export async function loadPriorValuations(sb, cardIds, currency = 'EUR') {
  const out = new Map();
  for (let i = 0; i < cardIds.length; i += 300) {
    const chunk = cardIds.slice(i, i + 300);
    const { data, error } = await sb.from('market_valuations')
      .select('*').eq('currency', currency).in('card_id', chunk);
    if (error) throw new Error(`loadPriorValuations: ${error.message}`);
    for (const r of data || []) out.set(r.card_id, r);
  }
  return out;
}
