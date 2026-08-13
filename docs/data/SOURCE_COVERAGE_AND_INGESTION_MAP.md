# DraGold — Source Coverage & Ingestion Map (Pokémon EN/JP)

Data: 2026-08-13. Scope: solo Pokémon TCG, lingue EN e JA. One Piece e altri TCG fuori scope per
questo documento (restano coperti da `DraGold_Patrimonio_Dati_TCG_Report.md`). Altre lingue Pokémon
sono censite solo dove una fonte le espone "gratis" nello stesso payload — non diventano lavoro attivo.

## 0. Metodo e cosa NON è stato fatto

Nessuna modifica a Supabase, nessuna migration, nessuna modifica alla reconciliation pipeline
(`scripts/reconcile-pokemon.js` + `scripts/lib/reconcile/*`), nessuna modifica al modello dati,
nessun download massivo, nessuna ingestion massiva, nessun refactor. Questo documento non
implementa i job di ingestion proposti in §7 — li descrive per poterli eseguire come task separati.

Base di partenza (non riscoperta da zero): `DraGold_Patrimonio_Dati_TCG_Report.md` (10 ago),
`CATALOG_RECONCILIATION_PIPELINE_PROPOSAL.md` (12 ago), `MASTER_DATA_MODEL_AUDIT.md` (12 ago),
`DUPLICATE_VARIANT_AUDIT_REPORT.md` (12 ago), `PHASE_0.6_FINAL_DECISION_REPORT.md` (12 ago),
`SCHEMA_VERIFICATION_REPORT.md` (9 ago), oltre al codice reale: `scripts/sync-full.js`,
`scripts/sync-pokemon-ptcg.js`, `scripts/sync-pokemon-ja.js`, `scripts/lib/image-resolver.js`,
`scripts/reconcile-pokemon.js`. Le fonti esterne (TCGdex, pokemontcg.io/Scrydex, Pokellector,
database ufficiale Pokémon) sono state ri-verificate oggi via ricerca web mirata — dove qualcosa è
cambiato rispetto al 10-12 agosto è segnalato esplicitamente.

Legenda confidenza: **VERIFIED** (fonte primaria/documentazione ufficiale letta oggi o codice reale
letto in questa sessione), **HIGH CONFIDENCE** (ricerca convergente, non fonte primaria diretta),
**UNKNOWN** (dichiarato esplicitamente, non inventato).

---

## 1. Source hierarchy

**Fonte primaria — Pokémon EN + JA**
- **TCGdex** (`api.tcgdex.net`, repo `tcgdex/cards-database`). Già in uso in produzione
  (`scripts/sync-full.js`, `scripts/sync-pokemon-ja.js`). Gratuita, multilingua (EN+JA nello scope,
  +10 altre lingue "gratis" nello stesso payload), MIT su dati/struttura, community attiva.
  Nessun motivo di sostituirla come primaria: nessun'altra fonte gratuita verificata oggi copre
  EN+JA con la stessa ampiezza.

**Fonti secondarie — cross-check e campi che TCGdex non ha**
- **pokemontcg.io / Scrydex** (`api.pokemontcg.io/v2`, ora parte di Scrydex). Già in uso
  (`scripts/sync-pokemon-ptcg.js`) solo per EN. Utile per cross-check e per il segnale di variante
  dentro `tcgplayer.prices` (§5). **Cambiamento rispetto al 10-12 agosto**: confermato oggi che il
  tier gratuito storico di `pokemontcg.io` è in fase di dismissione a favore di Scrydex, che è
  interamente a pagamento e a crediti (nessun tier gratuito verificato). Va trattata da qui in avanti
  come **fonte secondaria a costo**, non come seconda fonte gratuita di pari livello a TCGdex — non
  buttarla via (offre già valore oggi), ma non pianificare nuova ingestion che ne dipenda in modo
  strutturale senza budget esplicito.
