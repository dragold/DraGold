# DraGold — Phase 3: "Wow Factor" Plan (Set Assets, Filtri, Home Dinamica)
Documento di pianificazione · 26 agosto 2026 · Solo ricerca/ricostruzione da codice + Supabase live, nessuna modifica applicata in questa sessione.

Contesto: ricostruisce lo stato reale di Explore/Set/Home verificando `src/`, `supabase/migrations/` e le tabelle live, sulla falsariga di `DraGold-UXUI-Phase2-Polish-Roadmap.md` (12 agosto). Correzioni rispetto al brief originale sono segnalate esplicitamente dove il codice mostra uno stato diverso da quello ipotizzato — per CLAUDE.md §0/§9, non do per buono nulla che non sia verificato da repo/DB.

**Correzione tecnica preliminare**: il progetto non è Next.js. È **React 18 + Vite** (SPA, `vite.config.js`, `package.json`), con SEO gestito da pagine standalone separate (`/carta/:slug`, `/:tcg`) accanto alla SPA. Il piano sotto è scritto per questa architettura reale, non per Next.js — nessuna feature qui presuppone App Router, RSC o simili.

---

## A. CURRENT STATE — cosa è realmente implementato oggi (verificato da codice)

### A.1 Loghi dei set / asset visivi

- **Il fallback esiste già e non è banale.** `SetsView.jsx` (`set-card-fallback`) mostra una tile brandizzata (codice set + short-tag del TCG, colorata con `tcg.color`) quando `logo_url` è assente **o quando l'immagine "carica" ma restituisce 0×0px** — bug reale documentato in un commento nel codice: i loghi ufficiali One Piece (`en.onepiece-cardgame.com`) sono protetti da hotlink, l'evento `onLoad` si attiva comunque ma `naturalWidth === 0`, quindi il solo `onError` non basta. Questo è esattamente il pattern "pipeline fallback robusta" richiesto nel brief — **è già in produzione**, non va reinventato, va **esteso e reso coerente** (vedi A.1.1).
- Sorgente dati: tabella `set_logos` (`set_code, tcg, set_name, logo_url, symbol_url, release_date`, + `source`/`retrieved_at` aggiunti il 23/08 per provenance) — copre **solo Pokémon e One Piece**, confermato da commenti in `tcgSets.js` ("set_logos covers pokemon + onepiece only"). MTG/YGO non hanno righe in `set_logos` → in Explore ricevono sempre la tile fallback (comportamento corretto e voluto, non un bug).
- **Gap reale #1 — copertura JA**: i set giapponesi di Pokémon (`CP1, E1..E5, M1L, PCG1..9`, namespace diverso da `base1/bw1/...`) **non hanno mai un match in `set_logos`** (verificato: la logica in `computeLangSets` fa fallback su `nameByNormKey` da `cards.set_name`, mai su un vero logo) → ogni set JA Pokémon mostra sempre la tile fallback, anche quando un logo ufficiale esisterebbe e sarebbe reperibile. One Piece JA invece **eredita** il logo dell'omologo EN via `normalizeSetKey` (stesso set, due grafie di id) — quindi copertura reale è: **Pokémon EN buona, Pokémon JA quasi nulla, One Piece EN buona, One Piece JA ereditata (probabilmente buona ma mai verificata riga per riga)**.
- **Gap reale #2 — nessuna pipeline di refresh/riconciliazione periodica per `set_logos`**: non esiste una funzione equivalente a `sync-sets` (che sincronizza *contatori* set da TCG Price Lookup nella tabella `sets`, non i loghi) che tenga `set_logos` aggiornata quando escono nuovi set. Oggi `set_logos` sembra popolata manualmente/una tantum (coerente con `source`/`retrieved_at` aggiunti *dopo* i dati, per tracciare *futuri* aggiornamenti, non quelli passati).
- **Gap reale #3 — nessuna cache/CDN per i loghi**, a differenza delle card image (`card_image_cache`, con `status='ready'`/`cached_url`, vedi `pickCardImage()` in `cardImage.js`). I loghi sono serviti hotlinkati dalla fonte originale (`logo_url` diretto) → stesso rischio di rottura silenziosa (hotlink protection, CORS, rimozione asset) che già oggi produce il caso 0×0px di One Piece. Il fallback grafico maschera il sintomo lato utente, ma non risolve il fatto che "quando disponibile", il logo può comunque sparire senza preavviso.
- La tabella `sets` (da `sync-sets`, fonte TCG Price Lookup, 6 giochi incl. Lorcana/FaB) esiste **in parallelo** a `set_logos` e non risulta joinata da nessun componente UI ispezionato (`SetsView`, `tcgSets.js`, `state.js` usano solo `set_logos`/`cards`/`canonical_cards`). È una fonte di dati (conteggi, date, slug) oggi inutilizzata lato prodotto — potenziale base per A.2/A.1 senza nuovo lavoro di ingestion.

