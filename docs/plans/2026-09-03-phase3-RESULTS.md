# Fase 3 — Portfolio Core — RISULTATI

> **Data:** 2026-09-02 · **Branch:** `feature/portfolio-core` (stacked su `feature/market-valuation-foundation`, pushato, non mergiato)
> **Piano:** `docs/plans/2026-09-03-phase3-portfolio-core.md` · Caveat consumati: `docs/plans/2026-09-03-phase2.1-hardening-RESULTS.md` §4.

---

## Sintesi

Il Portfolio non è più "una lista di carte con prezzo spot". Ora è **MY COLLECTION → MY MARKET VALUE**: consuma `market_valuations` (Fase 2.1) per dare **valore totale EUR**, **breakdown** (TCG / set / lingua), **confidence per posizione e aggregata** (mai un livello "High" finché la fonte è unica), **collection intelligence** e una sezione di prima classe per le **carte non ancora valutate** — senza inventare un numero dove il dato non c'è.

Un RPC risolve il debito `me4`/`me04` **a query-time** (`set_identity_key`), quindi il Portfolio non aspetta la migration di Fase 1.x.

---

## Per blocco

### 1. RPC — il ponte collection → valuation

**Problema.** `collection.card_api_id` non matcha sempre `market_valuations.card_id`: carte JA (fonte EN-only), namespace `pokemon:ptcg:*` con spelling non-canonico (`sv3pt5` vs `sv03.5`), set non ancora ingeriti.

**Soluzione.** Due RPC `security invoker` (`search_path=''`), lettura pubblica:
- **`portfolio_valuations(text[])`** — per ogni `card_api_id`: match **diretto** → fallback **`set_identity_key` + card_number_norm** (risolve `pokemon:ptcg:me2pt5-123` → `pokemon:tcgdex:me02.5-123:en`) → altrimenti `unavailable_reason` (`ja_not_covered` | `set_not_covered` | `no_data_yet` | `resolved_via_alias`). Ritorna valore EUR, confidence + reason, low/median/high, trend, `computed_at`.
- **`portfolio_value_history(text[], int)`** — serie giornaliera `unit_eur` da `market_observations`.
- **`set_identity_key(text)`** — gemella SQL di `setIdentityKey` JS.

**Alternative scartate.** Migrare i dati `cards` (20k righe, user-data re-pointing) → è la Fase 1.x, non deve bloccare il Portfolio. Client-side join senza fallback → lascerebbe fuori i `ptcg` risolvibili.

**Verification.** Su `card_api_id` reali: `OP10-025:en` → €0.10 medium (diretto); `me2pt5-123` → `me02.5-123` €0.16 (`resolved_via_alias`); `OP09-072:ja` → `ja_not_covered`. `get_advisors` → i 3 WARN `search_path` risolti con `set search_path=''`; nessun altro nuovo.

**Status.** local + branch + **applicato su produzione**.

---

### 2. Layer di aggregazione (puro)

`src/lib/portfolio/`:
- **`valuation.js`** — `buildPortfolioValuation({positions, valuations})` → `totalEur`, `byTcg/bySet/byLang`, `confidenceMix` (per valore), `concentration` (top1/5/10 %), `movers` (solo trend non-null), `mostValuable`, `unvalued[{reason}]`. Una posizione senza `estimated_value` **non contribuisce** ai totali (bug `Number(null)===0` sistemato).
- **`insights.js`** — `deriveInsights` produce insight **solo se supportate dai dati** (niente "biggest mover" senza trend; concentrazione solo con ≥3 posizioni). Tono descrittivo, **mai un consiglio**.
- **`unavailableReason.js`** — `explainUnavailable` + `groupUnvalued` (ignora `resolved_via_alias`).
- **`history.js`** — `buildValueHistory` → `state: 'building' | 'ok'` (`building` se < 3 giorni con valore).
- **`confidence.js`** — `normalizeConfidenceLevel`: **INVARIANTE testata** — `'high'` → `'none'` (mai un badge "High").

**Verification.** 15 test puri + 3 confidence. Pipeline eseguita sulla **collection reale (67 carte)**:
```
Total EUR: 1.04 · valued: 6/67 · unvalued: 61
  → Japanese cards: 45 · Not enough market data: 16
byTcg: One Piece €0.96 (92%) · Pokémon €0.08 (8%)
confidenceMix: 100% Medium (6), 0 Low, 61 none
concentration top1/5/10: 30% / 93% / 100%
insights: "Your 6 most valuable cards account for 100% of your tracked value" ·
          "Your most valuable set is 500 Years in the Future — €0.38 (37%)" ·
          "61 of your 67 cards aren't valued yet (Japanese printings, uncovered sets)"
```

---

### 3. Componenti UI

