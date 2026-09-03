// DraGold — Cross-Language Identity (Fase A)
// Puro, nessun I/O. Mirror JS di public.xlang_key (spec §4.3).
// Le mappe (set_alias / card_number_alias) sono passate come argomento:
// gli stessi dati che vivono nelle tabelle omonime.
//
// NOTA normalizzazione numero (deviazione documentata dal reference-impl del piano
// Fase A, allineata all'INTENT dei suoi stessi test 2/3/4/14/16 e del test RPC R9):
// il componente "numero" della chiave azzera lo zero-padding di testa — la carta
// "006" È la carta "6". `normNum` resta invariata (strip separatori) perché usata
// anche per il match esatto degli alias; lo strip di testa vive in `numKey`.
import { setIdentityKey } from './normalize-set-code.js';

/** lower + solo [a-z0-9]. Mirror di regexp_replace(lower(x),'[^a-z0-9]','','g'). */
export function normNum(raw) {
  return String(raw ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** normNum + azzeramento zero-padding di testa: "006"->"6", "020"->"20", "op01001" invariato, "000"->"0". */
export function numKey(raw) {
  return normNum(raw).replace(/^0+(?=[0-9])/, '');
}

/**
 * Ritorna canonical_set_id se esiste un set_alias equivalent+confirmed per
 * (tcg, setId); altrimenti setId invariato. partial/subset/superset NON rimappano.
 */
export function resolveSetAlias(tcg, setId, setAliases = []) {
  const hit = (setAliases || []).find(a =>
    a && a.tcg === tcg && a.alias_set_id === setId
    && a.confidence === 'confirmed' && a.relation === 'equivalent');
  return hit ? hit.canonical_set_id : setId;
}

/**
 * Override puntuale: se una riga card_number_alias confirmed matcha
 * (tcg, alias_set_id=setId, normNum(alias_card_number)===normNum(cardNumber)),
 * ritorna { canonical_set_id, canonical_card_number }; altrimenti null.
 */
export function resolveNumberAlias(tcg, setId, cardNumber, numberAliases = []) {
  const n = normNum(cardNumber);
  const hit = (numberAliases || []).find(a =>
    a && a.tcg === tcg && a.alias_set_id === setId
    && a.confidence === 'confirmed'
    && normNum(a.alias_card_number) === n);
  return hit ? { canonical_set_id: hit.canonical_set_id, canonical_card_number: hit.canonical_card_number } : null;
}

/**
 * La chiave "card concept" language-independent.
 * Precedenza: number-alias (set+numero) > set-alias equivalent (solo set) > grezzo.
 * setIdentityKey normalizza lo spelling del set risolto; numKey il numero.
 */
export function xlangKey(tcg, setId, cardNumber, { setAliases = [], numberAliases = [] } = {}) {
  const t = String(tcg ?? '').toLowerCase();
  const na = resolveNumberAlias(tcg, setId, cardNumber, numberAliases);
  if (na) return `${t}:${setIdentityKey(na.canonical_set_id)}:${numKey(na.canonical_card_number)}`;
  const refSet = resolveSetAlias(tcg, setId, setAliases);
  return `${t}:${setIdentityKey(refSet)}:${numKey(cardNumber)}`;
}

const LANG_RANK = { en: 1, ja: 2 };
/** Ordina le versioni: contextLang, poi en, poi ja, poi resto alfabetico. Stabile. */
export function orderVersions(rows, contextLang = null) {
  const rank = (l) => {
    if (contextLang && l === contextLang) return 0;
    return LANG_RANK[l] ?? 3;
  };
  return [...(rows || [])]
    .map((r, i) => [r, i])
    .sort(([a, ia], [b, ib]) => {
      const ra = rank(a.lang), rb = rank(b.lang);
      if (ra !== rb) return ra - rb;
      const la = (a.lang || ''), lb = (b.lang || '');
      if (la !== lb) return la < lb ? -1 : 1;
      return ia - ib;
    })
    .map(([r]) => r);
}
