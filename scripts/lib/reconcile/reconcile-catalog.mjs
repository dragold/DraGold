#!/usr/bin/env node
// scripts/lib/reconcile/reconcile-catalog.mjs
// STEP 4 — Orchestratore READ-ONLY, resumable, per-set. Unisce:
//   1. fonte esterna (STEP 4: sources/fetch-tcgdex.js, sources/fetch-optcg.js)
//   2. supabase-read.js (STEP 2)
//   3. normalizzazione esistente (normalize-tcgdex.js/normalize-ptcg.js/normalize-optcg.js)
//   4. identity-cascade.js + classify-findings.js (matching/classificazione già esistenti)
//   5. image-taxonomy.js (STEP 3, solo sulle immagini già in DB — il recovery
//      da fonte esterna resta STEP 5, non implementato qui)
//   6. output NDJSON incrementale (un record per set completato)
//   7. checkpoint per set
//
// Copre i 4 target: Pokémon EN/JA, One Piece EN/JA. Il primo run reale è
// limitato a UN set piccolo per volta (stesso principio già validato in
// smoke-reconcile.mjs) — questo file espone runSetReconciliation() come unità
// di lavoro, e runReconcileCatalog() come loop resumable su una lista di
// {tcg,lang,setId} esplicita (mai una scansione "tutto il catalogo" implicita:
// quella resta esplicitamente vietata in questo step).
//
// ============================================================================
// GARANZIE DI SOLA LETTURA
// ============================================================================
// - Verso Supabase: solo fetchDbCatalogSlice/fetchAllCardsForReconciliation da
//   ./supabase-read.js (stessa garanzia già testata lì: mai insert/update/
//   upsert/delete).
// - Verso le fonti esterne: solo fetchTcgdexSet/fetchOptcgSet, entrambe GET
//   pure (vedi i rispettivi moduli in ./sources/).
// - Verso le immagini: solo auditCardImages da ./image-taxonomy.js (GET/HEAD
//   verso l'host immagine, mai verso Supabase).
// - Nessun recovery/scrittura immagine, nessun insert/update/upsert/delete su
//   Supabase in nessun punto di questo file — verificato anche a livello di
//   test (scansione del sorgente, stesso pattern già in uso negli altri
//   moduli di questo step).
//
// ============================================================================
// Come vengono riusati identity-cascade.js/classify-findings.js — e perché il
// significato di "source" viene ritaggato per le righe candidate esterne
// ============================================================================
// identity-cascade.js/classify-findings.js sono nati per rilevare duplicati/
// split ALL'INTERNO di `cards` (es. la stessa carta scritta sia da tcgdex che
// da ptcg). Qui li riusiamo per uno scopo dichiaratamente diverso ma
// strutturalmente identico: rilevare quando una riga già in DB e una riga
// "candidata" appena letta dalla fonte esterna sono la STESSA entità fisica —
// esattamente il problema che i Pass 2 (cross-source source_id) e Pass 3
// (cross-source natural key) risolvono già, further "cross-source" being any
// two DISTINCT `source` values.
//
// Le righe DB normalizzate mantengono il loro `source` reale (tcgdex/ptcg/
// optcg, deciso dai normalizzatori esistenti, invariato). Le righe candidate
// dalla fonte esterna, DOPO la normalizzazione (che assegnerebbe loro lo
// STESSO `source` delle righe DB, es. 'tcgdex'), vengono ri-taggate qui con
// un suffisso esplicito (es. 'tcgdex:external') PRIMA della cascata — mai
// dentro i moduli normalize-*.js, che restano quello che erano. Due
// conseguenze dirette, entrambe intenzionali:
//   - Pass 2/3 (cross-source) trattano un match DB<->esterno esattamente come
//     tratterebbero un match tcgdex<->ptcg: producono un finding
//     EXACT_DUPLICATE (subtype NATURAL_KEY_CROSS_SOURCE_MATCH o
//     CROSS_SOURCE_SOURCE_ID_MATCH), che qui interpretiamo come "carta
//     presente in entrambi, nessuna azione necessaria" (vedi
//     `interpretFindingForReconciliation` più sotto per la rietichettatura a
//     scopo di report, che NON altera l'oggetto finding originale).
//   - Pass 1 (same-source-repeat, richiede `source` letteralmente identico)
//     non scatta MAI fra DB ed esterno, perché ora i due lati hanno `source`
//     diverso per costruzione — corretto: quel pass è per ripetizioni
//     letterali nella STESSA fonte, non per un match cross-source.
//
// Alle righe candidate esterne viene anche assegnato un `id` sintetico
// (`external:<tcg>:<lang>:<setId>:<source_id>`), MAI un id inventato che
// assomigli a un vero `cards.id` — necessario perché identity-cascade.js
// scarta ogni riga con `id == null` (righe non ancora in DB non avrebbero
// altrimenti un id da usare come chiave di raggruppamento/row_ids).
//
// ============================================================================
// MISSING vs EXTRA: perché non ci affidiamo al dispatch per-source di
// classify-findings.js#classifyUnmatched
// ============================================================================
// classifyUnmatched(rows, {referenceSource}) decide MISSING/EXTRA
// confrontando `row.source` con un SINGOLO valore `referenceSource` — corretto
// quando la fonte "di riferimento" del DB è unica, ma FALSO per pokemon/en,
// dove il DB reale contiene GIÀ due source distinte (tcgdex E ptcg,
// verificato via query read-only su Supabase, 2026-08-17: 23.781 righe tcgdex
// + 20.479 righe ptcg). Con un solo referenceSource, le righe DB dell'altra
// fonte verrebbero classificate MISSING per errore (sembrerebbero "presenti
// solo nella fonte esterna").
// Questo file NON usa quindi classifyUnmatched — usa invece un tag `_origin`
// ('db' | 'external') assegnato qui, deterministico e indipendente dal valore
// di `source`, per decidere MISSING (origin='external', mai visto in DB in
// questo scope) vs EXTRA (origin='db', mai visto nella fonte esterna in
// questo scope). Tutti gli altri pass (splits/collisions/exact-duplicate/
// same-source-repeat/cross-source/fuzzy/variant-signals) restano quelli
// esportati da classify-findings.js, invariati e non duplicati.

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

