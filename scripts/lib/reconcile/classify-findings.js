// DraGold — Catalog Reconciliation Pipeline
// Classification layer: trasforma l'output grezzo di identity-cascade.js in
// findings strutturati (finding + category + subtype + confidence + evidence +
// recommended_action + dependencies-ready row_ids).
//
// Puramente diagnostico. Nessuna funzione qui sceglie una fonte vincente, fa
// merge di canonical_cards, o propone DELETE. Ogni funzione è pura: riceve
// cluster/righe, ritorna oggetti finding — mai un effetto collaterale.
//
// Tassonomia (dal design doc, sezione 12): le 12 categorie fisse più il finding
// CANONICAL_IDENTITY_SPLIT, che usa category=SCHEMA_GAP (non una tredicesima
// categoria libera, come esplicitamente richiesto).

import { naturalKey as naturalKeyOf } from './identity-cascade.js';

export const FINDING = Object.freeze({
  MATCH: 'MATCH',
  MISSING: 'MISSING',
  EXTRA: 'EXTRA',
  MISMATCH: 'MISMATCH',
  LANGUAGE_MISSING: 'LANGUAGE_MISSING',
  SOURCE_CONFLICT: 'SOURCE_CONFLICT',
  REGIONAL_VERSION: 'REGIONAL_VERSION',
  REPRINT: 'REPRINT',
  VARIANT_CANDIDATE: 'VARIANT_CANDIDATE',
  POSSIBLE_MIGRATED_ID: 'POSSIBLE_MIGRATED_ID',
  SCHEMA_GAP: 'SCHEMA_GAP',
  EXACT_DUPLICATE: 'EXACT_DUPLICATE',
  CANONICAL_IDENTITY_SPLIT: 'CANONICAL_IDENTITY_SPLIT',
  UNKNOWN: 'UNKNOWN',
});

// category è sempre uno dei 12 valori fissi del design (CANONICAL_IDENTITY_SPLIT
// mappa su SCHEMA_GAP, mai una categoria propria).
export const CATEGORY = Object.freeze({
  MATCH: 'MATCH',
  MISSING: 'MISSING',
  EXTRA: 'EXTRA',
  MISMATCH: 'MISMATCH',
  LANGUAGE_MISSING: 'LANGUAGE_MISSING',
  SOURCE_CONFLICT: 'SOURCE_CONFLICT',
  REGIONAL_VERSION: 'REGIONAL_VERSION',
  REPRINT: 'REPRINT',
  VARIANT_CANDIDATE: 'VARIANT_CANDIDATE',
  POSSIBLE_MIGRATED_ID: 'POSSIBLE_MIGRATED_ID',
  SCHEMA_GAP: 'SCHEMA_GAP',
  EXACT_DUPLICATE: 'EXACT_DUPLICATE',
});

export const CONFIDENCE = Object.freeze({
  VERIFIED: 'VERIFIED',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  UNVERIFIED: 'UNVERIFIED',
});

export const RECOMMENDED_ACTION = Object.freeze({
  NONE: 'NONE',
  KEEP_BOTH_MARK_PRIMARY: 'KEEP_BOTH_MARK_PRIMARY',
  REQUIRES_FIELD_LEVEL_PRIORITY_DECISION: 'REQUIRES_FIELD_LEVEL_PRIORITY_DECISION',
  REQUIRES_CANONICAL_MERGE_DECISION: 'REQUIRES_CANONICAL_MERGE_DECISION',
  REQUIRES_SET_ID_FIX: 'REQUIRES_SET_ID_FIX',
  REQUIRES_MANUAL_SPLIT: 'REQUIRES_MANUAL_SPLIT',
  REVIEW: 'REVIEW',
  INGEST_CANDIDATE: 'INGEST_CANDIDATE',
  SCHEMA_GAP: 'SCHEMA_GAP',
});

const CONFLICT_FIELDS = ['image_url', 'image_url_hi', 'rarity', 'print_variant'];

