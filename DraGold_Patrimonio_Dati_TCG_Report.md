# DraGold — Patrimonio Dati TCG: Ricerca Strategica
### Pokémon TCG (EN/JP) · One Piece Card Game (EN/JP) — costruire vs. dipendere da terzi
Data ricerca: 10 agosto 2026

---

## Nota di metodo

Prima di cercare fonti esterne, ho verificato cosa DraGold usa **già oggi** leggendo `scripts/sync-full.js`, `scripts/sync-pokemon-ptcg.js`, `scripts/sync-pokemon-ja.js`, `scripts/enrich-cards.js` e `scripts/lib/image-resolver.js` nel repository. Questo non è un audit dello schema (non rifatto, come richiesto) ma serve a non riproporre come "scoperta" ciò che il codice fa già, e a capire dove sono i gap reali. In sintesi, oggi:

- **Pokémon EN+JA** → TCGdex (`api.tcgdex.net`), fonte primaria multilingua con immagini incluse.
- **Pokémon EN** → anche pokemontcg.io v2 (`api.pokemontcg.io`), con una API key in chiaro nello script (`PTCG_API_KEY`) — non è un problema di sicurezza critico (è una key del tier gratuito), lo segnalo solo perché l'ho notato leggendo il codice, non è oggetto di questo task.
- **One Piece EN** → optcgapi.com (community, gratuita, Django REST, ~4347 carte).
- **One Piece JA** → **non ha una fonte dati reale**: il nome carta è il placeholder inglese (da optcgapi), solo l'immagine è presa dal CDN ufficiale Bandai (`onepiece-cardgame.com/images/cardlist/card/{id}.png`). Il commento nel codice dice esplicitamente che `jp.onepiece-cardgame.com` blocca i bot e quindi non viene scrapato. **Questo è il gap più concreto che questa ricerca doveva indirizzare**, e ci torno nella sezione 14.
- Esiste già un resolver di fallback immagini a cascata (TCGdex → Scrydex → PokemonPriceTracker, entrambi opzionali/a pagamento, disattivati se manca la API key) che è concettualmente già una mini pipeline di provenance — la userò come base per l'architettura proposta invece di inventarne una nuova.

Tutte le affermazioni su licenze/ToS sotto sono verificate da fonte primaria (pagina ufficiale o repository), con link. Dove non ho trovato conferma primaria lo dico esplicitamente — non ho riempito vuoti con supposizioni.

---

## 1. Executive Summary

1. **Pokémon TCG (EN/JA) ha già un'ottima fonte dati gratuita e strutturata**: TCGdex. È community-maintained, MIT su dati/struttura, multilingua, attivamente aggiornata (release a giugno 2026), e DraGold la usa già come primaria. Non serve costruire uno scraper Pokémon da zero.
2. **One Piece TCG è molto più debole come ecosistema dati**: non esiste un equivalente di TCGdex. Le fonti disponibili (optcgapi.com, apitcg.com, dotgg.gg) sono tutte piccole, non ufficiali, e derivano — direttamente o indirettamente — dallo stesso sito ufficiale Bandai (`en.onepiece-cardgame.com/cardlist/`).
3. **Il gap concreto più urgente per DraGold è One Piece JA**: oggi non esiste nel prodotto un vero dato giapponese (solo immagine + nome inglese placeholder). Nessuna fonte terza trovata in questa ricerca copre il testo JP delle carte One Piece in modo strutturato e gratuito.
4. **Verificata la tesi di partenza**: quasi nessuna delle API "note" produce dati da zero. `TCGdex` = community scan + inserimento manuale. `pokemontcg.io` = stesso schema, dati derivati/aggregati dalla community + prezzi TCGplayer/Cardmarket. `optcgapi.com` e in particolare `optcg-api` (opbindr.com) dichiarano esplicitamente le fonti a monte: sito ufficiale Bandai (scraping Playwright), TCGPlayer, dotgg.gg, eBay. La filiera è documentata nella sezione 9.
5. **Le immagini delle carte non sono mai "libere"**, nemmeno quando il codice che le serve è open source (MIT). Il codice/JSON può essere MIT; l'immagine della carta resta copyright Nintendo/Creatures/GAME FREAK/Pokémon Co. (Pokémon) o Eiichiro Oda/Shueisha/Toei/Bandai Namco (One Piece). TCGdex e optcg-api lo dichiarano esplicitamente nei loro stessi repository.
6. **Pokémon Company International concede solo uso editoriale non commerciale** delle sue immagini/marchi (Media Usage Guidelines, press.pokemon.com). Bandai dichiara le carte "copyright Bandai Namco Entertainment" e ha pubblicato a luglio 2026 un avviso anti-contraffazione che **non costituisce licenza d'uso**. Nessuno dei due publisher offre un programma developer/API ufficiale per il TCG.
7. **Il miglior riferimento architetturale trovato non è un dataset, è un progetto**: `arjunkai/optcg-api` (dietro opbindr.com). Implementa quasi esattamente la pipeline SOURCE→PROVENANCE→CONFIDENCE che la user voleva valutare: sorgenti multiple con priorità esplicita, campo `price_source` per audit, mediana troncata su listing eBay, override manuali che vincono sempre. Codice MIT, riusabile come pattern (non come dati).
8. **TCGplayer ha un ToS molto restrittivo sulla redistribuzione dei prezzi**: vieta esplicitamente di combinare i suoi dati con altre fonti o di ricostruire un prodotto che compete con TCGplayer. Chi lo fa comunque (es. TCGCSV) opera in una zona grigia tollerata, non garantita.
9. **Cardmarket ha aperto il price guide/catalogo al download gratuito per tutti** (non solo utenti API a pagamento) — utile, ma la redistribuzione commerciale/enterprise richiede accordo scritto separato.
10. **Esistono librerie open source mature e pronte per la fase di entity matching/deduplication** della pipeline proposta (`dedupe`, `splink`), quindi questo componente non va costruito da zero.
11. **Costruire un database DraGold proprietario è possibile, ma "SÌ, MA"**: fattibile per Pokémon (fonte solida già disponibile e già in uso), realistico ma più impegnativo per One Piece (serve uno scraper etico contro il sito ufficiale, mancante oggi), e comunque **il possesso dei dati normalizzati (numeri, rarità, set, testo) è diverso dal possesso delle immagini**, che restano sempre dati "in licenza precaria" salvo diverso accordo col publisher.
12. **Una API proprietaria DraGold ha senso, ma solo dopo aver stabilizzato la pipeline di provenance interna** — altrimenti si rischia di esporre agli utenti la stessa fragilità che oggi si subisce dalle fonti esterne.
13. Il rischio principale non è tecnico, è **di continuità delle fonti**: `pokemontcg.io` sta visibilmente spostando risorse verso `Scrydex` (prodotto commerciale a pagamento, stesso team); TCGdex resta il più solido per Pokémon proprio perché community-driven e non monetizzato in modo esclusivo.
14. Non è stato individuato **nessun database ufficiale, pubblico e strutturato** né per Pokémon né per One Piece: entrambi i publisher pubblicano solo pagine web per gli umani (card list), non endpoint pensati per l'automazione.
15. Il prossimo passo che consiglio non è "costruire tutta l'architettura", ma un singolo esperimento mirato e a basso rischio: verificare se il sito ufficiale JP di One Piece Card Game è realmente scrapabile in modo rispettoso (rate limit basso, headless browser, controllo `robots.txt`), perché da questo dipende se il gap #3 si chiude con scraping proprio o richiede una fonte terza non ancora trovata. Dettagli in sezione 14.