import { fetchDbCatalogSlice } from './supabase-read.js';
import { normalizeTcgdexRow } from './normalize-tcgdex.js';
import { normalizePtcgRow } from './normalize-ptcg.js';
import { normalizeOptcgRow } from './normalize-optcg.js';
import { auditCardImages, IMAGE_STATUS } from './image-taxonomy.js';
import { runIdentityCascade } from './identity-cascade.js';
import {
  classifyCanonicalSplits,
  classifyCollisions,
  classifyExactDuplicateClusters,
  classifySameSourceRepeats,
  classifySourceIdCrossMatches,
  classifyNaturalKeyCrossMatches,
  classifyFuzzyCandidates,
  classifyVariantSignals,
  FINDING,
  CATEGORY,
  CONFIDENCE,
  RECOMMENDED_ACTION,
} from './classify-findings.js';
import { fetchTcgdexSet } from './sources/fetch-tcgdex.js';
import { fetchOptcgSet } from './sources/fetch-optcg.js';

// ============================================================================
// Dispatch per tcg -> fetcher esterno. Un tcg senza entry qui non ha NESSUNA
// fonte implementata: errore esplicito immediato (vedi runSetReconciliation),
// mai un fallback silenzioso.
// ============================================================================
export const EXTERNAL_SOURCE_FETCHERS = Object.freeze({
  pokemon: fetchTcgdexSet,
  onepiece: fetchOptcgSet,
});

/** Errore esplicito: nessuna fonte esterna implementata per questo tcg. */
export class SourceNotImplementedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RECONCILE_SOURCE_NOT_IMPLEMENTED';
  }
}

/**
 * Sceglie il normalizzatore corretto in base a `row.source` — stesso
 * dispatcher già validato in smoke-reconcile.mjs#normalizeRow, esteso qui a
 * 'optcg' (necessario per coprire One Piece, fuori scope dello smoke test
 * originale). Una fonte non riconosciuta ferma l'esecuzione con un errore
 * esplicito, mai un fallback silenzioso.
 *
 * @param {object} row
 * @returns {object}
 */