- **PokemonTCG/pokemon-tcg-data** (GitHub, dataset JSON statico dietro il vecchio pokemontcg.io).
  Nessuna licenza esplicita nel repo. Utile solo come snapshot storico/cross-check offline, non come
  fonte live.

**Fonti di enrichment (nessuna oggi integrata, solo valutate)**
- Nessuna fonte di enrichment dedicata trovata per Pokémon EN/JA oltre a TCGdex/pokemontcg.io stessi
  (illustratore, rarità, release date sono già dentro queste due). Non è stata trovata una fonte
  separata affidabile per "personaggio raffigurato" (`character`, PRODUCT_SPEC §1) — vedi gap in §2.

**Fonti di fallback (immagini, solo se TCGdex non ha l'immagine)**
- **Scrydex** e **PokemonPriceTracker** — già implementate come fallback opzionali e disattivate di
  default in `scripts/lib/image-resolver.js` (attive solo se le API key sono configurate). Restano
  fallback validi, a pagamento.

**Fonti scartate esplicitamente per l'ingestion (motivazione in §8)**
- **Pokellector**: nessuna API, ToS che vieta esplicitamente lo scraping (verificato oggi, §2.4).
  Non utilizzabile come fonte di ingestion. Resta al massimo un riferimento visivo umano per QA
  manuale (es. verificare a occhio una variante dubbia), mai una fonte automatizzata.
- **Database ufficiale Pokémon** (`pokemon.com/us/pokemon-tcg/pokemon-cards`, sito JP
  `pokemon-card.com`): nessuna API pubblica, nessun export strutturato. Valutato in dettaglio in §6.
  Non diventa fonte primaria — resta solo un riferimento per QA umana su ambiguità di naming
  (stesso uso già fatto in passato per il caso `SV-P` via Bulbapedia).

---

## 2. Field → Source matrix

Colonne reali della tabella `cards` (`SCHEMA_VERIFICATION_REPORT.md`, verificato invariato) usate
come riferimento — nessuna migration proposta qui.

| Campo DraGold (`cards`) | Fonte preferita | Fonte secondaria | Metodo estrazione | Identificatore | Problemi noti |
|---|---|---|---|---|---|
| `name` / `name_en` | TCGdex (`name` per lingua) | pokemontcg.io (`name`, solo EN) | REST `GET /v2/{lang}/cards/{id}` | `id` TCGdex (`{setId}-{localId}`) | Nessuno strutturale; refusi rari tra fonti risolvibili con cross-check |
| `set_id` / `set_name` | TCGdex (`set.id`, `set.name`) | pokemontcg.io (`set.id`, `set.name`) | REST `GET /v2/{lang}/sets` + `/sets/{id}` | `set.id` TCGdex | **Bug noto DraGold** (non della fonte): collisione `set_id='tk'` per i Trainer Kit — TCGdex modella sotto-set (`tk-xy-su` ecc.), il mapping DraGold storico li ha appiattiti. Da correggere nel mapping, non nella fonte (`MASTER_DATA_MODEL_AUDIT.md` §11) |
| `card_number` | TCGdex (`localId`) | pokemontcg.io (`number`) | REST | `localId`/`number` | Nessuno per Pokémon (a differenza di One Piece, qui il numero non è mai stato osservato ambiguo) |
| `rarity` | TCGdex (`rarity`, stringa) | pokemontcg.io (`rarity`, stringa) | REST | — | Stringa libera in entrambe le fonti, nessuna FK a `rarities` lato DraGold — normalizzazione resta lavoro DraGold, non della fonte |
| `supertype` | TCGdex (`category`: Pokemon/Trainer/Energy) | pokemontcg.io (`supertype`) | REST | — | Nomenclatura leggermente diversa tra fonti (`category` vs `supertype`), serve mapping esplicito |
| `illustrator` | TCGdex (`illustrator`) | pokemontcg.io (`artist`) | REST, anche endpoint dedicato `GET /v2/{lang}/illustrators` su TCGdex | nome illustratore (stringa libera) | Nessuna fonte espone un ID stabile per illustratore, solo stringa — dedup nome→persona resta lavoro DraGold se servisse una entità `illustrator` a sé (PRODUCT_SPEC §1) |
| `image_url` / `image_url_hi` | TCGdex (`assets.tcgdex.net`, `/low.webp` e `/high.webp`) | pokemontcg.io (`images.small`/`images.large`) | CDN diretto, URL costruito da `card.image` | — | Vedi §4 (Image strategy) per licenza/rischio |
| `print_variant` (finish: normal/holo/reverse/1st ed.) | TCGdex (`variants` object booleano) | pokemontcg.io (`tcgplayer.prices`, chiavi per variante) | REST, campo già esposto ma **mai letto** da nessuno script di sync oggi (`MASTER_DATA_MODEL_AUDIT.md` §4, verificato con grep) | — | TCGdex ha `variants_detailed` in arrivo (ID marketplace per variante) — non ancora generalmente disponibile su tutte le carte, da trattare come arricchimento futuro non come dipendenza |
| `evolves_from` | TCGdex (`evolveFrom`) | — | REST | nome Pokémon precedente (stringa) | Nessuna FK verso un'entità "personaggio/Pokémon" — solo testo libero |
| `series_id` / `series_name` | TCGdex (`serie.id`, `serie.name`) | — | REST `GET /v2/{lang}/series` | `serie.id` | Colonna esiste ma **0% popolata** oggi (verificato in `SCHEMA_VERIFICATION_REPORT.md`) — dato disponibile in fonte, semplicemente non ancora ingerito |
| release date (set) | TCGdex (`set.releaseDate`) | pokemontcg.io (`set.releaseDate`) | REST `GET /v2/{lang}/sets/{id}` | — | Solo a livello set, non a livello singola carta (nessuna fonte espone una release date per-carta diversa da quella del set) |
| `character` (Pokémon raffigurato, PRODUCT_SPEC §1) | Derivabile da `name` (per le carte Pokémon) | — | Nessuna fonte espone un'entità "character" separata con ID stabile | — | **Gap dichiarato**: nessuna fonte fornisce oggi un ID stabile di personaggio distinto dal nome carta (es. per collegare tutte le stampe di "Charizard" a prescindere da variazioni di nome regionale/forma). Richiede normalizzazione DraGold, non è disponibile "gratis" da nessuna fonte verificata |
| prodotti/promozioni (sealed, box) | Nessuna fonte gratuita trovata | — | — | — | Confermato invariato da `MASTER_DATA_MODEL_AUDIT.md` §12: TCGplayer ha un modello Category→Group→Product utile come riferimento strutturale, non come fonte dati liberamente riusabile |
| relazioni card↔character | Nessuna fonte diretta | — | — | — | Stesso gap di `character` sopra — da costruire come normalizzazione DraGold su `name`/`evolves_from`, non importabile da nessuna fonte verificata |

---

## 3. Set coverage matrix — EN/JP

Verificato via documentazione TCGdex (endpoint `GET /v2/{lang}/sets`) e conferma indiretta da
`SCHEMA_VERIFICATION_REPORT.md`/`PRODUCT_SPEC.md` sui volumi già in DB.

| Aspetto | EN | JA |
|---|---|---|
| Copertura set TCGdex | Copertura storica pressoché completa (Base Set → set correnti), stessa base dati community usata oggi in produzione | Copertura ampia ma storicamente meno esaustiva del ramo EN per i set più vecchi (community-driven: dipende da chi contribuisce scan); set moderni (Scarlet & Violet in poi) ben coperti |
| Righe oggi in DB (`cards`, verificato 12 ago) | 23.781 (via tcgdex, solo conteggio `lang='en'`; a queste si sommano le righe `source='ptcg'`) | 8.159 |
| Copertura immagini (verificato in `PRODUCT_SPEC.md`, audit 05 ago) | 100% `image_url` popolato per Pokémon EN | Non riportato separatamente da EN in quell'audit — nessun problema noto segnalato per JA specificamente, a differenza di One Piece |
| Gap noto | Collisione `set_id='tk'` (90 gruppi/1.020 righe, §2) — riguarda principalmente le lingue non-EN storiche del set Trainer Kit, ma il bug di mapping è cross-lingua | Stesso bug `tk` si manifesta anche qui; nessun gap di copertura JA specifico oltre a quello già noto |
| pokemontcg.io/Scrydex | Copre EN, non JA (v2 storico era EN-only; Scrydex dichiara più lingue ma dietro paywall, non verificato in dettaglio per JA in questa sessione — **UNKNOWN** se il piano a pagamento copre JA con la stessa profondità di TCGdex) | Non usata oggi da DraGold per JA (`sync-pokemon-ja.js` usa solo TCGdex) |

**Conclusione set coverage**: per lo scope EN+JA richiesto, TCGdex resta l'unica fonte con copertura
completa su entrambe le lingue nello stesso schema. Non serve una seconda fonte per "coprire" set
mancanti — il lavoro reale è nel mapping (bug `tk`), non nella disponibilità dati a monte.

---

## 4. Image strategy

| Uso | Fonte migliore | Perché |
|---|---|---|
| Normal card image | TCGdex, `{card.image}/low.webp` | Già in uso, CDN dedicato (`assets.tcgdex.net`), formato ottimizzato |
| High resolution | TCGdex, `{card.image}/high.webp` (anche `.png`/`.jpg` disponibili) | Stessa fonte, stesso URL base con suffisso qualità — nessun secondo fetch a fonte diversa necessario nel caso comune |
| Variant image (holo/reverse/parallel visivamente diverse) | **Nessuna fonte oggi conferma se l'URL immagine cambia per variante di stampa** per Pokémon (a differenza di One Piece Parallel, che ha un `card_image_id` distinto) | **Dichiarato esplicitamente UNKNOWN**: nella pratica la maggior parte delle varianti di finish Pokémon (holo/reverse/1st ed.) condividono lo stesso artwork/scan della carta base — l'immagine TCGdex esistente resta valida come immagine "di riferimento" per la carta, ma non rappresenta fedelmente l'effetto olografico fisico. Non inventare una seconda immagine per variante se la fonte non la espone |
| Product/promotional images | Nessuna fonte gratuita strutturata trovata (stesso gap di §2 per "prodotti/promozioni") | I promo Pokémon (Black Star Promo ecc.) sono comunque singole carte con la propria riga TCGdex e quindi la propria immagine — il gap riguarda solo prodotti sigillati (box/ETB), non le carte promo in sé |
| Fallback se TCGdex non ha l'immagine | Scrydex → PokemonPriceTracker (cascata già implementata in `scripts/lib/image-resolver.js`, disattivata senza API key) | Nessuna modifica necessaria, pattern già corretto: mai un URL indovinato, `null` esplicito se nessuna fonte ha l'immagine |

**Licenza immagini (invariato da `DraGold_Patrimonio_Dati_TCG_Report.md` §7, non riverificato da
zero oggi salvo conferma FAQ TCGdex)**: nessuna fonte concede una licenza d'uso commerciale esplicita
sulle immagini carta. Il MIT di `tcgdex/cards-database` copre dati/struttura, non le immagini stesse
(confermato oggi dalla FAQ TCGdex: "non affiliato con Nintendo/The Pokémon Company", nessuna
menzione di licenza immagini separata dalla licenza dati). Trattare come nel report precedente: uso
"di riferimento/identificativo", rischio accettato di fatto nel settore, non una licenza. Non
riaprire questa valutazione legale qui — resta un punto per consulenza legale dedicata se DraGold
scala, non per questo task.

---

## 5. Variant strategy

| Variante | Distinguibile da TCGdex? | Distinguibile da pokemontcg.io? | Note |
|---|---|---|---|
| Normal | Sì (`variants.normal = true`) | Sì (assenza di `holofoil`/`reverseHolofoil` in `tcgplayer.prices`, indiretto) | TCGdex è il segnale diretto, pokemontcg.io è indiretto (nato per pricing) |
| Holo | Sì (`variants.holo = true`) | Sì (chiave `holofoil` in `tcgplayer.prices`) | Doppia conferma disponibile, non ancora letta da nessuno script di sync |
| Reverse holo | Sì (`variants.reverse = true`) | Sì (chiave `reverseHolofoil`) | Idem |
| 1st edition | Sì (`variants.firstEdition = true`) | Sì (chiave `1stEditionHolofoil` quando presente) | Idem |
| Promo | Parziale — nessun flag booleano dedicato, va dedotto dal `set.id`/`set.name` (set promozionali hanno ID riconoscibili, es. `swshp`, `smp`) | Parziale, stesso principio | Nessuna fonte ha un campo `is_promo` esplicito verificato — è una regola di mapping su set, non un dato diretto |
| Alternate art | **Non trovato un flag esplicito e separato in nessuna delle due fonti** in questa sessione, invariato da `MASTER_DATA_MODEL_AUDIT.md` §4 | Stesso | **UNKNOWN dichiarato**: spesso implicito nel nome carta ("... (Alternate Full Art)") o deducibile da `rarity` (es. "Special Illustration Rare"), mai un booleano dedicato — non inventare un campo che la fonte non offre esplicitamente, trattarlo come derivato da `rarity`/`name` con confidenza bassa |
| Parallel | Non applicabile a Pokémon (terminologia One Piece) | — | — |
| Reprint | Non distinguibile in modo affidabile: TCGdex/pokemontcg.io modellano ogni edizione di un set come record a sé (stesso `card_number`, `set.id` diverso per la ristampa) — è già "un'altra riga", non un flag su una riga esistente | Idem | Nessuna azione nuova richiesta: il modello a due livelli CARD ENTITY→PRINT già proposto in `MASTER_DATA_MODEL_AUDIT.md` gestisce questo caso per costruzione (ristampa = nuovo `set_id`, stesso `canonical_card_id` se il matching lo riconosce) |
| Altre varianti osservate (Shadowless, Stamped) | **Non trovato un campo esplicito** in nessuna fonte in questa sessione (confermato invariato da `MASTER_DATA_MODEL_AUDIT.md` §4) | — | Dichiarato UNKNOWN, non se ne inventa la copertura. Storicamente rappresentate come combinazioni implicite di set/epoca (es. "Shadowless" = un particolare print run di Base Set), non come flag di carta |

**Principio guida (non derogabile)**: dove la fonte non espone il dato in modo esplicito, il campo
resta vuoto/derivato-a-bassa-confidenza — non si inventa una soluzione. Questo vale in particolare
per Alternate Art, Shadowless, Stamped.

---

## 6. Official Pokémon assessment

**Domanda**: il database ufficiale Pokémon (`pokemon.com/us/pokemon-tcg/pokemon-cards` per EN,
`pokemon-card.com` per JP) può diventare fonte primaria per Pokémon EN?

**Risposta: no, non oggi.** Verificato (ri-confermato con ricerca mirata in questa sessione, oltre a
quanto già stabilito il 10 agosto):

- **Nessuna API pubblica documentata** su nessuno dei due domini (US/EN e JP). Il "Pokémon TCG Card
  Database" su pokemon.com è una UI di ricerca pensata per navigazione umana (filtri per tipo carta,
  energia, formato, espansione), non un endpoint JSON pubblico.
