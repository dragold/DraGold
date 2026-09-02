// DraGold — Catalog Freshness (Fase 1)
// Persistenza dei gap in `public.catalog_gaps` — l'unica scrittura DB di questo
// layer. `catalog_gaps` e' ANCHE la sync queue (campo `status`).
//
// Regola di upsert: il payload NON include `status`/`retry_count`/`resolved_at`/
// `first_seen_at` -> su INSERT prendono i default della tabella
// ('missing'/0/null/now()), su UPDATE restano invariati. Cosi' un gap gia'
// `resolved` NON viene riaperto solo perche' ricompare nel run (la riapertura
// esplicita, quando serve, e' `reopenResolved`).

const GAP_CONFLICT = 'tcg,language,entity_type,source,source_id';

// Separatore US (0x1F): non compare mai in set code / source id -> nessuna
// collisione fra chiavi tipo "a-bc" e "ab-c".
const KEY_SEP = String.fromCharCode(0x1f);

/** Chiave composita di un gap (per confronti in memoria). */
export function gapKey(g) {
  return [g.tcg, g.language, g.entity_type, g.source, g.source_id].join(KEY_SEP);
}

/**
 * @param {object} supabase
 * @param {Array<{tcg,language,entity_type,source,source_id,set_code?,card_number?,name?,release_date?,detail?}>} gaps
 * @returns {Promise<{upserted:number}>}
 */
export async function upsertGaps(supabase, gaps) {
  if (!gaps || !gaps.length) return { upserted: 0 };
  const now = new Date().toISOString();
  const rows = gaps.map((g) => ({
    tcg: g.tcg,
    language: g.language || 'en',
    entity_type: g.entity_type,
    source: g.source,
    source_id: g.source_id,
    set_code: g.set_code ?? null,
    card_number: g.card_number ?? null,
    name: g.name ?? null,
    release_date: g.release_date ?? null,
    detail: g.detail ?? null,
    last_seen_at: now,
  }));
  let upserted = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const { error } = await supabase.from('catalog_gaps')
      .upsert(batch, { onConflict: GAP_CONFLICT, ignoreDuplicates: false });
    if (error) throw new Error(`upsertGaps: ${error.message}`);
    upserted += batch.length;
  }
  return { upserted };
}

/**
 * Chiude come `resolved` i gap di uno scope che NON sono piu' fra le chiavi
 * viste in questo run.
 *
 * @param {object} supabase
 * @param {{tcg:string, language:string}} scope
 * @param {Set<string>} liveSourceIds - source_id ancora "gap" in questo run
 * @returns {Promise<{resolved:number}>}
 */
export async function resolveGapsNotIn(supabase, scope, liveSourceIds) {
  const { data, error } = await supabase.from('catalog_gaps')
    .select('id, source_id')
    .eq('tcg', scope.tcg).eq('language', scope.language)
    .in('status', ['missing', 'queued', 'error']);
  if (error) throw new Error(`resolveGapsNotIn(select): ${error.message}`);
  const stale = (data || []).filter((r) => !liveSourceIds.has(r.source_id)).map((r) => r.id);
  if (!stale.length) return { resolved: 0 };
  const now = new Date().toISOString();
  for (let i = 0; i < stale.length; i += 200) {
    const batch = stale.slice(i, i + 200);
    const { error: uErr } = await supabase.from('catalog_gaps')
      .update({ status: 'resolved', resolved_at: now })
      .in('id', batch);
    if (uErr) throw new Error(`resolveGapsNotIn(update): ${uErr.message}`);
  }
  return { resolved: stale.length };
}

/** Gap pronti per la sync queue. */
export async function nextQueuedGaps(supabase, { limit = 25, maxRetry = 3 } = {}) {
  const { data, error } = await supabase.from('catalog_gaps')
    .select('*')
    .in('status', ['missing', 'error'])
    .lt('retry_count', maxRetry)
    .order('release_date', { ascending: false, nullsFirst: false })
    .order('first_seen_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(`nextQueuedGaps: ${error.message}`);
  return data || [];
}

export async function markSyncing(supabase, id) {
  const { error } = await supabase.from('catalog_gaps')
    .update({ status: 'syncing', last_seen_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(`markSyncing: ${error.message}`);
}

export async function markResolvedById(supabase, id) {
  const { error } = await supabase.from('catalog_gaps')
    .update({ status: 'resolved', resolved_at: new Date().toISOString(), error_message: null }).eq('id', id);
  if (error) throw new Error(`markResolvedById: ${error.message}`);
}

export async function markError(supabase, id, message) {
  const { data, error: sErr } = await supabase.from('catalog_gaps').select('retry_count').eq('id', id).single();
  if (sErr) throw new Error(`markError(select): ${sErr.message}`);
  const { error } = await supabase.from('catalog_gaps')
    .update({ status: 'error', error_message: String(message || '').slice(0, 500), retry_count: (data?.retry_count || 0) + 1 })
    .eq('id', id);
  if (error) throw new Error(`markError: ${error.message}`);
}

/** Riapre esplicitamente un gap `resolved` (solo se l'entita' sparisce di nuovo). */
export async function reopenResolved(supabase, id) {
  const { error } = await supabase.from('catalog_gaps')
    .update({ status: 'missing', resolved_at: null }).eq('id', id).eq('status', 'resolved');
  if (error) throw new Error(`reopenResolved: ${error.message}`);
}
