# PRODUCT_SPEC.md — DraGold Rebuild

> Creato: 2026-06-12 (TASK 1 di REBUILD_PLAN.md) — OPUS
> Visione: **Trade Republic / Collectr, ma gli asset sono carte TCG.**
> Questa spec è la fonte di verità per le task 2–8. Se il codice e la spec divergono, vince la spec (o si aggiorna la spec di proposito).

---

## 0. Cosa è DraGold (in una frase)

Un'app dove cerchi una carta TCG, ne vedi il prezzo di mercato (FMV), la aggiungi al tuo portfolio come fosse un asset finanziario, e ricevi un alert quando supera o scende sotto una soglia.

**Core loop, immutabile:** `Cerca → Vedi prezzo → Aggiungi al portfolio → Ricevi alert.`
Tutto ciò che non serve a questo loop è **Upcoming** (badge, zero codice).

### Principi di prodotto (non negoziabili)

1. **Mai mostrare "No price data" nudo.** Se manca il prezzo → CTA onesta "Vedi su eBay". Mai un trattino freddo senza via d'uscita.
2. **Look dark fintech.** Riferimento visivo: Trade Republic. Sobrio, denso di dati, verde/rosso per P&L, niente decorazioni da marketplace di figurine.
3. **Onestà sui dati.** Se un prezzo è vecchio, lo si dice ("aggiornato il …"). Se non c'è, si dice perché e si offre eBay.
4. **Mobile-first.** Ogni schermata deve funzionare a 375px prima che a 1440px.
5. **Una sola valuta visibile alla volta** (EUR default, USD opzionale), selettore globale.

### Vincoli tecnici (da CLAUDE.md / REBUILD_PLAN.md)

- Single-file `DraGold.jsx`, niente TypeScript, niente Redux/Zustand (useState basta), niente nuove librerie oltre a quelle già presenti.
- Build Vite/esbuild esistente. **Verificare sempre la build con esbuild prima del commit** (gotcha null bytes upload GitHub).
- Deploy: commit su `main` via GitHub web → Vercel auto-deploya. Niente terminali locali, niente `.bat`.
- Auth: magic link via `src/supabase.js` riusato così com'è.

---

## 1. Dati disponibili (DB Supabase esistente, RLS attivo)

Solo queste tabelle sono in scope per il rebuild. Il resto del DB esiste ma non si tocca.

### `cards` — catalogo (~170k righe: Pokemon, MTG, YGO, One Piece)
Sorgente della ricerca. Campi usati dalla UI: identificativo carta (`card_id` / `id`), `name`, set, numero carta (es. `OP12-079`), lingua, `tcg`, URL immagine, rarità. La ricerca interroga questa tabella.

### `card_prices` — snapshot prezzi (tabella REALE dei prezzi)
Campi chiave: `card_id`, `source`, `price_market`, `captured_at`.
- **FMV = ultimo snapshot** per `card_id` (ordina `captured_at` desc, prendi il primo).
- **Grafico** = serie di `price_market` ordinata per `captured_at`, mostrata **solo se ≥ 2 snapshot**.
- ⚠️ NON usare `price_history` (vuota, legacy).

### `collection` — il portfolio dell'utente (vault)
Campi: `card_id`, `condition`, `grade`, `purchase_price`, più immagine/nome denormalizzati salvati all'insert. Ordinata per `added_at` desc.
Funzioni `supabase.js`: `listCollection()`, `addToCollection(card)`, `removeFromCollection(id)`.

### `alerts` — soglie prezzo
Campi: `tcg`, `card_api_id`, `card_name`, `threshold_price`, `direction` (`below`/`above`), `is_active`, lingua, valuta, paese.
Funzioni: `listAlerts()`, `createAlert({...})`, `deleteAlert(id)`.

### `watchlist` — carte tracciate (max 20 free tier)
Carte che l'utente vuole far includere nei refresh prezzo futuri quando non hanno ancora snapshot.
⚠️ **Gap noto:** in `supabase.js` non esistono ancora funzioni watchlist (`listWatchlist`/`addToWatchlist`/`removeFromWatchlist`) e va verificato che la Edge Function `refresh-prices` legga anche `watchlist`. Da risolvere in TASK 4 (Asset page, bottone "Traccia"). Vedi §6 Fix #5.

### Fuori scope DB (non toccare nel rebuild)
`profiles`, `binders`, `cards` write, `card_prices` write, cron, Edge Functions (a parte la verifica watchlist), `newsletter` (resta solo nel footer).

---

## 2. Le 4 schermate core