function rowRef(row) {
  return {
    id: row.id,
    source: row.source,
    source_id: row.source_id,
    canonical_card_id: row.canonical_card_id,
    name: row.name,
  };
}

function rowIdSetSignature(ids) {
  return [...ids].sort().join(',');
}

/**
 * Rileva divergenze campo-per-campo tra righe di uno stesso cluster (stessa
 * entità/lingua secondo il caller). Non decide quale valore sia corretto —
 * riporta solo i valori distinti per fonte. Ignora null/stringa vuota (assenza
 * di dato non è conflitto).
 *
 * @param {object[]} rows
 * @param {string[]} [fields]
 * @returns {Array<{field: string, values_by_source: Record<string,string>}>}
 */
export function detectFieldConflicts(rows, fields = CONFLICT_FIELDS) {
  const conflicts = [];
  for (const field of fields) {
    const valuesBySource = {};
    for (const row of rows) {
      const v = row[field];
      if (v != null && v !== '') valuesBySource[row.source] = v;
    }
    const distinct = new Set(Object.values(valuesBySource));
    if (distinct.size > 1) conflicts.push({ field, values_by_source: valuesBySource });
  }
  return conflicts;
}

/**
 * Rileva asimmetria di completezza campo-per-campo: un campo valorizzato su
 * UNA sola fonte del cluster, nullo/assente sulle altre. NON è un conflitto
 * (non ci sono due valori in disaccordo, solo dato mancante da un lato) —
 * riportato come nota informativa dentro l'evidence di EXACT_DUPLICATE, non
 * come finding SOURCE_CONFLICT a sé. Risponde alla domanda del design doc
 * (sezione H): "una source secondaria può avere dati migliori in alcuni
 * campi" — qui ci si limita a renderlo visibile, senza decidere una field-level
 * priority (esplicitamente fuori scope in questa fase).
 *
 * @param {object[]} rows
 * @param {string[]} [fields]
 * @returns {Array<{field: string, source_with_value: string, missing_on_sources: string[]}>}
 */
export function detectFieldCompletenessAsymmetry(rows, fields = CONFLICT_FIELDS) {
  const notes = [];
  for (const field of fields) {
    const withValue = rows.filter(r => r[field] != null && r[field] !== '');
    const withoutValue = rows.filter(r => r[field] == null || r[field] === '');
    if (withValue.length > 0 && withoutValue.length > 0 && withValue.length < rows.length) {
      notes.push({
        field,
        source_with_value: [...new Set(withValue.map(r => r.source))].join(','),
        missing_on_sources: [...new Set(withoutValue.map(r => r.source))],
      });
    }
  }
  return notes;
}

/**
 * Pass -1 → finding CANONICAL_IDENTITY_SPLIT (category SCHEMA_GAP).
 * confidence=VERIFIED si riferisce SOLO al rilevamento della frammentazione,
 * mai alla scelta di quale canonical_card_id sia quello corretto.
 *
 * @param {ReturnType<import('./identity-cascade.js').findCanonicalSplits>} splits
 * @returns {object[]}
 */
export function classifyCanonicalSplits(splits) {
  return splits.map(split => {
    const rows = split.rows;
    let subtype;
    if (split.hasNullCanonical && split.distinctCanonicalIds.length <= 1) {
      subtype = 'CANONICAL_ID_MISSING_ON_ONE_SIDE';
    } else if (rows.some(r => r.card_number_was_normalized)) {
      subtype = 'CARD_NUMBER_FORMAT_MISMATCH';
    } else {
      subtype = 'CANONICAL_MISMATCH_UNEXPLAINED';
    }
    return {
      finding: FINDING.CANONICAL_IDENTITY_SPLIT,
      category: CATEGORY.SCHEMA_GAP,
      subtype,
      confidence: CONFIDENCE.VERIFIED,
      confidence_note: 'VERIFIED si riferisce al rilevamento della frammentazione (evidenza diretta dai dati), NON alla scelta di quale canonical_card_id sia corretto: quella decisione resta fuori dal perimetro della reconciliation.',
      recommended_action: RECOMMENDED_ACTION.REQUIRES_CANONICAL_MERGE_DECISION,
      evidence: {
        natural_key_normalized: split.naturalKey,
        distinct_canonical_ids: split.distinctCanonicalIds,
        has_null_canonical: split.hasNullCanonical,
        rows: rows.map(r => ({
          source: r.source,
          source_id: r.source_id,
          card_number_raw: r.card_number_raw,
          card_number_normalized: r.card_number_normalized,
          card_number_was_normalized: r.card_number_was_normalized,
          canonical_card_id: r.canonical_card_id,
          id: r.id,
          name: r.name,
        })),
      },
      row_ids: rows.map(r => r.id),
    };
  });
}

