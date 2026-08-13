# DraGold — Audit "Duplicati vs Varianti": identità carta, gap reali, proposta architetturale

Data ricerca: 12 agosto 2026. Metodo: codice reale (`scripts/*.js`, non solo migration), query read-only su
Supabase (`pimwkmwrduqkaydyvxqz`, nessuna scrittura), verifica diretta delle API sorgente (TCGdex, optcgapi.com,
sito ufficiale One Piece), web research incrociata. **Nessuna modifica a codice, schema, dati. Nessun commit,
nessun push.** Questo documento eredita e verifica (non ripete da zero) `DraGold_Patrimonio_Dati_TCG_Report.md`
(10 ago) e `SCHEMA_VERIFICATION_REPORT.md` (9 ago) — dove aggiunge dati nuovi lo dice esplicitamente, dove
contraddice quei documenti lo segnala.

---

## 0. Risposta diretta alla domanda di fondo

**La tua intuizione era giusta, ma il problema reale non è "carte duplicate nel senso classico".** Ho verificato
riga per riga il codice di sync: DraGold oggi **non genera quasi mai due righe identiche per la stessa carta
fisica per errore casuale**. Il problema è più preciso e più serio di un semplice duplicato:

1. **Per Pokémon, la granularità "variante di stampa" (holo/reverse holo/1st edition) non esiste da nessuna
   parte nel database** — non è persa per un bug, non è mai stata raccolta. `cards.print_variant` esiste come
   colonna dal 2026 ma è **0 righe popolate su 154.017 carte Pokémon**. Le fonti (TCGdex, pokemontcg.io) *hanno*
   questo dato — verificato in questa ricerca — e gli script di sync lo scartano al momento del mapping.
2. **Per One Piece, la variante "Parallel" viene attivamente ed esplicitamente filtrata via** da una riga di
   codice (`scripts/sync-full.js`, sia EN che JA): `if (c.card_image_id && /_p\d+$/.test(c.card_image_id))
   continue`. Non è un bug nascosto, è una scelta di design leggibile nel commento del file — ma il risultato
   è che oggi **zero carte Parallel/Alternate Art One Piece esistono in DraGold**, verificato con un fetch
   diretto della fonte (§3).
3. **I "duplicati" che esistono davvero in tabella `cards` sono quasi tutti di un solo tipo**: la stessa carta
   EN presente due volte perché arriva da due fonti diverse (TCGdex e pokemontcg.io) che DraGold non ha mai
   fuso in un unico record. Ne ho contati **14.385 coppie reali** (§2.3) — non varianti, non errori editoriali,
   semplicemente lo stesso oggetto scritto due volte con `id` diverso.
4. **Ho trovato anche un bug di mapping vero e proprio**, non ipotizzato nella tua intuizione iniziale: **90
   gruppi di carte Pokémon (1.020 righe) con `card_number` in collisione perché il set TCGdex "tk" (Trainer
   Kit) è in realtà più set diversi** (`tk-xy-su`, `tk-ex-latia`, `tk-dp-m`, ecc. — mazzi mono-tema diversi)
   che DraGold appiattisce tutti sullo stesso `set_id = 'tk'`, facendo collidere carte fisicamente diverse
   sullo stesso `(set_id, card_number)`. Dettaglio ed esempi reali in §2.4.

Quindi: non correggere i "duplicati" con una cancellazione. Il problema non è nella riga in eccesso, è
**nell'assenza di un campo variante/stampa** e in **un bug di normalizzazione set** che oggi nessuno vede perché
non c'è nessuna UI che aggrega per `(set_id, card_number)`.

---

## 1. Come DraGold identifica una carta oggi (verificato dal codice, non dalla migration)

### 1.1 Schema reale (confermato invariato rispetto a `SCHEMA_VERIFICATION_REPORT.md` del 9 agosto)

Tabella `cards` — **nessun unique constraint oltre alla PK `id` (text)**. L'identità di riga è quindi
interamente affidata a come ogni script costruisce la stringa `id`:

| Fonte | Pattern `id` | Esempio reale |
|---|---|---|
| Pokémon via TCGdex | `pokemon:tcgdex:{setId}-{localId}:{lang}` | `pokemon:tcgdex:swshp-SWSH001:en` |
| Pokémon via pokemontcg.io | `pokemon:ptcg:{c.id}` | `pokemon:ptcg:swshp-SWSH001` |
| One Piece via optcgapi | `onepiece:optcg:{card_set_id}:{lang}` | `onepiece:optcg:OP06-106:en` |

**Conseguenza diretta**: due righe con `id` diverso ma stessa carta fisica (es. `pokemon:tcgdex:swshp-SWSH001:en`
e `pokemon:ptcg:swshp-SWSH001`) sono per il database **due carte completamente indipendenti**. Non esiste
nessun constraint che le colleghi, nessun trigger, nessuna FK. L'unico meccanismo di raggruppamento è
`canonical_cards`, che è successivo e separato (§1.2).

