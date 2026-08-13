# DraGold — Catalog Reconciliation Pipeline: Ricerca & Proposta Architetturale

Data: 2026-08-12
Stato: RICERCA + PROGETTAZIONE. Nessuna implementazione eseguita. Nessuna scrittura su DB/codice/schema.

---

## 0. Perché questo documento

Le bonifiche manuali `tk` (1.020 righe), `P` (311 righe), `SV` (95 righe) hanno chiuso i casi noti, ma sono state scoperte una alla volta per audit ad-hoc. Non c'è garanzia che non esistano altri `set_id` corrotti non ancora individuati. Il pattern non scala: ogni correzione ha richiesto ricerca manuale, snapshot, verifica, e in un caso (`SV`) la determinazione del valore corretto ha richiesto scavare fino a Bulbapedia perché l'evidenza interna al DB da sola portava a una conclusione sbagliata (`svp` invece di `SV-P`). Questo documento propone di sostituire l'audit manuale con una pipeline di riconciliazione contro fonti canoniche.

---

## 1. Fonti per TCG — ricerca condotta

### 1.1 Pokémon

| Fonte | Tipo | Stato/Copertura | Licenza | Note |
|---|---|---|---|---|
| **TCGdex** (`api.tcgdex.net`, repo `tcgdex/cards-database`) | Community, open source | 130k+ carte, 6→12 lingue, include zh-tw/th/ja (già usata da DraGold) | MIT (codice); dati carte soggetti a copyright Pokémon Company/Nintendo (come ogni dataset del genere) | Già la fonte primaria di DraGold. Self-hostabile via Docker. SDK JS/TS/PHP/Java ufficiali del progetto. |
| **pokemontcg.io / Scrydex** | Ex-community ora commerciale | Pokémon + Lorcana + MTG + Gundam + One Piece + Riftbound in un'unica API | A pagamento, nessun tier gratuito (da $29/mese, ~160 richieste/giorno) | `pokemontcg.io` è stato assorbito da Scrydex nel 2026: non più gratuito, non conviene come fonte primaria dato che TCGdex copre già Pokémon gratuitamente con più lingue. |
| **PokemonTCG/pokemon-tcg-data** (GitHub) | Dataset statico JSON | Dati storici dell'ex pokemontcg.io | Codice sotto licenza propria, dati soggetti a copyright PokémonCompany | Utile come fonte di confronto secondaria/storica, non come fonte primaria live. |
| Nintendo/Pokémon Company | Ufficiale diretta | Nessuna API pubblica documentata | — | Non esiste un'API ufficiale diretta della Pokémon Company per il catalogo carte; TCGdex/pokemontcg.io sono le migliori approssimazioni "quasi ufficiali" basate su scraping strutturato del sito ufficiale. |

**Raccomandazione Pokémon: mantenere TCGdex come source-of-truth primaria** (è già l'unica fonte gratuita, multilingua, con GitHub pubblico ispezionabile — il repo `cards-database` stesso è la fonte dei dati, non solo l'API). Usare `pokemon-tcg-data`/Scrydex solo come cross-check secondario in caso di ambiguità (come già fatto per `SV` via Bulbapedia).

### 1.2 One Piece TCG