/**
 * Pass -1 (variante collisione) → finding SOURCE_CONFLICT, subtype
 * NATURAL_KEY_COLLISION_LIKELY_DIFFERENT_CARDS. La natural key coincide ma i
 * nomi sono chiaramente diversi (guardia anti-falso-positivo di
 * identity-cascade.js) — non è la stessa carta, è una collisione di chiave
 * (es. il bug reale `set_id='tk'`: mini-mazzi diversi appiattiti sullo stesso
 * `set_id`). MAI classificato come CANONICAL_IDENTITY_SPLIT o EXACT_DUPLICATE.
 *
 * @param {ReturnType<import('./identity-cascade.js').findCanonicalSplits>['collisions']} collisions
 * @returns {object[]}
 */
export function classifyCollisions(collisions) {
  return collisions.map(collision => ({
    finding: FINDING.SOURCE_CONFLICT,
    category: CATEGORY.SOURCE_CONFLICT,
    subtype: 'NATURAL_KEY_COLLISION_LIKELY_DIFFERENT_CARDS',
    confidence: CONFIDENCE.MEDIUM,
    confidence_note: 'La natural key coincide, ma i nomi divergono chiaramente: probabile collisione di chiave tra carte fisicamente diverse, non la stessa entità. Non abbastanza per VERIFIED in nessuna direzione.',
    recommended_action: RECOMMENDED_ACTION.REQUIRES_MANUAL_SPLIT,
    evidence: {
      natural_key_normalized: collision.naturalKey,
      distinct_canonical_ids: collision.distinctCanonicalIds,
      has_null_canonical: collision.hasNullCanonical,
      rows: collision.rows.map(r => ({
        source: r.source,
        source_id: r.source_id,
        set_id: r.set_id,
        card_number_raw: r.card_number_raw,
        canonical_card_id: r.canonical_card_id,
        id: r.id,
        name: r.name,
      })),
    },
    row_ids: collision.rows.map(r => r.id),
  }));
}

/**
 * Pass 0 → finding EXACT_DUPLICATE (+ eventuale SOURCE_CONFLICT ortogonale,
 * mai fuso nello stesso oggetto finding — sezione 13 del design doc).
 *
 * @param {ReturnType<import('./identity-cascade.js').findExactDuplicateClustersByCanonical>} clusters
 * @returns {{duplicateFindings: object[], conflictFindings: object[]}}
 */