- **Nessun export strutturato** (CSV/JSON) offerto ufficialmente.
- **Licenza**: The Pokémon Company International pubblica solo Media Usage Guidelines che concedono
  uso editoriale/informativo **esplicitamente non commerciale** (`press.pokemon.com/en/Assets-Use-Terms`,
  verificato nel report del 10 agosto, non ricontrollato oggi perché non è cambiata natura di policy
  di questo tipo in 3 giorni senza annuncio — se servisse una conferma puntuale andrebbe rifatta al
  momento dell'ingestion, non qui).
- **Limiti concreti se si tentasse comunque lo scraping**: sito pensato per rendering umano (HTML
  denso di markup per filtri/paginazione), nessuna garanzia di stabilità della struttura pagina nel
  tempo, nessun identificatore stabile di carta esposto pubblicamente in modo ovvio (a differenza di
  TCGdex/pokemontcg.io che hanno `id` espliciti in risposta JSON).

**Conclusione**: il database ufficiale resta un riferimento di verità per dirimere ambiguità (stesso
uso già fatto per il caso `SV-P` tramite Bulbapedia, che a sua volta deriva in ultima istanza dai dati
ufficiali del set), non una fonte di ingestion. Non c'è nessun beneficio tecnico nel sostituire TCGdex
con uno scraper del sito ufficiale: TCGdex **è già**, di fatto, uno strato strutturato sopra lo stesso
tipo di informazione ufficiale, con il vantaggio di essere già API-first e già integrato.

---

## 7. Ingestion plan (proposta, non implementata)

Job separati per responsabilità, coerenti con la pipeline di reconciliation già progettata in
`CATALOG_RECONCILIATION_PIPELINE_PROPOSAL.md` (fasi SOURCE → RAW → NORMALIZATION → CONFRONTO →
CLASSIFICAZIONE → REPORT → APPLICAZIONE SOLO DOPO VALIDAZIONE UMANA) e con il motore offline già
scritto in `scripts/reconcile-pokemon.js`/`scripts/lib/reconcile/*`.

1. **Catalog/set ingestion** — fetch di `GET /v2/{lang}/sets` da TCGdex per EN e JA, normalizzazione
   verso lo schema `sets` esistente. Prerequisito di tutti gli altri job (serve la lista set corretta
   prima di poter validare `card_number` per set).
2. **Card metadata ingestion** — fetch di `GET /v2/{lang}/cards/{id}` (o bulk per set) da TCGdex,
   mapping verso `cards` per i campi già gestiti oggi (`name`, `rarity`, `supertype`, `illustrator`,
   `evolves_from`) **più** i campi oggi non letti ma disponibili in fonte: `variants` (per popolare
   `print_variant`, oggi 0% pieno) e `serie` (per popolare `series_id`/`series_name`, oggi 0% pieno).
   Nessuna migration necessaria — sono colonne già esistenti.
3. **Image ingestion** — separato da (2) per poter girare a frequenza diversa e con retry indipendente
   (le immagini sono il tipo di richiesta più soggetto a fallimento di rete). Riusa la cascata già
   scritta in `image-resolver.js`, nessun nuovo codice di risoluzione necessario.
4. **Variant/product enrichment** — job dedicato per leggere `tcgplayer.prices` da pokemontcg.io come
   **conferma incrociata** (non fonte primaria) della presenza di una variante già segnalata da
   TCGdex `variants`, coerente con quanto già raccomandato in `MASTER_DATA_MODEL_AUDIT.md` §4. Da
   eseguire solo dopo (2), mai come sostituto.
5. **Reconciliation report** (già progettato, non nuovo) — esecuzione READ-ONLY di
   `scripts/reconcile-pokemon.js` (nella sua futura modalità Supabase-connessa, oggi solo su fixture
   offline) contro il risultato di (1)+(2) per produrre missing/extra/mismatch, mai scritture dirette.

**Ordine consigliato**: 1 → 2 → 3 in parallelo con 4 → 5. Nessun job qui proposto scrive mai
direttamente `cards`/`canonical_cards` senza passare da un report di reconciliation, coerente con il
principio "mai scrittura diretta" già stabilito nella proposta di pipeline del 12 agosto.

**Cosa questo piano NON fa (esplicitamente fuori scope di questo documento)**: non implementa nessuno
di questi job, non corregge il bug `set_id='tk'` (resta task separato già descritto in
`MASTER_DATA_MODEL_AUDIT.md` §11/§21), non tocca la reconciliation pipeline esistente, non introduce
nuove tabelle.

---

## 8. Licensing / Terms — riepilogo per fonte in scope

| Fonte | Uso consentito | Limiti |
|---|---|---|
| **TCGdex** (dati/struttura) | MIT, uso libero incluso commerciale | Nessuno noto sui dati; le immagini servite dallo stesso progetto (`assets.tcgdex.net`) **non sono coperte dalla stessa licenza MIT** — vedi §4 |
| **pokemontcg.io / Scrydex** | Nessuna licenza esplicita concessa sui dati storici v2; Scrydex è un prodotto commerciale a pagamento con propri ToS (non riletti articolo per articolo in questa sessione, da fare prima di un'integrazione a pagamento strutturale) | Tier gratuito in dismissione (confermato oggi) — non pianificare ingestion che assuma un tier gratuito stabile |
| **Pokellector** | **Nessuno** | ToS verificato oggi: nessuna API, scraping non autorizzato esplicitamente. Escluso come fonte di ingestion |
| **Database ufficiale Pokémon (US/JP)** | Solo uso editoriale/informativo non commerciale (Media Usage Guidelines) | Nessuna licenza per uso commerciale delle immagini/dati; nessuna API quindi il tema si pone solo in caso di scraping manuale mirato per QA, non per ingestion automatizzata |
| **PokemonTCG/pokemon-tcg-data** (GitHub) | Nessun file LICENSE esplicito nel repo | Trattare come "tollerato de facto", non come base legale solida — coerente con la valutazione già fatta il 10 agosto |

**Non assumere mai** che "pubblico sul web" equivalga a "riutilizzabile": nessuna fonte in questo
scope concede oggi una licenza esplicita per uso commerciale delle **immagini**; solo TCGdex concede
una licenza esplicita (MIT) per i **dati testuali/struttura**.

---

## 9. Risposta diretta al criterio di successo

Per costruire il catalogo Pokémon EN/JP di DraGold:

- **Anagrafica carta** (nome, set, numero, rarità, supertype, illustratore, evolve-da, serie) → da
  **TCGdex**, come oggi, con l'aggiunta di leggere due campi già disponibili in fonte e oggi ignorati
  (`variants`, `serie`).
- **Immagini** (normale e alta risoluzione) → da **TCGdex** (`assets.tcgdex.net`), con fallback a
  **Scrydex**/**PokemonPriceTracker** solo se TCGdex non ha l'immagine (cascata già implementata).
- **Conferma incrociata variante di stampa e prezzo** → da **pokemontcg.io/Scrydex**, trattata come
  fonte secondaria a pagamento in fase di transizione, mai come base primaria unica.
- **Validation/fallback su ambiguità di naming/set** → **Bulbapedia** e, se necessario, ispezione
  manuale del **database ufficiale Pokémon** — mai come fonte di ingestion automatizzata.
- **Escluso**: Pokellector (nessuna licenza d'uso, nessuna API).

Informazioni non recuperabili in modo affidabile da nessuna fonte verificata in questo scope, e
dichiarate esplicitamente come tali: identità stabile di "personaggio/Pokémon raffigurato" separata
dal nome carta; Alternate Art come flag esplicito; Shadowless/Stamped come flag esplicito; prodotti
sigillati/promozionali come dataset strutturato gratuito.
