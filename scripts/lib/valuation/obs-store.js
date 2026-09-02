// DraGold — Market Valuation (Fase 2)
// I/O isolato verso market_observations e fx_rates.

/**
 * @param {object} sb
 * @param {string} quote - es. 'USD'
 * @returns {Promise<{as_of:string, rate:number}|null>}
 */
export async function latestFxRate(sb, quote) {
  const { data, error } = await sb.from('fx_rates')
    .select('as_of, rate')
    .eq('quote', quote)
    .order('as_of', { ascending: false })
    .limit(1);
  if (error) throw new Error(`latestFxRate(${quote}): ${error.message}`);
  return data && data[0] ? data[0] : null;
}

/**
 * @param {object} sb
 * @param {{as_of:string, quote:string, rate:number, source?:string}} row
 */
export async function upsertFxRate(sb, row) {
  const { error } = await sb.from('fx_rates').upsert({
    as_of: row.as_of, quote: row.quote, rate: row.rate,
    source: row.source || 'frankfurter', fetched_at: new Date().toISOString(),
  }, { onConflict: 'as_of,quote' });
  if (error) throw new Error(`upsertFxRate: ${error.message}`);
}

/**
 * Append batch di osservazioni (mai upsert — verita' storica).
 * @param {object} sb
 * @param {object[]} rows
 * @returns {Promise<{inserted:number}>}
 */
export async function insertObservations(sb, rows) {
  if (!rows || !rows.length) return { inserted: 0 };
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await sb.from('market_observations').insert(batch);
    if (error) throw new Error(`insertObservations: ${error.message}`);
    inserted += batch.length;
  }
  return { inserted };
}

/**
 * Osservazioni recenti per un insieme di carte.
 * @param {object} sb
 * @param {string[]} cardIds
 * @param {number} sinceDays
 * @returns {Promise<Map<string, object[]>>}
 */
export async function observationsForCards(sb, cardIds, sinceDays) {
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
  const out = new Map();
  for (let i = 0; i < cardIds.length; i += 200) {
    const chunk = cardIds.slice(i, i + 200);
    const { data, error } = await sb.from('market_observations')
      .select('card_id, canonical_card_id, tcg, source, kind, sub_type, condition, price, currency, price_eur, observed_at')
      .in('card_id', chunk)
      .gte('observed_at', since)
      .order('observed_at', { ascending: false })
      .limit(20000);
    if (error) throw new Error(`observationsForCards: ${error.message}`);
    for (const r of data || []) {
      if (!out.has(r.card_id)) out.set(r.card_id, []);
      out.get(r.card_id).push(r);
    }
  }
  return out;
}

/**
 * Carte con almeno un'osservazione negli ultimi `sinceDays`.
 * @returns {Promise<{card_id:string, canonical_card_id:string|null, tcg:string}[]>}
 */
export async function cardIdsWithRecentObservations(sb, sinceDays, tcg = null) {
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
  const seen = new Map();
  const PAGE = 1000;
  for (let offset = 0; offset < 500_000; offset += PAGE) {
    let q = sb.from('market_observations')
      .select('card_id, canonical_card_id, tcg')
      .gte('observed_at', since)
      .order('card_id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (tcg) q = q.eq('tcg', tcg);
    const { data, error } = await q;
    if (error) throw new Error(`cardIdsWithRecentObservations: ${error.message}`);
    for (const r of data || []) {
      if (!seen.has(r.card_id)) seen.set(r.card_id, { card_id: r.card_id, canonical_card_id: r.canonical_card_id, tcg: r.tcg });
    }
    if (!data || data.length < PAGE) break;
  }
  return [...seen.values()];
}