export function classifyExactDuplicateClusters(clusters) {
  const duplicateFindings = [];
  const conflictFindings = [];
  for (const cluster of clusters) {
    const rows = cluster.rows;
    const distinctSources = new Set(rows.map(r => r.source));
    const subtype = distinctSources.size > 1 ? 'CROSS_SOURCE_SAME_CANONICAL' : 'SAME_SOURCE_MULTIPLE_ROWS';
    const completenessAsymmetry = detectFieldCompletenessAsymmetry(rows);
    duplicateFindings.push({
      finding: FINDING.EXACT_DUPLICATE,
      category: CATEGORY.EXACT_DUPLICATE,
      subtype,
      confidence: CONFIDENCE.VERIFIED,
      recommended_action: RECOMMENDED_ACTION.KEEP_BOTH_MARK_PRIMARY,
      evidence: {
        canonical_card_id: cluster.canonicalCardId,
        lang: cluster.lang,
        rows: rows.map(rowRef),
        ...(completenessAsymmetry.length ? { field_completeness_asymmetry: completenessAsymmetry } : {}),
      },
      row_ids: rows.map(r => r.id),
    });

    const conflicts = detectFieldConflicts(rows);
    if (conflicts.length) {
      conflictFindings.push({
        finding: FINDING.SOURCE_CONFLICT,
        category: CATEGORY.SOURCE_CONFLICT,
        subtype: 'FIELD_DIVERGENCE',
        confidence: CONFIDENCE.VERIFIED,
        recommended_action: RECOMMENDED_ACTION.REQUIRES_FIELD_LEVEL_PRIORITY_DECISION,
        evidence: { canonical_card_id: cluster.canonicalCardId, lang: cluster.lang, field_conflicts: conflicts },
        row_ids: rows.map(r => r.id),
        related_finding: FINDING.EXACT_DUPLICATE,
      });
    }
  }
  return { duplicateFindings, conflictFindings };
}

/**
 * Pass 1 → finding EXACT_DUPLICATE, subtype SAME_SOURCE_REPEAT.
 * recommended_action=REVIEW (non KEEP_BOTH_MARK_PRIMARY): non ha senso
 * scegliere una riga "primaria" tra due righe della stessa identica fonte —
 * è un'anomalia da capire, non un conflitto multi-fonte da arbitrare.
 *
 * @param {ReturnType<import('./identity-cascade.js').findSameSourceRepeats>} clusters
 * @returns {object[]}
 */
export function classifySameSourceRepeats(clusters) {
  return clusters.map(cluster => ({
    finding: FINDING.EXACT_DUPLICATE,
    category: CATEGORY.EXACT_DUPLICATE,
    subtype: 'SAME_SOURCE_REPEAT',
    confidence: CONFIDENCE.VERIFIED,
    recommended_action: RECOMMENDED_ACTION.REVIEW,
    evidence: {
      match_key: cluster.matchKey,
      note: 'Ripetizione letterale dalla stessa fonte (stesso source+source_id+lang, id di riga diversi) — anomalo, verificare la causa prima di qualunque azione.',
      rows: cluster.rows.map(rowRef),
    },
    row_ids: cluster.rows.map(r => r.id),
  }));
}

/**
 * Pass 2 → EXACT_DUPLICATE candidate oppure SOURCE_CONFLICT, mai VERIFIED puro
 * (source_id cross-source non è mai identità globale da solo — vedi design
 * doc, identity model). Deduplica contro cluster già emessi da Pass -1/0
 * (stesso set di row_ids) per non riportare due volte lo stesso finding.
 *
 * @param {ReturnType<import('./identity-cascade.js').findCrossSourceSourceIdMatches>} clusters
 * @param {Set<string>} splitNaturalKeys - naturalKey già segnalate come split da Pass -1
 * @param {Set<string>} rowIdSetSignatures - firme di row_ids già emesse (mutato in place)
 * @returns {object[]}
 */
