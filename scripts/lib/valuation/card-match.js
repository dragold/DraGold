// DraGold — Market Valuation (Fase 2)
// Match di un prodotto TCGCSV a una carta gia' in `cards`, quando l'id
// sintetico (onepiece:tcgcsv:<pid>) non esiste (set sincronizzati da altre
// fonti). Match per (set, numero) — MAI un match forzato/ambiguo.

import { normalizeSetCode } from '../catalog/normalize-set-code.js';

// Prefisso codice-set TCGCSV: 1-5 lettere + eventuale numero/suffisso + ":"
// ("SV:", "SWSH12:", "ME06:", "SM3.5:", "A2b:"). Solo se seguito da ": " e da
// altro testo (non tocca nomi che contengono un ":" per altri motivi).
const PKM_GROUP_PREFIX_RE = /^[A-Za-z]{1,5}\d{0,3}(?:pt\d+|\.\d+|[a-z])?\s*:\s+(?=\S)/;

/** "SV: Prismatic Evolutions" -> "Prismatic Evolutions"; "ME06: Delta Reign" -> "Delta Reign" */
export function stripPokemonGroupPrefix(name) {
  return String(name || '').replace(PKM_GROUP_PREFIX_RE, '').trim();
}

/** "001/131" -> "001"; "TG12/TG30" -> "TG12"; "SWSH284" -> "SWSH284"; "GG01/GG70" -> "GG01" */
export function tcgcsvNumberToLocalId(numberField) {
  const s = String(numberField || '').trim();
  if (!s) return null;
  return s.split('/')[0].trim() || null;
}

/** Normalizza un numero carta come `cards.card_number_norm` (lower + solo alfanumerici). */
export function cardNumberNorm(raw) {
  return normalizeSetCode(raw);
}

/**
 * Indice nome-set -> set_id, dai dati reali in `cards`. Un nome che mappa a
 * piu' set_id resta ambiguo salvo che UNO solo sia nella lista autoritativa
 * (tcgdex).
 *
 * @param {object} sb
 * @param {Set<string>} authoritativeSetIds - id da listTcgdexSets (lowercase)
 * @returns {Promise<Map<string, {setId:string, ambiguous:boolean}>>}
 */
export async function buildPokemonSetIndex(sb, authoritativeSetIds = new Set()) {
  const byName = new Map(); // nameKey -> Set<setId>
  const PAGE = 1000;
  for (let off = 0; off < 60000; off += PAGE) {
    const { data, error } = await sb.from('cards')
      .select('set_id, set_name')
      .eq('tcg', 'pokemon').eq('lang', 'en')
      .not('set_name', 'is', null)
      .order('id', { ascending: true })
      .range(off, off + PAGE - 1);
    if (error) throw new Error(`buildPokemonSetIndex: ${error.message}`);
    for (const r of data || []) {
      const k = String(r.set_name).toLowerCase().trim();
      if (!k) continue;
      if (!byName.has(k)) byName.set(k, new Set());
      byName.get(k).add(r.set_id);
    }
    if (!data || data.length < PAGE) break;
  }

  const out = new Map();
  for (const [name, ids] of byName) {
    if (ids.size === 1) {
      out.set(name, { setId: [...ids][0], ambiguous: false });
      continue;
    }
    const inAuth = [...ids].filter((id) => authoritativeSetIds.has(String(id).toLowerCase()));
    if (inAuth.length === 1) out.set(name, { setId: inAuth[0], ambiguous: false });
    else out.set(name, { setId: null, ambiguous: true });
  }
  return out;
}

/**
 * @param {Map} setIndex - da buildPokemonSetIndex
 * @param {string} groupName - nome group TCGCSV
 * @returns {{setId:string|null, reason:string}}
 */
export function resolvePokemonSetId(setIndex, groupName) {
  const stripped = stripPokemonGroupPrefix(groupName).toLowerCase().trim();
  const hit = setIndex.get(stripped);
  if (!hit) return { setId: null, reason: 'set-name-not-in-db' };
  if (hit.ambiguous) return { setId: null, reason: 'set-name-ambiguous' };
  return { setId: hit.setId, reason: 'ok' };
}

/** Sceglie un id fra i candidati con lo stesso numero: preferisci la base. Puro. */
export function pickCardId(rows) {
  if (!rows || !rows.length) return null;
  const base = rows.filter((r) => !r.print_variant);
  if (base.length === 1) return base[0].id;
  if (rows.length === 1) return rows[0].id;
  return null; // ambiguo
}

/**
 * Indice `card_number_norm -> righe` per uno o piu' set, in UNA query.
 * @param {object} sb
 * @param {'pokemon'|'onepiece'} tcg
 * @param {string[]} setIdCandidates
 * @returns {Promise<Map<string, {id:string, print_variant:string|null}[]>>}
 */
export async function buildCardIndexForSets(sb, tcg, setIdCandidates) {
  const idx = new Map();
  if (!setIdCandidates.length) return idx;
  const PAGE = 1000;
  for (let off = 0; off < 20000; off += PAGE) {
    const { data, error } = await sb.from('cards')
      .select('id, print_variant, card_number_norm')
      .eq('tcg', tcg).eq('lang', 'en')
      .in('set_id', setIdCandidates)
      .not('card_number_norm', 'is', null)
      .order('id', { ascending: true })
      .range(off, off + PAGE - 1);
    if (error) throw new Error(`buildCardIndexForSets: ${error.message}`);
    for (const r of data || []) {
      if (!idx.has(r.card_number_norm)) idx.set(r.card_number_norm, []);
      idx.get(r.card_number_norm).push({ id: r.id, print_variant: r.print_variant });
    }
    if (!data || data.length < PAGE) break;
  }
  return idx;
}

/** @param {Map} index @param {string} numberNorm @returns {string|null} */
export function resolveCardIdFromIndex(index, numberNorm) {
  if (!numberNorm) return null;
  return pickCardId(index.get(numberNorm));
}