Navigazione: bottom-tab su mobile / top-nav su desktop. Tab: **Markets · Portfolio · Alerts** (+ Asset si apre dal tap su una carta, non è una tab fissa). Sezione **Upcoming** visibile ma non cliccabile.

Per ogni schermata: **stati (vuoto / caricamento / errore / successo)**, **dati**, **cosa NON fa**.

---

### 2.1 MARKETS (home) — ricerca + hot picks + watchlist rapida

Il punto d'ingresso. In cima la barra di ricerca; sotto, quando non si sta cercando, hot picks e watchlist rapida.

**Dati**
- Barra ricerca → query su `cards` (con normalizzazione, vedi §6 Fix #1/#2).
- Hot picks → logica esistente nel legacy, riusata, ma con la **stessa card UI** dei risultati di ricerca.
- Watchlist rapida → carte in `watchlist` con il loro ultimo prezzo da `card_prices` se presente.

**Stati**

| Stato | Cosa mostra |
|---|---|
| **Vuoto (nessuna ricerca attiva)** | Barra di ricerca con placeholder "Cerca una carta… (es. Charizard, Monkey D Luffy)". Sotto: Hot picks. Se la watchlist è vuota → micro-CTA "Le carte che tracci appariranno qui". |
| **Caricamento** | Skeleton card (griglia di placeholder grigi), niente spinner a tutto schermo. La barra resta sempre interattiva. |
| **Errore** | Messaggio inline sotto la barra: "Ricerca non riuscita, riprova." + bottone Riprova. Non cancella il testo digitato. |
| **Successo (risultati)** | Griglia di card: immagine (placeholder pulito se manca, §6 Fix #4), nome, set, numero, lingua, **prezzo FMV** se esiste in `card_prices`, altrimenti bottone **"Vedi su eBay"**. Tap su una card → Asset page. |
| **Successo (zero risultati)** | "Nessun risultato per «…»." + suggerimento ("Prova con meno parole o il numero carta") + CTA "Cerca «…» su eBay". |

**Interazioni chiave**
- **Invio nel campo = avvia la ricerca** (form submit), non solo il click sul bottone. (§6 Fix #2)
- Filtri: **lingua** (EN / JA / IT) e **TCG** (pokemon, mtg, ygo, op). Default: tutte le lingue live, tutti i TCG.
- La ricerca è normalizzata sulla punteggiatura (§6 Fix #1).

**Cosa NON fa**
- Niente ricerca fuzzy/typo-tolerant oltre alla normalizzazione punteggiatura (no Levenshtein).
- Niente ordinamento avanzato (per prezzo, per variazione%): ordine di default del catalogo.
- Niente paginazione infinita complessa: un limite ragionevole (es. 50 risultati) + "mostra altri" se serve, ma non è obbligatorio per l'alfa.
- Niente filtro per set/rarità nell'alfa.

---

### 2.2 ASSET (dettaglio carta) — prezzo, grafico, azioni

Si apre dal tap su una card in Markets, Portfolio o Watchlist. È la pagina che converte: da "ho trovato la carta" a "la traccio / la possiedo".

**Dati**
- Header: immagine, nome, set, numero, lingua (dalla riga `cards`).
- Prezzo: ultimo snapshot da `card_prices` (`price_market`, `source`, `captured_at`).
- Grafico: serie `price_market` per `captured_at`.
- eBay Live: listing filtrati per numero carta (funzione `ebayURL` / API eBay legacy).

**Stati**

| Stato | Cosa mostra |
|---|---|
| **Caricamento** | Skeleton: blocco immagine + blocco prezzo grigi. |
| **Errore (carta non caricata)** | "Impossibile caricare la carta." + Riprova + link torna a Markets. |
| **Successo — con prezzo** | "**FMV €X** — {source}, aggiornato il {data}". Se ≥ 2 snapshot: sparkline/grafico SVG sotto il prezzo. Sotto: sezione eBay Live (se ci sono match). Azioni: **Aggiungi a Portfolio** + **Crea Alert**. |
| **Successo — senza prezzo** | NIENTE "No price data". Invece: CTA grande **"Vedi prezzo su eBay"** + bottone **"Traccia questa carta"** (insert in `watchlist`, così il cron la include nei refresh futuri). Niente grafico. Azioni Portfolio/Alert restano disponibili (si può possedere/allertare anche senza FMV). |

**Regole di rendering**
- **Grafico solo se ≥ 2 snapshot** in `card_prices`. Con 0 o 1 snapshot: nessun grafico (non un grafico piatto/finto).
- **eBay Live:** solo listing che contengono il **numero carta** (es. `OP12-079`) nel titolo, **max 5**. Se zero match → **nascondi del tutto la sezione** (no "nessun risultato eBay"). (§6 Fix #3)
- "Aggiungi a Portfolio" → modal con **prezzo pagato** + **condizione** (NM/LP/MP/HP/DMG) → `addToCollection`.
- "Crea Alert" → modal con **soglia** + direzione (sopra/sotto) → `createAlert`.

**Cosa NON fa**
- Niente stime di grading PSA avanzate (→ Upcoming).
- Niente storico multi-fonte comparato (mostra una fonte, la più recente).
- Niente prezzi per condizione/grade differenziati: l'FMV è il market price grezzo dello snapshot.
- Niente acquisto/vendita in-app: eBay è solo un link esterno.

---

### 2.3 PORTFOLIO — valore totale, P&L, posizioni

La schermata "broker". Mostra cosa possiedi e quanto vale ora rispetto a quanto l'hai pagato.

**Dati**
- Posizioni: `collection` (`listCollection`).
- Prezzo attuale per posizione: ultimo `card_prices` per il `card_id`.
- P&L riga = prezzo attuale − `purchase_price`. Totale = somma.

**Stati**

| Stato | Cosa mostra |
|---|---|
| **Vuoto** | "Il tuo portfolio è vuoto." + CTA "Cerca una carta e aggiungila" → Markets. |
| **Caricamento** | Skeleton header (valore/P&L) + righe placeholder. |
| **Errore** | "Impossibile caricare il portfolio." + Riprova. |
| **Successo** | Header: **Valore totale** (somma ultimi prezzi noti) + **P&L totale € e %** vs prezzo pagato, colorato verde/rosso. Lista posizioni: immagine, nome, condizione, prezzo pagato, prezzo attuale, P&L riga. |

**Regole**
- Posizioni **senza prezzo attuale**: mostra "—" nel prezzo attuale e P&L, e un bottone **"Traccia"** (insert watchlist) così verrà prezzata ai refresh futuri. Queste posizioni **non rompono i totali**: contano 0 nel P&L finché non c'è prezzo (oppure si escludono dal totale e si nota "X posizioni non ancora prezzate" — scelta da fissare in TASK 5, ma i numeri visibili devono essere verificabili a mano).
- Rimuovi posizione → **conferma** → `removeFromCollection`.
- Valore totale e P&L vanno **verificati a mano** nello smoke test (TASK 5 "fatto quando").

**Cosa NON fa**
- Niente allocazione per TCG/grafico a torta (→ eventuale Upcoming).
- Niente performance storica del portfolio nel tempo (solo snapshot attuale vs pagato).
- Niente lotti multipli con prezzi medi ponderati complessi: ogni riga è una posizione singola.
- Niente export/CSV nell'alfa.

---

### 2.4 ALERTS — lista, crea, elimina, stato attivo

Dove vivono le soglie prezzo. Gli alert si creano sia da qui sia dalla Asset page.

**Dati**
- `alerts` (`listAlerts`). Campi mostrati: carta (`card_name`), soglia (`threshold_price`), direzione, `is_active`.

**Stati**

| Stato | Cosa mostra |
|---|---|
| **Vuoto** | "Nessun alert. Crea il tuo primo alert da una carta." + CTA che apre la ricerca inline. |
| **Caricamento** | Skeleton righe. |
| **Errore** | "Impossibile caricare gli alert." + Riprova. |
| **Successo** | Lista: per riga → carta, soglia, direzione (sopra/sotto), **stato** (Attivo / Scattato il {data}). Azioni per riga: toggle `is_active`, elimina (con conferma). In cima: bottone "Nuovo alert" → ricerca inline per scegliere la carta → modal soglia. |

**Regole**
- Crea alert: da Asset page (TASK 4) **e** da questa schermata via ricerca inline.
- Elimina → **conferma** → `deleteAlert`.
- Toggle attivo/non attivo → update `is_active`.
- Verifica E2E (TASK 6): crea alert con soglia sopra il prezzo attuale, invoca manualmente la Edge Function `check-alerts` dal dashboard Supabase, controlla che scatti.

**Cosa NON fa**
- Niente canali di notifica configurabili nell'alfa oltre a quello esistente (email): nessun push/SMS.
- Niente alert su variazione % o volume: solo soglia prezzo assoluta (sopra/sotto).
- Niente scheduling/snooze degli alert.

---

## 3. Sezione "Upcoming" (solo badge, ZERO codice)

Visibile nell'app come elementi chiaramente **non cliccabili** con badge "Upcoming" / "Presto". Servono a comunicare la direzione senza costruire nulla.

- **Binder** — binder virtuali con griglie per sfogliare la collezione.
- **Blog** — contenuti/SEO.
- **Community** — funzioni sociali/condivisione.
- **Grading PSA avanzato** — stime di valore per grado di conservazione.

Regola: nessuna route, nessuna logica, nessuna chiamata DB dietro questi badge. Sono placeholder informativi.

---

## 4. Stati globali e componenti condivisi

- **Card component** (riusato in Markets, Hot picks, Watchlist, Portfolio, risultati): immagine con placeholder pulito, nome, set, numero, lingua, prezzo-o-CTA-eBay. UNA implementazione, riusata ovunque.
- **Placeholder immagine** (§6 Fix #4): box neutro con icona/iniziali della carta su sfondo dark, mai immagine rotta o alt-text grezzo.
- **Empty states**: ogni tab ha un vuoto con copy chiaro + CTA verso il core loop.
- **Selettore valuta** EUR/USD globale, nell'header/nav.
- **Auth**: magic link; stato sessione globale; se non loggato, Markets e ricerca restano usabili in lettura, ma Portfolio/Alerts/azioni richiedono login (CTA "Accedi per salvare").
- **Colori P&L**: verde positivo / rosso negativo, coerenti in tutta l'app.

---

## 5. Cosa il prodotto NON fa (a livello globale, alfa)

- Non vende, compra o scambia carte: nessuna transazione in-app.
- Non fa grading reale né stime PSA per grado.
- Non supporta lingue card oltre EN / JA / IT nel core (le altre restano nel DB ma fuori dai filtri UI).
- Non ha Binder, Blog, Community attivi (→ Upcoming).
- Non ha social login / password: solo magic link.
- Non ha pagamenti/abbonamenti attivati nel flusso alfa (i PLANS esistono ma non gateano il core loop).
- Non garantisce prezzi su tutte le carte: dove manca, è eBay la via d'uscita onesta.

---

## 6. Fix obbligatori (devono entrare nel rebuild)

### Fix #1 — Ricerca che normalizza la punteggiatura
"`monkey d luffy`" **deve** trovare "`Monkey.D.Luffy`". La ricerca confronta una forma normalizzata di entrambi: minuscolo + rimozione di tutto ciò che non è `[a-z0-9]` (punti, spazi, apostrofi, trattini).
- Server-side preferito: `lower(regexp_replace(name,'[^a-z0-9]','','gi'))` confrontato con il termine normalizzato allo stesso modo.
- Oppure equivalente client-side se più semplice/robusto.
- **Test obbligatorio**: "monkey d luffy" → restituisce "Monkey.D.Luffy". Inserito negli smoke test di TASK 3.

### Fix #2 — Invio avvia la ricerca
Premere **Invio** nel campo ricerca lancia la query (form `onSubmit`), non solo il click sul bottone lente. Su mobile, il tasto "vai/search" della tastiera fa lo stesso.

### Fix #3 — eBay Live filtrato per numero carta
La sezione eBay Live mostra **solo** listing che contengono il numero carta esatto (es. `OP12-079`) nel titolo, max 5. Se zero match → la sezione è **nascosta**, non mostra "nessun risultato". Evita listing irrilevanti (bundle, lotti, carte diverse della stessa serie).

### Fix #4 — Immagini con placeholder pulito
Quando l'URL immagine manca o fallisce il load (`onError`): mostra un placeholder neutro coerente col tema dark (box + icona o iniziali del nome), **mai** l'icona di immagine rotta del browser né testo alt grezzo. Stesso componente ovunque.

### Fix #5 — Watchlist effettivamente collegata al cron (gap noto)
Il bottone "Traccia questa carta" (Asset page, posizioni Portfolio senza prezzo) deve inserire in `watchlist`. Da risolvere in TASK 4:
1. aggiungere le funzioni watchlist mancanti in `supabase.js` (`listWatchlist`, `addToWatchlist`, `removeFromWatchlist`);
2. **verificare** che la Edge Function `refresh-prices` includa `watchlist` nella sua query di carte da prezzare; se non lo fa, aggiungerla. Altrimenti "Traccia" è un bottone che non produce prezzi.

---

## 7. Definizione di "fatto" per la spec (TASK 1)

PRODUCT_SPEC.md è su `main` e Ermal l'ha letto e approvato. Da qui partono TASK 2 (shell) → 3 (Markets) → 4 (Asset) → 5 (Portfolio) → 6 (Alerts) → 7 (polish) → 8 (QA/GO), ognuna = una sessione = un commit verificato live su dragold.org.