export function normalizeDbRow(row) {
  if (row.source === 'tcgdex') return normalizeTcgdexRow(row);
  if (row.source === 'ptcg') return normalizePtcgRow(row);
  if (row.source === 'optcg') return normalizeOptcgRow(row);
  throw new Error(
    `reconcile-catalog: nessun normalizzatore per source="${row.source}" (card id=${row.id ?? '(esterna)'}) — mi fermo invece di indovinare quale usare.`
  );
}

/**
 * Ritagga righe candidate ESTERNE (già normalizzate) con un id sintetico e un
 * `source` distinto da quello delle righe DB — vedi il commento di testa al
 * file per il perché. Funzione pura, non muta l'input.
 *
 * @param {object[]} normalizedExternalRows - output di normalizeDbRow() sulle
 *   righe prodotte da un fetcher esterno (già hanno `source` = 'tcgdex'/'optcg')
 * @param {{tcg: string, lang: string, setId: string}} scope
 * @returns {object[]}
 */
export function tagExternalCandidates(normalizedExternalRows, { tcg, lang, setId }) {
  return normalizedExternalRows.map((row) => {
    if (!row.source_id) {
      throw new Error(
        `reconcile-catalog: riga candidata esterna senza source_id (tcg=${tcg} lang=${lang} set=${setId} name=${row.name ?? '?'}) — non posso costruire un id sintetico stabile, mi fermo invece di inventarne uno.`
      );
    }
    return {
      ...row,
      id: `external:${tcg}:${lang}:${setId}:${row.source_id}`,
      source: `${row.source}:external`,
      _origin: 'external',
    };
  });
}

/**
 * Tagga righe DB (già normalizzate) con `_origin: 'db'` — simmetrico a
 * tagExternalCandidates, stesso scopo: rendere la provenienza indipendente
 * dal valore di `source`, per la decisione MISSING/EXTRA a valle.
 *
 * @param {object[]} normalizedDbRows
 * @returns {object[]}
 */
export function tagDbRows(normalizedDbRows) {
  return normalizedDbRows.map((row) => ({ ...row, _origin: 'db' }));
}

/**
 * Rimpiazza il pass "unmatched" di classify-findings.js#classifyFindings con
 * una decisione MISSING/EXTRA basata su `_origin` (vedi motivazione nel
 * commento di testa al file) invece che sul confronto stringa di `source`.
 *
 * @param {object[]} unmatchedRows - da runIdentityCascade().unmatchedRows
 * @returns {object[]}
 */
export function classifyMissingExtraByOrigin(unmatchedRows) {
  return unmatchedRows.map((row) => {
    if (row._origin === 'external') {
      return {
        finding: FINDING.MISSING,
        category: CATEGORY.MISSING,
        subtype: 'PRESENT_IN_EXTERNAL_SOURCE_NOT_IN_DB',
        confidence: CONFIDENCE.MEDIUM,
        confidence_note: 'Nessuna riga DB corrispondente trovata in questo scope (set singolo) dai pass di matching esistenti. MEDIUM, non VERIFIED: un match cross-source mancato in questo scope non esclude un problema di normalizzazione più che un\'assenza reale.',
        recommended_action: RECOMMENDED_ACTION.INGEST_CANDIDATE,
        evidence: {
          note: 'Riga presente nella fonte esterna, nessuna corrispondenza trovata in DB per questo set.',
          row: { source: row.source, source_id: row.source_id, set_id: row.set_id, card_number: row.card_number_raw, name: row.name, image_url: row.image_url, image_url_hi: row.image_url_hi },
        },
        row_ids: [row.id],
      };
    }
    return {
      finding: FINDING.EXTRA,
      category: CATEGORY.EXTRA,
      subtype: 'PRESENT_IN_DB_NOT_IN_EXTERNAL_SOURCE',
      confidence: CONFIDENCE.LOW,
      confidence_note: 'LOW: non implica che la carta non esista davvero nella fonte esterna — solo che questo pass, in questo scope, non l\'ha trovata (possibile disallineamento di set_id/card_number fra le due rappresentazioni).',
      recommended_action: RECOMMENDED_ACTION.REVIEW,
      evidence: {
        note: 'Riga presente in DB, nessuna corrispondenza trovata nella fonte esterna per questo set.',
        row: { id: row.id, source: row.source, source_id: row.source_id, set_id: row.set_id, card_number: row.card_number_raw, name: row.name },
      },
      row_ids: [row.id],
    };
  });
}

