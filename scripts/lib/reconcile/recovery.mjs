#!/usr/bin/env node
// scripts/lib/reconcile/recovery.mjs
// STEP 5 — Catalog & image recovery, DRY-RUN/READ-ONLY. Prende l'output di
// STEP 4 (reconcile-catalog.mjs: findings + image audit per set) e produce
// CANDIDATI di recupero — mai un'azione, mai una scrittura, mai un download
// reale. Due categorie tenute ESPLICITAMENTE separate (richiesto dal task):
//
//   1. missing_card_candidates — da finding `MISSING` (carta presente nella
//      fonte esterna, assente in DB): il candidato è la carta stessa da
//      importare, non un'immagine.
//   2. image_recovery_candidates — da `report.images.cards` con stato
//      IMAGE_MISSING/IMAGE_BROKEN/IMAGE_INVALID (carta GIÀ in DB, immagine
//      da recuperare). FETCH_ERROR è escluso di proposito: uno stato
//      transient non prova che l'immagine sia rotta, non è materia di
//      recovery — riprovare l'audit, non cercare un sostituto.
//
// ============================================================================
// Cosa riusa, cosa NON reinventa
// ============================================================================
// - `image-taxonomy.js#auditImageUrl/auditCardImages` (STEP 3): stessa
//   infrastruttura HTTP probe/verifica già usata per l'audit — riusata qui
//   per verificare via GET/HEAD reale un URL candidato PRIMA di proporlo,
//   mai un URL "indovinato" e mai un download del body oltre al probe.
// - `scripts/image-audit/resolve-fallback.mjs#resolveCard`: la cascata
//   multi-fonte GIÀ ESISTENTE (TCGdex retry, Scrydex, pokemontcg.io,
//   PokemonPriceTracker), già READ-ONLY e già verificata via HTTP reale per
//   ogni candidato — riusata COSÌ COM'È, zero logica HTTP duplicata qui.
//   Copre SOLO Pokémon (limite della fonte riusata, non di questo file) —
//   per One Piece non esiste un resolver equivalente nel repo: questo modulo
//   dichiara esplicitamente UNRESOLVED con motivo, non inventa un fallback.
// - `match-confidence.mjs#scoreMatch` (usato internamente da resolveCard):
//   stessa soglia già in uso (LOW/D = ambiguo, mai auto-risolvibile) — non
//   ridefinita qui, solo riletta dal risultato di resolveCard.
//
// ============================================================================
// Cascata per il recupero immagine (2 stadi, in ordine, mai un URL non
// verificato via HTTP reale)
// ============================================================================
//   Stadio 1 — "match già confermato dalla reconciliation in corso": se la
//   carta DB ha già un finding EXACT_DUPLICATE con una riga candidata
//   `_origin: 'external'` (calcolato da reconcile-catalog.mjs, STEP 4) e
//   quella riga ha un image_url/image_url_hi diverso da quello rotto in DB,
//   lo si verifica via auditImageUrl — zero fetch aggiuntivi alla fonte
//   esterna (i dati sono già stati letti durante la reconciliation), solo
//   la verifica HTTP dell'URL stesso.
//   Stadio 2 — fallback sulla cascata multi-fonte esistente
//   (resolve-fallback.mjs#resolveCard), SOLO se lo stadio 1 non produce un
//   candidato verificato E tcg === 'pokemon'.
// Se nessuno stadio produce un candidato verificato, o se la confidence
// risultante è ambigua, il risultato resta AMBIGUOUS/UNRESOLVED.
//
// ============================================================================
// Perché serve `rows` (accanto a `findings`) dal report di STEP 4
// ============================================================================
// classify-findings.js#rowRef() esclude deliberatamente i campi immagine
// dall'evidence dei finding (non è un suo scopo trasportarli, e non lo
// modifichiamo per questo). Per accedere all'image_url della riga esterna
// già confermata come match, questo modulo ha quindi bisogno delle righe
// normalizzate complete (`report.rows`, aggiunto in reconcile-catalog.mjs
// per questo scopo, campo puramente additivo) indicizzate per id.
//
// ============================================================================
// Garanzie di sola lettura / dry-run
// ============================================================================
// Nessuna scrittura Supabase in nessun punto di questo file (nessun
// import/uso di insert/update/upsert/delete). Nessun download/salvataggio
// reale di un'immagine: ogni verifica passa da `auditImageUrl`/`resolveCard`,
// che fanno solo GET/HEAD probe (stessa infrastruttura di crawl-images.mjs),
// mai una scrittura su disco del body dell'immagine.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { auditImageUrl, auditCardImages, IMAGE_STATUS, RECOVERY_STATUS } from './image-taxonomy.js';
import { resolveCard } from '../../image-audit/resolve-fallback.mjs';
import { runSetReconciliation } from './reconcile-catalog.mjs';

