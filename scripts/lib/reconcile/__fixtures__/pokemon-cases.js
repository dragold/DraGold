// DraGold — Catalog Reconciliation Pipeline
// Fixture sintetiche per la cascata di identity matching + classificazione.
//
// Dati SINTETICI, non un dump del DB reale — tranne il case 25, che riproduce
// esattamente i valori verificati READ-ONLY su Supabase in sessione di analisi
// (svp-044 tcgdex vs svp-44 ptcg, entrambi già discussi/disclosed nel design
// doc di questa pipeline): è il caso più importante da non perdere, quindi
// merita di essere il dato reale verificato, non un'approssimazione.
//
// Ogni caso ha la forma di righe grezze `cards` (stesso shape della tabella
// reale: id, tcg, source, source_id, set_id, lang, card_number,
// canonical_card_id, name, name_en, image_url, image_url_hi, rarity,
// print_variant, + eventuale `variants` grezzo per il segnale VARIANT_CANDIDATE)
// — non righe già normalizzate: la normalizzazione è responsabilità del test
// harness (vedi __tests__/pokemon-cases.test.js), esattamente come lo sarebbe
// di reconcile-pokemon.js in un run reale.
//
// Onestà sui limiti (importante quanto i casi che passano): alcuni dei 25 casi
// del test plan del design doc richiedono un segnale che questa pipeline v1
// NON possiede offline (es. "lingua mancante" richiede sapere quali lingue la
// fonte dovrebbe avere — non deducibile confrontando solo righe già presenti
// in DraGold tra loro). Questi casi sono marcati `gap: true` con una nota
// esplicita invece di essere forzati a un esito finto.