/**
 * ============================================================================
 * Fix 2026-08-17: falso CANONICAL_IDENTITY_SPLIT/SOURCE_CONFLICT su ogni
 * match DB<->external candidate (diagnosticato su SVLN-001, vedi il turno che
 * ha introdotto questa funzione per il dettaglio completo del trace)
 * ============================================================================
 * identity-cascade.js#findCanonicalSplits (Pass -1) è corretto per lo scopo
 * per cui è nato: rilevare `canonical_card_id` incoerente fra righe GIÀ
 * PERSISTITE nel DB (es. il caso reale svp-044/svp-44). La sua regola:
 *   isMismatched = distinct.length > 1 || (distinct.length >= 1 && hasNullCanonical)
 * tratta "un canonical presente su un lato, assente sull'altro" come
 * un'anomalia potenziale — corretto quando ENTRAMBI i lati sono record DB
 * reali (un record persistito senza canonical_card_id È un'anomalia da
 * segnalare). Non è però una nozione applicabile a un candidato `_origin:
 * 'external'`: quella riga non esiste ancora in DB, quindi NON PUÒ avere un
 * canonical_card_id per costruzione — non è un dato mancante per errore, è un
 * campo non applicabile (N/A). identity-cascade.js non ha (e non deve avere)
 * il concetto di "riga non ancora persistita": è un modulo generico che opera
 * solo sulla forma delle righe, quindi applica la sua regola indistintamente,
 * producendo uno split per OGNI carta correttamente matchata fra DB ed
 * external (ogni record DB reale ha già un canonical_card_id assegnato).
 * Quello split, a sua volta, entra in `splitNaturalKeys` e fa deviare il
 * corretto match cross-source (Pass 2/3) su SOURCE_CONFLICT invece che
 * EXACT_DUPLICATE (classify-findings.js#classifySourceIdCrossMatches,
 * `anyRowInSplit` branch) — anche classify-findings.js si comporta qui
 * esattamente come progettato, sulla base di un input (gli split) che è
 * l'orchestratore a costruire in modo inapplicabile a questo confronto.
 *
 * La correzione è quindi, per costruzione, solo qui: PRIMA di passare gli
 * split a classifyCanonicalSplits/di costruire splitNaturalKeys, li separiamo
 * in:
 *   - "genuini": la componente `_origin: 'db'` del cluster è essa stessa
 *     incoerente (canonical diverso fra righe DB, o assente su alcune righe
 *     DB mentre presente su altre) — STESSA regola di identity-cascade.js,
 *     applicata qui SOLO al sottoinsieme delle righe DB. Comportamento
 *     invariato: un record DB reale senza canonical_card_id resta
 *     un'anomalia potenziale, split genuino, a prescindere da cosa c'è o non
 *     c'è lato external.
 *   - "artefatti external N/A": la componente DB è coerente (un solo
 *     canonical, o nessuna riga DB nel cluster) — il mismatch segnalato da
 *     identity-cascade.js dipende SOLO dal canonical_card_id=null strutturale
 *     di una riga external. Questi NON vengono passati a
 *     classifyCanonicalSplits e la loro naturalKey NON entra in
 *     splitNaturalKeys — quindi Pass 2/3 (già calcolati da identity-cascade.js
 *     senza alcuna modifica) restano liberi di classificarli come il normale
 *     EXACT_DUPLICATE cross-source, esattamente come farebbero per un match
 *     tcgdex<->ptcg pulito.
 * Nessuna riga viene scartata dal matching, nessun canonical_card_id viene
 * inventato per il lato external, identity-cascade.js/classify-findings.js
 * restano invariati: si sceglie solo QUALI split (fra quelli che
 * identity-cascade.js ha già calcolato) rappresentano un'anomalia reale da
 * riportare, in base a un'informazione (`_origin`) che solo l'orchestratore
 * possiede.
 *
 * @param {ReturnType<import('./identity-cascade.js').findCanonicalSplits>['splits']} splits
 * @returns {{genuineSplits: object[], externalNullArtifacts: object[]}}
 */