export function classifySourceIdCrossMatches(clusters, splitNaturalKeys, rowIdSetSignatures) {
  const results = [];
  for (const cluster of clusters) {
    const rows = cluster.rows;
    const signature = rowIdSetSignature(rows.map(r => r.id));
    if (rowIdSetSignatures.has(signature)) continue;

    const anyRowInSplit = rows.some(r => splitNaturalKeys.has(naturalKeyOf(r)));
    const nonNullIds = rows.map(r => r.canonical_card_id).filter(v => v != null);
    const distinct = [...new Set(nonNullIds)];
    const hasNull = rows.some(r => r.canonical_card_id == null);

    if (anyRowInSplit || distinct.length > 1) {
      results.push({
        finding: FINDING.SOURCE_CONFLICT,
        category: CATEGORY.SOURCE_CONFLICT,
        subtype: 'SOURCE_ID_MATCH_CANONICAL_MISMATCH',
        confidence: CONFIDENCE.MEDIUM,
        recommended_action: RECOMMENDED_ACTION.REVIEW,
        evidence: {
          match_key: cluster.matchKey,
          source_id_normalization: cluster.sourceIdNormalization,
          distinct_canonical_ids: distinct,
          has_null_canonical: hasNull,
        },
        row_ids: rows.map(r => r.id),
      });
      rowIdSetSignatures.add(signature);
      continue;
    }

    results.push({
      finding: FINDING.EXACT_DUPLICATE,
      category: CATEGORY.EXACT_DUPLICATE,
      subtype: 'CROSS_SOURCE_SOURCE_ID_MATCH',
      confidence: distinct.length === 1 ? CONFIDENCE.HIGH : CONFIDENCE.MEDIUM,
      recommended_action: RECOMMENDED_ACTION.KEEP_BOTH_MARK_PRIMARY,
      evidence: {
        match_key: cluster.matchKey,
        source_id_normalization: cluster.sourceIdNormalization,
        canonical_card_id: distinct[0] ?? null,
      },
      row_ids: rows.map(r => r.id),
    });
    rowIdSetSignatures.add(signature);
  }
  return results;
}

/**
 * Pass 3 → conferma un candidato EXACT_DUPLICATE via natural key quando
 * canonical_card_id è assente su entrambi i lati (caso non coperto né da
 * Pass -1, che richiede almeno un canonical non nullo, né da Pass 0, che
 * richiede canonical non nullo su tutte le righe). Se il gruppo è già stato
 * segnalato come split da Pass -1, questo pass non emette nulla di nuovo — le
 * due evidenze indipendenti si rafforzano a vicenda solo nel finding di split
 * stesso (Pass -1), non come due finding separati. Confidence sempre MEDIA,
 * mai VERIFIED: la natural key da sola non è mai stata la fonte di verità
 * primaria in questo modello (quel ruolo resta a canonical_card_id quando
 * coerente).
 *
 * @param {ReturnType<import('./identity-cascade.js').findNaturalKeyCrossSourceMatches>} clusters
 * @param {Set<string>} splitNaturalKeys
 * @param {Set<string>} rowIdSetSignatures
 * @returns {object[]}
 */
export function classifyNaturalKeyCrossMatches(clusters, splitNaturalKeys, rowIdSetSignatures) {
  const results = [];
  for (const cluster of clusters) {
    if (splitNaturalKeys.has(cluster.naturalKey)) continue;

    const rows = cluster.rows;
    const nonNullIds = rows.map(r => r.canonical_card_id).filter(v => v != null);
    const distinct = [...new Set(nonNullIds)];
    if (distinct.length > 1) continue; // difensivo: sarebbe già uno split, non dovrebbe arrivare qui

    const signature = rowIdSetSignature(rows.map(r => r.id));
    if (rowIdSetSignatures.has(signature)) continue;

    results.push({
      finding: FINDING.EXACT_DUPLICATE,
      category: CATEGORY.EXACT_DUPLICATE,
      subtype: 'NATURAL_KEY_CROSS_SOURCE_MATCH',
      confidence: CONFIDENCE.MEDIUM,
      recommended_action: RECOMMENDED_ACTION.KEEP_BOTH_MARK_PRIMARY,
      evidence: {
        natural_key_normalized: cluster.naturalKey,
        canonical_card_id: distinct[0] ?? null,
        rows: rows.map(rowRef),
      },
      row_ids: rows.map(r => r.id),
    });
    rowIdSetSignatures.add(signature);
  }
  return results;
}

const FUZZY_SUBTYPE_MAP = Object.freeze({
  REPRINT_CANDIDATE: { finding: FINDING.REPRINT, category: CATEGORY.REPRINT },
  POSSIBLE_MIGRATED_ID_CANDIDATE: { finding: FINDING.POSSIBLE_MIGRATED_ID, category: CATEGORY.POSSIBLE_MIGRATED_ID },
  VARIANT_CANDIDATE_HINT: { finding: FINDING.VARIANT_CANDIDATE, category: CATEGORY.VARIANT_CANDIDATE },
  UNKNOWN: { finding: FINDING.UNKNOWN, category: CATEGORY.MISMATCH },
});

