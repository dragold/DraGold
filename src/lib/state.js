// Cache module-level condivisa (estratta da DraGold.jsx — Fase 1 Passo B).
// Nessuna libreria di state management: semplici variabili private + funzioni export.

import { supabase, supabaseReady } from "../supabase.js";

// ─── Saved search cache ─────────────────────────────────────────────────
// Sopravvive all'unmount di MarketsView (es. apertura card detail).
let _savedSearch = null;

export function getSavedSearch() {
    return _savedSearch;
}

export function setSavedSearch(value) {
    _savedSearch = value;
}

export function clearSavedSearch() {
    _savedSearch = null;
}

// ─── Sets cache: Map<"tcg:set_code", {set_code,tcg,set_name,logo_url,symbol_url}> ───
let _setsMap = null;
let _setsLoadP = null;

export function loadSetsMap() {
    if (_setsMap) return Promise.resolve(_setsMap);
    if (!supabaseReady) return Promise.resolve((_setsMap = new Map()));
    if (!_setsLoadP) {
          _setsLoadP = supabase.from('set_logos').select('set_code,tcg,set_name,logo_url,symbol_url,release_date')
            .then(({ data }) => {
                      _setsMap = new Map();
                      for (const s of (data || [])) _setsMap.set(`${s.tcg}:${s.set_code}`, s);
                      return _setsMap;
            }).catch(() => (_setsMap = new Map()));
    }
    return _setsLoadP;
}