export const RECOVERY_CANDIDATE_KIND = Object.freeze({
  MISSING_CARD: 'MISSING_CARD_CANDIDATE',
  IMAGE_RECOVERY: 'IMAGE_RECOVERY_CANDIDATE',
});

/** Stati immagine per cui ha senso cercare un recupero (esclude FETCH_ERROR di proposito, vedi header). */
const RECOVERABLE_IMAGE_STATUSES = Object.freeze([IMAGE_STATUS.MISSING, IMAGE_STATUS.BROKEN, IMAGE_STATUS.INVALID]);

// ============================================================================
// 1. Carte mancanti — candidati da finding MISSING
// ============================================================================

/**
 * Costruisce candidati per carte MANCANTI in DB, da finding `MISSING`
 * (prodotti da reconcile-catalog.mjs#classifyMissingExtraByOrigin — presente
 * nella fonte esterna, nessuna corrispondenza in DB in questo scope). Ogni
 * candidato riporta ESATTAMENTE la confidence del finding di origine — MAI
 * ricalcolata più alta, MAI marcata "safe to write": è un dato diagnostico,
 * l'eventuale ingestion resta una decisione fuori da questo step.
 *
 * @param {object[]} findings - da report.findings (reconcile-catalog.mjs)
 * @param {object} [opts]
 * @param {typeof fetch} [opts.fetchImpl=fetch]
 * @param {boolean} [opts.verifyImages=true] - false per saltare la verifica
 *   HTTP dell'URL candidato (utile nei test/dry-run rapidi)
 * @returns {Promise<object[]>}
 */
export async function buildMissingCardCandidates(findings, { fetchImpl = fetch, verifyImages = true } = {}) {
  const missing = (findings || []).filter((f) => f.finding === 'MISSING');
  const candidates = [];
  for (const f of missing) {
    const row = f.evidence?.row;
    if (!row) {
      // Difensivo: un finding MISSING dovrebbe sempre avere evidence.row
      // (vedi classifyMissingExtraByOrigin) — se manca, non inventiamo nulla,
      // saltiamo il candidato piuttosto che costruirne uno con dati mancanti.
      continue;
    }
    const candidate = {
      kind: RECOVERY_CANDIDATE_KIND.MISSING_CARD,
      finding_row_ids: f.row_ids,
      source: row.source ?? null,
      source_id: row.source_id ?? null,
      set_id: row.set_id ?? null,
      card_number: row.card_number ?? null,
      name: row.name ?? null,
      candidate_image_url: row.image_url ?? null,
      candidate_image_url_hi: row.image_url_hi ?? null,
      confidence: f.confidence,
      confidence_note: f.confidence_note ?? null,
      provenance: {
        mechanism: 'RECONCILE_FINDING_MISSING',
        finding_subtype: f.subtype,
        note: 'Carta presente nella fonte esterna interrogata da STEP 4, nessuna corrispondenza trovata in DB per questo set — candidato a ingestion, non un\'azione.',
      },
      image_verification: null,
    };
    if (verifyImages && (row.image_url || row.image_url_hi)) {
      candidate.image_verification = await auditCardImages(
        { image_url: row.image_url, image_url_hi: row.image_url_hi },
        { fetchImpl, source: 'missing_card_candidate' }
      );
    }
    candidates.push(candidate);
  }
  return candidates;
}

// ============================================================================
// 2. Immagini mancanti/broken/invalid — candidati di recupero
// ============================================================================

/**
 * Trova, per una carta DB, l'eventuale riga `_origin: 'external'` già
 * confermata come match dalla reconciliation in corso (finding
 * EXACT_DUPLICATE che include l'id della carta). MAI una scelta arbitraria:
 * se il cluster non contiene esattamente UNA riga esterna (0, o più di 1 —
 * quest'ultimo caso non atteso nella pratica ma non escluso a priori), non
 * si sceglie nulla — si ritorna `row: null` con il motivo esplicito.
 *
 * @param {string} dbCardId
 * @param {object[]} findings
 * @param {Map<string, object>} rowsById - da report.rows (reconcile-catalog.mjs), indicizzato per id
 * @returns {{row: object|null, finding: object|null, reason: string}}
 */