/**
 * Pass 4 → SEMPRE confidence LOW, MAI VERIFIED/HIGH, per vincolo esplicito del
 * design ("il fuzzy matching non deve poter creare automaticamente un match
 * VERIFIED"). recommended_action sempre REVIEW, mai automatico.
 *
 * @param {ReturnType<import('./identity-cascade.js').findFuzzyCandidates>} clusters
 * @returns {object[]}
 */
export function classifyFuzzyCandidates(clusters) {
  return clusters.map(cluster => {
    const mapping = FUZZY_SUBTYPE_MAP[cluster.subtypeHint] || FUZZY_SUBTYPE_MAP.UNKNOWN;
    return {
      finding: mapping.finding,
      category: mapping.category,
      subtype: cluster.subtypeHint,
      confidence: CONFIDENCE.LOW,
      recommended_action: RECOMMENDED_ACTION.REVIEW,
      evidence: {
        match_key: cluster.matchKey,
        note: 'Candidato da matching fuzzy (nome normalizzato, unico pass euristico della cascata). Richiede revisione umana, nessuna azione automatica ammessa.',
        rows: cluster.rows.map(rowRef),
      },
      row_ids: cluster.rows.map(r => r.id),
    };
  });
}

/**
 * Pass 5 → righe non coperte da nessun pass precedente. Senza una
 * `referenceSource` dichiarata dal chiamante, NON assume la direzione
 * MISSING/EXTRA (coerente col vincolo: "non assumere che MISSING significhi
 * automaticamente 'la carta deve essere importata'").
 *
 * @param {object[]} rows - righe non abbinate (da runIdentityCascade().unmatchedRows)
 * @param {{referenceSource?: string}} [options]
 * @returns {object[]}
 */
export function classifyUnmatched(rows, options = {}) {
  const { referenceSource } = options;
  return rows.map(row => {
    if (referenceSource && row.source !== referenceSource) {
      return {
        finding: FINDING.MISSING,
        category: CATEGORY.MISSING,
        subtype: 'NOT_MATCHED_AGAINST_REFERENCE_SOURCE',
        confidence: CONFIDENCE.LOW,
        recommended_action: RECOMMENDED_ACTION.INGEST_CANDIDATE,
        evidence: {
          note: `Presente solo in source='${row.source}', nessuna corrispondenza trovata rispetto alla source di riferimento '${referenceSource}' in questo scope.`,
          row: rowRef(row),
        },
        row_ids: [row.id],
      };
    }
    if (referenceSource && row.source === referenceSource) {
      return {
        finding: FINDING.EXTRA,
        category: CATEGORY.EXTRA,
        subtype: 'PRESENT_ONLY_IN_REFERENCE_SOURCE',
        confidence: CONFIDENCE.LOW,
        recommended_action: RECOMMENDED_ACTION.REVIEW,
        evidence: {
          note: `Presente nella source di riferimento '${referenceSource}' ma senza corrispondenza in altre source in questo scope — non implica che manchi altrove, solo che questo pass non l'ha trovata.`,
          row: rowRef(row),
        },
        row_ids: [row.id],
      };
    }
    return {
      finding: FINDING.UNKNOWN,
      category: CATEGORY.MISMATCH,
      subtype: 'SINGLE_SOURCE_NO_REFERENCE_DECLARED',
      confidence: CONFIDENCE.UNVERIFIED,
      recommended_action: RECOMMENDED_ACTION.REVIEW,
      evidence: {
        note: 'Riga senza corrispondenza in nessun altro pass; nessuna source di riferimento dichiarata dal chiamante, quindi non è possibile distinguere MISSING da EXTRA in modo affidabile.',
        row: rowRef(row),
      },
      row_ids: [row.id],
    };
  });
}

