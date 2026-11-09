# CHECKPOINT — DraGold GitHub Community Analysis
**Data:** 2026-09-18 (ora legale Europa occidentale, UTC+02:00)
**Autore:** analisi automatizzata del repository locale
**Stato:** analisi completata — nessuna modifica al codice, al database, alle migration o alla Set View

---

## 1. STATO DEL REPOSITORY

### 1.1 Repository GitHub
- **URL:** `https://github.com/dragold/DraGold`
- **Remote:** `origin https://github.com/dragold/DraGold.git (fetch+push)`
- **Visibilità:** già **pubblico** — chiunque può vedere il contenuto senza autenticazione
- **Branch principale:** `main`
- **Ultimo commit:** `100c0f5` — “Task 2: Set Selector + Set View MVP”
- **Branch locali:** `main` (attivo), più 25+ branch tematici (docs/, feat/, fix/, refactor/, redesign/)
- **Branch remoti:** ~30 branch remoti su origin
- **PR aperte/chiuse:** 27+ PR chiuse — repository con storia di sviluppo attivo

### 1.2 Documentazione presente nel repository (root)
- `CLAUDE.md` — istruzioni per il modello operativo interno (non documentazione pubblica)
- **NESSUN** `README.md`
- **NESSUN** `LICENSE`
- **NESSUN** `CONTRIBUTING.md`
- **NESSUN** `CODE_OF_CONDUCT.md`
- **NESSUN** `SECURITY.md`
- **NESSUN** `.github/ISSUE_TEMPLATE/`
- **NESSUN** `.github/PULL_REQUEST_TEMPLATE.md`

**Nota:** la mancanza di LICENSE è già un rischio reale sul repo pubblico attuale.

### 1.3 `.github/` presente
- `.github/workflows/` — 14 workflow GitHub Actions (catalog-freshness, image-audit, sync-*, deploy-edge-functions, tests, ecc.)
- I workflow usano secrets GitHub (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `IMAGE_CACHE_KEY`, `SCRYDEX_API_KEY`, `POKEMONTCG_API_KEY`, `SUPABASE_ACCESS_TOKEN`, ecc.)
- Il workflow `deploy-edge-functions.yml` contiene il project ref Supabase hardcoded: `pimwkmwrduqkaydyvxqz`

### 1.4 `.gitignore`
Presente e volto, esclude:
- `node_modules/`, `dist/`, `.vercel/`
- `.env`, `.env.local` ✅ (corretto)
- `*.ndjson`, `*.csv`, `*_snapshot_*.csv`, `*_baseline_*.csv`, `pokemon-en-ja-*.json`, `final-summary-*.json` (artefatti dati volatili)
- `.atlas-review/`, `.codegraph/`, `.claude/`
- `.vscode/`, `.idea/`, `*.swp`, `*.swo`