export function findMatchedExternalRow(dbCardId, findings, rowsById) {
  const clusters = (findings || []).filter((f) => f.finding === 'EXACT_DUPLICATE' && f.row_ids?.includes(dbCardId));
  if (clusters.length === 0) return { row: null, finding: null, reason: 'NO_MATCH_FINDING' };
  if (clusters.length > 1) return { row: null, finding: null, reason: 'AMBIGUOUS_MULTIPLE_CLUSTERS' };

  const finding = clusters[0];
  const externalRows = finding.row_ids
    .filter((id) => id !== dbCardId)
    .map((id) => rowsById.get(id))
    .filter((r) => r && r._origin === 'external');

  if (externalRows.length === 0) return { row: null, finding, reason: 'NO_EXTERNAL_ROW_IN_CLUSTER' };
  if (externalRows.length > 1) return { row: null, finding, reason: 'AMBIGUOUS_MULTIPLE_EXTERNAL_ROWS' };
  return { row: externalRows[0], finding, reason: 'OK' };
}

/**
 * Mappa il `source` (già taggato ':external' dall'orchestratore, es.
 * 'tcgdex:external') sul vocabolario stabile RECOVERY_STATUS dichiarato in
 * image-taxonomy.js. Nessuno stato nuovo inventato: solo 'tcgdex' ha un
 * RECOVERY_STATUS dedicato (RECOVERABLE_TCGDEX); qualunque altra fonte
 * (es. 'optcg') ricade su RECOVERABLE_OTHER, stessa scelta già documentata
 * in image-taxonomy.js per non aggiungere stati non richiesti.
 *
 * @param {string|null|undefined} source
 * @returns {string}
 */
function recoveryStatusForCandidateSource(source) {
  const base = String(source || '').split(':')[0];
  if (base === 'tcgdex') return RECOVERY_STATUS.RECOVERABLE_TCGDEX;
  return RECOVERY_STATUS.RECOVERABLE_OTHER;
}

/** Mappa il `source` restituito da resolve-fallback.mjs#resolveCard sul vocabolario RECOVERY_STATUS. */
function recoveryStatusForResolvedSource(source) {
  if (source === 'tcgdex_retry' || source === 'tcgdex_low') return RECOVERY_STATUS.RECOVERABLE_TCGDEX;
  // scrydex/pokemontcg.io/pokemonpricetracker: nessuno stato dedicato
  // dichiarato in image-taxonomy.js (RECOVERABLE_SCRYDEX esiste solo in
  // summarize.mjs, deliberatamente accorpato qui in RECOVERABLE_OTHER, per
  // restare fedeli all'elenco di stati già dichiarato in image-taxonomy.js).
  return RECOVERY_STATUS.RECOVERABLE_OTHER;
}

/**
 * Costruisce UN candidato di recupero immagine per una carta DB con stato
 * IMAGE_MISSING/IMAGE_BROKEN/IMAGE_INVALID. Vedi l'header del file per la
 * cascata a 2 stadi. Non scarica mai il body dell'immagine, non scrive mai
 * su Supabase.
 *
 * @param {object} dbCard - riga DB normalizzata (da report.rows, _origin='db')
 * @param {object} [opts]
 * @param {object|null} [opts.matchedExternalRow=null] - da findMatchedExternalRow
 * @param {object|null} [opts.matchFinding=null] - da findMatchedExternalRow
 * @param {typeof fetch} [opts.fetchImpl=fetch]
 * @param {typeof resolveCard} [opts.resolveCardImpl=resolveCard] - DI per i test (mai la rete reale)
 * @returns {Promise<object>}
 */