export function partitionCanonicalSplits(splits) {
  const genuineSplits = [];
  const externalNullArtifacts = [];
  for (const split of splits) {
    for (const r of split.rows) {
      if (r._origin !== 'db' && r._origin !== 'external') {
        throw new Error(
          `partitionCanonicalSplits: riga senza _origin valido ('db'|'external') per id=${r.id ?? '(sconosciuto)'} — questa funzione richiede che ogni riga sia stata taggata da tagDbRows/tagExternalCandidates prima della cascata, altrimenti non può distinguere un'anomalia reale da un artefatto strutturale del confronto DB<->external.`
        );
      }
    }
    const dbRows = split.rows.filter((r) => r._origin === 'db');
    const dbDistinctCanonical = [...new Set(dbRows.map((r) => r.canonical_card_id).filter((v) => v != null))];
    const dbHasNullCanonical = dbRows.some((r) => r.canonical_card_id == null);
    // Stessa formula di identity-cascade.js#findCanonicalSplits, ristretta al
    // sottoinsieme delle sole righe _origin='db' del cluster.
    const dbSideMismatched = dbDistinctCanonical.length > 1 || (dbDistinctCanonical.length >= 1 && dbHasNullCanonical);
    if (dbSideMismatched) {
      genuineSplits.push(split);
    } else {
      externalNullArtifacts.push(split);
    }
  }
  return { genuineSplits, externalNullArtifacts };
}

/**
 * Riproduce la composizione di classify-findings.js#classifyFindings, SENZA
 * duplicarne la logica interna (ogni classify* è importata così com'è da
 * quel modulo) — le due differenze deliberate sono: (1) il pass finale
 * (classifyMissingExtraByOrigin invece di classifyUnmatched, per il motivo
 * spiegato nel commento di testa al file) e (2) gli split passati a
 * classifyCanonicalSplits/usati per costruire splitNaturalKeys sono filtrati
 * da partitionCanonicalSplits (vedi il commento "Fix 2026-08-17" sopra), per
 * escludere gli artefatti strutturali "canonical_card_id N/A su un candidato
 * external" dal risultato riportato come anomalia.
 *
 * @param {ReturnType<typeof runIdentityCascade>} cascadeResult
 * @param {object[]} allRows - stesse righe passate a runIdentityCascade (DB + esterne, taggate)
 * @returns {object[]}
 */
export function classifyFindingsForReconciliation(cascadeResult, allRows) {
  const findings = [];
  const { genuineSplits } = partitionCanonicalSplits(cascadeResult.splits);
  findings.push(...classifyCanonicalSplits(genuineSplits));
  findings.push(...classifyCollisions(cascadeResult.collisions));
  const { duplicateFindings, conflictFindings } = classifyExactDuplicateClusters(cascadeResult.exactDuplicateClusters);
  findings.push(...duplicateFindings, ...conflictFindings);
  findings.push(...classifySameSourceRepeats(cascadeResult.sameSourceRepeats));

  // splitNaturalKeys usa SOLO gli split genuini (+ le collisioni, invariate —
  // una collisione è un conflitto di nome, non correlato al bug del canonical
  // N/A): un artefatto external non deve sopprimere/deviare il match
  // cross-source pulito che Pass 2/3 produrrebbero altrimenti.
  const splitNaturalKeys = new Set([
    ...genuineSplits.map((s) => s.naturalKey),
    ...cascadeResult.collisions.map((c) => c.naturalKey),
  ]);
  const rowIdSetSignatures = new Set();
  findings.push(...classifySourceIdCrossMatches(cascadeResult.sourceIdCrossMatches, splitNaturalKeys, rowIdSetSignatures));
  findings.push(...classifyNaturalKeyCrossMatches(cascadeResult.naturalKeyCrossMatches, splitNaturalKeys, rowIdSetSignatures));
  findings.push(...classifyFuzzyCandidates(cascadeResult.fuzzyCandidates));
  findings.push(...classifyMissingExtraByOrigin(cascadeResult.unmatchedRows));
  findings.push(...classifyVariantSignals(allRows || []));
  return findings;
}

