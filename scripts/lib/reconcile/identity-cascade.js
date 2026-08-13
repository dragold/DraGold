// DraGold — Catalog Reconciliation Pipeline
// Identity matching cascade: Pass -1 .. Pass 5.
//
// Puramente diagnostico. Ogni funzione qui è pura: prende righe già normalizzate
// (vedi normalize-tcgdex.js / normalize-ptcg.js) e produce CLUSTER candidati —
// non decide la finding category, non assegna recommended_action, non sceglie
// una fonte vincente. Quella logica vive in classify-findings.js, di proposito
// separata da questa (single responsibility, testabile in isolamento).
//
// Vincolo non negoziabile, ripetuto qui perché è la parte più a rischio:
// il Pass 4 (fuzzy/candidate matching) non deve MAI produrre una confidence
// VERIFIED altrove nella pipeline — questo modulo lo garantisce non scrivendo
// mai un campo "confidence" qui (lo fa classify-findings.js), ma segnala ogni
// cluster di Pass 4 con `pass: 'PASS_4_FUZZY_CANDIDATE'` esplicito, in modo che
// classify-findings.js non possa confonderlo con un pass a chiave esatta.

/**
 * Raggruppa un array per una chiave calcolata da keyFn. Righe con chiave
 * null/undefined vengono escluse dal raggruppamento (mai fuse per "assenza di
 * chiave" — coerente con la policy già in produzione in `src/lib/search.js`
 * groupByCanonical, che non fonde mai righe con canonical_card_id nullo).
 *
 * @param {object[]} rows
 * @param {(row: object) => string|null|undefined} keyFn
 * @returns {Map<string, object[]>}
 */
function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (key === null || key === undefined) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

/**
 * Normalizza un `source_id` in modo conservativo per il confronto cross-source
 * (Pass 2). Regola dichiarata esplicitamente, non generica:
 *   - se il valore matcha "<prefisso><separatore?><cifre>" (es. "svp-044",
 *     "svp044"), la parte numerica finale viene spogliata degli zeri iniziali
 *     e riassemblata con un separatore "-" canonico.
 *   - altrimenti il valore resta invariato (mai indovinato).
 *
 * @param {string|null|undefined} raw
 * @returns {{normalized: string|null, wasNormalized: boolean, reason: string}}
 */
export function normalizeSourceId(raw) {
  if (raw === null || raw === undefined) {
    return { normalized: null, wasNormalized: false, reason: 'NULL_INPUT' };
  }
  const s = String(raw).trim();
  if (s === '') return { normalized: '', wasNormalized: false, reason: 'EMPTY_INPUT' };
  const m = s.match(/^([A-Za-z][A-Za-z0-9]*?)-?(\d+)$/);
  if (!m) {
    return { normalized: s, wasNormalized: false, reason: 'PATTERN_NOT_RECOGNIZED_NOT_NORMALIZED' };
  }
  const [, prefix, digits] = m;
  const strippedDigits = digits.replace(/^0+(?=\d)/, '');
  const normalized = `${prefix.toLowerCase()}-${strippedDigits}`;
  const rawCanonicalForm = `${prefix.toLowerCase()}-${digits}`;
  return {
    normalized,
    wasNormalized: normalized !== rawCanonicalForm,
    reason: normalized !== rawCanonicalForm ? 'PREFIX_DIGIT_SPLIT_ZEROS_STRIPPED' : 'ALREADY_NORMAL_FORM',
  };
}

/**
 * Chiave di raggruppamento canonico per il Pass 0, DELIBERATAMENTE diversa da
 * `groupByCanonical()` di `src/lib/search.js`: quella raggruppa per
 * `canonical_card_id` da solo, includendo tutte le lingue (corretto per il suo
 * scopo — mostrare "tutte le lingue di questa carta" in ricerca/pagina carta).
 * Qui lo scopo è diverso: rilevare quando la STESSA lingua della STESSA entità
 * canonica è presente più di una volta (il pattern reale verificato:
 * `swshp-SWSH001:en` da tcgdex + `swshp-SWSH001` da ptcg, entrambe EN). Senza
 * includere `lang` in questa chiave, ogni gruppo canonico multilingua legittimo
 * (7 righe = 7 lingue della stessa carta, comportamento corretto per design)
 * verrebbe segnalato come falso EXACT_DUPLICATE. Include `lang` nella chiave.
 */