export async function buildImageRecoveryCandidate(dbCard, {
  matchedExternalRow = null,
  matchFinding = null,
  fetchImpl = fetch,
  resolveCardImpl = resolveCard,
} = {}) {
  const base = {
    kind: RECOVERY_CANDIDATE_KIND.IMAGE_RECOVERY,
    card_id: dbCard.id,
    tcg: dbCard.tcg,
    lang: dbCard.lang,
    set_id: dbCard.set_id,
    card_number: dbCard.card_number_raw ?? dbCard.card_number ?? null,
    name: dbCard.name,
    broken_image_url: dbCard.image_url ?? null,
    broken_image_url_hi: dbCard.image_url_hi ?? null,
  };

  // Stadio 1: riga esterna già confermata come match dalla reconciliation in corso.
  if (matchedExternalRow) {
    const candidateUrl = matchedExternalRow.image_url_hi || matchedExternalRow.image_url || null;
    const isNewUrl = candidateUrl && candidateUrl !== dbCard.image_url_hi && candidateUrl !== dbCard.image_url;
    if (isNewUrl) {
      const audit = await auditImageUrl(candidateUrl, { fetchImpl, source: 'reconciliation_matched_external' });
      if (audit.status === IMAGE_STATUS.OK) {
        return {
          ...base,
          status: recoveryStatusForCandidateSource(matchedExternalRow.source),
          candidate_url: candidateUrl,
          candidate_source: matchedExternalRow.source,
          candidate_source_id: matchedExternalRow.source_id,
          confidence: 'HIGH',
          confidence_note: 'Riga esterna già identificata come la stessa carta dalla reconciliation (finding EXACT_DUPLICATE), URL verificato via HTTP reale in questo step.',
          provenance: {
            mechanism: 'RECONCILE_MATCHED_EXTERNAL_CANDIDATE',
            match_finding_subtype: matchFinding?.subtype ?? null,
            note: 'Nessun fetch aggiuntivo alla fonte esterna: i dati provengono dallo stesso fetch già eseguito da STEP 4 per questo set; solo l\'URL candidato è stato verificato via HTTP in questo step.',
          },
          verification: audit,
        };
      }
      // Candidato non verificato (immagine anch'essa rotta lato esterno) ->
      // si prosegue allo stadio 2, MAI proposto un URL non confermato.
    }
  }

  // Stadio 2: cascata multi-fonte esistente (resolve-fallback.mjs), SOLO Pokémon.
  if (dbCard.tcg !== 'pokemon') {
    return {
      ...base,
      status: RECOVERY_STATUS.UNRESOLVED,
      candidate_url: null,
      candidate_source: null,
      confidence: 'UNVERIFIED',
      confidence_note: null,
      provenance: {
        mechanism: 'NO_RESOLVER_FOR_TCG',
        note: `Nessun resolver di image recovery implementato per tcg="${dbCard.tcg}" (scripts/image-audit/resolve-fallback.mjs copre solo Pokémon) — nessun candidato inventato.`,
      },
      verification: null,
    };
  }

  const resolved = await resolveCardImpl(
    {
      image_url: dbCard.image_url_hi || dbCard.image_url || null,
      lang: dbCard.lang,
      card_number: dbCard.card_number_raw ?? dbCard.card_number ?? null,
      set_id: dbCard.set_id,
      name: dbCard.name,
    },
    { fetchImpl }
  );

  if (!resolved || !resolved.resolved) {
    return {
      ...base,
      status: RECOVERY_STATUS.UNRESOLVED,
      candidate_url: null,
      candidate_source: null,
      confidence: 'UNVERIFIED',
      confidence_note: resolved?.match_reason ?? null,
      provenance: {
        mechanism: 'RESOLVE_FALLBACK_CASCADE',
        attempts: (resolved?.attempts ?? []).map((a) => a.stage),
        note: 'Nessuna fonte della cascata esistente (TCGdex retry, Scrydex, pokemontcg.io, PokemonPriceTracker) ha prodotto un candidato verificabile via HTTP.',
      },
      verification: null,
    };
  }

  const isAmbiguous = ['LOW', 'D'].includes(resolved.match_confidence);
  return {
    ...base,
    status: isAmbiguous ? RECOVERY_STATUS.AMBIGUOUS : recoveryStatusForResolvedSource(resolved.source),
    candidate_url: resolved.url,
    candidate_source: resolved.source,
    confidence: resolved.match_confidence,
    confidence_note: resolved.match_reason ?? null,
    provenance: {
      mechanism: 'RESOLVE_FALLBACK_CASCADE',
      stage: resolved.source,
      attempts: (resolved.attempts ?? []).map((a) => a.stage),
      note: isAmbiguous
        ? 'Match ambiguo secondo match-confidence.mjs (LOW/D) — richiede revisione manuale, MAI auto-risolto.'
        : 'Candidato verificato via HTTP reale dalla cascata esistente (resolve-fallback.mjs).',
    },
    verification: resolved.probe ?? null,
  };
}

// ============================================================================
// Orchestratore: report completo per UN set (stesso scope del report di STEP 4)
// ============================================================================