---

## 2. Migliori fonti trovate (classifica per valore DraGold)

| # | Fonte | TCG | Perché conta per DraGold |
|---|---|---|---|
| 1 | **TCGdex** (`tcgdex.dev`, GitHub `tcgdex/cards-database`) | Pokémon EN+JA (+10 lingue) | Già in uso, gratuita, MIT, immagini incluse, community attiva |
| 2 | **Sito ufficiale One Piece Card Game** (`en.onepiece-cardgame.com/cardlist/`) | One Piece EN | Fonte di verità per numeri/rarità/testo; base di tutte le API terze trovate |
| 3 | **arjunkai/optcg-api** (GitHub, dietro opbindr.com) | One Piece EN | Non è una fonte dati da consumare, è il miglior *pattern* di pipeline provenance/pricing trovato: da studiare, non da copiare i dati |
| 4 | **optcgapi.com** | One Piece EN | Già in uso da DraGold, gratuita, ~4347 carte |
| 5 | **TCGCSV** (`tcgcsv.com`) | Prezzi multi-TCG (via TCGplayer) | Utile per prezzi, ma redistribuzione in zona grigia legale (vedi §8) |
| 6 | **Cardmarket price guide download** | Prezzi EU multi-TCG | Ora aperto a tutti gratuitamente, condizioni commerciali da verificare per uso a scala |
| 7 | **pokemontcg.io / pokemon-tcg-data** | Pokémon EN | Solido ma in fase di "abbandono morbido" a favore di Scrydex — non fonte primaria da consolidare ulteriormente |
| 8 | **apitcg.com** | Multi-TCG incl. One Piece | Conferma esplicita di fonte (scraping da `en.onepiece-cardgame.com/cardlist/`), utile come seconda opinione/cross-check, non come primaria (piccola, poco matura) |

---

## 3. GitHub / Open Source

### 3.1 Dati carte