### 1.5 Credenziali
- `.env` — contiene `IMAGE_CACHE_KEY` (parzialmente mascherato) — **gitignorado** ✅
- `.env.local` — contiene `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `VITE_SUPABASE_ANON_KEY` — **gitignorado** ✅
- **NON** ci sono credenziali nei file tracciati da Git, **ECCETTO**:
  - ⚠️ `supabase/functions/sync-sets/index.ts` riga 7: `TCG_LOOKUP_API_KEY` hardcoded come fallback `tcg_13cab6f910a348848a908751cc07d9fcaff84cc005bd1f94` — HIGH RISK, già esposto pubblicamente

### 1.6 Stato delle modifiche non committate
- 13 file modificati/deletti (tra cui file dati NDJSON eliminati, file di sviluppo eliminati)
- Molti file untracked (report, script di sviluppo, dati di test, artifact di audit)
- Nessuna modifica alle migration applicate o al database in questo task

---

## 2. COSA È GIA' PUBBLICO

### 2.1 Codice proprietario DraGold (già visibile)
- Frontend React/Vite completo: `src/` — componenti UI, pagine (home, set, search, card, academy, alerts, auth, portfolio, legal, illustrator, tcg, card-id), lib (auth, search, portfolio, cardId, ebayLinks, gdprExport, illustratorSlug, setEras, setSlug, state, tcgConfig, tcgSets, useCardGridColumns, useDragScroll, useLenis, useReveal, useTilt, searchData)
- Edge Functions Supabase: `supabase/functions/` — sync-sets, bulk-import-*, check-alerts, refresh-prices, fetch-ebay-prices, compute-hot-picks, _shared/fetch-with-log
- Script Node.js: `scripts/` — sincronizzazione, catalog, reconciliation, valuation, image-audit
- Schema Supabase: `supabase/schema.sql` — 12 tabelle + trigger + RLS
- Migrazioni: `supabase/migrations/` — incluse quelle non ancora applicate (es. `20260916_normalize_canonical_slugs.sql`)
- Configurazione: `vite.config.js`, `vercel.json`, `package.json`, `package-lock.json`
- File di build: `index.html`, `build-esbuild.mjs`, `middleware.js`

### 2.2 Codice open source di terze parti nel repo
- **Dipendenze npm** — non nel repo (node_modules escluso da .gitignore), ma dichiarate in package.json:
  - `react ^18.3.1` — MIT
  - `react-dom ^18.3.1` — MIT
  - `@supabase/supabase-js ^2.45.4` — MIT
  - `@tanstack/react-virtual ^3.14.10` — MIT
  - `@vercel/analytics ^1.3.1` — Apache-2.0
  - `gsap ^3.15.0` — BSD-3-Clause
  - `three ^0.169.0` — MIT
  - `@react-three/fiber ^8.17.10` — MIT
  - `@react-three/drei ^9.114.3` — MIT
  - `sharp ^0.35.4` — Apache-2.0
  - `lenis ^1.3.26` — MIT
  - `@gsap/react ^2.1.2` — MIT
  - `node-html-parser ^9.0.1` — MIT
  - `@vitejs/plugin-react ^4.3.1` — MIT
  - `vite ^5.4.2` — MIT
  - `playwright ^1.63.0` — Apache-2.0
  - `dotenv ^17.4.2` — BSD-2-Clause
- **Codice incorporato nel repo:**
  - Font in `public/fonts/` — probabili SIL Open Font License (da verificare individualmente)
  - Loghi set in `public/logos/` — vedi sezione rischi

### 2.3 Immagini e assets visibili
- `public/logo192.png`, `public/logo512.png` — logo DraGold
- `public/logo-bw.png`, `public/logo-gold.png` — varianti logo DraGold
- `public/og-image.png` — immagine social
- `public/apple-touch-icon.png`, `public/favicon.png`, `public/favicon.svg`
- `public/manifest.webmanifest`
- `public/robots.txt`
- `public/sitemap.xml`, `public/sitemap-static.xml`

### 2.4 Loghi di terze parti visibili
- `public/logos/mtg.png` — logo Magic: The Gathering (Wizards of the Coast)
- `public/logos/op.png` — logo One Piece TCG (Bandai)
- `public/logos/pkm.png` — logo Pokémon TCG (The Pokémon Company)
- `public/logos/ygo.png` — logo Yu-Gi-Oh! TCG (Konami)

**QUESTO È UN RISCHIO:** redistribuire loghi di marche registrate senza verifica delle licenze è problematico. Magari sono usati come icona di set (fair use discutibile), ma la redistribuzione su un repo pubblico espone a claim di marchio.

### 2.5 Font visibili
- `public/fonts/fraunces.woff2*` (4 file) — Fraunces, tipograficamente OFL (da verificare)
- `public/fonts/jakarta.woff2*` (2 file) — Jakarta, tipograficamente OFL (da verificare)
- `public/fonts/space-mono-400.woff2*`, `space-mono-700.woff2*` (4 file) — Space Mono, tipograficamente OFL (da verificare)
- **Rischio:** se sono effettivamente SIL OFL, redistribuire i font nel repo pubblico è OK. Se no, è un problema.

### 2.6 Dataset e cataloghi
**NESSUN dataset di carte nel repo pubblico.** I dati delle carte non sono in Git. Risiedono nel database Supabase. Questo è corretto e protegge i dati.

### 2.7 Dati derivati e artifact di sviluppo visibili
Alcuni file di dati derivati sono presenti nel repo pubblico:
- `data/reconciliation/reconcile-catalog.ndjson` — output di reconciliation
- `data/reconciliation/reconcile-catalog-checkpoint.json`
- `data/reconciliation/reconcile-catalog-svln-test.ndjson` + checkpoint
- `data/reconciliation/recovery-pokemon-ja-web1.json`
- `data/reconciliation/smoke-pokemon-ja.json`
- `scripts/image-audit/data/cards-onepiece-en-ja.ndjson` — dati di audit immagini
- `scripts/image-audit/data/cards-pokemon-en-ja.ndjson`
- `scripts/image-audit/data/crawl-onepiece.ndjson`
- `scripts/image-audit/data/crawl-pokemon.ndjson`
- `scripts/image-audit/data/demo-final-summary.json`
- `scripts/image-audit/data/resolve-priority-gaps.ndjson`
- `scripts/image-audit/data/probe-sample-session2.csv`
- `scripts/sources/pokemon-jp/catalog-jp-full.ndjson` — 724 righe di probe URL
- `scripts/sources/pokemon-jp/catalog-jp-full.checkpoint.json`
- `scripts/sources/pokemon-jp/checkpoint-test.json`
- `scripts/sources/pokemon-jp/discover-catalog-smoke.ndjson`
- `scripts/sources/pokemon-jp/results-test.ndjson`
- `provider_validation_results.json` — risultati validation provider
- `provider_validation_final.json`
- `cardSightResults.json`
- `scripts/eval/results/` — log e JSON di eval LLM
- `scripts/verify-mvp-state.mjs`, `verify-mvp-state-v2.mjs`, `verify-production.cjs`, `verify-creds.cjs` — tool di verifica
- `scripts/dragold-qa-*.cjs`, `*.mjs` — script QA
- `scripts/check-mvp-*.cjs`, `*.mjs` — script check
- `scripts/price-intelligence-spike.mjs` — spike
- `scripts/provider-validation-*.mjs` — script validation provider
- `scripts/sync-mvp-prices.js` — script MVP
- `scripts/apply-mvp-set-logos.js`, `*.mjs`
- `scripts/select-20-cards.mjs`, `select-20-cards-corrected.mjs`

### 2.8 Configurazioni visibili
- `.github/workflows/*` — 14 file, contengono riferimenti a secrets e al project ref Supabase
- `vercel.json` — config deployment Vercel
- `.vercel/project.json` — gitignorado in parte ma presente
- `vite.config.js` — config Vite dev
- `supabase/schema.sql` — schema DB completo
- `supabase/migrations/*` — 21 file di migrazione
- `supabase/BACKEND_SETUP.md` — documentazione setup backend (include istruzioni finali con URL e chiavi da copiare — ma non le chiavi stesse)

### 2.9 Script e utility visibili
Tutti gli script elencati in 2.7 sono visibili. Molti sono utility di sviluppo/internal QA.

---

## 3. RISCHI INDIVIDUATI

### 3.1 Rischio CRITICO — API key hardcoded
- **File:** `supabase/functions/sync-sets/index.ts` (riga 7)
- **Contenuto:** `const TCG_KEY = Deno.env.get('TCG_LOOKUP_API_KEY') || 'tcg_13cab6f910a348848a908751cc07d9fcaff84cc005bd1f94'`
- **Esposizione:** la chiave è visibile a chiunque visiti il repo
- **Urgenza:** ALTA — va rimossa o spostata in secret prima di qualsiasi ulteriore pubblicazione

### 3.2 Rischio ALTO — Nessuna licenza
- Il repository è pubblico ma senza LICENSE
- Senza licenza esplicita, i diritti sono riservati per default — nessuno ha diritto legale di usare, modificare o distribuire il codice
- GitHub mostra "No license specified" con avviso
- **Rischio:** contributor che inviano PR potrebbero avere diritti non chiariti; utenti che usano il codice potrebbero essere in viola

### 3.3 Rischio MEDIO — Loghi di terze parti nel repo pubblico
- `public/logos/mtg.png`, `op.png`, `pkm.png`, `ygo.png`
- Sono marchi registrati di Wizards of the Coast, Bandai, The Pokémon Company, Konami
- La redistribuzione su repo pubblico senza verifica delle licenze è rischiosa
- Probabilmente sono usati come semplici icone di set (use caso debole), ma la legge del marchio è severa

### 3.4 Rischio MEDIO — Riferimento project Supabase nel workflow
- `pimwkmwrduqkaydyvxqz` è nel workflow `deploy-edge-functions.yml`
- Rivela quale project Supabase è usato, ma senza le credenziali è solo un riferimento
- Può essere utile a malintenzionati per targettizzare attacchi, ma senza le credenziali il rischio è limitato

### 3.5 Rischio MEDIO-BASSO — Dati derivati nel repo pubblico
- I file `.ndjson` in `data/reconciliation/` e `scripts/image-audit/data/` sono output di processi
- Contengono metadati di carte e URL di fonti
- Non sono dati utente, ma sono artifacts che ingrossano il repo e potrebbero contenere URL di fonti che cambiano
- Non sono problematici dal punto di vista legale, ma sono noisierli per un repo Core pubblico

### 3.6 Rischio BASSO — Tool di sviluppo e QA nel repo pubblico
- `scripts/verify-*`, `scripts/dragold-qa-*`, `scripts/check-mvp-*`, `scripts/eval/`, `scripts/provider-validation-*`
- Contengono logica interna, risultati di test, probe URL
- Non sono segreti, ma sono noise per un repo Core pubblico

### 3.7 Rischio BASSO — Brand esposto senza protezione formale
- Logo DraGold, nome, domain `dragold.org` sono nel repo pubblico
- Senza policy di trademark esplicita, la community potrebbe pensare di avere diritto di usare il brand
- Non è un rischio immediato, ma è una lacuna da colmare con documentazione

### 3.8 Rischio — Funzioni Edge con accesso ad infrastructure
- `check-alerts/index.ts` usa `SUPABASE_SERVICE_ROLE_KEY`, invia email via Resend, accede a dati utente
- `refresh-prices/index.ts` usa EBAY_APP_ID, varie API key
- Queste funzioni sono già nel repo pubblico — il codice è visibile, ma le credenziali arrivano da env/secret
- Il rischio è che qualcuno possa leggere la logica e capire come interagire con i servizi, ma senza le chiavi non può fare nulla di pratico

---

## 4. LICENZE RILEVATE

### 4.1 Dipendenze dirette npm (principali)
| Dipendenza | Licenza | Note |
|---|---|---|
| react / react-dom | MIT | Compatibile con qualsiasi modello |
| @supabase/supabase-js | MIT | OK |
| @tanstack/react-virtual | MIT | OK |
| @vercel/analytics | Apache-2.0 | OK |
| gsap | BSD-3-Clause | OK |
| three | MIT | OK |
| @react-three/fiber / @react-three/drei | MIT | OK |
| sharp | Apache-2.0 | OK |
| lenis | MIT | OK |
| @gsap/react | MIT | OK |
| node-html-parser | MIT | OK |
| @vitejs/plugin-react | MIT | OK |
| vite | MIT | OK |
| playwright | Apache-2.0 | OK |
| dotenv | BSD-2-Clause | OK |

**Tutte le dipendenze dirette sono licenze permissive (MIT, BSD, Apache-2.0).** Nessuna licenza copyleft (GPL) che costringerebbe a rilasciare il codice modificato.

### 4.2 Font (da verificare)
- Fraunces, Jakarta, Space Mono — presumibilmente SIL Open Font License
- Se confermato: redistribuzione OK nel repo pubblico

### 4.3 Loghi terze parti (da NON redistribuire senza verifica)
- Non esiste una licenza che copra i loghi di MTG, One Piece, Pokémon, Yu-Gi-Oh!
- Sono marchi registrati, non software

### 4.4 Fonti dati (da verificare)
- TCGdex API — termini d'uso da verificare (probabilmente permette uso per progetto pubblico)
- PokémonTCG.io / images.pokemontcg.io — fonti immagine pubbliche, da verificare
- optcgapi.com — API pubblica One Piece
- onepiece-cardgame.com — sito ufficiale Bandai
- Scryfall bulk data — licenza propia Scryfall, da verificare
- YGOPRODeck — uso libero comune

---

## 5. MODELLI DI LICENSING POSSIBILI

### Modello A — Apache 2.0 + separazione Brand/Trademark esplicita

**Cosa può fare un contributor:**
- Leggere, studiare, modificare il codice
- Inviare PR
- Forkare il repo
- Usare il codice per qualsiasi scopo (incluso commerciale), purché rispetti la licenza

**Cosa può fare un utente:**
- Usare il codice per progetti personali o commerciali
- Distribuire copie del codice
- Modificare e ridistribuire

**Uso commerciale da parte di terzi:**
- PERMESSO — la licenza Apache 2.0 permette prodotti commerciali derivati
- IL BRAND DraGold non è concesso — chiunque usa il codice non può chiamare il proprio prodotto "DraGold"

**Fork:**
- PERMISSO — chiunque può fare fork

**Protezione del brand:**
- Si difende con una sezione esplicita nel README: "DraGold, il logo, e dragold.org sono marchi di [proprietario]. Questa licenza non concede diritti sul marchio."
- Il codice può essere forkato e usato, ma non il brand

**Gestione dei contributi con CLA:**
- CLA compatibile — chi contribuisce concede i diritti sul proprio contributo
- Il maintainer può usare i contributi in prodotti commerciali

**Vantaggi:**
- Massima adozione possibile
- Compatibile con OSI, facile da spiegare
- Protezione del brand chiara e separata
- Licenza ben conosciuta, poche sorprese legali

**Svantaggi:**
- Qualcuno può forkare DraGold e creare un prodotto concorrente con nome diverso
- Non c'è restrizione commerciale sulla tecnologia

**Cosa verificare legalmente:**
- Validità della clausola di trademark nel README (non è una licenza, ma un avviso)
- Se ci sono registrazioni di marchio pendenti o già registrate

---

### Modello B — Common Clause / Source-Available con restrizione commerciale

**Cosa può fare un contributor:**
- Leggere, studiare il codice
- Inviare PR
- Forkare il repo per uso personale
- NON può usare il codice per prodotti commerciali senza accordo

**Cosa può fare un utente:**
- Usare per apprendimento, ricerca, progetti personali non commerciali
- Non può costruire un prodotto commerciale basato sul codice senza licenza separata

**Uso commerciale da parte di terzi:**
- RESTRITO — serve una licenza separata dal maintainer
- Il maintainer può concedere licenze commerciali per prodotti derivati

**Fork:**
- Permesso per uso non commerciale
- Il fork non può essere usato per prodotti commerciali concorrenti

**Protezione del brand:**
- Il brand è naturalmente protetto perché il codice stesso è restrittivo
- Si aggiunge una clausola esplicita di non-use del marchio

**Gestione dei contributi con CLA:**
- CLA necessario per assicurarsi che i contributi siano usabili dal maintainer in modo commerciale
- I contributor mantengono il controllo sui propri contributi? NO — il CLA cede i diritti al maintainer per uso commerciale

**Vantaggi:**
- Protezione diretta del modello commerciale
- Chiunque voglia usare il codice in modo commerciale deve comunicare con il maintainer
- Discourages fork commerciali concorrenti

**Svantaggi:**
- Non è open source (non OSI-approved)
- Meno adozione possibile
- Complessità legale maggiore
- Alcuni progetti la considerano "open sourcevelato" — può creare aspettative sbagliate
- La licenza Common Clause ha una reputazione mista nella community

**Cosa verificare legalmente:**
- Validità e applicabilità della Common Clause in giurisdizione rilevante
- Redazione precisa delle restrizioni commerciali
- Interazione con le licenze delle dipendenze (MIT/Apache sono compatibili, ma attenzione)

---

### Modello C — Dual License: Core opensource + prodotti commerciali sotto licenza separata

**Cosa può fare un contributor:**
- Contribuire al Core sotto licenza open (es. Apache 2.0 o MIT)
- I contributi al Core sono rilasciati sotto la licenza open del Core

**Cosa può fare un utente:**
- Usare il Core sotto la licenza open
- Se vuole usare funzionalità proprietarie o il prodotto completo, deve accordarsi con il maintainer

**Uso commerciale da parte di terzi:**
- Del Core: PERMISSO (sotto la licenza open del Core)
- Dei componenti proprietari / prodotti commerciali: NEGATO senza accordo

**Fork:**
- Del Core: PERMESSO
- Dei componenti proprietari: non applicabile (non pubblicati)

**Protezione del brand:**
- La separazione è strutturale: il Core è aprip, il brand e i prodotti commerciali sono chiusi
- README chiaro sulla separazione

**Gestione dei contributi con CLA:**
- CLA per i contributi al Core — concede i diritti al maintainer
- I componenti proprietari non accettano contributi pubblici (sono in repo privato)

**Vantaggi:**
- Flessibile — il Core attira community, i prodotti commerciali sono protetti
- Il contributor sa esattamente cosa è open e cosa no
- Modello consolidato (usato da molte aziende)

**Svantaggi:**
- Richiede mantenere due repositori o due parti chiaramente separate nello stesso repo
- Complessità di gestione
- Rischio di confusione se la separazione non è chiara

**Cosa verificare legalmente:**
- Separazione netta tra Core e prodotti commerciali
- CLA per il Core
- Come gestire i contributi che potrebbero "inquinare" i componenti proprietari

---

### Tabella comparativa rapida

| Criterio | A: Apache 2.0 + Trademark | B: Source-Available | C: Dual License |
|---|---|---|---|
| Adoption | Alta | Media-Bassa | Media |
| Protezione modello commerciale | Brand-only | Codice + Brand | Componenti commerciali |
| CLA necessario | Sì (per usare contributi in modo commerciale) | Sì (più complesso) | Sì (per il Core) |
| Fork commerciale | Permesso (brand non concesso) | Restritto | Permesso solo sul Core |
| Semplicità legale | Alta | Media | Bassa-Media |
| Compatibilità OSI | Sì (Apache 2.0) | No | Solo il Core |
| Rischio contributor "sorpresa" | Basso | Medio | Basso (se chiaro) |

---

## 6. MODELLO CONTRIBUTOR PROPOSTO

### Flusso desiderato
```
1. Fork del repo dragold/DraGold (GitHub → Fork button)
2. Clone del fork locale
3. Creazione branch: git checkout -b feature/nome-feature
4. Sviluppo e test locali
5. Commit e push sul fork
6. Apertura Pull Request su dragold/DraGold
7. CLA: il contributor conferma di aver letto e accettato il CLA
8. Review da parte del maintainer (Ermal)
9. Eventuali richieste di modifica
10. Merge (solo da parte del maintainer con write access)
11. Ringraziamento del contributor
```

### Cosa dev'essere automatizzato da GitHub
- Fork: automatizzato (GitHub UI)
- Branch protection su `main`:
  - Richiedi PR (non push diretto su main)
  - Richiedi review da parte del maintainer
  - Richiedi status check (test CI) prima del merge
- CI: workflow tests.yml già esistente — va configurato per girare su PR
- Template per Issue e PR: da creare
- Badge e README: da creare

### Cosa dev'essere controllato dal maintainer
- Accettazione CLA prima del merge (non automatizzato, ma verificabile)
- Review del codice: qualità, compatibilità con la direzione del progetto
- Decisione di merge: solo il maintainer mergea su main
- Pubblicazione di release: solo il maintainer crea release taggate

### Automazione CLA (da decidere)
Opzioni:
1. **CLA Assistant** (usato da React, Jest, molti progetti): integra con GitHub, traccia chi ha firmato, blocca PR da contributor non registrati
2. **DCO (Signed-off-by)**: più leggero, meno protezione — lo sviluppatore aggiunge `Signed-off-by: Nome <email>` nel commit; il maintainer verifica
3. **Formulario manuale**: un issue template o un Google Form che il contributor compila; il maintainer verifica manualmente
4. **Bozza tecnica:** un file `docs/CLA.md` e un commento alla PR che dice "by submitting this PR you agree to docs/CLA.md" — ma questo è DCO-style, nonCLA vero

**Nessuna di queste è implementata in questa sessione.** È una decisione architetturale da fare prima di configurare GitHub.

---

## 7. FILE CHE DOVRANNO ESSERE CREATI DOPO

Una volta deciso il modello di licensing, queste sono le priorità:

### Priorità alta (prima di promuovere la community)
1. `LICENSE` — la licenza scelta (A, B, o C)
2. `README.md` — presenta DraGold, cosa contiene il Core, come contribuire, distinzione Core/Official, branding, licensing
3. Fix di `supabase/functions/sync-sets/index.ts` — rimuove la chiave hardcoded

### Priorità media (per facilitare contributi)
4. `CONTRIBUTING.md` — come fare fork, branch, PR, test, formattazione
5. `CODE_OF_CONDUCT.md` — comportamento atteso nella community
6. `docs/CLA.md` — il CLA versionato (bozza da revisionare legalmente)
7. `.github/ISSUE_TEMPLATE/bug_report.md`
8. `.github/ISSUE_TEMPLATE/feature_request.md`
9. `.github/PULL_REQUEST_TEMPLATE.md`

### Priorità bassa (miglioramento della documentazione)
10. `SECURITY.md` — come segnalare vulnerabilità
11. Documentazione delle fonti dati e dei termini d'uso
12. Documentazione dei font e delle licenze dei font
13. Guida all'impostazione locale (`docs/getting-started.md` o simile)

### Priorità da decidere
- Pulizia dei branch remoti residui (alcuni sono storici, alcuni potrebbero essere rami sperimentali da chiudere)
- Verifica dei loghi di terze parti in `public/logos/` — confermare se redistribuire o rimuovere
- Verifica dei font in `public/fonts/` — confermare licenza

---

## 8. DECISIONI ANCORA RICHIESTE A ERMAL

Prima di pubblicare la documentazione definitiva e prima di configurare GitHub per la community, serve decidere:

1. **Modello di licenza del Core:** A (Apache 2.0 + Trademark), B (Source-Available con restrizione commerciale), C (Dual License), o altra?
2. **CLA o DCO?** Se CLA, quale meccanismo di accettazione (CLA Assistant, DCO, manuale)?
3. **Cosa fare della chiave hardcoded in sync-sets?** Fix immediato incluso in questo task?
4. **Cosa fare dei loghi in public/logos/?** Confermarne la redistribuzione, rimuoverli, o sostituirli con icona testuale?
5. **Cosa fare dei font in public/fonts/?** Confermare licenza (probabilmente OFL) e redistribuzione?
6. **Creare un repo separato privato per i componenti proprietari?** O mantenere tutto nello stesso repo con directory separate e documentazione chiara?
7. **Pulizia dei branch remoti:** chiudere o cancellare i branch storici non necessari?
8. **Aggiungere un branch protection su main prima o dopo la pubblicazione dei documenti?**
9. **Il repo DraGold Core sarà lo stesso repo esistente (dragold/DraGold) o un repo diverso?**
10. **Vogliamo pubblicare o meno le funzioni Edge sensibili (check-alerts, refresh-prices) nel Core?**

---

## 9. PROSSIMO PASSO ESATTO

**Fase attuale:** analisi completata — nessuna azione sul codice.

**Prossimo step (da decidere da Ermal):**

Opzione 1 (consigliata):
- Ermal legge questo checkpoint
- Decide il modello di licensing (A, B, C o altro)
- Decidisce CLA vs DCO
- Autorizza il fix della chiave hardcoded in sync-sets
- Autorizza la creazione dei file documentali (LICENSE, README, CONTRIBUTING, CLA, issue/PR templates)
- Autorizza la configurazione di GitHub (branch protection, secrets management)

Opzione 2:
- Ermal chiede chiarimenti su uno o più punti
- Poi procede con le decisioni

**NOTA:** il repo è già pubblico. La priorità più alta è:
1. Rimuovere/fix la chiave hardcoded (se Ermal lo autorizza)
2. Aggiungere una LICENSE (qualsiasi cosa, anche provvisoria) per chiarire i diritti
3. Aggiungere un README minimo che spiega cosa è DraGold e la distinzione tra Core e prodotti commerciali

Questo checkpoint è pronto per la review. Dopo la decisione di Ermal, possiamo procedere con la creazione dei file e la configurazione.

---

*Documento generato in sessione di analisi. Non contiene modifiche al codice, al database, alle migration o alla Set View.*