`src/pages/portfolio/`:
- **`ConfidenceBadge`** — chip `Medium` (neutro) / `Low` (ambra) / `Estimate pending` (grigio). **Nessun ramo `high`.** `title` dal `confidence_reason` ("3 observations · 1 source · updated today").
- **`PortfolioConfidence`** — barra segmentata **neutra** + "One market source (TCGplayer). Confidence rises as more sources and days of data accumulate."
- **`PortfolioBreakdown`** — tab By TCG / By Set / By Language, riga con valore EUR + barra % + count.
- **`CollectionIntelligence`** — insight come righe testuali; vuoto → non renderizza.
- **`UnvaluedSection`** — carte non valutate raggruppate per motivo, copy costruttivo, nessun rosso.
- **`portfolio-valuation.css`** — palette neutra + gold, **nessun verde/rosso di sfondo** (PRODUCT_SPEC §6).

---

### 4. `PortfolioView` — cablaggio

- Hero: **"Estimated Market Value"** = `€totalEur`. Sotto: `<PortfolioConfidence>`.
- P&L "vs your purchase price" **separato e invariato** (usa ancora `purchase_price` / spot USD) con nota esplicita.
- Fra hero e movers: `<PortfolioBreakdown>` + `<CollectionIntelligence>`.
- Movers / Most Valuable → dal valuation layer; `RailCard` mostra `<ConfidenceBadge>` quando non c'è trend.
- `PortfolioGridCard` / `PortfolioRow` → valore EUR + badge; **"Estimate pending"** se non valutata, mai un numero finto.
- Storico: `HeroChart` da `portfolio_value_history`, oppure pannello **"Your value history is being built — check back in a few days"** (oggi: 1 giorno di dati → stato `building`).
- Fondo: `<UnvaluedSection>`.
- **Firme componenti stabili** (nuovi prop opzionali) → merge-safe con `feat/ui-ux-image-price-overhaul` (che virtualizza la stessa view).

**Diff `PortfolioView.jsx`:** +183 / −129 (net +54). La logica pesante è in `src/lib/portfolio/` (5 moduli) + 5 componenti, non nel monolite.

---

## DraGold vNext — KPI Fase 3

| Metrica | Prima | Dopo |
|---|---|---|
| Portfolio: fonte del valore | `card_prices` spot (USD, stale da mesi) | **`market_valuations`** (EUR, Fase 2.1) |
| Confidence in UI | assente | badge per posizione + barra aggregata; **nessuno stato "High"** (onesto: 1 fonte) |
| Breakdown | solo filtro TCG | **TCG / Set / Lingua** con valore EUR + % |
| Collection intelligence | assente | concentrazione, set più prezioso, biggest mover, N non valutate — solo su dati reali |
| Carte non valutate | "N unpriced" generico | **sezione di prima classe** raggruppata per motivo (JA / set non coperti) con copy costruttivo |
| Debito `me4`/`me04` sul Portfolio | avrebbe rotto il match | **risolto a query-time** via `set_identity_key` (nessuna migration richiesta) |
| Storico valore | da `card_prices` (stale) | da `market_observations` + stato "in costruzione" (~2 settimane per il grafico) |
| Test | — | +18 (15 lib portfolio + 3 confidence); 22 src, 538 scripts, build verde |
| Security advisor | ok | 3 WARN `search_path` sulle nuove funzioni → risolti; 0 residui nuovi |

---

## Verifica

- **Test:** `npm test` (22) + `npm run test:scripts` (538) verdi. `npm run build` verde (tutti i componenti compilano).
- **DB:** RPC verificato su `card_api_id` reali (diretto / alias / ja / no-data). `set_identity_key` con casi di equivalenza + anti-regressione.
- **Pipeline end-to-end:** eseguita su produzione contro la collection reale (67 carte) — output sopra, coerente e senza NaN/crash.
- **Render:** Portfolio (stato non autenticato) renderizzato in browser reale — nessuna regressione. Screenshot inviato.

## Remaining / rischi

1. **Browser QA autenticato — PENDING.** I pannelli valutazione richiedono un login (la collection è RLS per-utente e non ho un utente di test). Da verificare con un tuo account: badge su ogni card valutata, tab Breakdown, `UnvaluedSection` (JA raggruppate), mobile 390px, e che **nessun badge "High"** compaia. Comando: `! npm run dev` → login → tab Collection.
2. **Copertura valutazione del portfolio bassa** per collection JA-heavy (6/67 nel test) — mitigato dalla `UnvaluedSection` e dal copy ("coverage expands"). Cresce con Pokémon JP (`categoryId 85`) e le fasi successive.
3. **Trend / storico vuoti** per ~2 settimane (1 giorno di `market_observations`) — mitigato dallo stato `building`.
4. **`feat/ui-ux-image-price-overhaul`** tocca `PortfolioView.jsx` (virtualizzazione) → conflitto di merge da risolvere al rebase di quel branch (firme componenti mantenute stabili apposta).
5. **`ConfidenceBadge` senza test di rendering** (node:test non transpila JSX; vitest non ancora su questo branch) — l'invariante "no High" è testata a livello di `normalizeConfidenceLevel` (puro). Test componente completo nella fase testing dedicata.

## Cosa passa a Fase 4 (Explore hierarchy)

Il valuation layer e il Portfolio consumano dati affidabili. Explore (`TCG → Sets → Set detail → Cards`) userà `set_logos` v2 (Fase 1) per `status`/`release_date` e potrà mostrare il valore stimato per carta da `market_valuations` nelle griglie di set.