| Repository | Cosa fa | Licenza | Stato | Utilità DraGold | Riutilizzabile? |
|---|---|---|---|---|---|
| [`tcgdex/cards-database`](https://github.com/tcgdex/cards-database) | Database carte Pokémon multilingua dietro l'API TCGdex | MIT (dati/struttura); immagini separate, non coperte da MIT | Molto attivo (828★, release giugno 2026) | Fonte primaria già in uso | Sì, già integrata |
| [`PokemonTCG/pokemon-tcg-data`](https://github.com/PokemonTCG/pokemon-tcg-data) | JSON grezzo dietro pokemontcg.io | Nessun file LICENSE nel repo → default "tutti i diritti riservati", nonostante l'apertura a PR | Attivo ma team spostato su Scrydex | Fonte secondaria EN, prezzi TCGplayer/Cardmarket integrati | Sì con cautela: nessuna licenza esplicita concessa sui dati |
| [`apitcg/one-piece-tcg-data`](https://github.com/apitcg/one-piece-tcg-data) | JSON carte One Piece EN | Non dichiarata nel repo | Piccolo, poco maturo (13★, 11 commit) | Conferma di lineage (fonte = sito ufficiale) | Solo come riferimento, non come dataset primario |
| [`arjunkai/optcg-api`](https://github.com/arjunkai/optcg-api) | API Cloudflare Workers dietro opbindr.com, One Piece | Codice MIT; **dati e immagini esplicitamente esclusi dalla licenza** | Attivo, ben documentato (202 commit) | **Miglior riferimento architetturale** per pricing multi-fonte con provenance | Il codice sì (pattern), i dati no (il README lo vieta esplicitamente) |
| [`nemesis312/OnePieceTCGEngCardList`](https://github.com/nemesis312/OnePieceTCGEngCardList) | JSON statico carte One Piece EN | Non verificata | Piccolo progetto personale | Cross-check secondario | Solo come confronto, non affidabile come primaria |

### 3.2 Software riutilizzabile (non dati)

| Repository | Cosa fa | Licenza | Stato | Utilità DraGold | Riutilizzabile? |
|---|---|---|---|---|---|
| [`dedupeio/dedupe`](https://github.com/dedupeio/dedupe) | Fuzzy matching e deduplicazione con active learning (Python) | MIT | Maturo, stabile | Fase ENTITY MATCHING/DEDUPLICATION della pipeline proposta (es. matching carta TCGdex ↔ carta pokemontcg.io ↔ carta scrapata) | Sì |
| [`moj-analytical-services/splink`](https://github.com/moj-analytical-services/splink) | Record linkage probabilistico scalabile (anche su Spark/DuckDB) | MIT | Molto maturo, usato da enti pubblici UK | Alternativa a `dedupe` se il volume cresce oltre poche decine di migliaia di righe | Sì, da valutare se/quando serve scala |
| `arjunkai/optcg-api` → `scraper.py`, `scripts/` | Scraper Playwright contro sito ufficiale Bandai + pipeline prezzi con priorità sorgente | MIT (codice) | Attivo | Pattern di riferimento per uno scraper One Piece proprio di DraGold | Sì come pattern/ispirazione, non va puntato al suo D1 (esplicitamente vietato dal README) |
| `tcgdex/cards-database` → `scripts/`, `server/`, `Dockerfile` | Build pipeline dell'API TCGdex stessa | MIT | Attivo | Riferimento per normalizzazione multilingua e servizio immagini via CDN | Sì come riferimento |
| [`CptSpaceToaster/tcgcsv`](https://github.com/CptSpaceToaster/tcgcsv) | Infrastruttura (Terraform/AWS) che espone il catalogo TCGplayer come CSV pubblico | Non verificata nel dettaglio | Attivo | Riferimento infrastrutturale per pubblicare cataloghi come CSV | Solo come pattern infrastrutturale — **non come giustificazione legale** per redistribuire dati TCGplayer (vedi §8) |

---

## 4. Fonti ufficiali

### Pokémon
Non esiste un'API ufficiale del publisher per il TCG. Pokémon.com ha una card list consultabile via browser, senza endpoint JSON documentato pubblicamente. The Pokémon Company International pubblica invece **Media Usage Guidelines** (`press.pokemon.com/en/Assets-Use-Terms`) che concedono una licenza "non-exclusive limited" solo per uso **editoriale/informativo, esplicitamente non commerciale** — niente vendita, niente uso in prodotti a pagamento, niente naming/branding che implichi affiliazione. Il supporto Pokémon (`support.pokemon.com`) rimanda alla stessa policy quando gli utenti chiedono se possono usare immagini/materiali. **Conclusione**: nessuna via ufficiale per ottenere licenza d'uso commerciale delle immagini carte da Pokémon; qualunque immagine usata oggi (via TCGdex o altrove) viaggia legalmente su un piano diverso da quello dei dati testuali normalizzati (numero, rarità, nome, set).

### One Piece Card Game (Bandai)
Il sito ufficiale (`en.onepiece-cardgame.com`, con varianti regionali: `www.onepiece-cardgame.com` JP, `asia-en.`, `asia-tc.`, `asia-th.`, `onepiece-cardgame.kr`, `fr.`) pubblica la card list a `/cardlist/` e occasionalmente PDF (es. `asia-en.onepiece-cardgame.com/pdf/don-cardlist.pdf`). Nessuna API pubblica, nessun export JSON ufficiale. A luglio 2026 Bandai ha pubblicato un avviso ("Regulations Regarding the Protection of Intellectual Property Associated with ONE PIECE Card Game") che dichiara esplicitamente: *"Card images, info, level, rank, attribute type and card text are copyright Bandai Namco Entertainment"* e che le regole pubblicate **non costituiscono permesso formale né rinuncia a diritti legali**. L'avviso è mirato principalmente contro prodotti contraffatti/proxy venduti online, ma conferma senza ambiguità la titolarità del copyright su tutti i dati e le immagini delle carte.

Il sito JP (dominio `www.onepiece-cardgame.com` / storicamente riferito come `jp.onepiece-cardgame.com` nel codice DraGold) risulta **non scrapabile con richieste semplici** secondo l'esperienza già documentata nel codice DraGold stesso (blocco bot). Non è stato verificato in questa ricerca se un headless browser (Playwright/Puppeteer) con user-agent realistico e rate limiting basso riesca a superare il blocco: è il test suggerito in sezione 14.

---

## 5. Dataset

| Dataset | Copertura | Aggiornamento | Condizioni d'uso | Note |
|---|---|---|---|---|
| `pokemon-tcg-data` (JSON) | Pokémon EN, ~20k carte, 170+ set | Attivo, ultima release luglio 2025 | Nessuna licenza esplicita nel repo → cautela | Usalo per cross-check, non come unica fonte di verità legale |
| `tcgdex/cards-database` | Pokémon 10+ lingue incl. EN/JA | Molto attivo (release giugno 2026) | MIT su dati/struttura | Già fonte primaria DraGold |
| `apitcg/one-piece-tcg-data` | One Piece EN | Poco attivo (11 commit) | Non dichiarata | Solo cross-check |
| `nemesis312/OnePieceTCGEngCardList` | One Piece EN | Sconosciuto | Non dichiarata | Solo cross-check |
| TCGCSV export (CSV/JSON) | Prezzi/catalogo multi-TCG via TCGplayer | Giornaliero | Terze parti, ToS TCGplayer sottostante restrittivo | Solo per uso interno/analisi, non per ripubblicazione diretta senza verifica legale |
| Cardmarket price guide download | Prezzi/catalogo EU multi-TCG | Periodico | Gratuito per download singolo; redistribuzione commerciale richiede accordo scritto | Buona fonte prezzi EU se uso resta "consultazione", non "rivendita dati" |

Non è stato trovato nessun dataset strutturato gratuito e mantenuto per **One Piece JA** (testo carte in giapponese). Questo è il gap più rilevante emerso da tutta la ricerca.

---

## 6. API

| API | Cosa fornisce | Da dove sembrano arrivare i dati | Costo |
|---|---|---|---|
| TCGdex | Carte, set, serie, immagini, multilingua | Community: scan/inserimento manuale via PR sul repo `cards-database` | Gratuita |
| pokemontcg.io v2 | Carte EN, prezzi TCGplayer/Cardmarket | Community + prezzi aggregati dai due marketplace | Gratuita (in fase di transizione verso Scrydex) |
| Scrydex | Multi-TCG incl. One Piece, prezzi storici, graded, image recognition | Stesso team di pokemontcg.io, evoluzione commerciale | A pagamento (crediti) |
| optcgapi.com | Carte One Piece EN | Derivata da sito ufficiale Bandai (secondo pattern confermato da apitcg) | Gratuita |
| apitcg.com | Multi-TCG incl. One Piece | Dichiarata: `en.onepiece-cardgame.com/cardlist/` | Gratuita/freemium |
| optcg-api (opbindr.com) | Carte One Piece + prezzi con provenance esplicita | **Dichiarata esplicitamente**: sito ufficiale Bandai (scraper Playwright proprio), TCGPlayer, dotgg.gg, eBay Browse API | Accesso gated, dev non commerciale su richiesta |
| TCGplayer API | Catalogo e prezzi ufficiali del marketplace | Prima parte (TCGplayer stesso) | A pagamento/partnership, ToS restrittivo su redistribuzione |
| Cardmarket API | Catalogo e prezzi EU | Prima parte (Cardmarket) | Tier gratuito limitato + piani a pagamento |
| PriceCharting API/CSV | Prezzi gradati, storico, sold listing | Prima parte (aggregazione propria + scraping dichiarato di eBay/altri marketplace) | A pagamento (CSV solo tier "Legendary") |

---

## 7. Immagini e asset

| Fonte immagini | Origine reale | Licenza | Uso commerciale? | Redistribuzione? | Salvabile in storage nostro? | Mostrabile su DraGold? |
|---|---|---|---|---|---|---|
| `assets.tcgdex.net` (TCGdex) | Scan contribuiti dalla community via Discord/PR | Nessuna licenza esplicita sulle immagini stesse (il MIT del repo copre solo dati/struttura); disclaimer "non affiliato con Nintendo/Pokémon Co." | **Non chiarito da TCGdex** — implicitamente rischioso per uso commerciale puro | Non esplicitamente concessa | Tecnicamente sì, legalmente da verificare | Come oggi (mostrare la carta è la funzione core di un'app collezione — pratica diffusa nel settore, ma non "autorizzata" in senso legale) |
| Immagini ufficiali Bandai (`onepiece-cardgame.com/images/cardlist/card/*.png`) | Sito ufficiale | Copyright dichiarato Bandai Namco/Oda/Shueisha/Toei | No (nessuna licenza concessa) | No | Hotlink diretto oggi (rischio: URL possono cambiare/bloccarsi senza preavviso) | Come oggi, stesso rischio legale di TCGdex |
| Immagini Pokémon (via TCGdex/pokemontcg.io) | Ultimamente scan community, storicamente derivate da materiale ufficiale | Copyright Nintendo/Creatures/GAME FREAK/Pokémon Co.; TPCi concede solo uso editoriale non commerciale (§4) | No | No | Come sopra | Come sopra |
| Bulbapedia / Serebii (fan wiki) | Scan/upload della community | Testi Bulbapedia CC BY-NC-SA, ma le immagini carte restano copyright Nintendo (Bulbapedia lo dichiara esplicitamente) | No | No | Sconsigliato come fonte primaria: aggiunge un livello di incertezza in più senza benefici rispetto a TCGdex | — |
| `HybridShivam/Pokemon` (repo GitHub "highest quality images") | Bulbapedia | Licenza del repo non copre il copyright sottostante delle immagini | No | No | Stesso discorso di cui sopra | — |

**In sintesi sulle immagini**: nessuna fonte trovata offre un diritto d'uso commerciale esplicito sulle immagini delle carte, né per Pokémon né per One Piece. Tutte le pipeline esistenti (incluso `optcg-api`, che è il progetto più trasparente su questo punto) operano su un principio di fatto: "mostriamo l'immagine della carta come riferimento identificativo del prodotto reale, non rivendichiamo diritti, non la vendiamo come asset". Questo è lo stesso principio su cui si basano oggi praticamente tutte le app di collezione/marketplace TCG (comportamento di settore), ma **non è una licenza**, è un rischio accettato implicitamente da tutto il settore. Va verificato con un legale se e quando DraGold cresce di scala o attira attenzione, non prima.

Loghi set/serie e simboli set: **nessuna fonte dedicata trovata** in questa ricerca (né open source né ufficiale con export pulito). Sia TCGdex sia il sito Bandai mostrano simboli set come parte della UI/immagine carta, non come asset separato scaricabile. Se servono a DraGold come elemento UI standalone, andrebbero probabilmente ritagliati/estratti dalle immagini set esistenti (con lo stesso vincolo di licenza di cui sopra) — nessuna scorciatoia trovata.

---

## 8. Licenze e diritti

### UTILIZZABILE
- **Codice** `dedupeio/dedupe`, `splink`, `tcgdex/cards-database` (parte codice/script), `arjunkai/optcg-api` (parte codice) — tutti MIT, uso libero incluso commerciale.
- **Dati strutturali TCGdex** (nomi, numeri, rarità, set — non immagini) — MIT dichiarato esplicitamente nel repository.
- **Cardmarket price guide/catalogo** in download diretto — dichiarato aperto a tutti gli utenti, non solo API a pagamento.

### UTILIZZABILE CON CONDIZIONI
- **pokemontcg.io / pokemon-tcg-data** — nessuna licenza esplicita concessa sui dati, ma uso tollerato de facto da anni nell'ecosistema; da trattare come "fonte secondaria, non come base legale solida".
- **Immagini carte (TCGdex, sito Bandai, ecc.)** — uso "identificativo/di riferimento" tollerato di fatto nel settore, ma nessuna licenza esplicita concessa per uso commerciale; rischio basso nel breve termine data la prassi di settore, ma da rivedere con un legale se DraGold scala.
- **TCGCSV / dati TCGplayer ripubblicati da terzi** — utilizzabile per analisi interna con cautela; la ripubblicazione via API propria a utenti finali rischia di collidere col ToS TCGplayer che vieta esplicitamente la redistribuzione e la combinazione con altre fonti di prezzo.
- **eBay Browse API (sold listing)** — richiede developer account, ToS eBay non verificato in dettaglio in questa ricerca; da verificare separatamente prima di usarlo per uno storico prezzi pubblico.

### SOLO RIFERIMENTO
- **apitcg.com / one-piece-tcg-data** — utile per capire schema e cross-check, non abbastanza maturo/documentato da diventare fonte primaria.
- **Bulbapedia/Serebii/HybridShivam** — utili come riferimento enciclopedico, non come fonte dati/immagini primaria per un prodotto commerciale.
- **arjunkai/optcg-api (dati/D1)** — il README stesso lo dice: non riusare i suoi dati, riusa il suo *pattern* di scraping.

### DA EVITARE
- **Costruire un prodotto che compete direttamente con TCGplayer usando i suoi dati di prezzo redistribuiti** — esplicitamente vietato dal suo ToS (`help.tcgplayer.com/hc/en-us/articles/360061115874`).
- **Usare le Media Usage Guidelines di Pokémon per giustificare un uso commerciale delle immagini** — le stesse guideline escludono esplicitamente questo caso d'uso.
- **Scraping aggressivo del sito JP ufficiale Bandai senza rate limiting/User-Agent onesto** — oltre al rischio di essere bloccati (già osservato), rischia di violare i Terms of Use del sito (non letti in dettaglio in questa ricerca — da fare prima di scrivere lo scraper, vedi §14).

**Punti che richiedono verifica legale esplicita, non risolvibili con ricerca**: (a) se mostrare immagini carte non modificate all'interno di un'app di collezione/marketplace rientra in un uso lecito secondo le leggi applicabili a DraGold (fair use / diritto di cronaca-catalogo non è un concetto uniforme tra giurisdizioni); (b) se la normalizzazione di dati fattuali (numero carta, rarità, nome) da fonti multiple costituisce "database proprio" tutelabile e privo di problemi di copyright (i fatti non sono copyrightabili, ma la selezione/struttura di un database sì, in alcune giurisdizioni UE con la *sui generis database right*); (c) condizioni commerciali reali di Cardmarket/TCGplayer per un volume di query da produzione, che vanno negoziate direttamente, non dedotte da un ToS pubblico.

---

## 9. Data lineage (fonte originale → dato che arriva a noi)

### Pokémon (via TCGdex, fonte primaria DraGold oggi)
```
Scan fisico della carta (community/utenti)
  → upload/PR su tcgdex/cards-database (GitHub)
  → revisione dei maintainer TCGdex
  → JSON strutturato + immagine servita da assets.tcgdex.net
  → api.tcgdex.net (REST/GraphQL)
  → scripts/sync-pokemon-ja.js, sync-full.js (DraGold)
  → tabella cards (Supabase)
```
Non esiste in questa filiera nessun passaggio "ufficiale Pokémon Company": è community end-to-end, il che spiega sia la qualità (community grande, correzioni rapide) sia il limite legale (nessuna licenza dal publisher).

### Pokémon prezzi (via pokemontcg.io)
```
TCGplayer / Cardmarket (marketplace, dati di prima parte)
  → aggregazione da pokemontcg.io (patto/partnership o scraping non dichiarato in dettaglio pubblicamente)
  → api.pokemontcg.io/v2
  → scripts/sync-pokemon-ptcg.js (DraGold, oggi usato solo per EN)
```

### One Piece (via optcgapi.com / pattern confermato da apitcg e da optcg-api)
```
Sito ufficiale Bandai en.onepiece-cardgame.com/cardlist/ (HTML per umani)
  → scraping (Playwright/Selenium, non dichiarato in dettaglio da optcgapi.com,
     ma dichiarato esplicitamente da apitcg.com e da optcg-api/opbindr.com)
  → normalizzazione in JSON (per set, per carta)
  → API REST (optcgapi.com / apitcg.com / optcg-api)
  → scripts/sync-full.js (DraGold) per EN
  → per JA: solo l'immagine viene presa direttamente dal CDN immagini ufficiale
     Bandai (stesso dominio, path /images/cardlist/card/{id}.png); il TESTO
     giapponese non viene raccolto da nessuna fonte oggi in uso da DraGold
```

### One Piece prezzi (pattern optcg-api, il più trasparente trovato)
```
TCGPlayer (scraping price guide) ─┐
dotgg.gg (fallback)               ├─→ merge con priorità esplicita
eBay Browse API (gap-fill,        │   (manual > web_* > tcgplayer > dotgg > ebay)
  mediana troncata 20% su 3+)     │   campo price_source per audit
manual override (data/*.json)    ─┘
  → D1 (Cloudflare) → API REST propria → client (opbindr.com)
```
Questo è l'unico esempio trovato in cui la provenance e il confidence sono **campi di dati veri e propri**, non solo un'idea architetturale — motivo per cui lo cito come riferimento diretto per la sezione 12.

---

## 10. Possiamo costruire il database DraGold?

**SÌ, MA** — con due velocità diverse per i due giochi.

**Pokémon: SÌ, quasi tutto il lavoro è già fatto.** TCGdex fornisce oggi una base dati EN+JA sufficientemente solida, gratuita e con licenza chiara sulla struttura. Il lavoro reale per DraGold non è "raccogliere i dati" ma **normalizzarli in uno schema canonico proprio con provenance**, aggiungendo un secondo strato (es. pokemontcg.io per prezzi/cross-check, Scrydex opzionale a pagamento) solo dove TCGdex non arriva. Il "possesso" qui è soprattutto normalizzazione e arricchimento, non raccolta primaria.

**One Piece: SÌ, ma richiede lavoro reale, non solo integrazione.** Non esiste un TCGdex equivalente. Per possedere davvero il dato One Piece (EN e soprattutto JA), DraGold dovrebbe costruire un proprio scraper etico contro il sito ufficiale Bandai, ispirandosi al pattern di `optcg-api` (Playwright, rate limit, provenance esplicita) invece di dipendere in eterno da optcgapi.com/apitcg.com, che sono progetti piccoli e non garantiti nel tempo (apitcg ha 11 commit totali sul repo dati One Piece: rischio di abbandono concreto).

**Le immagini restano un caso a parte in entrambi i casi**: "possedere" un JSON con numero/rarità/nome è molto diverso, legalmente, da "possedere" l'immagine della carta. Anche costruendo tutta la pipeline dati da soli, le immagini resteranno sempre asset di terzi mostrati "per riferimento", salvo contratto diretto con i publisher (non risulta esistere un percorso di licensing per sviluppatori indipendenti, né per Pokémon né per Bandai).

---

## 11. Possiamo costruire una nostra API?

**SÌ, MA solo dopo aver stabilizzato la pipeline interna**, non come primo passo.

Difficoltà tecnica: bassa/media — Supabase/Postgres è già la base dati DraGold, quindi non serve nuova infrastruttura core; serve principalmente disegnare bene provenance, versionamento e cache immagini (già parzialmente presente nel resolver a cascata in `image-resolver.js`).

Componenti che DraGold può costruire da sé, con moduli già esistenti nell'ecosistema open source:
- **Storage immagini + caching**: già presente (`api/cache-image.js`, `api/scan-images.js`) — da estendere, non da reinventare.
- **Deduplicazione/entity matching**: `dedupe` o `splink` (§3.2), non va scritto da zero.
- **Rate limiting/versionamento API**: pattern standard (es. header `X-Api-Key`, tabella `api_keys` in Supabase), nessuna libreria esotica necessaria.
- **Aggiornamento incrementale**: DraGold ha già script di sync con `--dry-run`, `--force`, filtri per set/lingua — la base per un sistema di aggiornamento incrementale c'è già, manca solo la tabella di provenance/versioning esplicita.

Componenti che conviene lasciare a servizi esterni, almeno inizialmente:
- **Prezzi in tempo reale multi-marketplace** (TCGplayer/Cardmarket ufficiali) — meglio consumarli via partnership/API ufficiale che tentare di replicarli, per non entrare in conflitto con i ToS (§8).
- **OCR/riconoscimento immagine carte** (se mai servisse per uno scanner) — meglio partire da modelli/librerie esistenti (Tesseract, PaddleOCR, o servizi come Scrydex Vision) che allenarne uno proprio, almeno finché il volume di immagini "vere" possedute da DraGold non è enorme.

Una API pubblica futura (terze parti che consumano dati DraGold) è ragionevole come orizzonte, ma **non va costruita prima di aver reso solida e documentata la provenance interna**: un'API pubblica espone anche gli errori di provenance ad altri sviluppatori, e li rende molto più costosi da correggere una volta che altri ci hanno costruito sopra (esattamente il problema che TCGdex sta affrontando ora con il nuovo campo `variants_detailed`, introdotto per risolvere anni di mismatch di prezzo accumulati).

---

## 12. Architettura dati proposta

La pipeline SOURCE → RAW → NORMALIZATION → ENTITY MATCHING → DEDUPLICATION → VALIDATION → PROVENANCE → CONFIDENCE → CANONICAL → SUPABASE → API proposta dalla user è corretta nella forma; la mappo sui problemi reali osservati nel codice DraGold e nelle fonti trovate:

**SOURCE → RAW.** Ogni fonte (TCGdex, pokemontcg.io, optcgapi.com, futuro scraper JP proprio) scrive in una tabella `raw_cards` con `source`, `source_id`, `fetched_at`, payload JSON grezzo non trasformato. Questo già esiste in nuce (`source`, `source_id` sono colonne nello schema attuale) — va solo separato concettualmente dal dato canonico, cosa che oggi non è: oggi la sync scrive direttamente nella tabella `cards` finale.

**NORMALIZATION.** Nomi diversi per lo stesso set (es. TCGdex usa ID tipo `sv3pt5`, optcgapi usa `OP-01`) vanno mappati a un ID di set canonico DraGold, con una tabella `set_id_map(source, source_set_id, canonical_set_id)`. Stesso principio per numerazioni carta (`localId` TCGdex vs `card_set_id` optcgapi) e per rarità (nomi diversi tra fonti per lo stesso concetto, es. "Secret Rare" vs "SecretRare").

**ENTITY MATCHING / DEDUPLICATION.** Per Pokémon, il matching cross-fonte (TCGdex ↔ pokemontcg.io) è quasi deterministico: stesso set + stesso numero + stessa lingua è già una chiave forte, serve fuzzy matching solo sul nome per i casi di refusi/traslitterazioni diverse — qui `dedupe` (con poche feature: nome normalizzato, set, numero) è sufficiente e non richiede infrastruttura pesante. Per One Piece, dove in futuro DraGold avrà più fonti frammentate (proprio scraper + optcgapi + eventuali fonti JP), conviene lo stesso approccio ma con soglie di confidenza più basse, dato che le fonti minori sono meno affidabili.

**VALIDATION.** Regole esplicite e semplici prima di promuovere un record a canonico: campi obbligatori non nulli (nome, set, numero), formato numero carta coerente con il pattern del set, immagine raggiungibile (HTTP 200) al momento del sync — DraGold ha già `image-resolver.js` che implementa un principio simile ("mai un URL indovinato": ritorna null piuttosto che un link rotto), da generalizzare a tutti i campi.

**SOURCE PROVENANCE + CONFIDENCE SCORE.** Qui il riferimento diretto è `optcg-api`: ogni campo (non solo il prezzo) dovrebbe portare `{value, source, confidence, updated_at}`. Un punteggio di confidenza semplice basato su regole (non ML, non serve inizialmente) funziona bene: fonte ufficiale diretta > community strutturata (TCGdex) > community non strutturata (scraping terzo) > derivato/placeholder (es. il nome EN oggi usato come placeholder per One Piece JA, che andrebbe marcato esplicitamente `confidence: low, provenance: placeholder`, cosa che oggi non è visibile a valle).

**CANONICAL DATA → SUPABASE.** Il dato canonico è quello che DraGold mostra e su cui costruisce collection/academy — cioè la tabella `cards` di oggi, ma alimentata da un processo di merge esplicito invece che da upsert diretti multi-sorgente come accade ora (dove `ignoreDuplicates: true` viene usato come meccanismo di provenance implicito e fragile, es. nel caso One Piece JA).

**Gestione nuove carte, aggiornamenti incrementali, versionamento.** Ogni sync già supporta filtri (`--set`, `--lang`, `--force`, `--dry-run`): è già un buon punto di partenza per aggiornamenti incrementali. Manca uno storico dei cambiamenti (oggi un upsert sovrascrive senza lasciare traccia di "cosa è cambiato e perché") — una tabella `card_history` o l'uso delle funzionalità di audit di Postgres/Supabase risolverebbe questo senza nuova infrastruttura.

Questa architettura non richiede nuovi strumenti pesanti (niente Airbyte/Dagster/Meltano necessari a questa scala): gli script Node già esistenti + due tabelle nuove (`raw_cards` o equivalente, `set_id_map`) + qualche campo di provenance in più sui record esistenti bastano.

---

## 13. Priorità

**P0 — fare subito**
- Verificare (tecnicamente, non legalmente) se il sito ufficiale JP di One Piece Card Game è scrapabile con un headless browser rispettoso (vedi §14). Da questo dipende tutto il resto del piano One Piece JA.

**P1 — prossimo**
- Aggiungere provenance esplicita (`source`, `confidence`, `updated_at` per campo, non solo per riga) allo schema esistente, partendo dai campi già distinti per fonte nel resolver immagini.
- Introdurre `dedupe` (o logica equivalente più semplice) per il matching cross-fonte Pokémon EN tra TCGdex e pokemontcg.io, oggi gestito implicitamente da ID diversi (`pokemon:tcgdex:...` vs eventuali altri) senza un vero merge.
- Valutare se sostituire/affiancare optcgapi.com con uno scraper proprio One Piece EN basato sul pattern `optcg-api`, per ridurre la dipendenza da un progetto community piccolo e poco mantenuto.

**P2 — futuro**
- Valutare Scrydex o PokemonPriceTracker come fonte prezzi a pagamento, solo se/quando il volume lo giustifica economicamente (oggi sono già previsti come fallback opzionali disattivati).
- API pubblica DraGold per terze parti, dopo che la provenance interna è stabile e testata.
- Loghi/simboli set come asset separati (ritaglio o fonte dedicata), oggi non c'è una fonte pulita.

**SCARTARE**
- Costruire un proprio dataset immagini "libero da copyright": non esiste una via legale per questo con i publisher attuali, non vale la pena cercarla.
- Redistribuire dati di prezzo TCGplayer via API propria a terzi: rischio ToS diretto, nessun beneficio che non si possa ottenere restando nell'uso interno/di prima parte.
- Costruire un'infrastruttura ETL enterprise (Airbyte/Dagster) alla scala attuale di DraGold: overhead non giustificato dai volumi.

---

## 14. Prossimo task concreto

**Verificare se `www.onepiece-cardgame.com` (sito ufficiale giapponese) è scrapabile in modo rispettoso.**

Nello specifico: un piccolo spike tecnico (non una feature, non un task di produzione) che usi un headless browser con user-agent onesto, un rate limit molto conservativo (es. 1 richiesta ogni 3-5 secondi, come già fa DraGold per la parte JP in `sync-full.js` con `DELAY_JP`), e che prima di tutto legga e rispetti `robots.txt` e i Terms of Use effettivi del sito (non ancora letti in dettaglio in questa ricerca) — per capire se il blocco bot osservato oggi è un blocco a livello di HTTP semplice (superabile con un vero browser) o una protezione anti-bot più seria (Cloudflare/JS challenge, che renderebbe lo scraping sconsigliabile anche tecnicamente).

Perché questo e non altro: è l'unico gap concreto, verificato nel codice reale di DraGold, per cui **non esiste oggi nessuna fonte terza gratuita, strutturata e mantenuta** (né nella ricerca di questa sessione né, a giudicare dalla piccola dimensione di tutti i progetti One Piece JP trovati, nell'ecosistema open source in generale). Il risultato di questo singolo esperimento determina se il prossimo passo reale è "scrivere lo scraper JP" oppure "accettare per ora il placeholder EN e cercare invece un partner/fonte umana per la traduzione", che sono due strade di lavoro molto diverse.