/**
 * Punto di ingresso principale. Prende il report di UN set prodotto da
 * `runSetReconciliation` (reconcile-catalog.mjs, STEP 4 — deve includere
 * `findings` e `rows`; `images.cards` se si vuole anche il recupero
 * immagini) e produce candidati di recupero, in DUE liste separate. Nessuna
 * scrittura Supabase, nessun download reale di immagine.
 *
 * @param {object} report - da runSetReconciliation
 * @param {object} [opts]
 * @param {typeof fetch} [opts.fetchImpl=fetch]
 * @param {typeof resolveCard} [opts.resolveCardImpl=resolveCard]
 * @param {boolean} [opts.verifyMissingCardImages=true]
 * @returns {Promise<object>}
 */
export async function buildRecoveryReport(report, opts = {}) {
  const { fetchImpl = fetch, resolveCardImpl = resolveCard, verifyMissingCardImages = true } = opts;
  if (!report || !Array.isArray(report.findings)) {
    throw new TypeError('buildRecoveryReport: "report" deve essere l\'output di runSetReconciliation (richiede almeno .findings)');
  }
  if (!Array.isArray(report.rows)) {
    throw new TypeError(
      'buildRecoveryReport: report.rows mancante — richiede la versione di reconcile-catalog.mjs che espone le righe normalizzate (necessarie per il recupero immagine, vedi header di questo file).'
    );
  }
  const rowsById = new Map(report.rows.map((r) => [r.id, r]));

  const missingCardCandidates = await buildMissingCardCandidates(report.findings, { fetchImpl, verifyImages: verifyMissingCardImages });

  const imageRecoveryCandidates = [];
  for (const cardAudit of report.images?.cards ?? []) {
    if (!RECOVERABLE_IMAGE_STATUSES.includes(cardAudit.image_status)) continue;
    const dbCard = rowsById.get(cardAudit.id);
    if (!dbCard) continue; // difensivo: non dovrebbe accadere, mai una riga inventata
    const { row: matchedExternalRow, finding: matchFinding } = findMatchedExternalRow(cardAudit.id, report.findings, rowsById);
    const candidate = await buildImageRecoveryCandidate(dbCard, { matchedExternalRow, matchFinding, fetchImpl, resolveCardImpl });
    imageRecoveryCandidates.push(candidate);
  }

  const summary = { missing_cards: missingCardCandidates.length, image_recovery: {} };
  for (const c of imageRecoveryCandidates) summary.image_recovery[c.status] = (summary.image_recovery[c.status] || 0) + 1;

  return {
    mode: 'RECOVERY_DRY_RUN_READ_ONLY',
    generated_at: new Date().toISOString(),
    scope: report.scope,
    summary,
    missing_card_candidates: missingCardCandidates,
    image_recovery_candidates: imageRecoveryCandidates,
  };
}

// ============================================================================
// CLI — riusa runSetReconciliation di STEP 4 (nessuna orchestrazione DB/fetch
// esterno duplicata qui), poi applica il recovery dry-run sul suo output.
// ============================================================================

async function main() {
  const { createClient } = await import('@supabase/supabase-js');

  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=');
      return [k, v];
    })
  );
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('ERROR: SUPABASE_URL e SUPABASE_SERVICE_KEY mancanti in env.');
    process.exitCode = 1;
    return;
  }
  const { tcg, lang, set: setId } = args;
  if (!tcg || !lang || !setId) {
    console.error('Uso: node recovery.mjs --tcg=pokemon --lang=ja --set=SVLN [--out=data/reconciliation/recovery-<tcg>-<lang>-<set>.json]');
    process.exitCode = 1;
    return;
  }
  const outPath = args.out || `data/reconciliation/recovery-${tcg}-${lang}-${setId}.json`;

  const client = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log(`[recovery] DRY-RUN READ-ONLY. target=${tcg}/${lang}/${setId} (nessuna scrittura Supabase, nessun download reale immagine)`);
  const report = await runSetReconciliation({ tcg, lang, setId, client });
  const recovery = await buildRecoveryReport(report);

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(recovery, null, 2));

  console.log(`\n=== RECOVERY SUMMARY: ${tcg}/${lang}/${setId} ===`);
  console.log(`missing_cards: ${recovery.summary.missing_cards}`);
  for (const [k, v] of Object.entries(recovery.summary.image_recovery)) console.log(`  ${k}: ${v}`);
  console.log(`\nReport: ${outPath}`);
}

// Stesso pattern di isDirectCliInvocation già in uso in reconcile-catalog.mjs/
// sync-dry-run.mjs/discover-catalog.mjs (pathToFileURL(), portabile su Windows).
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