| Fonte | Tipo | Stato/Copertura | Licenza | Note |
|---|---|---|---|---|
| **vegapull** (repo `Coko7/vegapull`, Rust) | Scraper open source diretto dal sito ufficiale `onepiece-cardgame.com` | Scarica pack/carte/immagini direttamente dalla fonte ufficiale Bandai | Da verificare puntualmente, repo pubblico | Scraper, non un dataset già pronto — va eseguito per generare i dati. |
| **punk-records** (repo `buhbbl/punk-records`) | Dataset JSON statico versionato, generato da vegapull | Copertura diretta del sito ufficiale Bandai, aggiornamenti versionati | **AGPL-3.0-or-later** | Il più vicino a una fonte "canonica derivata" per One Piece: scrape diretto e strutturato del sito ufficiale, non di un aggregatore terzo. Attenzione: AGPL richiede condivisione del codice se il dataset viene distribuito/servito — da valutare con attenzione legale se usato in produzione. |
| **optcgapi.com** | Community API | Usata oggi da `sync-full.js` (con filtro Parallel esplicito) | Non dichiarata pubblicamente in modo chiaro | Fonte attuale di DraGold per EN/JA — aggregatore terzo, non scrape diretto ufficiale. |
| **arjunkai/optcg-api** (Cloudflare Worker, `opbindr.com`) | Community API | 4.347+ carte, 51 set, prezzi TCGplayer | Endpoint gated, chiave su richiesta | Alternativa più recente e strutturata, ma con accesso ristretto. |
| Bandai HTML scraping diretto | Attuale (`sync-cards.js`) | Nessuna struttura JSON, regex su HTML | — | Fragile per definizione (già causa nota di incongruenze rilevate in Phase 0.6). |

**Raccomandazione One Piece: valutare la migrazione da "Bandai HTML scraping + optcgapi.com" verso `vegapull`/`punk-records`** come fonte più vicina all'ufficiale e strutturata, ma **solo dopo verifica esplicita della licenza AGPL-3.0** rispetto al modello di distribuzione DraGold (non risolta in questa ricerca — richiede una decisione legale/di prodotto dedicata, non tecnica).

### 1.3 Magic: The Gathering

**Scryfall** è lo standard de facto, ampiamente riconosciuto come "gold standard" per dati MTG: API HTTPS, bulk data export giornaliero (formato JSONL da luglio 2026), endpoint `/cards/manifest` per sync incrementale. Nessuna alternativa seria necessaria. Priorità CLAUDE.md: solo architettura, zero lavoro attivo — quindi questa fonte va solo *documentata* per quando (se) MTG verrà attivato.

### 1.4 Yu-Gi-Oh!

**YGOPRODeck API v7** è la fonte community de facto, gratuita, con rate limit generoso (20 req/s), copertura completa di carte/set/archetipi/banlist. Non risulta un'API ufficiale Konami pubblica. Stesso discorso di MTG: solo da documentare per attivazione futura.

---

## 2. Cosa è recuperabile da fonte ufficiale vs cosa richiede fonti secondarie

- **Pokémon**: quasi tutto recuperabile da TCGdex (set, carte, lingue, immagini, rarità). Le ambiguità di naming regionale (vedi caso `SV-P`) richiedono occasionalmente un cross-check con fonti enciclopediche (Bulbapedia) — da modellare come step esplicito "se TCGdex non risolve l'ambiguità, cross-check secondario con confidence HIGH CONFIDENCE, mai VERIFIED".
- **One Piece**: nessuna fonte è realmente "ufficiale" in senso di API pubblica Bandai. Il meglio disponibile è uno scrape diretto e strutturato del sito ufficiale (vegapull/punk-records) — comunque da trattare come HIGH CONFIDENCE, non VERIFIED, perché nessuna Bandai API dichiarata esiste.
- **MTG**: Scryfall è sufficientemente autorevole da poter essere trattato come VERIFIED nella pratica del settore.
- **Yu-Gi-Oh!**: YGOPRODeck, community-run, da trattare come HIGH CONFIDENCE.

---

## 3. Perché non serve costruire da zero

TCGdex già copre l'85%+ del problema per Pokémon (multi-lingua, set strutturati, MIT license, self-hostabile). Il problema di DraGold finora non è stata la scelta della fonte per Pokémon — è che **manca uno strato di riconciliazione automatica** fra ciò che TCGdex offre e ciò che è effettivamente in `cards`. Per One Piece, invece, la fonte stessa (Bandai HTML scraping) è il problema architetturale di fondo — lì la priorità è cambiare fonte prima di costruire riconciliazione sopra dati fragili.

---

## 4. Proposta di pipeline — CATALOG RECONCILIATION (progettazione, non implementazione)

### 4.1 Principi

