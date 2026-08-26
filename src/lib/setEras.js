// DraGold — src/lib/setEras.js
// Explorer/Filtri "Era/Blocco" + "Tipologia prodotto" (Phase 3, Fase 1 — Fondamenta dati).
// Opzione A del piano (vedi DraGold-UXUI-Phase3-WowFactor-Plan.md §C.1): mapping statico
// versionato, zero migration, zero nuova dipendenza. Nessun dato inventato: le 152 righe
// Pokémon EN e 31 righe One Piece EN sotto sono state lette live da public.set_logos il
// 26/08/2026 (stessa query usata da lib/tcgSets.js) — ogni set_code qui presente esiste
// davvero in quella tabella a quella data. Se set_logos cambia (nuovi set, refresh dati),
// questo file va aggiornato manualmente: nessuna era/tipo viene dedotta automaticamente
// per un set_code non elencato, vedi fallback in fondo al file.
//
// Copertura nota (verificata, non assunta):
// - Pokémon EN (namespace base1/bw1/swsh1/sv1/...): 152/152 set con era assegnata.
// - Pokémon JA (namespace CP1/E1../M1L/PCG1../...): NESSUNA era assegnata qui — è un
//   namespace di set_id completamente diverso (verificato in tcgSets.js), non derivabile
//   dalla cronologia EN sotto senza una fonte dati JA dedicata (gap aperto, vedi piano §C.1).
// - One Piece EN+JA: 31/31 set con tipologia prodotto assegnata. Nessun concetto di "era"
//   applicato — il gioco è troppo giovane (dic. 2022→oggi) per avere blocchi ufficiali
//   riconosciuti come quelli Pokémon; la numerazione di serie (OP01, OP02, ...) è già
//   l'informazione di raggruppamento reale e resta disponibile via releaseYear/setId
//   esistenti in tcgSets.js — non duplicata qui per non inventare una tassonomia che il
//   gioco stesso non ha.

// ─────────────────────────────────────────────────────────────────────────
// POKÉMON — ERA (blocco ufficiale, ordine cronologico = eraOrder crescente)
// ─────────────────────────────────────────────────────────────────────────
// Ogni entry: prefisso di set_code (match esatto su un elenco, non regex libera, per
// evitare falsi match tra prefissi simili es. "sv" vs "svp").
const POKEMON_ERAS = [
  { era: "Classic (Base/Gym/Neo/e-Card)", eraOrder: 1, codes: [
    "base1","base2","basep","base3","base4","base5","gym1","gym2",
    "neo1","neo2","si1","neo3","neo4","base6","ecard1","bp","ecard2","ecard3",
  ]},
  { era: "EX", eraOrder: 2, codes: [
    "ex1","ex2","np","ex3","ex4","ex5","tk1a","tk1b","ex6","pop1","ex7","ex8",
    "ex9","ex10","pop2","ex11","ex12","tk2a","tk2b","pop3","ex13","ex14","pop4",
    "ex15","ex16","pop5",
  ]},
  { era: "Diamond & Pearl", eraOrder: 3, codes: [
    "dp1","dpp","dp2","pop6","dp3","dp4","pop7","dp5","dp6","pop8","dp7",
  ]},
  { era: "Platinum", eraOrder: 4, codes: ["pl1","pop9","pl2","pl3","pl4","ru1"] },
  { era: "HeartGold & SoulSilver", eraOrder: 5, codes: [
    "hgss1","hsp","hgss2","hgss3","hgss4","col1",
  ]},
  { era: "Black & White", eraOrder: 6, codes: [
    "bwp","bw1","bw2","bw3","bw4","bw5","bw6","dv1","bw7","bw8","bw9","bw10","bw11",
  ]},
  { era: "XY", eraOrder: 7, codes: [
    "xyp","xy0","xy1","xy2","xy3","xy4","xy5","dc1","xy6","xy7","xy8","xy9","g1",
    "xy10","xy11","xy12",
  ]},
  { era: "Sun & Moon", eraOrder: 8, codes: [
    "sm1","smp","sm2","sm3","sm35","sm4","sm5","sm6","sm7","sm75","sm8","sm9",
    "det1","sm10","sm11","sm115","sma","sm12",
  ]},
  { era: "Sword & Shield", eraOrder: 9, codes: [
    "swshp","swsh1","swsh2","swsh3","swsh35","swsh4","swsh45","swsh5","swsh6",
    "swsh7","cel25","swsh8","swsh9","swsh9tg","swsh10","pgo","swsh11","swsh12",
    "swsh12pt5",
  ]},
  { era: "Scarlet & Violet", eraOrder: 10, codes: [
    "svp","sv1","sv2","sv3","sv3pt5","sv4","sv4pt5","sv5","sv6","sv6pt5","sv7",
    "sv8","sv8pt5","sv9","sv10",
  ]},
  { era: "Mega Evolution", eraOrder: 11, codes: ["me1","me2","me2pt5","me3","me4"] },
];