export function canonicalKey(row) {
  if (!row.canonical_card_id || !row.lang) return null;
  return `${row.canonical_card_id}|${row.lang}`;
}

/** Chiave natural key normalizzata, usata da Pass -1 e Pass 3. */
export function naturalKey(row) {
  if (!row.tcg || !row.set_id || row.card_number_normalized == null || !row.lang) return null;
  return `${row.tcg}|${row.set_id}|${row.card_number_normalized}|${row.lang}`;
}

/**
 * Raggruppa per canonical_card_id (non nullo).
 * @param {object[]} rows
 * @returns {Map<string, object[]>}
 */
export function groupByCanonical(rows) {
  return groupBy(rows, canonicalKey);
}

/**
 * Raggruppa per natural key normalizzata.
 * @param {object[]} rows
 * @returns {Map<string, object[]>}
 */
export function groupByNaturalKey(rows) {
  return groupBy(rows, naturalKey);
}

function normName(s) {
  return (s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
}

/**
 * Segnale debole ma necessario di "probabilmente la stessa entità fisica",
 * usato come guardia anti-falso-positivo dai pass che si affidano solo alla
 * natural key (Pass -1, Pass 3). La natural key da sola può collidere per
 * bug di normalizzazione a monte (es. il caso reale `set_id='tk'`, dove
 * mini-mazzi Trainer Kit diversi vengono appiattiti sullo stesso `set_id`,
 * facendo collidere `(set_id, card_number)` tra carte fisicamente diverse —
 * vedi `MASTER_DATA_MODEL_AUDIT.md`). Se i nomi sono entrambi presenti e
 * chiaramente diversi, il gruppo NON è trattato come la stessa entità — va
 * invece in `collisions` (vedi findCanonicalSplits), non in `splits`. Se un
 * nome manca su un lato, non neghiamo il segnale (dati insufficienti per
 * escludere, non per confermare).
 *
 * @param {object[]} rows
 * @returns {boolean}
 */
function sameEntityNameSignal(rows) {
  const names = rows.map(r => normName(r.name) || normName(r.name_en)).filter(Boolean);
  if (names.length < 2) return true;
  return new Set(names).size === 1;
}

/**
 * PASS -1 — Canonical Integrity Check.
 * Prerequisito di tutti i pass successivi che usano canonical_card_id.
 * Raggruppa per natural key normalizzata; per ogni gruppo con più righe,
 * verifica se canonical_card_id è incoerente (diverso tra righe, o assente su
 * alcune righe del gruppo mentre presente su altre). Non tenta di dire quale
 * canonical_card_id sia corretto — segnala solo che il gruppo è sospetto.
 *
 * Distingue due esiti, NON intercambiabili:
 *   - `splits`: la natural key coincide E i nomi sono compatibili (uguali, o
 *     uno mancante) → probabile la stessa carta fisica con canonical_card_id
 *     frammentato (il caso reale svp-044/svp-44).
 *   - `collisions`: la natural key coincide MA i nomi sono chiaramente diversi
 *     → non è la stessa carta, è una collisione di chiave (es. bug `tk`) —
 *     classificata da classify-findings.js come SOURCE_CONFLICT, mai come
 *     CANONICAL_IDENTITY_SPLIT.
 *
 * @param {object[]} rows - righe già normalizzate (normalize-tcgdex/ptcg)
 * @returns {{splits: Array<object>, collisions: Array<object>}}
 */
export function findCanonicalSplits(rows) {
  const groups = groupByNaturalKey(rows);
  const splits = [];
  const collisions = [];
  for (const [key, groupRows] of groups) {
    if (groupRows.length < 2) continue;
    const nonNullIds = groupRows.map(r => r.canonical_card_id).filter(v => v != null);
    const distinct = [...new Set(nonNullIds)];
    const hasNullCanonical = groupRows.some(r => r.canonical_card_id == null);
    const isMismatched = distinct.length > 1 || (distinct.length >= 1 && hasNullCanonical);
    if (!isMismatched) continue;

    const entry = {
      naturalKey: key,
      rows: groupRows,
      distinctCanonicalIds: distinct,
      hasNullCanonical,
    };
    if (sameEntityNameSignal(groupRows)) {
      splits.push({ pass: 'PASS_-1_CANONICAL_INTEGRITY', ...entry });
    } else {
      collisions.push({ pass: 'PASS_-1_NATURAL_KEY_COLLISION', ...entry });
    }
  }
  return { splits, collisions };
}

/**
 * PASS 0 — Same Canonical.
 * Raggruppa per canonical_card_id non nullo. Gruppi con più righe sono
 * candidati EXACT_DUPLICATE (la classificazione fine, incluso subtype, è
 * responsabilità di classify-findings.js).
 *
 * @param {object[]} rows
 * @returns {Array<{pass: string, canonicalCardId: string, rows: object[]}>}
 */
export function findExactDuplicateClustersByCanonical(rows) {
  const groups = groupByCanonical(rows);
  const clusters = [];
  for (const [key, groupRows] of groups) {
    if (groupRows.length > 1) {
      clusters.push({
        pass: 'PASS_0_SAME_CANONICAL',
        canonicalCardId: groupRows[0].canonical_card_id,
        lang: groupRows[0].lang,
        matchKey: key,
        rows: groupRows,
      });
    }
  }
  return clusters;
}

/**
 * PASS 1 — Same source + source_id + lang.
 * Massima confidenza: è ripetizione letterale dalla stessa fonte.
 *
 * @param {object[]} rows
 * @returns {Array<{pass: string, matchKey: string, rows: object[]}>}
 */
export function findSameSourceRepeats(rows) {
  const groups = groupBy(rows, r => (r.source && r.source_id && r.lang) ? `${r.source}|${r.source_id}|${r.lang}` : null);
  const clusters = [];
  for (const [matchKey, groupRows] of groups) {
    if (groupRows.length > 1) {
      clusters.push({ pass: 'PASS_1_SAME_SOURCE_REPEAT', matchKey, rows: groupRows });
    }
  }
  return clusters;
}

/**
 * PASS 2 — Cross-source source_id match.
 * Normalizza source_id (regola dichiarata in normalizeSourceId) e cerca
 * coincidenze tra fonti diverse per lo stesso tcg/lang. Non usa source_id come
 * verità assoluta — produce solo un candidato, mai un match "certo per
 * definizione" (coerente col vincolo del design: source_id non è mai identità
 * globale da solo).
 *
 * @param {object[]} rows
 * @returns {Array<{pass: string, matchKey: string, rows: object[], sourceIdNormalization: object[]}>}
 */
export function findCrossSourceSourceIdMatches(rows) {
  const enriched = rows.map(r => ({ row: r, norm: normalizeSourceId(r.source_id) }));
  const groups = new Map();
  for (const { row, norm } of enriched) {
    if (!row.tcg || !row.lang || norm.normalized == null) continue;
    const key = `${row.tcg}|${norm.normalized}|${row.lang}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ row, norm });
  }
  const clusters = [];
  for (const [matchKey, entries] of groups) {
    const distinctSources = new Set(entries.map(e => e.row.source));
    if (entries.length > 1 && distinctSources.size > 1) {
      clusters.push({
        pass: 'PASS_2_CROSS_SOURCE_SOURCE_ID',
        matchKey,
        rows: entries.map(e => e.row),
        sourceIdNormalization: entries.map(e => ({ source: e.row.source, source_id: e.row.source_id, ...e.norm })),
      });
    }
  }
  return clusters;
}

/**
 * PASS 3 — Natural key cross-source match.
 * Riusa la stessa natural key normalizzata di Pass -1, ma qui l'obiettivo è
 * diverso: confermare un candidato di identità cross-source (non necessariamente
 * già coperto da Pass 0/1/2), incluso il caso in cui canonical_card_id sia
 * assente o discordante (il caso reale svp-044/svp-44 vive qui, oltre che in
 * Pass -1 — le due evidenze indipendenti si rafforzano a vicenda in
 * classify-findings.js).
 *
 * @param {object[]} rows
 * @returns {Array<{pass: string, naturalKey: string, rows: object[]}>}
 */
export function findNaturalKeyCrossSourceMatches(rows) {
  const groups = groupByNaturalKey(rows);
  const clusters = [];
  for (const [key, groupRows] of groups) {
    const distinctSources = new Set(groupRows.map(r => r.source));
    if (groupRows.length > 1 && distinctSources.size > 1 && sameEntityNameSignal(groupRows)) {
      clusters.push({ pass: 'PASS_3_NATURAL_KEY_CROSS_SOURCE', naturalKey: key, rows: groupRows });
    }
  }
  return clusters;
}

/**
 * PASS 4 — Candidate matching (fuzzy/euristico). L'UNICO pass fuzzy della
 * cascata. Opera solo sulle righe non già raggruppate da nessun pass a chiave
 * esatta (-1, 0, 1, 2, 3), passate come `alreadyMatchedIds`.
 *
 * Non produce mai un verdetto definitivo: ogni cluster qui è etichettato con un
 * `subtypeHint` (best-effort, non autorevole) che classify-findings.js userà
 * per proporre REPRINT / VARIANT_CANDIDATE / POSSIBLE_MIGRATED_ID / UNKNOWN —
 * mai per assegnare confidence VERIFIED o HIGH.
 *
 * @param {object[]} rows - tutte le righe dello scope
 * @param {Set<string>} alreadyMatchedIds - id delle righe già coperte da pass -1..3
 * @returns {Array<{pass: string, matchKey: string, rows: object[], subtypeHint: string}>}
 */
export function findFuzzyCandidates(rows, alreadyMatchedIds) {
  const candidates = rows.filter(r => r.id != null && !alreadyMatchedIds.has(r.id));
  const groups = groupBy(candidates, r => {
    const n = normName(r.name) || normName(r.name_en);
    if (!n || !r.tcg || !r.lang) return null;
    return `${r.tcg}|${n}|${r.lang}`;
  });
  const clusters = [];
  for (const [matchKey, groupRows] of groups) {
    if (groupRows.length < 2) continue;
    const distinctSetIds = new Set(groupRows.map(r => r.set_id));
    const distinctNumbers = new Set(groupRows.map(r => r.card_number_normalized));

    // Guardia anti-falso-positivo (design doc, Pass 3/4: "il fuzzy matching non
    // deve creare match VERIFIED" e "rischio di falso positivo" su collisioni
    // di nome). Nome uguale da solo è un segnale debolissimo in un TCG: la
    // stessa specie/personaggio compare su centinaia di carte fisicamente
    // diverse (es. "Pikachu"). Clusterizziamo SOLO quando varia esattamente UN
    // asse strutturale (o solo il set, o solo il numero) — coerente con un
    // vero reprint (stesso numero logico, set/epoca diversa) o una vera
    // migrazione di id (stesso set "famiglia", numero diverso). Se entrambi
    // gli assi variano insieme, o nessuno dei due varia, il nome da solo non
    // basta: non produciamo alcun candidato (case reale: "due Pikachu diversi
    // con stesso nome", test plan #17 — devono restare non collegati).
    const exactlyOneAxisVaries = (distinctSetIds.size === 1) !== (distinctNumbers.size === 1);

    let subtypeHint = null;
    if (exactlyOneAxisVaries && distinctSetIds.size > 1) {
      subtypeHint = 'POSSIBLE_MIGRATED_ID_CANDIDATE';
    } else if (exactlyOneAxisVaries && distinctNumbers.size > 1) {
      subtypeHint = 'VARIANT_CANDIDATE_HINT';
    } else if (distinctSetIds.size > 1 && distinctNumbers.size > 1) {
      // Entrambi gli assi variano: il nome da solo è un segnale troppo debole
      // (falso positivo classico: due carte diverse che condividono il nome
      // di specie, es. due "Pikachu" senza nessun'altra relazione). Richiede
      // un secondo segnale corroborante — qui: stessa rarity dichiarata,
      // non nulla — per proporre REPRINT_CANDIDATE. Senza corroborazione,
      // nessun cluster viene prodotto (meglio un falso negativo silenzioso
      // che un candidato rumoroso su un pattern comune in ogni TCG).
      const rarities = new Set(groupRows.map(r => r.rarity).filter(Boolean));
      if (rarities.size === 1) subtypeHint = 'REPRINT_CANDIDATE';
    }
    if (!subtypeHint) continue;

    clusters.push({ pass: 'PASS_4_FUZZY_CANDIDATE', matchKey, rows: groupRows, subtypeHint });
  }
  return clusters;
}

/**
 * PASS 5 — righe non coperte da nessun pass precedente.
 * Non decide se è MISSING o EXTRA (richiede sapere quale lato è il riferimento
 * — decisione del chiamante/classify-findings.js, non di questo pass).
 *
 * @param {object[]} rows
 * @param {Set<string>} matchedIds
 * @returns {object[]}
 */
export function findUnmatchedRows(rows, matchedIds) {
  return rows.filter(r => r.id != null && !matchedIds.has(r.id));
}

/**
 * Esegue l'intera cascata Pass -1..5 su un insieme di righe già normalizzate
 * (stesso scope logico: tipicamente un `(tcg, set_id, lang)` o un intero `tcg`
 * se il chiamante vuole un giro più ampio). Ritorna gli output grezzi di ogni
 * pass, senza classificazione — quella è responsabilità di classify-findings.js.
 *
 * @param {object[]} rows
 * @returns {{
 *   splits: object[],
 *   collisions: object[],
 *   exactDuplicateClusters: ReturnType<typeof findExactDuplicateClustersByCanonical>,
 *   sameSourceRepeats: ReturnType<typeof findSameSourceRepeats>,
 *   sourceIdCrossMatches: ReturnType<typeof findCrossSourceSourceIdMatches>,
 *   naturalKeyCrossMatches: ReturnType<typeof findNaturalKeyCrossSourceMatches>,
 *   fuzzyCandidates: ReturnType<typeof findFuzzyCandidates>,
 *   unmatchedRows: object[],
 *   matchedRowIds: Set<string>,
 * }}
 */
export function runIdentityCascade(rows) {
  const safeRows = (rows || []).filter(r => r && r.id != null);

  const { splits, collisions } = findCanonicalSplits(safeRows);
  const exactDuplicateClusters = findExactDuplicateClustersByCanonical(safeRows);
  const sameSourceRepeats = findSameSourceRepeats(safeRows);
  const sourceIdCrossMatches = findCrossSourceSourceIdMatches(safeRows);
  const naturalKeyCrossMatches = findNaturalKeyCrossSourceMatches(safeRows);

  const matchedRowIds = new Set();
  for (const cluster of [...splits, ...collisions, ...exactDuplicateClusters, ...sameSourceRepeats, ...sourceIdCrossMatches, ...naturalKeyCrossMatches]) {
    for (const r of cluster.rows) matchedRowIds.add(r.id);
  }

  const fuzzyCandidates = findFuzzyCandidates(safeRows, matchedRowIds);
  for (const cluster of fuzzyCandidates) {
    for (const r of cluster.rows) matchedRowIds.add(r.id);
  }

  const unmatchedRows = findUnmatchedRows(safeRows, matchedRowIds);

  return {
    splits,
    collisions,
    exactDuplicateClusters,
    sameSourceRepeats,
    sourceIdCrossMatches,
    naturalKeyCrossMatches,
    fuzzyCandidates,
    unmatchedRows,
    matchedRowIds,
  };
}