### A.2 Ordinamento e filtri dei set

- **Ordinamento cronologico inverso**: già implementato, sia nel path "cheap" (`SetsView` via `setsMap`) sia nel path lazy (`tcgSets.js` → `computeTcgSets`/`computeLangSets`): `release_date DESC`, set senza data in coda ordinati per nome — **mai una data inventata**, principio esplicito nel codice.
- **Raggruppamento per anno**: già implementato (`groupByYear` in `SetsView.jsx`), con bucket "Release date unknown" per i set senza data — mostrato solo se ci sono ≥2 gruppi.
- **Filtro TCG**: già implementato ma come *sezioni verticali separate* (una per TCG, `TCG_LIST` order), non come toggle/tab selezionabile — coerente con la priorità di prodotto (Pokémon → One Piece → MTG/YGO) ma meno esplorabile su mobile (scroll lungo).
- **Filtro lingua EN/JA**: già implementato per Pokémon e One Piece (le due uniche lingue rilevanti per priorità di prodotto, CLAUDE.md §1) — via `detectJapaneseSets()` + `loadLangSets()`, live-checked per TCG (non hardcoded).
- **Alfabetico**: **non implementato** come opzione esplicita (oggi solo come tie-break secondario dentro l'ordinamento per data).
- **Raggruppamento per era/blocco** (es. Scarlatto e Violetto, Spada e Scudo): **non implementato, e non banale** — non esiste nel DB nessuna colonna che codifichi l'era di un set. Andrebbe derivata (mapping statico set_id→era, o nuova colonna popolata da fonte esterna) prima di poter essere un filtro, non è un semplice re-sort di dati già presenti.
- **Filtro stato set (Completato/Incompleto/In corso)**: **non implementato e non derivabile oggi** — richiede sapere quante carte "dovrebbe" avere un set (totale ufficiale) contro quante ne ha il catalogo (`cards`/`canonical_cards` count). La tabella `sets` di `sync-sets` ha `card_count` (totale ufficiale dalla fonte esterna) che **potrebbe** essere la base per questo confronto, ma non è mai stata collegata a `cards` — verificare in Fase 1 se `sets.id`/`slug` sono riconciliabili con `cards.set_id` prima di costruire la feature.
- **Filtro tipologia prodotto (Main/Special/Promo)**: **non implementato, nessuna colonna esistente la codifica.** Richiede nuova classificazione dati (vedi D.2).

### A.3 Home / "effetto wow"

- **Non esiste una vera Home dashboard.** L'app apre direttamente sul tab "Search" (`markets`, `SearchView.jsx`) dentro la shell SPA (`DraGold.jsx`). Non c'è una view distinta "Home".
- **"Hot Picks" esiste già** (`HotPicksSection.jsx`, dentro `SearchView`) — ma è **solo card-level, solo Pokémon** (la SQL in `compute_hot_picks_today()`, migrazione 003, filtra esplicitamente `where c.tcg = 'pokemon'`), calcolata via cron giornaliero da `card_prices`, con fallback curato hardcoded (2 carte) se il cron non ha ancora girato. Non è "Trending Sets", è "Trending Cards" — buona base per il requisito Home ma va estesa (multi-TCG) e non esiste l'equivalente a livello di set.
- **"Discover sets" rail esiste già** in `SearchView.jsx` — set con logo disponibile, ordine di priorità TCG, **shuffle casuale per sessione** (commento esplicito: `set_logos` non ha colonna adatta per un vero "most recent", quindi non è un vero "Recent Releases" — è scelto casualmente tra i set con logo). Requisito Home "Recent Releases / New Additions" **non è coperto da questo**, serve logica reale basata su `release_date DESC` (già disponibile in `tcgSets.js`/`computeTcgSets`, semplicemente non riusata qui).
- **Portfolio teaser**: la vista `user_portfolio_summary` esiste già in DB (`006_collection_denormalized.sql`: `card_count, total_quantity, total_paid_eur, total_value_usd` per `user_id`) — **mai esposta fuori da `PortfolioView.jsx`**. È la base pronta per la "Quick Portfolio" richiesta, zero nuova infrastruttura dati necessaria, solo un nuovo consumo UI.
- **Top Chase Cards Showcase**: nessun concetto equivalente in codice. Andrebbe definito cosa rende una carta "chase" (prezzo assoluto? rarità testuale? entrambi?) — nessuna colonna oggi la marca esplicitamente, ma `card_prices_latest` (prezzo) + `rarity` (testo libero su `cards`) sono sufficienti per una query "top N per prezzo" senza nuovo schema.
- **Motion/wow visivo**: zero dipendenze di animazione (confermato in Phase 2 e invariato: `package.json` ha solo supabase-js, vercel/analytics, node-html-parser, react, react-dom, sharp). `useReveal`/`useTilt`/`useDragScroll` sono hook custom già in `src/lib/` (CSS-driven, zero-dep) — riusabili per la Home invece di introdurre Framer Motion o simili (coerente con CLAUDE.md §5 "niente nuovi build tool/librerie senza decisione esplicita").
- Dark mode: il progetto è **dark-native**, non "anche dark" — non c'è toggle, non c'è tema chiaro da conciliare. Il requisito "dark mode nativa ottimizzata" è già lo stato di base, non un task.

---

## B. Cosa NON fare (per non duplicare lavoro già fatto)

1. Non ricostruire il fallback loghi da zero — esiste, è già gestito il caso "carica ma è 0×0" che è il caso più insidioso. Il lavoro è: **estendere la copertura dati** (JA Pokémon) e **irrobustire la pipeline** (cache propria, refresh periodico), non riscrivere `SetTile`.
2. Non ricostruire l'ordinamento cronologico/alfabetico di base — esiste ed è corretto. Il lavoro è: **esporre un controllo UI esplicito** (oggi l'utente non sceglie l'ordinamento, lo subisce) + aggiungere le due dimensioni davvero mancanti (era/blocco, stato, tipologia prodotto).
3. Non trattare "Hot Picks"/"Discover sets" come inesistenti nel proporre la Home — vanno **promossi, estesi ed evoluti** in sezioni Home reali, riusando le query già scritte in `tcgSets.js`/`compute_hot_picks_today()` dove possibile.

---

## C. Architettura dati — cosa manca davvero (prerequisito di tutto il resto)

Ordine di dipendenza: senza C.1-C.3 i filtri "era", "stato" e "tipologia" in D non sono costruibili con dati reali (principio CLAUDE.md §9: mai inventare stato/schema).

### C.1 — Era/Blocco set (Pokémon + One Piece)

Non esiste nel DB. Due opzioni, entrambe compatibili con "JavaScript non TypeScript" e "niente nuove librerie":

- **Opzione A (consigliata per partire subito)**: mapping statico versionato in `src/lib/` (es. `src/lib/setEras.js`), `{ tcg, setIdNormalizzato → era_label, era_order }`, costruito a mano una tantum dai blocchi ufficiali pubblici (Scarlatto e Violetto, Spada e Scudo, Sole e Luna, ... per Pokémon; saghe/arc per One Piece). Zero nuova migration, zero rischio di schema drift, aggiornabile ad ogni nuovo set con una riga. Rischio: manutenzione manuale ad ogni release (accettabile, cadenza set nuovi è mensile/bimestrale, non giornaliera).
- **Opzione B**: colonna `era`/`block` su `set_logos` (migration + backfill). Più "corretto" architetturalmente ma richiede una fonte esterna affidabile da cui derivarlo (ricerca prima di costruire, CLAUDE.md §4) e un processo di sync, non solo una migration — più lavoro per lo stesso risultato a breve termine.

Verifica richiesta prima di scegliere: quante righe distinte ha oggi `set_logos` per Pokémon+OnePiece (per stimare lo sforzo del mapping manuale) — dato volatile, va contato live su Supabase al momento del task, non assunto qui.

### C.2 — Stato completamento set (Completato/Incompleto/In corso)

Prerequisito: verificare se `public.sets.id`/`slug` (fonte TCG Price Lookup, popolata da `sync-sets`, mai usata lato prodotto) sono riconciliabili con `set_logos.set_code`/`cards.set_id` per gli stessi set. Se sì: `sets.card_count` (totale ufficiale) vs `count(cards where set_id=...)` (quanto è nel catalogo) dà lo stato quasi gratis. Se no (id incompatibili tra le due fonti dati): serve una colonna `official_card_count` popolata a mano o da altra fonte per Pokémon/One Piece, stesso pattern manuale di C.1 Opzione A.

Questo è un gap che tocca anche la qualità percepita del catalogo in generale (non solo il filtro Home/Explore), quindi vale la pena verificarlo con priorità alta — è probabile che risolva anche ambiguità di conteggio già menzionate in `MASTER_DATA_MODEL_AUDIT.md`/`DUPLICATE_VARIANT_AUDIT_REPORT.md` (non riletti in dettaglio in questa sessione, da incrociare in Fase 1).

### C.3 — Tipologia prodotto (Main/Special/Promo)

Nessuna colonna oggi la esprime. Va derivata per pattern sul `set_id`/`set_name` esistente (es. prefissi promo noti, "Trainer Gallery", "McDonald's", set di promozione vs espansione main) o mappata a mano insieme a C.1 (stesso file `setEras.js` potrebbe includere `productType` per riga, evitando una seconda struttura dati parallela).

### C.4 — Set logos: irrobustimento pipeline

- Aggiungere una vera cache propria per i loghi (tabella `set_logo_cache` o riuso/estensione del pattern `card_image_cache`: fetch server-side, upload su storage proprio, `status: ready|failed`, `cached_url`) — stesso principio già validato per le card image, elimina la dipendenza da hotlink permission dei siti sorgente **prima** che si rompano, invece di limitarsi a mascherare la rottura con un fallback grafico lato client.
- Introdurre un job di sync periodico per `set_logos` (nuova Edge Function tipo `sync-set-logos`, sul modello di `sync-sets`/`refresh-prices`) che confronti i set nuovi apparsi in `cards`/`canonical_cards` con `set_logos` e segnali (log, non auto-pubblichi) i set senza logo — oggi questo controllo non esiste, i gap si scoprono solo visivamente in Explore.
- Colmare il gap JA Pokémon (A.1 Gap #1): ricerca fonte per loghi set JA Pokémon (CLAUDE.md §4 — verificare licenza/hotlink policy prima di integrare), altrimenti restano sulla tile fallback che comunque è già "elegante", solo meno informativa di un vero logo.

---

## D. Piano di esecuzione incrementale

Sequenza scelta per dipendenza: dati prima di UI (CLAUDE.md architetturale), e dentro ciascuna area, "irrobustire ciò che esiste" prima di "aggiungere ciò che manca".

### Fase 1 — Fondamenta dati (nessuna UI nuova visibile)
1. Verifica live su Supabase (dato a data di esecuzione, non qui): conteggio set Pokémon/One Piece per era, riconciliabilità `sets` ↔ `set_logos`/`cards.set_id`, copertura reale `set_logos` per JA.
2. `src/lib/setEras.js` — mapping statico era/blocco + tipologia prodotto per Pokémon e One Piece (C.1 Opzione A + C.3).
3. Se C.2 riconciliabile: nessuna migration, solo una funzione `computeSetCompleteness()` in `lib/tcgSets.js` che incrocia `sets.card_count` con il conteggio già calcolato. Se non riconciliabile: colonna manuale + task dedicato separato (non bloccante per il resto del piano).
4. Edge Function `sync-set-logos` (nuova) + eventuale tabella `set_logo_cache` (C.4) — irrobustisce senza cambiare nulla di visibile finché non arriva C.4's UI consumer.

### Fase 2 — Ordinamento e filtri Explore (UI su dati già/appena disponibili)
5. Barra filtri esplicita sopra le sezioni TCG in `SetsView.jsx`: toggle TCG (oggi implicito nelle sezioni, va reso un controllo reale per saltare direttamente a un TCG su mobile), toggle lingua EN/JA (dato già disponibile), select ordinamento (Novità / Alfabetico / Era) — riusa `sortSets()`/`groupByYear()` già esistenti, aggiunge `groupByEra()` gemella.
6. Filtro Stato (Completato/Incompleto/In corso) e Tipologia prodotto (Main/Special/Promo), attivi solo se C.2/C.3 hanno dati per quel TCG — mai un filtro "finto" su dati assenti.
7. Estendere lo stesso set di filtri/ordinamenti a `TcgPage.jsx` (hub SEO `/​:tcg`), che oggi consuma `tcgPageData.js`/`computeTcgSets` in modo simile ma separato da `SetsView` — verificare se conviene un componente filtro condiviso invece di due implementazioni parallele.

### Fase 3 — Home dinamica
8. Nuova route/tab "Home" (`src/pages/home/HomePage.jsx`) come landing reale, con `Search` ed `Explore` che restano tab primari accanto ad essa (non sostituiti) — decisione di prodotto da confermare con Ermal: Home sostituisce "Search" come tab di apertura di default, o si affianca?
9. **Trending / Hot Sets**: nuova metrica set-level. Non esiste oggi (hot_picks è card-level, solo Pokémon) — opzione più economica: aggregare `hot_picks` esistenti per `set_id` (via join su `cards`) invece di una nuova pipeline di prezzo, poi estendere `compute_hot_picks_today()` a One Piece (rimuovere il filtro hardcoded `tcg = 'pokemon'`, verificando prima che `card_prices` abbia copertura sufficiente per One Piece).
10. **Recent Releases / New Additions**: riuso diretto di `computeTcgSets()`/`loadTcgSets()` (già `release_date DESC`) limitato ai primi N per TCG — zero nuova query, solo un nuovo consumer UI con anteprima carte via `pickCardImage()` sulle carte "chase" di quel set (D.11).
11. **Top Chase Cards Showcase**: query "top N per prezzo" su `card_prices_latest` + join `cards`, multi-TCG — definire soglia/criterio "chase" con Ermal prima di costruire (prezzo assoluto vs percentile per rarità).
12. **Quick Portfolio / Collection Teaser**: consumo diretto di `user_portfolio_summary` (già esiste) se loggato; se non loggato, preview statica/esempio (nessun dato utente reale da inventare per un utente anonimo).
13. Motion/wow: hover con scale/elevazione su tile (gap esplicito già segnalato in Phase 2 e mai chiuso), View Transitions API già usata per Card/Set detail (`withViewTransition` in `DraGold.jsx`) da estendere all'apertura Home→Set/Card, `prefers-reduced-motion` da rispettare ovunque (oggi zero occorrenze nel codice — debito aperto, va chiuso insieme al nuovo motion, non dopo).

### Fase 4 — Verifica (CLAUDE.md §8)
14. Build Vite pulita, verifica import/export, nessuna regressione sui flussi Search→Card, Explore→Set→Card.
15. Verifica dedicata su tutte le combinazioni filtro Explore (TCG × lingua × ordinamento × stato × tipologia) — matrice non banale, va testata esplicitamente, non assunta corretta perché ogni singolo filtro lo è isolatamente.
16. Deploy su branch dedicato → Vercel preview → controllo visivo Home su dark mode reale (non solo dev tools) → merge.

---

## E. Domande aperte per Ermal (decisioni di prodotto, non tecniche)

1. Home sostituisce il tab "Search" come landing di default, o è un terzo tab/route separata?
2. "Chase card" — soglia di prezzo assoluto (es. >100€) o relativa alla rarità/set? Cambia la query e l'aspettativa dell'utente.
3. Estensione di `hot_picks` a One Piece (oggi hardcoded solo Pokémon in SQL) — priorità ora o rimane scope futuro?
4. Mapping era/blocco (C.1): manuale via file versionato (veloce, da mantenere ad ogni release) o investimento in una fonte dati esterna sincronizzata (più solido, più lavoro iniziale)?