const _pokemonEraByCode = new Map();
for (const group of POKEMON_ERAS) {
  for (const code of group.codes) {
    _pokemonEraByCode.set(code, { era: group.era, eraOrder: group.eraOrder });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// POKÉMON — TIPOLOGIA PRODOTTO (main / special / promo)
// ─────────────────────────────────────────────────────────────────────────
// "main": espansione numerata standard, vendibile in booster pack, fa parte della
//   sequenza principale dell'era.
// "special": prodotto boxed/a tema che non fa parte della sequenza numerata principale
//   (side set, Trainer Gallery, Shiny Vault, prodotto spin-off) — ha comunque un set_id
//   proprio e carte reali, non è un promo.
// "promo": Black Star Promos e affini — carte distribuite fuori dai booster (eventi,
//   prerelease, riviste), non un'espansione a sé.
const POKEMON_PROMO_CODES = new Set([
  "basep","np","dpp","hsp","bwp","xyp","smp","swshp","svp","bp",
]);
const POKEMON_SPECIAL_CODES = new Set([
  "base6","si1","pop1","pop2","pop3","pop4","pop5","pop6","pop7","pop8","pop9",
  "tk1a","tk1b","tk2a","tk2b","ru1","col1","dv1","dc1","g1","det1","sm35","sm75",
  "sm115","sma","cel25","swsh35","swsh45","swsh9tg","pgo","swsh12pt5","sv3pt5",
  "sv4pt5","sv6pt5","sv8pt5","me2pt5",
]);

function getPokemonProductType(setCode) {
  if (POKEMON_PROMO_CODES.has(setCode)) return "promo";
  if (POKEMON_SPECIAL_CODES.has(setCode)) return "special";
  if (_pokemonEraByCode.has(setCode)) return "main";
  return null; // set_code non nella mappa (es. namespace JA) — mai un default inventato
}

// ─────────────────────────────────────────────────────────────────────────
// ONE PIECE — TIPOLOGIA PRODOTTO (booster / starter_deck / extra_booster / premium / promo)
// ─────────────────────────────────────────────────────────────────────────
// Derivata dal prefisso di set_code, verificato contro le 31 righe reali di set_logos
// (OP.. = booster principale, ST.. = starter deck, EB.. = extra booster — nessuna riga
// EB presente il 26/08/2026 ma il prefisso è documentato pubblicamente dal publisher,
// incluso qui per non richiedere un secondo aggiornamento quando arriverà — PRB.. =
// premium/special booster, P-.. o "Promotion" nel nome = promo).
function getOnePieceProductType(setCode, setName) {
  const code = String(setCode || "").toUpperCase();
  const name = String(setName || "");
  if (/promotion/i.test(name)) return "promo";
  if (/^OP\d/.test(code)) return "booster";
  if (/^ST\d/.test(code)) return "starter_deck";
  if (/^EB\d/.test(code)) return "extra_booster";
  if (/^PRB\d/.test(code)) return "premium";
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// API pubblica
// ─────────────────────────────────────────────────────────────────────────

// Ritorna { era, eraOrder } per Pokémon EN, o null (Pokémon JA, One Piece, MTG/YGO —
// nessuna era assegnata, mai un valore fabbricato). setCode va passato as-is (lowercase
// coerente con set_logos.set_code, es. "sv1", non "SV1").
export function getSetEra(tcg, setCode) {
  if (tcg !== "pokemon") return null;
  return _pokemonEraByCode.get(String(setCode || "").toLowerCase()) || null;
}

// Ritorna la tipologia prodotto (stringa) o null se non classificabile con i dati oggi
// disponibili. Un filtro UI deve trattare null come "non filtrabile", mai come una
// categoria implicita.
export function getProductType(tcg, setCode, setName) {
  if (tcg === "pokemon") return getPokemonProductType(String(setCode || "").toLowerCase());
  if (tcg === "onepiece") return getOnePieceProductType(setCode, setName);
  return null;
}

// Etichette leggibili per la UI filtro — un solo posto da aggiornare se cambiano.
export const PRODUCT_TYPE_LABELS = {
  main: "Main set",
  special: "Special set",
  promo: "Promo",
  booster: "Booster",
  starter_deck: "Starter Deck",
  extra_booster: "Extra Booster",
  premium: "Premium",
};

// Elenco ordinato delle era Pokémon per popolare un select/filtro senza dover
// riordinare a mano (già in eraOrder crescente = cronologico).
export const POKEMON_ERA_LIST = POKEMON_ERAS.map(g => ({ era: g.era, eraOrder: g.eraOrder }));
