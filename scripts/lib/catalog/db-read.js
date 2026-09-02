// DraGold — Catalog Freshness (Fase 1)
// Letture DB del catalogo attuale (SOLA LETTURA su `cards`/`canonical_cards`).
// Nessuna scrittura. Le chiavi restituite sono gia' normalizzate.

import { normalizeSetCode } from './normalize-set-code.js';
import { cardNumberKey } from './card-number-key.js';

const MAX_ROWS = 60000;

/**
 * Candidati di spelling grezzo per un set code, per query `.in('set_id', ...)`.
 * (In `cards` lo stesso set vive a volte come "OP-17" e a volte "op17".)
 * @param {string} code @returns {string[]}
 */
export function rawSetIdCandidates(code) {
  const s = String(code || '').trim();
  if (!s) return [];
  const noDash = s.replace(/[-_ ]/g, '');
  const set = new Set([
    s, s.toUpperCase(), s.toLowerCase(),
    noDash, noDash.toUpperCase(), noDash.toLowerCase(),
    s.replace(/[-_ ]/g, '-'),
  ]);
  return [...set].filter(Boolean);
}

/**
 * Set delle chiavi normalizzate dei set gia' presenti in DraGold per (tcg, lang).
 * Pokémon: canonical_cards (piu' leggera); fallback a cards. One Piece: cards
 * (canonical_cards.set_id e' NULL per OP — verificato).
 *
 * @param {object} supabase
 * @param {string} tcg
 * @param {string} lang
 * @returns {Promise<Set<string>>}
 */
export async function dbSetCodes(supabase, tcg, lang) {
  const keys = new Set();
  const add = (raw) => { const k = normalizeSetCode(raw); if (k) keys.add(k); };

  if (tcg !== 'onepiece') {
    const { data } = await supabase
      .from('canonical_cards').select('set_id').eq('tcg', tcg)
      .not('set_id', 'is', null).limit(MAX_ROWS);
    for (const r of data || []) add(r.set_id);
  }
  if (!keys.size) {
    const { data } = await supabase
      .from('cards').select('set_id').eq('tcg', tcg).eq('lang', lang)
      .not('set_id', 'is', null).limit(MAX_ROWS);
    for (const r of data || []) add(r.set_id);
  }
  return keys;
}

/**
 * Set delle chiavi-numero normalizzate delle carte gia' in DraGold per un set.
 * @param {object} supabase
 * @param {'pokemon'|'onepiece'} tcg
 * @param {string} lang
 * @param {string} setCode
 * @returns {Promise<Set<string>>}
 */
export async function dbCardNumbers(supabase, tcg, lang, setCode) {
  const candidates = rawSetIdCandidates(setCode);
  if (!candidates.length) return new Set();
  const { data } = await supabase
    .from('cards').select('card_number')
    .eq('tcg', tcg).eq('lang', lang).in('set_id', candidates)
    .not('card_number', 'is', null).limit(MAX_ROWS);
  const out = new Set();
  for (const r of data || []) {
    const k = cardNumberKey(tcg, r.card_number);
    if (k) out.add(k);
  }
  return out;
}

/**
 * Conteggio carte sincronizzate di recente (per KPI).
 * @returns {Promise<{last24h:number,last7d:number}>}
 */
export async function recentlySyncedCounts(supabase, tcg) {
  const since = (h) => new Date(Date.now() - h * 3600_000).toISOString();
  const q = (iso) => supabase.from('cards').select('id', { count: 'exact', head: true })
    .eq('tcg', tcg).gt('created_at', iso);
  const [{ count: last24h }, { count: last7d }] = await Promise.all([q(since(24)), q(since(24 * 7))]);
  return { last24h: last24h || 0, last7d: last7d || 0 };
}

/**
 * Un set esiste gia' in `cards` (per la guardia "non e' un gap se e' presente").
 * @returns {Promise<boolean>}
 */
export async function dbSetExists(supabase, tcg, lang, setCode) {
  const candidates = rawSetIdCandidates(setCode);
  if (!candidates.length) return false;
  const { count } = await supabase.from('cards').select('id', { count: 'exact', head: true })
    .eq('tcg', tcg).eq('lang', lang).in('set_id', candidates);
  return (count || 0) > 0;
}