/**
 * Segnale deterministico (NON fuzzy) di variante di stampa non rappresentabile:
 * la fonte espone un campo variante (es. `variants` TCGdex) che il modello
 * DraGold non scrive mai (`print_variant` sempre vuoto). Non è un pass della
 * cascata di identità — opera riga per riga, indipendentemente dal matching.
 *
 * @param {object[]} rows
 * @returns {object[]}
 */
export function classifyVariantSignals(rows) {
  const findings = [];
  for (const row of rows) {
    const raw = row._raw || {};
    const sourceVariants = raw.variants || raw?.metadata?.variants || null;
    const hasVariantSignal = sourceVariants
      && typeof sourceVariants === 'object'
      && Object.values(sourceVariants).some(Boolean);
    const printVariantEmpty = row.print_variant == null || row.print_variant === '';
    if (hasVariantSignal && printVariantEmpty) {
      findings.push({
        finding: FINDING.VARIANT_CANDIDATE,
        category: CATEGORY.VARIANT_CANDIDATE,
        subtype: 'SOURCE_VARIANT_FIELD_PRESENT',
        confidence: CONFIDENCE.VERIFIED,
        recommended_action: RECOMMENDED_ACTION.SCHEMA_GAP,
        evidence: { source_field: 'variants', source_data: sourceVariants, target_field_empty: 'print_variant' },
        row_ids: [row.id],
      });
    }
  }
  return findings;
}

/**
 * Orchestratore: prende l'output grezzo di runIdentityCascade() (identity-cascade.js)
 * e produce l'elenco finale di findings strutturati. Applica anche il pass
 * deterministico VARIANT_CANDIDATE su tutte le righe dello scope.
 *
 * @param {ReturnType<import('./identity-cascade.js').runIdentityCascade>} cascadeResult
 * @param {object[]} allRows - stesse righe passate a runIdentityCascade (per il variant scan)
 * @param {{referenceSource?: string}} [options]
 * @returns {object[]}
 */
export function classifyFindings(cascadeResult, allRows, options = {}) {
  const findings = [];
  const rowIdSetSignatures = new Set();
  // Include sia gli split (stessa entità, canonical frammentato) sia le
  // collisioni (natural key coincide, entità diverse) nell'insieme di chiavi
  // "già spiegate" da Pass -1, così Pass 2/3 non le ri-processano come se
  // fossero candidati indipendenti.
  const splitNaturalKeys = new Set([
    ...cascadeResult.splits.map(s => s.naturalKey),
    ...cascadeResult.collisions.map(c => c.naturalKey),
  ]);

  const splitFindings = classifyCanonicalSplits(cascadeResult.splits);
  findings.push(...splitFindings);
  for (const f of splitFindings) rowIdSetSignatures.add(rowIdSetSignature(f.row_ids));

  const collisionFindings = classifyCollisions(cascadeResult.collisions);
  findings.push(...collisionFindings);
  for (const f of collisionFindings) rowIdSetSignatures.add(rowIdSetSignature(f.row_ids));

  const { duplicateFindings, conflictFindings } = classifyExactDuplicateClusters(cascadeResult.exactDuplicateClusters);
  findings.push(...duplicateFindings, ...conflictFindings);
  for (const f of duplicateFindings) rowIdSetSignatures.add(rowIdSetSignature(f.row_ids));

  findings.push(...classifySameSourceRepeats(cascadeResult.sameSourceRepeats));
  findings.push(...classifySourceIdCrossMatches(cascadeResult.sourceIdCrossMatches, splitNaturalKeys, rowIdSetSignatures));
  findings.push(...classifyNaturalKeyCrossMatches(cascadeResult.naturalKeyCrossMatches, splitNaturalKeys, rowIdSetSignatures));
  findings.push(...classifyFuzzyCandidates(cascadeResult.fuzzyCandidates));
  findings.push(...classifyUnmatched(cascadeResult.unmatchedRows, options));
  findings.push(...classifyVariantSignals(allRows || []));

  return findings;
}