/**
 * Unità di lavoro: reconciliation READ-ONLY di UN set (tcg, lang, setId).
 * Nessuna scrittura Supabase/immagine in nessun punto. Se il tcg non ha un
 * fetcher esterno implementato (EXTERNAL_SOURCE_FETCHERS), o se il fetcher
 * stesso rifiuta la lingua (es. optcg + lang=ja), l'errore propaga SENZA
 * essere inghiottito — mai un set "vuoto" fabbricato al posto di un errore.
 *
 * @param {object} opts
 * @param {string} opts.tcg
 * @param {string} opts.lang
 * @param {string} opts.setId
 * @param {object} opts.client - client Supabase (reale o mock)
 * @param {typeof fetch} [opts.fetchImpl=fetch]
 * @param {boolean} [opts.auditImages=true] - false per saltare l'audit HTTP
 *   delle immagini (utile nei test/dry-run rapidi; il default true riflette
 *   il comportamento reale richiesto dal task)
 * @returns {Promise<object>} report strutturato per questo set (stessa forma
 *   scritta come singola riga NDJSON da runReconcileCatalog)
 */
export async function runSetReconciliation({ tcg, lang, setId, client, fetchImpl = fetch, auditImages = true } = {}) {
  if (!tcg || !lang || !setId) {
    throw new TypeError('runSetReconciliation: "tcg", "lang" e "setId" sono obbligatori');
  }
  if (!client) {
    throw new TypeError('runSetReconciliation: "client" (Supabase) è obbligatorio');
  }

  const externalFetcher = EXTERNAL_SOURCE_FETCHERS[tcg];
  if (!externalFetcher) {
    throw new SourceNotImplementedError(
      `RECONCILE_SOURCE_NOT_IMPLEMENTED: nessun fetcher esterno registrato per tcg="${tcg}" (tcg supportati: ${Object.keys(EXTERNAL_SOURCE_FETCHERS).join(', ')}). Nessun dato inventato.`
    );
  }

  // 1. Fonte esterna — propaga qualunque errore così com'è (incluso
  //    OptcgSourceNotImplementedError per onepiece/ja): mai un fallback.
  const external = await externalFetcher({ setId, lang, fetchImpl });

  // 2. DB (READ-ONLY, supabase-read.js — stessa garanzia già testata lì).
  const dbRowsRaw = await fetchDbCatalogSlice(client, { tcg, lang, setId });

  // 3. Normalizzazione (esistente, invariata) + tag di provenienza.
  const dbRows = tagDbRows(dbRowsRaw.map(normalizeDbRow));
  const externalRows = tagExternalCandidates(external.rows.map(normalizeDbRow), { tcg, lang, setId });

  // 4. Cascata di identità + classificazione (esistenti, invariate — vedi
  //    classifyFindingsForReconciliation per l'unica sostituzione dichiarata).
  const allRows = [...dbRows, ...externalRows];
  const cascadeResult = runIdentityCascade(allRows);
  const findings = classifyFindingsForReconciliation(cascadeResult, allRows);

  // 5. Image taxonomy — SOLO sulle immagini già in DB (il recovery da fonte
  //    esterna è STEP 5, non implementato qui). Sequenziale, stesso motivo già
  //    documentato in smoke-reconcile.mjs (set piccoli, niente burst HTTP).
  const imageTally = {
    [IMAGE_STATUS.OK]: 0,
    [IMAGE_STATUS.MISSING]: 0,
    [IMAGE_STATUS.BROKEN]: 0,
    [IMAGE_STATUS.INVALID]: 0,
    [IMAGE_STATUS.FETCH_ERROR]: 0,
  };
  const cardImageAudits = [];
  if (auditImages) {
    for (const row of dbRowsRaw) {
      const audit = await auditCardImages(row, { fetchImpl });
      const primary = audit.image_url_hi.url ? audit.image_url_hi : audit.image_url;
      imageTally[primary.status] = (imageTally[primary.status] || 0) + 1;
      cardImageAudits.push({ id: row.id, source_id: row.source_id, image_status: primary.status, image_url_audit: audit.image_url, image_url_hi_audit: audit.image_url_hi });
    }
  }

  const findingsSummary = {};
  for (const f of findings) findingsSummary[f.finding] = (findingsSummary[f.finding] || 0) + 1;

  return {
    mode: 'RECONCILE_CATALOG_READ_ONLY',
    generated_at: new Date().toISOString(),
    scope: { tcg, lang, set_id: setId, set_name: external.setName ?? dbRowsRaw[0]?.set_name ?? null },
    db_total: dbRows.length,
    external_total: externalRows.length,
    findings_summary: findingsSummary,
    findings,
    images: auditImages ? { tally: imageTally, cards: cardImageAudits } : null,
    // Aggiunto per STEP 5 (recovery.mjs): le righe normalizzate e taggate
    // (_origin: 'db'|'external') usate per la cascata. Necessario perché
    // classify-findings.js#rowRef esclude DELIBERATAMENTE i campi immagine
    // dall'evidence dei finding (non è un suo scopo trasportarli) — senza
    // questo campo, un consumer a valle non avrebbe modo di risalire
    // all'image_url di una riga esterna già confermata come match dalla
    // reconciliation stessa. Campo puramente additivo: nessuna chiave
    // preesistente di questo report cambia forma o significato.
    rows: allRows,
  };
}