export const POKEMON_TEST_CASES = [
  {
    id: 'case-01-match-clean-isolated',
    description: 'Riga isolata, nessuna anomalia — caso di controllo positivo (analogo più vicino a "MATCH" nello scope di questa pipeline: la vera categoria MATCH del design doc confronta DraGold contro un fetch live della fonte, fuori scope qui — vedi nota in fondo al file). Comportamento reale verificato: senza una `referenceSource` dichiarata, Pass 5 classifica comunque la riga isolata come UNKNOWN a bassa confidenza (nessun match trovato, nessuna direzione MISSING/EXTRA deducibile) — NON zero findings. "Pulito" qui significa: nessun EXACT_DUPLICATE/CANONICAL_IDENTITY_SPLIT/SOURCE_CONFLICT, non l\'assenza totale di output diagnostico.',
    rows: [
      { id: 'c1-tcgdex-1', tcg: 'pokemon', source: 'tcgdex', source_id: 'sv1-1', set_id: 'sv1', lang: 'en', card_number: '1', canonical_card_id: 'canon-c1', name: 'Sprigatito', rarity: 'Common' },
    ],
    expect: {
      findingsCount: 1,
      mustInclude: [{ finding: 'UNKNOWN', category: 'MISMATCH', subtype: 'SINGLE_SOURCE_NO_REFERENCE_DECLARED', confidence: 'UNVERIFIED' }],
      mustNotInclude: [{ finding: 'EXACT_DUPLICATE' }, { finding: 'CANONICAL_IDENTITY_SPLIT' }, { finding: 'SOURCE_CONFLICT' }],
    },
  },

  {
    id: 'case-02-missing',
    description: 'MISSING: riga presente solo in una source diversa dalla reference dichiarata, nessuna corrispondenza nello scope.',
    rows: [
      { id: 'c2-ptcg-1', tcg: 'pokemon', source: 'ptcg', source_id: 'sv1-2', set_id: 'sv1', lang: 'en', card_number: '2', canonical_card_id: 'canon-c2', name: 'Fuecoco' },
    ],
    options: { referenceSource: 'tcgdex' },
    expect: { mustInclude: [{ finding: 'MISSING', category: 'MISSING', confidence: 'LOW', recommended_action: 'INGEST_CANDIDATE' }] },
  },

  {
    id: 'case-03-extra',
    description: 'EXTRA: riga presente nella source di riferimento, nessuna corrispondenza altrove nello scope.',
    rows: [
      { id: 'c3-tcgdex-1', tcg: 'pokemon', source: 'tcgdex', source_id: 'sv1-3', set_id: 'sv1', lang: 'en', card_number: '3', canonical_card_id: 'canon-c3', name: 'Quaxly' },
    ],
    options: { referenceSource: 'tcgdex' },
    expect: { mustInclude: [{ finding: 'EXTRA', category: 'EXTRA', confidence: 'LOW', recommended_action: 'REVIEW' }] },
  },

  {
    id: 'case-04-set-id-errato',
    description: 'set_id errato: stesso source_id normalizzato cross-source, ma set_id diverso tra le due righe → canonical_card_id diverso. Rilevato via Pass 2 (source_id), non via Pass -1/3 (che richiedono set_id uguale nella natural key).',
    rows: [
      { id: 'c4-tcgdex-1', tcg: 'pokemon', source: 'tcgdex', source_id: 'tk-4', set_id: 'tk', lang: 'fr', card_number: '4', canonical_card_id: 'canon-c4-a', name: 'Évoli' },
      { id: 'c4-ptcg-1', tcg: 'pokemon', source: 'ptcg', source_id: 'tk-4', set_id: 'tk-xy-su', lang: 'fr', card_number: '4', canonical_card_id: 'canon-c4-b', name: 'Évoli' },
    ],
    expect: { mustInclude: [{ finding: 'SOURCE_CONFLICT', category: 'SOURCE_CONFLICT', subtype: 'SOURCE_ID_MATCH_CANONICAL_MISMATCH', confidence: 'MEDIUM', recommended_action: 'REVIEW' }] },
  },

  {
    id: 'case-05-tk-style-collision',
    description: 'tk-style migrated set_id: due carte fisicamente DIVERSE (Évoli vs Latias) collidono sulla stessa natural key (set_id="tk" appiattito, stesso card_number) dalla STESSA fonte. La guardia sul nome in identity-cascade.js deve instradarle come collisione (SOURCE_CONFLICT), MAI come CANONICAL_IDENTITY_SPLIT.',
    rows: [
      { id: 'c5-tcgdex-evoli', tcg: 'pokemon', source: 'tcgdex', source_id: 'tk-xy-su-4', set_id: 'tk', lang: 'fr', card_number: '4', canonical_card_id: 'canon-c5-a', name: 'Évoli', rarity: 'Promo' },
      { id: 'c5-tcgdex-latias', tcg: 'pokemon', source: 'tcgdex', source_id: 'tk-ex-latia-4', set_id: 'tk', lang: 'fr', card_number: '4', canonical_card_id: 'canon-c5-b', name: 'Latias', rarity: 'Promo' },
    ],
    expect: {
      mustInclude: [{ finding: 'SOURCE_CONFLICT', category: 'SOURCE_CONFLICT', subtype: 'NATURAL_KEY_COLLISION_LIKELY_DIFFERENT_CARDS', confidence: 'MEDIUM', recommended_action: 'REQUIRES_MANUAL_SPLIT' }],
      mustNotInclude: [{ finding: 'CANONICAL_IDENTITY_SPLIT' }, { finding: 'EXACT_DUPLICATE' }],
    },
  },

  {
    id: 'case-06-p-style-mixed-population',
    description: 'P-style mixed population: numerazione mista tra fonti nello stesso set promo, nessuna chiave esatta combacia, nomi diversi. Nessun pass a chiave esatta né la guardia di Pass 4 (nomi diversi) permette un match — resta correttamente UNKNOWN, non forzato in una categoria specifica.',
    rows: [
      { id: 'c6-tcgdex-1', tcg: 'pokemon', source: 'tcgdex', source_id: 'smp-SM01', set_id: 'smp', lang: 'en', card_number: 'SM01', canonical_card_id: 'canon-c6-a', name: 'Pikachu Promo A' },
      { id: 'c6-ptcg-1', tcg: 'pokemon', source: 'ptcg', source_id: 'smp-1', set_id: 'smp', lang: 'en', card_number: '1', canonical_card_id: 'canon-c6-b', name: 'Pikachu Promo B' },
    ],
    expect: { mustInclude: [{ finding: 'UNKNOWN', category: 'MISMATCH', subtype: 'SINGLE_SOURCE_NO_REFERENCE_DECLARED', confidence: 'UNVERIFIED' }] },
  },

  {
    id: 'case-07-sv-to-svp-migrated',
    description: 'SV → SV-P: stesso nome, stesso card_number normalizzato, set_id diverso (famiglia diversa) — nessuna chiave esatta combacia (natural key richiede set_id uguale), il segnale arriva solo dal Pass 4 (un solo asse — il set — varia).',
    rows: [
      { id: 'c7-tcgdex-1', tcg: 'pokemon', source: 'tcgdex', source_id: 'sv1-25', set_id: 'sv1', lang: 'en', card_number: '25', canonical_card_id: 'canon-c7-a', name: 'Charizard ex' },
      { id: 'c7-ptcg-1', tcg: 'pokemon', source: 'ptcg', source_id: 'svp-25', set_id: 'svp', lang: 'en', card_number: '25', canonical_card_id: 'canon-c7-b', name: 'Charizard ex' },
    ],
    expect: { mustInclude: [{ finding: 'POSSIBLE_MIGRATED_ID', category: 'POSSIBLE_MIGRATED_ID', subtype: 'POSSIBLE_MIGRATED_ID_CANDIDATE', confidence: 'LOW', recommended_action: 'REVIEW' }] },
  },

  {
    id: 'case-08-same-source-id-cross-source',
    description: 'Stesso source_id, stesso set_id/card_number, canonical coerente — caso "pulito", catturato indipendentemente da Pass 0/2/3, deduplicato a un solo finding EXACT_DUPLICATE.',
    rows: [
      { id: 'c8-tcgdex-1', tcg: 'pokemon', source: 'tcgdex', source_id: 'sv1-77', set_id: 'sv1', lang: 'en', card_number: '77', canonical_card_id: 'canon-c8', name: 'Gardevoir' },
      { id: 'c8-ptcg-1', tcg: 'pokemon', source: 'ptcg', source_id: 'sv1-77', set_id: 'sv1', lang: 'en', card_number: '77', canonical_card_id: 'canon-c8', name: 'Gardevoir' },
    ],
    expect: {
      findingsCount: 1,
      mustInclude: [{ finding: 'EXACT_DUPLICATE', category: 'EXACT_DUPLICATE', subtype: 'CROSS_SOURCE_SAME_CANONICAL', confidence: 'VERIFIED', recommended_action: 'KEEP_BOTH_MARK_PRIMARY' }],
    },
  },

  {
    id: 'case-09-exact-duplicate-clean-with-conflict',
    description: 'EXACT_DUPLICATE ptcg/tcgdex, canonical coerente (analogo al range 100-199 verificato su svp/en) + SOURCE_CONFLICT ortogonale su image_url.',
    rows: [
      { id: 'c9-tcgdex-1', tcg: 'pokemon', source: 'tcgdex', source_id: 'svp-144', set_id: 'svp', lang: 'en', card_number: '144', canonical_card_id: 'canon-c9', name: 'Gouging Fire ex', image_url: 'https://assets.tcgdex.net/en/svp/144/high.webp' },
      { id: 'c9-ptcg-1', tcg: 'pokemon', source: 'ptcg', source_id: 'svp-144', set_id: 'svp', lang: 'en', card_number: '144', canonical_card_id: 'canon-c9', name: 'Gouging Fire ex', image_url: 'https://images.pokemontcg.io/svp/144_hires.png' },
    ],
    expect: {
      mustInclude: [
        { finding: 'EXACT_DUPLICATE', category: 'EXACT_DUPLICATE', subtype: 'CROSS_SOURCE_SAME_CANONICAL', confidence: 'VERIFIED' },
        { finding: 'SOURCE_CONFLICT', category: 'SOURCE_CONFLICT', subtype: 'FIELD_DIVERGENCE', confidence: 'VERIFIED', recommended_action: 'REQUIRES_FIELD_LEVEL_PRIORITY_DECISION' },
      ],
    },
  },

  {
    id: 'case-10-source-conflict-rarity',
    description: 'Source conflict su un campo diverso (rarity), stesso canonical.',
    rows: [
      { id: 'c10-tcgdex-1', tcg: 'pokemon', source: 'tcgdex', source_id: 'sv2-10', set_id: 'sv2', lang: 'en', card_number: '10', canonical_card_id: 'canon-c10', name: 'Growlithe', rarity: 'Common' },
      { id: 'c10-ptcg-1', tcg: 'pokemon', source: 'ptcg', source_id: 'sv2-10', set_id: 'sv2', lang: 'en', card_number: '10', canonical_card_id: 'canon-c10', name: 'Growlithe', rarity: 'Uncommon' },
    ],
    expect: {
      mustInclude: [{ finding: 'SOURCE_CONFLICT', category: 'SOURCE_CONFLICT', subtype: 'FIELD_DIVERGENCE', confidence: 'VERIFIED' }],
    },
  },

  {
    id: 'case-11-language-missing',
    gap: true,
    description: 'LANGUAGE_MISSING: GAP DICHIARATO. Richiederebbe di sapere quali lingue la fonte pubblica per questo canonical group (es. TCGdex ne pubblica 10+) per dire che una manca — informazione che non esiste confrontando solo righe già presenti in DraGold tra loro. Non implementato in v1, non forzato a un esito finto.',
    rows: [],
    expect: { skip: true },
  },

  {
    id: 'case-12-variant-candidate-pokemon',
    description: 'VARIANT_CANDIDATE: la fonte espone `variants` (holo/reverse), print_variant resta vuoto — segnale deterministico, non fuzzy.',
    rows: [
      { id: 'c12-tcgdex-1', tcg: 'pokemon', source: 'tcgdex', source_id: 'sv1-199', set_id: 'sv1', lang: 'en', card_number: '199', canonical_card_id: 'canon-c12', name: 'Iron Hands ex', print_variant: null, variants: { normal: true, reverse: true, holo: false, firstEdition: false } },
    ],
    expect: { mustInclude: [{ finding: 'VARIANT_CANDIDATE', category: 'VARIANT_CANDIDATE', subtype: 'SOURCE_VARIANT_FIELD_PRESENT', confidence: 'VERIFIED', recommended_action: 'SCHEMA_GAP' }] },
  },

  {
    id: 'case-13-parallel-onepiece-variant',
    description: 'Parallel (One Piece): stesso meccanismo di case 12, applicato a un TCG diverso per dimostrare che classifyVariantSignals è source-agnostico (design doc, sezione K: "il design deve restare source-agnostic").',
    rows: [
      { id: 'c13-optcg-1', tcg: 'onepiece', source: 'optcg', source_id: 'OP06-106', set_id: 'OP-06', lang: 'en', card_number: 'OP06-106', canonical_card_id: 'canon-c13', name: 'Kouzuki Hiyori', print_variant: null, variants: { parallel: true } },
    ],
    expect: { mustInclude: [{ finding: 'VARIANT_CANDIDATE', category: 'VARIANT_CANDIDATE', subtype: 'SOURCE_VARIANT_FIELD_PRESENT', confidence: 'VERIFIED', recommended_action: 'SCHEMA_GAP' }] },
  },

  {
    id: 'case-14-reprint-with-rarity-corroboration',
    description: 'REPRINT: stesso nome, set e card_number diversi (entrambi gli assi variano) — cluster prodotto SOLO perché rarity coincide come segnale corroborante (guardia anti-Pikachu).',
    rows: [
      { id: 'c14-tcgdex-1', tcg: 'pokemon', source: 'tcgdex', source_id: 'base1-4', set_id: 'base1', lang: 'en', card_number: '4', canonical_card_id: 'canon-c14-a', name: 'Charizard', rarity: 'Rare Holo' },
      { id: 'c14-tcgdex-2', tcg: 'pokemon', source: 'tcgdex', source_id: 'legacy-4', set_id: 'legacy', lang: 'en', card_number: '58', canonical_card_id: 'canon-c14-b', name: 'Charizard', rarity: 'Rare Holo' },
    ],
    expect: { mustInclude: [{ finding: 'REPRINT', category: 'REPRINT', subtype: 'REPRINT_CANDIDATE', confidence: 'LOW', recommended_action: 'REVIEW' }] },
  },

  {
    id: 'case-15-duplicate-with-fk',
    description: 'EXACT_DUPLICATE con dipendenze FK-enforced (card_prices, hot_picks) su una delle due righe — verificato in combinazione con dependency-check.js, non solo con classify-findings.js (vedi test dedicato).',
    rows: [
      { id: 'c15-tcgdex-1', tcg: 'pokemon', source: 'tcgdex', source_id: 'sv3-1', set_id: 'sv3', lang: 'en', card_number: '1', canonical_card_id: 'canon-c15', name: 'Bulbasaur' },
      { id: 'c15-ptcg-1', tcg: 'pokemon', source: 'ptcg', source_id: 'sv3-1', set_id: 'sv3', lang: 'en', card_number: '1', canonical_card_id: 'canon-c15', name: 'Bulbasaur' },
    ],
    dependencyMap: {
      'c15-tcgdex-1': { card_prices: 3, hot_picks: 1 },
    },
    expect: {
      mustInclude: [{ finding: 'EXACT_DUPLICATE', category: 'EXACT_DUPLICATE', subtype: 'CROSS_SOURCE_SAME_CANONICAL' }],
    },
    expectDependencies: { hasFkEnforcedDependency: true, fkEnforcedTotal: 4 },
  },

  {
    id: 'case-16-duplicate-without-fk',
    description: 'EXACT_DUPLICATE senza alcuna dipendenza (né FK-enforced né reference-only) su entrambi i lati.',
    rows: [
      { id: 'c16-tcgdex-1', tcg: 'pokemon', source: 'tcgdex', source_id: 'sv3-2', set_id: 'sv3', lang: 'en', card_number: '2', canonical_card_id: 'canon-c16', name: 'Ivysaur' },
      { id: 'c16-ptcg-1', tcg: 'pokemon', source: 'ptcg', source_id: 'sv3-2', set_id: 'sv3', lang: 'en', card_number: '2', canonical_card_id: 'canon-c16', name: 'Ivysaur' },
    ],
    dependencyMap: {},
    expect: {
      mustInclude: [{ finding: 'EXACT_DUPLICATE', category: 'EXACT_DUPLICATE', subtype: 'CROSS_SOURCE_SAME_CANONICAL' }],
    },
    expectDependencies: { hasAnyDependency: false },
  },

  {
    id: 'case-17-two-different-pikachu-same-name',
    description: 'Due carte fisicamente diverse che condividono solo il nome (nessuna relazione reale) — DEVONO restare non collegate: nessun EXACT_DUPLICATE, nessun CANONICAL_IDENTITY_SPLIT, nessun finding fuzzy (guardia "entrambi gli assi variano + rarity diversa" in identity-cascade.js).',
    rows: [
      { id: 'c17-tcgdex-1', tcg: 'pokemon', source: 'tcgdex', source_id: 'base1-58', set_id: 'base1', lang: 'en', card_number: '58', canonical_card_id: 'canon-c17-a', name: 'Pikachu', rarity: 'Common' },
      { id: 'c17-tcgdex-2', tcg: 'pokemon', source: 'tcgdex', source_id: 'swshp-SWSH001', set_id: 'swshp', lang: 'en', card_number: 'SWSH001', canonical_card_id: 'canon-c17-b', name: 'Pikachu', rarity: 'Promo' },
    ],
    expect: {
      mustNotInclude: [{ finding: 'EXACT_DUPLICATE' }, { finding: 'CANONICAL_IDENTITY_SPLIT' }, { finding: 'REPRINT' }, { finding: 'VARIANT_CANDIDATE' }, { finding: 'POSSIBLE_MIGRATED_ID' }],
    },
  },

  {
    id: 'case-18-same-card-number-different-set',
    description: 'Stesso card_number, set_id realmente diverso (non un bug — due set legittimamente diversi) → non un match: natural key diversa per costruzione (include set_id).',
    rows: [
      { id: 'c18-tcgdex-1', tcg: 'pokemon', source: 'tcgdex', source_id: 'sv1-1', set_id: 'sv1', lang: 'en', card_number: '1', canonical_card_id: 'canon-c18-a', name: 'Sprigatito' },
      { id: 'c18-tcgdex-2', tcg: 'pokemon', source: 'tcgdex', source_id: 'sv2-1', set_id: 'sv2', lang: 'en', card_number: '1', canonical_card_id: 'canon-c18-b', name: 'Skeledirge' },
    ],
    expect: { mustNotInclude: [{ finding: 'EXACT_DUPLICATE' }, { finding: 'CANONICAL_IDENTITY_SPLIT' }, { finding: 'SOURCE_CONFLICT' }] },
  },

  {
    id: 'case-19-weak-signal-same-card-variant-hint',
    description: 'Segnale debole "stessa carta potenzialmente" — nome uguale, stesso set, card_number diverso: unico asse che varia (numero), quindi VARIANT_CANDIDATE_HINT via Pass 4 (nota: la pipeline richiede nome ESATTAMENTE uguale dopo normalizzazione — non fa fuzzy string distance sul nome stesso, limite dichiarato).',
    rows: [
      { id: 'c19-tcgdex-1', tcg: 'pokemon', source: 'tcgdex', source_id: 'promo-10', set_id: 'promo', lang: 'en', card_number: '10', canonical_card_id: 'canon-c19-a', name: 'Mew' },
      { id: 'c19-tcgdex-2', tcg: 'pokemon', source: 'tcgdex', source_id: 'promo-11', set_id: 'promo', lang: 'en', card_number: '11', canonical_card_id: 'canon-c19-b', name: 'Mew' },
    ],
    expect: { mustInclude: [{ finding: 'VARIANT_CANDIDATE', category: 'VARIANT_CANDIDATE', subtype: 'VARIANT_CANDIDATE_HINT', confidence: 'LOW', recommended_action: 'REVIEW' }] },
  },

  {
    id: 'case-20-canonical-null-on-one-side',
    description: 'canonical_card_id NULL su un lato, presente sull\'altro, stessa natural key — CANONICAL_IDENTITY_SPLIT subtype CANONICAL_ID_MISSING_ON_ONE_SIDE.',
    rows: [
      { id: 'c20-tcgdex-1', tcg: 'pokemon', source: 'tcgdex', source_id: 'sv3-9', set_id: 'sv3', lang: 'en', card_number: '9', canonical_card_id: null, name: 'Eevee' },
      { id: 'c20-ptcg-1', tcg: 'pokemon', source: 'ptcg', source_id: 'sv3-9', set_id: 'sv3', lang: 'en', card_number: '9', canonical_card_id: 'canon-c20', name: 'Eevee' },
    ],
    expect: { mustInclude: [{ finding: 'CANONICAL_IDENTITY_SPLIT', category: 'SCHEMA_GAP', subtype: 'CANONICAL_ID_MISSING_ON_ONE_SIDE', confidence: 'VERIFIED', recommended_action: 'REQUIRES_CANONICAL_MERGE_DECISION' }] },
  },

  {
    id: 'case-21-source-id-null',
    gap: true,
    description: 'source_id NULL: GAP DICHIARATO. La riga resta semplicemente esclusa dai pass che richiedono source_id (Pass 1/2); se isolata finisce in Pass 5 come UNKNOWN generico (MISMATCH/SINGLE_SOURCE_NO_REFERENCE_DECLARED), non come SCHEMA_GAP dedicato — la pipeline v1 non distingue ancora "dato incompleto" da "nessuna corrispondenza trovata". Verificato qui il comportamento REALE, non quello aspirazionale.',
    rows: [
      { id: 'c21-tcgdex-1', tcg: 'pokemon', source: 'tcgdex', source_id: null, set_id: 'sv4', lang: 'en', card_number: '1', canonical_card_id: 'canon-c21', name: 'Torchic' },
    ],
    expect: { mustInclude: [{ finding: 'UNKNOWN', category: 'MISMATCH', subtype: 'SINGLE_SOURCE_NO_REFERENCE_DECLARED' }] },
  },

  {
    id: 'case-22-set-id-null',
    gap: true,
    description: 'set_id NULL: GAP DICHIARATO, stesso principio del case 21 — la riga è esclusa dalla natural key (Pass -1/3 la ignorano) e finisce come UNKNOWN generico in Pass 5.',
    rows: [
      { id: 'c22-tcgdex-1', tcg: 'pokemon', source: 'tcgdex', source_id: 'unknown-1', set_id: null, lang: 'en', card_number: '1', canonical_card_id: 'canon-c22', name: 'Torterra' },
    ],
    expect: { mustInclude: [{ finding: 'UNKNOWN', category: 'MISMATCH', subtype: 'SINGLE_SOURCE_NO_REFERENCE_DECLARED' }] },
  },

  {
    id: 'case-23-source-primary-more-complete-on-field',
    description: 'Source primaria (tcgdex) più completa su un campo (image_url_hi) — asimmetria di completezza, NON un conflitto: nessun valore in disaccordo, solo assente da un lato. Riportato come nota informativa dentro l\'evidence di EXACT_DUPLICATE.',
    rows: [
      { id: 'c23-tcgdex-1', tcg: 'pokemon', source: 'tcgdex', source_id: 'sv4-5', set_id: 'sv4', lang: 'en', card_number: '5', canonical_card_id: 'canon-c23', name: 'Torkoal', image_url_hi: 'https://assets.tcgdex.net/en/sv4/5/high.webp' },
      { id: 'c23-ptcg-1', tcg: 'pokemon', source: 'ptcg', source_id: 'sv4-5', set_id: 'sv4', lang: 'en', card_number: '5', canonical_card_id: 'canon-c23', name: 'Torkoal', image_url_hi: null },
    ],
    expect: {
      mustInclude: [{ finding: 'EXACT_DUPLICATE', category: 'EXACT_DUPLICATE' }],
    },
    expectFieldCompletenessAsymmetry: [{ field: 'image_url_hi', missing_on_sources: ['ptcg'] }],
  },

  {
    id: 'case-24-source-secondary-more-complete-on-field',
    description: 'Source secondaria (ptcg) più completa su un campo diverso (rarity) — stesso principio del case 23, direzione opposta, per dimostrare che la nota è simmetrica e non presuppone quale fonte sia "migliore" in generale.',
    rows: [
      { id: 'c24-tcgdex-1', tcg: 'pokemon', source: 'tcgdex', source_id: 'sv4-6', set_id: 'sv4', lang: 'en', card_number: '6', canonical_card_id: 'canon-c24', name: 'Skiddo', rarity: null },
      { id: 'c24-ptcg-1', tcg: 'pokemon', source: 'ptcg', source_id: 'sv4-6', set_id: 'sv4', lang: 'en', card_number: '6', canonical_card_id: 'canon-c24', name: 'Skiddo', rarity: 'Common' },
    ],
    expect: {
      mustInclude: [{ finding: 'EXACT_DUPLICATE', category: 'EXACT_DUPLICATE' }],
    },
    expectFieldCompletenessAsymmetry: [{ field: 'rarity', missing_on_sources: ['tcgdex'] }],
  },

  {
    id: 'case-25-canonical-identity-split-real-svp-044',
    description: 'IL CASO PIÙ IMPORTANTE. Dati reali verificati READ-ONLY su Supabase (pimwkmwrduqkaydyvxqz, sessione di analisi): pokemon:tcgdex:svp-044:en (card_number="044", zero-padded nativo nella fonte TCGdex) vs pokemon:ptcg:svp-44 (card_number="44", pokemontcg.io non fa mai padding — sync-pokemon-ptcg.js:110). Nessuna normalizzazione cross-source prima del matching in produzione: canonical_cards, unique su (tcg,set_id,card_number), ha creato due gruppi canonici distinti per la stessa carta fisica (Charmander). Deve essere CANONICAL_IDENTITY_SPLIT, MAI EXACT_DUPLICATE, perché nel modello attuale i due canonical_card_id sono realmente diversi.',
    rows: [
      { id: 'pokemon:tcgdex:svp-044:en', tcg: 'pokemon', source: 'tcgdex', source_id: 'svp-044', set_id: 'svp', lang: 'en', card_number: '044', canonical_card_id: '34e65567-97b9-4007-98ea-b94ccd82e75e', name: 'Charmander' },
      { id: 'pokemon:ptcg:svp-44', tcg: 'pokemon', source: 'ptcg', source_id: 'svp-44', set_id: 'svp', lang: 'en', card_number: '44', canonical_card_id: 'e05713fc-0790-4034-a2c5-f31092004918', name: 'Charmander' },
    ],
    expect: {
      mustInclude: [{
        finding: 'CANONICAL_IDENTITY_SPLIT',
        category: 'SCHEMA_GAP',
        subtype: 'CARD_NUMBER_FORMAT_MISMATCH',
        confidence: 'VERIFIED',
        recommended_action: 'REQUIRES_CANONICAL_MERGE_DECISION',
      }],
      mustNotInclude: [{ finding: 'EXACT_DUPLICATE' }],
    },
  },
];