1. **Mai scrittura diretta**: ogni run produce un report (missing/extra/mismatch), mai un UPDATE automatico.
2. **VERIFIED / HIGH CONFIDENCE / UNKNOWN** su ogni singolo finding, non solo sul report complessivo.
3. **`cards.id` mai toccato dalla riconciliazione** — se un id deve cambiare, è una migrazione separata con la sua stessa procedura di snapshot/verifica già rodata in questo engagement, non un'azione della pipeline di reconciliation.
4. **Incrementale**: ogni run opera per (tcg, set) o (tcg, lingua), non full-catalog obbligatorio ogni volta — permette retry mirati.
5. **FK-preserving by design**: la pipeline non propone mai DELETE; propone solo INSERT (per missing) o UPDATE su campi non-FK (per mismatch), sempre con dependency-check preventivo come fatto finora manualmente.

### 4.2 Fasi

1. **Ingestion**: fetch dalla fonte canonica (TCGdex per Pokémon; sorgente da determinare per One Piece dopo valutazione legale) → normalizzazione in uno schema intermedio comune (set_id, card_number, lang, name, immagini, metadata).
2. **Normalizzazione**: mapping esplicito fonte→schema DraGold (stesso lavoro fatto a mano per `tk`/`P`/`SV`, ma codificato una volta come tabella di regole per set, non riscoperto ogni volta).
3. **Confronto**: join fra dataset canonico normalizzato e `cards` esistente su chiave naturale (non su `id`, che è generato — su `tcg+source+set_id+card_number+lang` o equivalente).
4. **Classificazione dei findings**:
   - *Missing*: presente nella fonte, assente in DraGold.
   - *Extra*: presente in DraGold, assente nella fonte (da investigare, mai auto-DELETE).
   - *Mismatch*: stesso record logico, campo divergente (set_id, card_number, rarità, immagine...).
   - *Lingua mancante*: set presente in alcune lingue ma non in altre già disponibili in fonte.
   - *Variant/Parallel*: da trattare con la stessa cautela già definita nel `DUPLICATE_VARIANT_AUDIT_REPORT.md` — mai collassare varianti reali in un'unica riga.
5. **Report pre-scrittura**: markdown/CSV con conteggi, esempi, confidence — stesso formato già usato in questo engagement (Pre-update/Post-update/Stato).
6. **Applicazione solo dopo validazione umana**: nessun passo automatico di scrittura nella v1. Eventuale automazione futura solo per i finding VERIFIED e a basso rischio (es. lingua mancante su un set già interamente corretto), mai per mismatch strutturali.
7. **Retry/incrementalità**: ogni run logga cosa ha processato (per set/lingua) così un fallimento parziale (es. rate limit) non richiede repartire da zero.

### 4.3 Cosa NON fa la v1

- Non tocca One Piece finché non è chiarita la questione fonte/licenza.
- Non introduce nuove tabelle/schema di per sé — il PRINT/VARIANT layer discusso in `MASTER_DATA_MODEL_AUDIT.md` resta un progetto distinto, non un prerequisito.
- Non sostituisce `bulk-import-pokemon` (già disattivato) né gli altri workflow GitHub Actions — è un layer di analisi in più, non una nuova pipeline di scrittura automatica sincrona.

---

## 5. Prossimo passo singolo (se autorizzato)

Prototipo READ-ONLY: uno script che, per un singolo set Pokémon già noto-corretto (es. `svp` inglese), interroga TCGdex e produce un report missing/extra/mismatch contro `cards`, senza scrivere nulla — per validare il modello prima di generalizzarlo. Non eseguito, in attesa di autorizzazione.

---

## Stato

- tk: CORRETTO (1.020/1.020)
- P (Pokémon): CORRETTO (311/311)
- SV: CORRETTO (95/95, → `SV-P`)
- M-P: già canonico, nessuna azione
- One Piece: NON TOCCATO
- schema/codice/cron: NON TOCCATO
- commit/push: nessuno
- Pipeline di reconciliation: SOLO PROGETTATA, non implementata
