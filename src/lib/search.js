import { JP_NAME_ALIASES, LANG_ALIASES, RARITY_TOKENS } from './searchData.js';
import { supabase, supabaseReady } from '../supabase.js';

export function norm(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
export function tokenize(s) { return (s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean); }

// Pattern ilike per la ricerca su card_number_norm (colonna generata lato DB, vedi
// migration supabase/migrations/20260820_card_number_norm.sql: stesso algoritmo di
// norm() applicato a card_number — minuscolo, senza separatori — così un ilike
// substring semplice basta a matchare "P-159"/"P 159"/"P159"/"p-159" con un'unica
// query, indipendentemente da quale separatore (o nessuno) l'utente ha digitato o il
// DB ha salvato. Generico per qualsiasi TCG/formato codice: nessuna logica specifica
// per set o gioco. Un input puramente numerico (es. "159") produce lo stesso pattern
// di un semplice substring match — non viene mai riscritto in un card code con
// prefisso lettera arbitrario.
export function cardCodeIlikePattern(normalizedCode, wildcard = '%') {
  return `${wildcard}${normalizedCode}${wildcard}`;
}
// Raggruppa varianti linguistiche/regionali della stessa carta usando ESCLUSIVAMENTE
// canonical_card_id — mai nome normalizzato, string similarity, numero carta da solo,
// set+nome o fuzzy matching. Due record con canonical_card_id diversi restano SEMPRE
// carte distinte, anche se i nomi sono identici o molto simili (es. ristampe con lo
// stesso nome in set diversi). Record con canonical_card_id nullo non vengono MAI
// raggruppati con nessun altro record (ognuno resta la propria entry, chiave fallback
// unica per id) — nessuna euristica di somiglianza viene usata come sostituto.
// Nomi carta (es. "___'s Pikachu") non vengono mai letti, normalizzati o alterati qui.
export function groupByCanonical(cards) {
  const order = [];
  const groups = new Map();
  for (const c of cards) {
    const key = c.canonical_card_id != null ? `c:${c.canonical_card_id}` : `solo:${c.id}`;
    let g = groups.get(key);
    if (!g) { g = []; groups.set(key, g); order.push(key); }
    g.push(c);
  }
  return order.map(key => {
    const group = groups.get(key);
    if (group.length === 1) return group[0];
    // Rappresentante: preferisce EN, altrimenti il primo della query (ordine già
    // deciso a monte dalla query/expand, non da similarity).
    const primary = group.find(c => c.lang === 'en') || group[0];
    const langs = [...new Set(group.map(c => c.lang).filter(Boolean))];
    // variantEntries: id/lang/print_variant/slug per ogni riga del gruppo, cosi'
    // la UI (SearchResultItem) puo' linkare direttamente a /carta/{slug}?lang=xx
    // per la stampa esatta scelta, invece di aprire sempre il primary EN.
    const variantEntries = group.map(c => ({
      id: c.id, lang: c.lang, print_variant: c.print_variant || null,
      slug: c.canonical_cards?.slug || null,
    }));
    return { ...primary, variantCount: group.length - 1, variantLangs: langs, variantEntries };
  });
}

export function rankSearchResults(cards, rawQuery) {
  const q = norm(rawQuery);
  const qWords = tokenize(rawQuery);
  const aliasList = [...(JP_NAME_ALIASES[q] || []), ...qWords.flatMap(w => JP_NAME_ALIASES[w] || [])];
  const tier = (c) => {
    const n = norm(c.name || '');
    const ne = norm(c.name_en || '');
    const nWords = tokenize(c.name || '');
    const neWords = tokenize(c.name_en || '');
    const allWords = [...nWords, ...neWords];
    // Match esatto sul card code (a formattazione normalizzata, es. query "p159" contro
    // card_number "P-159") viene prima di tutto: è un identificativo preciso, non un
    // nome — se l'utente ha digitato esattamente un codice esistente, quella è la carta
    // che cerca. Non tocca il ranking per query di solo nome (card_number raramente
    // coincide con un nome normalizzato).
    if (norm(c.card_number || '') === q) return -1;
    if (n === q) return 0;
    if (ne === q) return 1;
    if (n.startsWith(q) || ne.startsWith(q)) return 2;
    if (qWords.length <= 1) {
      const w = qWords[0] || q;
      if (w && allWords.some(word => word === w)) return 3;
      if (w && allWords.some(word => word.startsWith(w))) return 3;
    } else if (qWords.every(qw => allWords.some(word => word === qw || word.startsWith(qw)))) {
      return 4;
    }
    if (aliasList.length && aliasList.some(a => (c.name || '').includes(a))) return 5;
    return 6;
  };
  return [...cards].sort((a, b) => {
    const ta = tier(a), tb = tier(b);
    if (ta !== tb) return ta - tb;
    const cn = (a.card_number || '').localeCompare(b.card_number || '');
    if (cn !== 0) return cn;
    return (a.id || '').localeCompare(b.id || '');
  });
}

// Motore di ricerca condiviso -- estratto da SearchView.jsx (Card ID microproduct,
// 2026-08-26) cosi' /card-id puo' riusare la stessa logica di matching (lang-token
// parsing, expand multilingua via canonical_card_id, filtro falsi positivi) invece
// di duplicarla in un secondo motore di ricerca. Comportamento identico a prima:
// stesso codice, solo spostato e reso riusabile. Il caricamento prezzi (specifico
// della UI di SearchView) resta nel chiamante.
export async function searchCards(rawQuery) {
  const trimmed = (rawQuery || '').trim();
  if (!trimmed) return [];
  if (!supabaseReady) throw new Error("Backend non configurato.");
  const normQ = norm(trimmed);
  const hasSpaces = trimmed.includes(' ');
  // Normalizza query: rimuove punteggiatura, splitta in token significativi (≥2 char)
  const words = trimmed.toLowerCase().replace(/[^a-z0-9 ]/gi, ' ')
    .trim().split(/\s+/).filter(w => w.length >= 2);

  let dbQuery = supabase
    .from('cards')
    .select('id,name,name_en,set_name,set_id,card_number,image_url,lang,tcg,rarity,canonical_card_id,print_variant,card_image_cache(cached_url,status),canonical_cards!cards_canonical_card_id_fkey(slug)');

  // Separa lang-token (es. "jp","ja","en") dai content-token (es. "charizard","op05").
  // I lang-token NON entrano nell'AND della query DB: le carte JP hanno nome giapponese,
  // quindi name.ilike.*jp* non matcha mai. Vengono risolti e usati nell'expand sotto.
  const LANG_CODES_SET = new Set(['en','ja','it','es','pt','id','ko','fr','de']);
  const langFilterCodes = []; // codici lingua risolti (es. "ja")
  const contentTokens = [];
  for (const w of words) {
    const alias = LANG_ALIASES[w];
    if (alias) { langFilterCodes.push(alias); }
    else if (LANG_CODES_SET.has(w)) { langFilterCodes.push(w); }
    else { contentTokens.push(w); }
  }

  // Limit più alto per ricerche con filtro lingua: serve raccogliere tutti i card_number
  // del set (es. OP05 ha 119 carte) prima dell'expand. Per ricerche normali 80 basta.
  dbQuery = dbQuery.limit(400);

  if (words.length > 0) {
    // Query DB con solo content-token; se tutti lang (raro), usa words originali
    const tokensForQuery = contentTokens.length > 0 ? contentTokens : words;
    for (const w of tokensForQuery) {
      const sw = w.replace(/[*%()]/g, '');
      if (!sw) continue;
      // Token con cifre o trattino → codice set/carta (es. sv03, OP05-119) → cerca ovunque
      // Token solo lettere (es. pikachu, charizard) → cerca SOLO in name
      const swIsCode = /\d/.test(sw) || sw.includes('-'); const jpA = JP_NAME_ALIASES[sw] || [];
      const orParts = [`name.ilike.*${sw}*`, `name_en.ilike.*${sw}*`, ...jpA.map(a => `name.ilike.*${a}*`)];
      if (swIsCode) {
        // card_number.ilike sul valore grezzo copre la formattazione esatta salvata nel
        // DB; card_number_norm.ilike (colonna generata, separatori rimossi + minuscolo)
        // copre in più i casi in cui la punteggiatura digitata dall'utente non coincide
        // con quella nel DB (es. utente "OP01001" contro DB "OP01-001") — vedi
        // cardCodeIlikePattern sopra. Aggiunta, non sostituzione: nessuna perdita di
        // match già coperti dal confronto sul valore grezzo.
        orParts.push(`card_number.ilike.*${sw}*`, `card_number_norm.ilike.${cardCodeIlikePattern(norm(sw))}`, `set_name.ilike.*${sw}*`);
      }
      if (RARITY_TOKENS.has(sw)) orParts.push(`rarity.ilike.*${sw}*`);
      // Se il token è un alias/codice lang (solo quando è anche content, es. "en" da solo)
      const la = LANG_ALIASES[sw];
      if (la) orParts.push(`lang.eq.${la}`);
      else if (LANG_CODES_SET.has(sw)) orParts.push(`lang.eq.${sw}`);
      dbQuery = dbQuery.or(orParts.join(','));
    }
  } else {
    const sw = trimmed.replace(/[*%()]/g, '');
    const swIsCode = /\d/.test(sw) || sw.includes('-'); const jpA = JP_NAME_ALIASES[sw] || [];
    dbQuery = dbQuery.or(
      `name.ilike.*${sw}*,name_en.ilike.*${sw}*${jpA.map(a => `,name.ilike.*${a}*`).join('')}${swIsCode ? `,card_number.ilike.*${sw}*,card_number_norm.ilike.${cardCodeIlikePattern(norm(sw))},set_name.ilike.*${sw}*` : ''}${sw.length >= 4 && RARITY_TOKENS.has(sw) ? `,rarity.ilike.*${sw}*` : ''}`
    );
  }

  const { data, error: dbErr } = await dbQuery;
  if (dbErr) throw dbErr;

  let nameMatches = data || [];

  // Client-side filter: rimuove falsi positivi da set_name/card_number
  // Per query name-like (solo lettere, es. "pikachu"): richiede match su name
  // Per query codice (es. "sv03", "OP05"): controlla name + card_number
  if (!hasSpaces && normQ.length >= 3) {
    const qIsCode = /\d/.test(normQ) || normQ.includes('-'); const qJpA = JP_NAME_ALIASES[normQ] || [];
    nameMatches = nameMatches.filter(c =>
      norm(c.name || '').includes(normQ) || norm(c.name_en || '').includes(normQ) ||
      (qIsCode && norm(c.card_number || '').includes(normQ)) || (qJpA.length > 0 && qJpA.some(a => (c.name || '').includes(a)))
    );
  }

  let cards = nameMatches;
  if (langFilterCodes.length > 0 && nameMatches.length > 0) {
    // Expand per lingua: cerca versioni nella lingua richiesta usando gli stessi card_number.
    // Necessario perché le carte JP hanno nome giapponese nel DB (non matcha "charizard").
    const byTcg = {};
    for (const c of nameMatches) {
      if (!c.card_number) continue;
      if (!byTcg[c.tcg]) byTcg[c.tcg] = new Set();
      byTcg[c.tcg].add(c.card_number);
    }
    const allLangCards = [];
    for (const [tcgKey, numSet] of Object.entries(byTcg)) {
      const nums = [...numSet];
      if (!nums.length || nums.length > 400) continue;
      // Usa solo card_number con prefisso set (es. "sv3-125", "OP05-119").
      // I numeri bare (es. "006") causano collisioni cross-set nel DB:
      // Base Set Charizard e Jungle Beedrill condividono entrambi "006".
      const safeNums = nums.filter(n => /^[a-zA-Z].*-\d|^[a-zA-Z]{2,}\d{2,}/.test(n));
      if (!safeNums.length) continue;
      let lq = supabase
        .from('cards')
        .select('id,name,name_en,set_name,set_id,card_number,image_url,lang,tcg,rarity,canonical_card_id,print_variant,card_image_cache(cached_url,status),canonical_cards!cards_canonical_card_id_fkey(slug)')
        .eq('tcg', tcgKey)
        .in('card_number', safeNums);
      if (langFilterCodes.length === 1) lq = lq.eq('lang', langFilterCodes[0]);
      else lq = lq.in('lang', langFilterCodes);
      const { data: expanded } = await lq.limit(300);
      for (const c of (expanded || [])) allLangCards.push(c);
    }
    allLangCards.sort((a, b) => {
      const n = (a.card_number || '').localeCompare(b.card_number || '');
      return n !== 0 ? n : (a.name || '').localeCompare(b.name || '');
    });
    cards = allLangCards;
  } else {
    // Multi-language expand: trova versioni linguistiche delle stesse carte.
    // Attiva SOLO per query che sembrano set-code/card-number (es. "OP05", "sv03-006").
    // Per query generiche come "charizard", l'expand causa falsi positivi perché
    // card_number "006" in set diversi appartiene a pokemon completamente diversi.
    const looksLikeCardNum = words.some(w =>
      /^[a-z]{1,5}\d{2,}/i.test(w) || (w.includes('-') && w.length >= 5)
    );
    if (looksLikeCardNum && nameMatches.length > 0) {
      // Raggruppa i card_number per TCG (evita collisioni cross-TCG)
      const byTcg = {};
      for (const c of nameMatches) {
        if (!c.card_number) continue;
        if (!byTcg[c.tcg]) byTcg[c.tcg] = new Set();
        byTcg[c.tcg].add(c.card_number);
      }
      const knownIds = new Set(nameMatches.map(c => c.id));
      const allCards = [...nameMatches];
      for (const [tcgKey, numSet] of Object.entries(byTcg)) {
        const nums = [...numSet];
        if (!nums.length || nums.length > 400) continue;
        const { data: expanded } = await supabase
          .from('cards')
          .select('id,name,name_en,set_name,set_id,card_number,image_url,lang,tcg,canonical_card_id,print_variant,card_image_cache(cached_url,status),canonical_cards!cards_canonical_card_id_fkey(slug)')
          .eq('tcg', tcgKey)
          .in('card_number', nums)
          .limit(400);
        for (const c of (expanded || [])) {
          if (!knownIds.has(c.id)) { knownIds.add(c.id); allCards.push(c); }
        }
      }
      allCards.sort((a, b) => {
        const n = (a.card_number || '').localeCompare(b.card_number || '');
        return n !== 0 ? n : (a.lang || '').localeCompare(b.lang || '');
      });
      cards = allCards;
    } else if (nameMatches.length > 0) {
      // Entity-identity expand for plain name queries (es. "Pikachu"): il testo
      // da solo NON basta a coprire tutte le lingue — verificato su Supabase
      // (17/08/2026): name_en è popolato solo sul 36% delle righe ja e sullo 0%
      // di zh-tw/th/zh-cn/ko, quindi "pikachu" via ilike su name/name_en non
      // troverà mai quelle lingue anche se la carta esiste. canonical_card_id
      // è la vera chiave d'identità della carta (stesso approccio di TCGdex:
      // un id canonico language-independent, testo tradotto come overlay) —
      // già usata per raggruppare i risultati (groupByCanonical) ma non ancora
      // per ESPANDERE la ricerca prima del raggruppamento. Qui si prendono i
      // canonical_card_id già trovati dal text-match e si tirano dentro TUTTE
      // le righe che li condividono, cosi' groupByCanonical() sotto costruisce
      // un elenco variantLangs completo invece che limitato alle lingue il cui
      // testo ha fatto match diretto.
      const canonIds = [...new Set(nameMatches.map(c => c.canonical_card_id).filter(Boolean))];
      if (canonIds.length > 0 && canonIds.length <= 200) {
        const knownIds = new Set(nameMatches.map(c => c.id));
        const { data: canonExpand } = await supabase
          .from('cards')
          .select('id,name,name_en,set_name,set_id,card_number,image_url,lang,tcg,rarity,canonical_card_id,print_variant,card_image_cache(cached_url,status),canonical_cards!cards_canonical_card_id_fkey(slug)')
          .in('canonical_card_id', canonIds)
          .limit(2000);
        const merged = [...nameMatches];
        for (const c of (canonExpand || [])) {
          if (!knownIds.has(c.id)) { knownIds.add(c.id); merged.push(c); }
        }
        cards = merged;
      }
    }
  }

  // Raggruppa varianti lingua/regione della stessa carta (canonical_card_id, mai
  // similarity di nome — vedi lib/search.js). Non si raggruppa quando l'utente ha
  // chiesto esplicitamente una lingua (langFilterCodes.length>0): in quel caso
  // vuole vedere proprio quell'elenco, non una singola entry collassata.
  if (langFilterCodes.length === 0) cards = groupByCanonical(cards);
  cards = rankSearchResults(cards, trimmed);
  return cards;
}