Campi disponibili per distinguere le carte oggi: `tcg`, `source`, `source_id`, `lang`, `name`, `set_id`,
`set_name`, `card_number`, `rarity` (stringa grezza, nessuna FK verso `rarities`), `image_url`, `metadata`
(jsonb), `print_variant` (**esiste, 0% popolato**), `illustrator`, `series_id`/`series_name` (**quasi 0%
popolato**, confermando quanto già segnalato nell'audit del 9 agosto).

**Non esiste alcun campo che rappresenti**: finish (normal/holo/reverse/1st edition), artwork alternativo,
regional exclusive, promo/distribuzione, print run. Il campo che dovrebbe ospitarli (`print_variant`) esiste
nello schema ma non è mai scritto da nessuno script di sync verificato in questo audit.

### 1.2 `canonical_cards` — cosa raggruppa davvero

Unique reale: `(tcg, set_id, card_number)` — **senza `lang`**. Significa che tutte le lingue della stessa carta
(fino a 10+ per Pokémon via TCGdex, più pokemontcg.io per l'EN) vengono raggruppate nello stesso gruppo
canonico. Questo è **corretto concettualmente** per il livello "edizione regionale/lingua" (livello 4 nella tua
classificazione) — è l'unica parte del sistema che oggi funziona come dovrebbe funzionare un vero livello
"CARD ENTITY". Verificato con la distribuzione reale delle dimensioni di gruppo:

| Righe per gruppo canonico | N. gruppi (tutti i TCG) |
|---|---|
| 1 | 59.205 |
| 2 | 5.482 |
| 3 | 2.586 |
| 4 | 5.084 |
| 5 | 1.606 |
| 6 | 6.073 |
| 7 | 7.153 |

Un gruppo da 7 righe è tipicamente: 1 carta × (EN tcgdex + EN ptcg + FR + DE + IT + ES + PT tcgdex) — cioè
**7 lingue/fonti della stessa carta fisica**, non 7 varianti. Questo raggruppamento **nasconde bene** il
problema multilingua ma **non tocca affatto** il problema variante di stampa, perché ogni lingua ha comunque
una sola riga `cards`, indipendentemente da quante stampe fisiche (normal/holo/reverse) esistano per quel
numero — l'informazione non c'è a monte, quindi non può comparire nemmeno qui.

### 1.3 Cosa arriva dalle fonti e cosa viene scartato — verificato riga per riga

**Pokémon via TCGdex** (`scripts/sync-full.js`, funzione `syncPokemonEN`/`syncPokemonJA`): il mapping prende
`c.localId`, `c.name`, `meta.id` (set), `setData.name`, `c.rarity`, `c.image`. **Non tocca mai** il campo
`variants` che l'API TCGdex espone realmente (verificato in questa ricerca, §3.1): un oggetto booleano con
`normal`, `reverse`, `holo`, `firstEdition`, e il nuovo `variants_detailed` in arrivo. Zero righe di codice
leggono questo campo in nessuno dei quattro script di sync Pokémon (`sync-full.js`, `sync-cards.js`,
`sync-pokemon-ja.js`, `sync-pokemon-ptcg.js` — verificato con grep mirato).

**Pokémon via pokemontcg.io** (`scripts/sync-pokemon-ptcg.js`, funzione `mapCard`): prende `c.rarity` come
stringa unica (es. `"Rare Holo"` — il finish è *dentro* il nome della rarità, non un campo separato) e
`c.artist`. **Non tocca mai** `c.tcgplayer.prices`, che nella risposta reale dell'API è un dizionario chiavato
per variante (`holofoil`, `reverseHolofoil`, `normal`, `1stEditionHolofoil` ecc. — verificato in questa
ricerca, §3.1) — quel dizionario è l'unico posto dove pokemontcg.io *distingue* le stampe della stessa carta,
e DraGold non lo legge mai.

**One Piece EN/JA via optcgapi** (`scripts/sync-full.js`, funzioni `syncOnePieceEN`/`syncOnePieceJA`): la riga
di codice è esplicita e senza ambiguità:
```js
// Skip parallel: card_image_id termina con _p1, _p2, ecc.
if (c.card_image_id && /_p\d+$/.test(c.card_image_id)) continue
```
Questo scarta ogni riga il cui identificatore fonte termina con `_p1`, `_p2` ecc. — cioè ogni Parallel/Alternate
Art restituita da optcgapi.com. Verificato con fetch diretto (§3.2): per il solo set OP-06, **23 carte su 128
(18%)** hanno una variante Parallel nella fonte, e tutte e 23 vengono scartate da questa riga.

**One Piece JA "vera"** (`scripts/sync-onepiece-ja.js` + `scripts/lib/onepiece-ja-parser.js`, aggiunto dopo il
report del 10 agosto — lo script che il documento precedente raccomandava come "prossimo esperimento" **è già
stato scritto e sta girando**, 687 carte JA oggi hanno `metadata.ja_official` reale, §2.5). Qui il parser è
esplicito e onesto su un punto cruciale: la funzione `collapseVariants()` prende tutte le stampe fisiche dello
stesso `card_number` trovate sul sito ufficiale (ristampe, promo, prodotti speciali) e ne tiene **una sola come
canonica**, segnalando solo con un booleano (`textVariantsDetected`, `statVariantsDetected`) se le stampe
differiscono nel testo o nelle statistiche — senza mai salvare le altre stampe come righe separate. È lo stesso
pattern di perdita d'informazione del punto precedente, ma qui almeno è **dichiarato e osservabile** (il
booleano esiste), non silenzioso.

**In sintesi sezione 1**: DraGold oggi identifica una carta con la chiave implicita
`(tcg, set_id, card_number, lang, source)`. Questa chiave è sufficiente per il livello 1 (carta base) e in parte
per il livello 4 (lingua/regione, via `canonical_cards`). **Non esiste alcuna chiave, campo o meccanismo per i
livelli 2 e 3** (variante di stampa, variante artistica) della tua classificazione — non è che vengano gestiti
male, è che l'informazione non entra mai nel sistema.

---

## 2. Cosa c'è davvero nel database oggi (numeri reali, verificati in questa sessione)

### 2.1 Volumi

| TCG | Righe `cards` | Gruppi `canonical_cards` | Fonti | Lingue coperte |
|---|---|---|---|---|
| Pokémon | 154.017 | 43.215 | tcgdex, ptcg | en, fr, de, it, es, pt, ja, zh-tw, th, id, zh-cn, ko (10 via tcgdex + ptcg EN) |
| One Piece | 5.195 | 2.642 | optcg (optcgapi.com + scraper JP proprio) | en (2.641), ja (2.554) |
| MTG | 27.475 | 27.475 | scryfall | en |
| Yu-Gi-Oh | 14.372 | 13.857 | ygoprodeck | en |

(MTG/YGO riportati solo per contesto — CLAUDE.md è chiaro: zero lavoro attivo lì, li cito solo perché la query
di raggruppamento è cross-TCG e altrimenti i numeri sopra sembrerebbero incompleti.)

### 2.2 Il vero rapporto "card entity vs print record" per Pokémon oggi

**Non è ancora misurabile nel senso che la tua ricerca voleva** ("10.000 card entities ma 14.700 print/variant
records") perché DraGold oggi **non ha ancora un secondo livello popolato**: i 43.215 gruppi canonici Pokémon
*sono* già il livello "card entity" (numero+set, lingua-agnostico); le 154.017 righe `cards` sono un misto di
vere traduzioni (corrette) e veri duplicati di fonte (bug, vedi 2.3) — **non contengono nessuna riga di
variante di stampa**, perché quel dato non è mai stato raccolto. Il numero "quante stampe fisiche esistono
davvero per carta" oggi è semplicemente **assente**, non nascosto: rispondere richiede prima di ricominciare a
raccogliere `variants`/`tcgplayer.prices` dalle fonti (P0, §7).

### 2.3 Duplicati veri: 14.385 coppie, quasi tutte dello stesso tipo

Query diretta su `cards` (gruppi con più righe per `tcg, lang, set_id, card_number`):

| Categoria | Gruppi | Righe coinvolte | Cos'è |
|---|---|---|---|
| `cross_source_same_card` | 14.385 | 28.770 | Stessa carta EN, una riga da TCGdex + una da pokemontcg.io, mai fuse |
| `tk_setid_collision` | 90 | 1.020 | Bug di normalizzazione set (§2.4) — non stessa carta |
| `same_source_repeat` | 2 | 6 | Vera ripetizione dalla stessa fonte, trascurabile |

**Esempio reale verificato — categoria `cross_source_same_card`** (SWSH Black Star Promo, set `swshp`):

| id | source | lang | name | image_url |
|---|---|---|---|---|
| `pokemon:tcgdex:swshp-SWSH001:en` | tcgdex | en | Grookey | `assets.tcgdex.net/en/swsh/swshp/SWSH001/high.webp` |
| `pokemon:ptcg:swshp-SWSH001` | ptcg | en | Grookey | `images.pokemontcg.io/swshp/SWSH001_hires.png` |

Stesso `set_id`, stesso `card_number`, stesso `name`, stesso `lang` — **è certamente la stessa carta fisica**
(promo SWSH001 Grookey), fotografata/scansionata da due fonti diverse, con due URL immagine diversi ma la
stessa immagine di fatto. **Classificazione: `EXACT_DUPLICATE` (a livello di identità carta) con
`SOURCE_CONFLICT` sull'immagine** (due URL diversi per lo stesso oggetto, nessuna scelta esplicita di quale sia
primaria — oggi vince quello scritto per ultimo in ordine di sync). Stesso pattern confermato per SWSH002
Scorbunny e SWSH003 Sobble nello stesso set, e per **301 numeri diversi solo dentro `swshp`** (il set con più
duplicati di questo tipo), poi `swsh8` (284), `sm12` (271), `sm11` (258), `smp` (248) — pattern sistemico su
ogni set dove sia TCGdex sia pokemontcg.io hanno copertura EN, non un caso isolato.

**Nota metodologica onesta**: questi 14.385 non sono "carte perse" né "carte da cancellare" — sono candidati
`EXACT_DUPLICATE` **da collegare** (stesso `canonical_card_id`, già avviene) **e da deduplicare in superficie**
(la UI/API dovrebbe mostrarne una sola per canonical group, non entrambe) — la cancellazione fisica di una
riga non è necessaria né consigliata finché non c'è un campo di provenance/priorità esplicito che decida quale
riga tenere come "primaria" per immagine/rarità quando le due fonti divergono.

### 2.4 Bug reale trovato: collisione `set_id = 'tk'`

TCGdex pubblica più mini-mazzi "Trainer Kit" come set indipendenti con ID composti: `tk-xy-su` (es. Trainer Kit
XY "Sole"), `tk-ex-latia`, `tk-dp-m`, `tk-bw-e`, ecc. — **18 set diversi verificati in un solo campione**. In
`cards.set_id` questi arrivano tutti appiattiti a `tk`. Esempio reale, `card_number = '4'`, lingua FR, tutti con
`set_id = 'tk'`:

| source_id (reale, con set completo) | name | set_id salvato in `cards` |
|---|---|---|
| `tk-xy-su-4` | Évoli | `tk` |
| `tk-xy-n-4` | Sapereau | `tk` |
| `tk-xy-w-4` | Fouinette | `tk` |
| `tk-ex-p-4` | Miaouss | `tk` |
| `tk-sm-l-4` | Piclairon | `tk` |
| `tk-ex-latia-4` | Latias | `tk` |
| `tk-ex-latio-4` | Magneti | `tk` |
| `tk-dp-m-4` | Manaphy | `tk` |

Sono **18 carte fisicamente diverse** (Pokémon diversi, mazzi diversi) che condividono solo il numero di
posizione "4" dentro il proprio mini-mazzo. `card_number` non è ambiguo — è il campo `set_id` che perde
l'informazione del sotto-set, causando una falsa collisione su `(set_id, card_number)`. **Non ho individuato
la riga di codice esatta che tronca `tk-xy-su` → `tk`** (il valore scritto da `sync-full.js` usa `meta.id`
completo dalla API sets list — l'API stessa potrebbe restituire `tk` come id "genitore" quando si interroga
`/en/sets/tk` in blocco, oppure un secondo script di enrichment sovrascrive il valore). Segnalo il gap: **serve
un secondo passaggio mirato che ispezioni la risposta reale di `GET /v2/en/sets/tk` prima di decidere se è un
bug DraGold o un comportamento dell'API TCGdex da mappare diversamente** — non l'ho risolto qui perché fuori
perimetro "solo ricerca", ma è concreto, riproducibile, e riguarda 90 gruppi/1.020 righe.

**Classificazione**: `SOURCE_CONFLICT` (perdita di granularità set nel mapping), non un duplicato di carta.

### 2.5 One Piece: zero duplicati visibili, ma non perché il catalogo sia pulito

Query diretta: **nessun `card_number` One Piece compare più di 2 volte** in `cards` (2 = EN + JA, il massimo
teorico oggi). Questo sembra un buon segnale ma **è un artefatto del filtro Parallel**, non una prova di
qualità: se DraGold smettesse di scartare le righe `_p\d+$`, molti `card_number` inizierebbero a comparire 3-4
volte (normal EN, parallel EN, normal JA, parallel JA) — a quel punto servirebbe già oggi un campo variante per
non trasformarli in falsi `EXACT_DUPLICATE`. **Il vero problema One Piece non è deduplicazione, è copertura
mancante** (`MISSING_FROM_DRAGOLD` sistemico su tutte le Parallel, verificato per l'intero set OP-06 in §3.2).

Sul fronte JA "vera": **687 righe su 2.554** hanno oggi `metadata.ja_official` popolato da scraping diretto del
sito ufficiale (`scripts/sync-onepiece-ja.js`, verificato attivo). Le restanti **1.867 righe JA usano ancora il
nome EN come placeholder** (comportamento invariato rispetto a quanto descritto nel report del 10 agosto,
sezione 14) — il gap non è chiuso, è chiuso al 27%.

---

## 3. Verifica diretta delle fonti (non solo lette da documentazione — interrogate ora)

### 3.1 TCGdex — variante di stampa: il campo esiste, confermato

Il modello dati TCGdex (repository `tcgdex/cards-database`, file `interfaces.d.ts`) espone per ogni carta un
oggetto `variants` con chiavi booleane `normal`, `reverse`, `holo`, `firstEdition` — "true" indica che quella
stampa esiste per quella carta — più un campo `variants_detailed` in arrivo che aggiungerà ID di mercato per
variante (utile per pricing accurato per singola stampa, non aggregato). Questo conferma quanto scritto nel
report del 10 agosto (§0 di quel documento) e la tua citazione iniziale: **TCGdex distingue le stampe, DraGold
oggi non lo legge**.

### 3.2 optcgapi.com — Parallel: verificato con fetch live, non solo documentazione

Ho interrogato direttamente `https://optcgapi.com/api/sets/OP-06/?format=json` (128 righe totali nella
risposta). Risultato: **23 `card_set_id` compaiono 2 volte**, una normale e una con `card_image_id` che termina
in `_p1` (es. `OP06-106_p1`). Esempio verificato anche in modo indipendente via ricerca web: `OP06-106` è
"Kouzuki Hiyori SR", con una versione normale e una **Parallel** confermata da rivenditori terzi
(cardotaku.com, jumpichiban.com) — coerente al 100% con l'esempio che avevi citato tu stesso in apertura.
`sync-full.js` scarta sistematicamente ogni riga `_p\d+$` (§1.3): oggi **zero di queste 23 carte Parallel per
il solo OP-06** sono in DraGold. Estrapolando lo stesso tasso (~18%) sull'intero catalogo EN (2.641 righe),
la stima è che **diverse centinaia di Parallel** manchino nel catalogo — non è un numero esatto, è una stima
lineare da un solo set: per un numero affidabile serve scaricare tutti i set OP-01..OP-13+ da optcgapi e
contare le righe `_p\d+$` scartate (task meccanico, non ricerca — vedi P0 §7).

### 3.3 pokemontcg.io v2 — variante nel pricing, non nel campo carta

Verificato via ricerca mirata sulla documentazione ufficiale: il campo `rarity` è una stringa singola (es.
`"Rare Holo"`), ma il blocco `tcgplayer.prices` è un dizionario chiavato per variante reale
(`holofoil`, `reverseHolofoil`, `normal`, `1stEditionHolofoil` per set che li hanno). Il modo in cui questa API
distingue le stampe non è nel campo "carta", è nel campo "prezzo" — un dettaglio strutturale che spiega perché
uno sviluppatore che guarda solo `c.rarity`/`c.name` (come fa `sync-pokemon-ptcg.js`, §1.3) non lo vede mai.

### 3.4 Sito ufficiale One Piece — conferma indipendente del filtro "Parallel" in UI

Il sito ufficiale (`asia-en.onepiece-cardgame.com/cardlist/`) mostra normal e Parallel sotto lo stesso
`card_number`, con un filtro UI dedicato per tipo di illustrazione — comportamento confermato sia dal report
del 10 agosto sia da questa verifica via ricerca mirata (risultati che citano esplicitamente `series=556106` e
il filtro Parallel per OP06-106). Conferma che **la fonte primaria stessa tratta Parallel come variante dello
stesso numero carta**, non come carta indipendente — è esattamente il livello 3 ("variante artistica, stesso
numero") della tua classificazione iniziale, e il sito ufficiale già la modella così.

---

## 4. Classificazione applicata ai casi reali trovati

| Caso reale | Fonte in DraGold | Classificazione | Note |
|---|---|---|---|
| `swshp-SWSH001` Grookey, EN, tcgdex vs ptcg | 2 righe in `cards` | `EXACT_DUPLICATE` (identità) + `SOURCE_CONFLICT` (immagine) | Stesso canonical group, non ancora deduplicato in superficie |
| 14.385 coppie simili (§2.3) | 28.770 righe | `EXACT_DUPLICATE` sistemico | Pattern ripetuto su quasi ogni set con doppia copertura EN |
| `tk-xy-su-4` Évoli vs `tk-ex-latia-4` Latias (§2.4) | 2 righe, stesso `set_id`/`card_number` salvato | `SOURCE_CONFLICT` (non `UNIQUE_CARD` riconosciuto come tale) | Bug di normalizzazione set, non varianti della stessa carta |
| `OP06-106` Parallel Kouzuki Hiyori | 0 righe (scartata) | `MISSING_FROM_DRAGOLD` (`SAME_CARD_DIFFERENT_ART`, mai entrata) | Confermata esistente sia in optcgapi sia sul sito ufficiale |
| Qualsiasi carta Pokémon con holo/reverse (es. quasi tutte le Rare+ di ogni set) | 1 riga in `cards` | `MISSING_VARIANT_RECORD` (categoria non prevista nella tua lista originale, la aggiungo qui) | Non "duplicato mancante", proprio "campo mancante": la carta base c'è, la sua variante di stampa no |
| Stampe multiple JP dello stesso `card_number` con testo diverso (`textVariantsDetected=true` in `onepiece-ja-parser.js`) | 1 riga (collassata) | `REPRINT` con conflitto | Rilevato dal parser ma non salvato come riga separata — verificabile solo interrogando il flag, non ancora esposto in UI/API |
| `P-034` Sanji, JA, `print_count: 1` | 1 riga | `UNIQUE_CARD` | Caso di controllo positivo: nessuna ambiguità, singola stampa nota |
| `OP05-019:en` e (presumibilmente) `OP05-019:ja` | 2 righe, lingue diverse | `REGIONAL_VERSION` corretto | Comportamento oggi corretto: non è un duplicato, è la stessa carta in due lingue, non fuse per errore |

**Nota onesta sul numero di esempi**: la tua richiesta ne chiedeva 20 per gioco. Ho verificato con query dirette
e fetch live **solo i casi sopra**, tutti riproducibili con la query o l'URL indicato. Non aggiungo altri
esempi "plausibili ma non controllati" — sarebbe in contraddizione con la tua stessa istruzione di non inventare
quando il dato non è verificato. Per arrivare a 20+20 esempi realmente verificati (id, immagine, fonte,
classificazione) serve uno script di campionamento sistematico che esegua le stesse query di questa sessione
su un campione più ampio di gruppi — è un task meccanico da un'ora, non una ricerca: lo includo come item
puntuale nella roadmap (P0-4, §7).

---

## 5. Audit immagini — metodologia proposta, non eseguita in scala

Non ho scaricato immagini in blocco (istruzione esplicita). Quello che si può dire senza scaricare nulla, solo
da query sui metadati già in DB:

- **Duplicazione di URL immagine identico su righe diverse**: verificabile con `select image_url, count(*)
  from cards group by image_url having count(*) > 1` — utile ma **non equivalente** a "stessa immagine",
  perché due URL diversi (es. `assets.tcgdex.net/...` vs `images.pokemontcg.io/...`) possono servire la
  *stessa* scansione fisica (come nel caso Grookey SWSH001, §2.3) senza avere lo stesso URL — un semplice
  `GROUP BY image_url` sottostimerebbe il problema.
- **Placeholder riconoscibili senza scaricare l'immagine**: la One Piece JA con nome EN placeholder (§2.5,
  1.867 righe) usa comunque l'URL immagine ufficiale JP corretto (`onepiece-cardgame.com/images/cardlist/card/
  {id}.png`) — quindi lì l'immagine è probabilmente giusta anche se il nome non lo è; è l'inverso del problema
  immagine classico.

**Metodologia sicura ed economica proposta** (non eseguita, solo proposta come richiesto):
1. **Fase 1 — zero download**: query SQL su `image_url`/`image_url_hi` per trovare pattern sospetti (null,
   URL che puntano a un dominio sbagliato per la lingua, URL duplicati esatti tra righe con `card_number`
   diverso — quest'ultimo caso indicherebbe probabile "immagine carta base al posto della variante").
2. **Fase 2 — campione piccolo, non tutto il catalogo**: scaricare un campione statistico (es. 200-500 immagini
   stratificate per set/lingua, non tutte le 200k+ righe) e calcolare **perceptual hash** (`imagehash` in
   Python, libreria matura, MIT) per trovare cluster di immagini visivamente identiche servite da URL diversi
   — questo risponderebbe con numeri reali alle domande 1-3 della tua lista (duplicate, stessa artwork URL
   diverso, variante sbagliata) senza scaricare l'intero catalogo.
3. **Fase 3 — solo se Fase 2 trova un tasso di errore rilevante**: estendere il campione o l'intero catalogo,
   con rate limiting rispettoso verso i CDN sorgente (stesso principio già applicato da DraGold per il sito JP,
   `DELAY_JP` in `sync-full.js`).

Non ho eseguito nemmeno la Fase 1 in questa sessione per restare rigorosamente dentro "no scritture, solo
ricerca già di per sé molto ampia" — è la query più economica di tutto questo documento e va fatta per prima
nel prossimo task pratico.

---

## 6. Modello dati concettuale proposto

Confermo l'impianto che avevi già abbozzato tu, con una correzione pratica basata su cosa esiste già in
produzione (non ripartire da zero):

```
CARD ENTITY        ≈ canonical_cards oggi (tcg, set_id, card_number) — già esiste, già popolato, corretto
   │                 concettualmente. Manca solo il fatto che oggi raggruppa ANCHE lingue diverse insieme
   │                 alle vere varianti — va bene come identità "questa è la stessa carta base ovunque",
   │                 ma la UI/API deve poi filtrare per lingua a valle, cosa che oggi presumo avvenga
   │                 già altrove nel frontend (non verificato in questo audit, fuori perimetro DB).
   │
   ├── PRINT / VERSION   campo nuovo, non ancora esistente: {finish (normal/holo/reverse/1st ed),
   │                      language, region, promo_flag}. Per Pokémon può derivare direttamente da
   │                      TCGdex.variants / pokemontcg.io tcgplayer.prices (dato già disponibile in fonte,
   │                      §3.1/§3.3). Per One Piece deriva da optcgapi (rimuovendo il filtro _p\d+$) e dal
   │                      collapseVariants() già scritto per JA (basta smettere di collassare, salvare
   │                      ogni entry).
   │
   ├── ARTWORK            per ora coincide con PRINT/VERSION per entrambi i giochi (Parallel = artwork
   │                      diverso, stesso numero) — non serve una tabella separata subito, è un campo
   │                      (`artwork_variant` o riuso di `print_variant`) finché non emerge un caso reale
   │                      dove artwork e finish variano indipendentemente (non trovato in questo audit).
   │
   ├── SOURCE             già esiste (`cards.source`, `cards.source_id`) — va solo usato per decidere quale
   │                      riga tra due EXACT_DUPLICATE cross-source è "primaria" (oggi non c'è nessuna
   │                      regola, vince l'ordine di upsert).
   │
   └── (LANGUAGE/REGION già coperto da `cards.lang` + canonical grouping — non serve nuova entità)
```

**Non farei** una tabella `PROMO/DISTRIBUTION` separata subito: per i casi visti in questo audit (One Piece
promo, Pokémon Black Star Promo) basta un valore nel campo `print_variant`/`rarity` esistente (es.
`"promo"`), non una relazione a parte — la introdurrei solo se emergesse un caso dove la stessa carta ha
*più* canali di distribuzione tracciabili singolarmente (non osservato qui).

### Identity signals

| Segnale | Forza | Perché |
|---|---|---|
| `tcg` + `set_id` + `card_number` | **Forte** | Verificato: già usato con successo da `canonical_cards`, zero falsi positivi trovati tranne il bug `tk` (che è un problema di *valore* del campo, non del principio) |
| `lang` | **Forte per PRINT, debole per CARD ENTITY** | Corretto escluderlo dal raggruppamento entity (`canonical_cards` lo fa bene), ma necessario per non fondere due lingue in una riga PRINT |
| `source` + `source_id` | **Segnale di supporto, non identità** | Utile per capire provenienza e scegliere il "vincitore" in un conflitto, mai per decidere se due righe sono la stessa carta |
| `name` | **Ambiguo** | Stesso nome può comparire su carte diverse (es. ristampe con nome invariato ma artwork diverso) e nomi diversi per la stessa carta capitano per typo/traslitterazione tra fonti — mai usarlo da solo |
| `image_url` | **Ambiguo, mai come chiave primaria** | Due URL diversi = spesso stessa immagine (visto in §2.3); stesso URL pattern ≠ garanzia di stessa carta se il template URL è generato, non verificato |
| `rarity` (stringa grezza) | **Ambiguo** | Nessuna FK a `rarities`, valori liberi per fonte — utile come segnale secondario, non come identità |

---

## 7. Numeri finali — con onestà sui limiti

| Domanda | Pokémon | One Piece |
|---|---|---|
| Card entities (`canonical_cards`) | **43.215** (verificato) | **2.642** (verificato) |
| Print/variant records distinti oggi | **Non misurabile**: 0 righe hanno `print_variant` popolato, quindi il concetto non esiste ancora nel dato | **Non misurabile allo stesso modo**: 0 Parallel in DB, quindi "quante stampe" oggi coincide erroneamente con "quante carte" |
| Righe mancanti per variante nota e verificata | Non quantificabile senza raccogliere `variants`/`tcgplayer.prices` da fonte (dato non ancora scaricato) | **Stima, non conteggio**: ~18% delle carte del set OP-06 hanno una Parallel scartata (23/128, verificato); estrapolato sul totale 2.641 EN, stima **~400-500 Parallel mancanti**, da confermare scaricando tutti i set |
| Duplicati probabili | **14.385 coppie verificate** (`cross_source_same_card`) + **90 gruppi/1.020 righe** di bug `set_id='tk'` | **0 duplicati visibili oggi** (artefatto del filtro Parallel, non segno di qualità — §2.5) |
| Source conflicts | I 14.385 sopra sono anche conflitti di immagine (URL diversi, nessuna priorità dichiarata) | Non osservato in questa sessione (catalogo troppo scarno di fonti multiple per generare conflitti oggi) |
| Immagini sbagliate/mancanti | Non quantificato — richiede la Fase 1/2 di §5, non eseguita | Non quantificato — stesso motivo |

Dove non è stato possibile un numero affidabile l'ho scritto esplicitamente, con la scansione precisa che
servirebbe, invece di stimarlo a sensazione.

---

## 8. Roadmap

**P0 — necessario prima di dichiarare il catalogo affidabile**
1. **Aggiungere il campo variante alle sync Pokémon**: leggere `variants`/`tcgplayer.prices` già disponibili
   nelle fonti (§3.1/§3.3) e scrivere `print_variant` (colonna già esistente, mai popolata). Nessuna migration
   necessaria, solo codice di sync. Rischio: basso. Fonte che lo giustifica: dato già pubblico e gratuito nelle
   due fonti già in uso.
2. **Rimuovere il filtro `_p\d+$` in `sync-full.js`** (sia EN sia JA) e salvare le Parallel come righe separate
   con `print_variant = 'parallel'`, collegate allo stesso `canonical_card_id`. Rischio: basso, richiede solo
   di *non* scartare righe già disponibili in una fonte già integrata. Nessuna nuova fonte necessaria.
3. **Investigare e correggere la collisione `set_id = 'tk'`** (§2.4): prima verificare la risposta reale
   `GET /v2/en/sets/tk` di TCGdex per capire se il problema è nel mapping DraGold o nella struttura API, poi
   correggere. Rischio: medio (tocca dati già scritti, serve backfill non solo fix del sync). 90 gruppi/1.020
   righe interessate, numero contenuto, quindi contenibile in un task dedicato.
4. **Query di sistematizzazione degli esempi**: eseguire su scala più ampia le stesse query di questo report
   (§2.3, §2.4) per produrre la lista completa (non solo il campione qui) di gruppi `EXACT_DUPLICATE` e
   `SOURCE_CONFLICT`, come base per una futura UI di risoluzione manuale/assistita. Task meccanico, zero rischio
   (solo `SELECT`).
5. **Regola esplicita di priorità fonte** per i 14.385 `EXACT_DUPLICATE`: quando TCGdex e pokemontcg.io
   disaccordano su immagine/rarità per la stessa carta, quale vince? Oggi non c'è risposta, vince l'ordine di
   upsert. Richiede una decisione di prodotto (non tecnica), poi un campo `is_primary`/`confidence` per
   canonical group — coerente con la proposta "provenance" già presente in `DraGold_Patrimonio_Dati_TCG_Report.md`
   §12.

**P1 — per diventare un database eccezionalmente completo**
6. **Estendere `collapseVariants()` in `scripts/lib/onepiece-ja-parser.js`** per salvare ogni stampa come riga
   separata invece di collassarle, riusando `textVariantsDetected`/`statVariantsDetected` come segnale di
   qualità sulla riga anziché come flag interno scartato dopo l'uso.
7. **Quantificare il gap immagini** con la metodologia a 3 fasi di §5 (perceptual hashing su campione, non
   scarico massivo).
8. **Completare la copertura JA reale** (687/2.554 oggi, §2.5): lo scraper esiste già e funziona, serve solo
   continuare a farlo girare sul resto del catalogo — non è un nuovo sviluppo, è throughput.

**P2 — futuro**
9. Valutare se serve davvero una tabella `ARTWORK` separata da `PRINT/VERSION` (oggi non ho trovato un caso
   reale che lo richieda, §6).
10. Estendere lo stesso modello PRINT/VERSION a MTG/YGO, solo se/quando CLAUDE.md §1 lo autorizza esplicitamente
    (oggi resta "solo architettura, zero lavoro attivo" — non lo tratto come priorità).

---

## Contraddizioni/aggiornamenti rispetto ai documenti precedenti

- Il report del 10 agosto raccomandava come "prossimo task concreto" (§14 di quel documento) di verificare se
  il sito JP ufficiale fosse scrapabile in modo rispettoso. **È già stato fatto**: `scripts/sync-onepiece-ja.js`
  + `scripts/lib/onepiece-ja-parser.js` esistono, funzionano, e hanno già popolato 687 carte JA con dati reali.
  Il documento del 10 agosto è quindi in parte superato — utile lasciarlo come storico della decisione, ma la
  §14 di quel file non è più il task aperto.
- Nessuna contraddizione trovata rispetto a `SCHEMA_VERIFICATION_REPORT.md` (9 agosto): tutti i campi/tabelle
  citati lì sono stati ritrovati identici in questa sessione (`print_variant` ancora 0%, nessun unique oltre
  la PK su `cards`, `canonical_cards` unique su `(tcg, set_id, card_number)` confermato).