// ============================================================================
// Checkpoint per-set — stesso pattern (write-to-temp + rename atomico) di
// sync-dry-run.mjs/discover-catalog.mjs, riusato qui, granularità diversa
// (una entry per set completato invece che per id numerico, coerente con
// l'unità di lavoro di questo orchestratore).
// ============================================================================

function setKey({ tcg, lang, setId }) {
  return `${tcg}:${lang}:${setId}`;
}

function writeCheckpointAtomic(checkpointPath, data) {
  mkdirSync(dirname(checkpointPath), { recursive: true });
  const tmpPath = `${checkpointPath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  renameSync(tmpPath, checkpointPath);
}

/**
 * @param {string|null} checkpointPath
 * @returns {{completedSets: string[], updatedAt: string|null}}
 */
export function readCheckpoint(checkpointPath) {
  if (!checkpointPath || !existsSync(checkpointPath)) return { completedSets: [], updatedAt: null };
  try {
    const parsed = JSON.parse(readFileSync(checkpointPath, 'utf8'));
    return { completedSets: Array.isArray(parsed.completedSets) ? parsed.completedSets : [], updatedAt: parsed.updatedAt ?? null };
  } catch {
    // Checkpoint corrotto/parziale: trattato come "nessun checkpoint", mai un crash.
    return { completedSets: [], updatedAt: null };
  }
}

/**
 * Loop resumable su una lista ESPLICITA di {tcg, lang, setId} — mai una
 * scansione implicita di "tutto il catalogo" (esplicitamente vietata in
 * questo step). Un set già presente in `completedSets` del checkpoint viene
 * saltato (skip, non ri-eseguito) — resume, non re-fetch.
 *
 * Ogni set completato produce ESATTAMENTE una riga NDJSON in outPath e
 * aggiorna il checkpoint atomicamente subito dopo — un run interrotto a metà
 * di un set non lascia mai una entry di checkpoint per un set incompleto.
 *
 * @param {object} opts
 * @param {{tcg: string, lang: string, setId: string}[]} opts.targets
 * @param {object} opts.client
 * @param {typeof fetch} [opts.fetchImpl=fetch]
 * @param {string|null} [opts.checkpointPath=null]
 * @param {string|null} [opts.outPath=null] - se null, non scrive NDJSON su
 *   disco (utile nei test); il chiamante CLI passa sempre un path reale.
 * @param {boolean} [opts.auditImages=true]
 * @param {(report: object) => void} [opts.onSetComplete=null]
 * @param {(err: Error, target: object) => void} [opts.onSetError=null] - se
 *   fornito, un errore su UN set viene registrato e il loop CONTINUA con il
 *   set successivo (utile per un run su più target, dove un errore di
 *   normalizzazione su un set non deve abortire l'intero run); se assente
 *   (default), l'errore propaga e interrompe il loop — comportamento più
 *   sicuro di default, coerente con "mai un problema aggirato in silenzio".
 * @returns {Promise<{completed: object[], skipped: string[], errors: {target: object, error: string}[]}>}
 */
export async function runReconcileCatalog({
  targets,
  client,
  fetchImpl = fetch,
  checkpointPath = null,
  outPath = null,
  auditImages = true,
  onSetComplete = null,
  onSetError = null,
} = {}) {
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new TypeError('runReconcileCatalog: "targets" deve essere un array non vuoto di {tcg, lang, setId}');
  }
  if (!client) {
    throw new TypeError('runReconcileCatalog: "client" (Supabase) è obbligatorio');
  }

  const checkpoint = readCheckpoint(checkpointPath);
  const completedSet = new Set(checkpoint.completedSets);

  if (outPath) mkdirSync(dirname(outPath), { recursive: true });

  const completed = [];
  const skipped = [];
  const errors = [];

  for (const target of targets) {
    const key = setKey(target);
    if (completedSet.has(key)) {
      skipped.push(key);
      continue;
    }

    let report;
    try {
      report = await runSetReconciliation({ ...target, client, fetchImpl, auditImages });
    } catch (err) {
      if (onSetError) {
        onSetError(err, target);
        errors.push({ target, error: err.message });
        continue;
      }
      throw err;
    }

    if (outPath) {
      const fs = await import('node:fs');
      fs.appendFileSync(outPath, JSON.stringify(report) + '\n');
    }

    completedSet.add(key);
    if (checkpointPath) {
      writeCheckpointAtomic(checkpointPath, { completedSets: [...completedSet], updatedAt: new Date().toISOString() });
    }

    completed.push(report);
    if (onSetComplete) onSetComplete(report);
  }

  return { completed, skipped, errors };
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=');
      return [k, v];
    })
  );
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('ERROR: SUPABASE_URL e SUPABASE_SERVICE_KEY mancanti in env (stesso requisito degli altri script di questo repo).');
    process.exitCode = 1;
    return;
  }
  const tcg = args.tcg;
  const lang = args.lang;
  const setId = args.set;
  if (!tcg || !lang || !setId) {
    console.error('Uso: node reconcile-catalog.mjs --tcg=pokemon --lang=ja --set=SVLN [--out=data/reconciliation/reconcile-catalog.ndjson] [--checkpoint=data/reconciliation/reconcile-catalog-checkpoint.json]');
    process.exitCode = 1;
    return;
  }
  const outPath = args.out || 'data/reconciliation/reconcile-catalog.ndjson';
  const checkpointPath = args.checkpoint || 'data/reconciliation/reconcile-catalog-checkpoint.json';

  const client = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log(`[reconcile-catalog] READ-ONLY. target=${tcg}/${lang}/${setId} (nessuna scrittura Supabase, nessun recovery immagine)`);
  const { completed, skipped, errors } = await runReconcileCatalog({
    targets: [{ tcg, lang, setId }],
    client,
    checkpointPath,
    outPath,
    onSetComplete: (r) => console.log(`[reconcile-catalog] Set completato: ${r.scope.tcg}/${r.scope.lang}/${r.scope.set_id} — db=${r.db_total} external=${r.external_total} findings=${JSON.stringify(r.findings_summary)}`),
    onSetError: (err, target) => console.error(`[reconcile-catalog] ERRORE su ${setKey(target)}: ${err.message}`),
  });

  console.log(`\n[reconcile-catalog] completati=${completed.length} saltati(già in checkpoint)=${skipped.length} errori=${errors.length}`);
  console.log(`[reconcile-catalog] Report NDJSON: ${outPath}`);
  console.log(`[reconcile-catalog] Checkpoint: ${checkpointPath}`);
}

export function isDirectCliInvocation(argv1, moduleUrl) {
  if (!argv1) return false;
  return pathToFileURL(argv1).href === moduleUrl;
}

if (isDirectCliInvocation(process.argv[1], import.meta.url)) {
  main().catch((err) => {
    console.error('FATAL:', err.message);
    process.exitCode = 1;
  });
}
