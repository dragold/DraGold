# DraGold — Phase 2: UX/UI Polish Roadmap
Documento di pianificazione · 12 agosto 2026 · Solo ricerca/ricostruzione, nessuna modifica al codice.

Contesto: P0 (`f24403b`), P1 (`0943559`) e P1.5 (`1adc37f`) sono live e verificati in produzione. Il loop DISCOVER → SEARCH → EXPLORE → SET → CARD funziona per Pokémon e One Piece, senza P0 residui. Questo documento ricostruisce e aggiorna `DraGold-UXUI-Master-Plan.md` (11 agosto) alla luce di cosa è *realmente* live oggi, e produce la roadmap per la Fase 2 — polish UX/UI, non nuove feature di prodotto.

---

## A. CURRENT STATE — cosa è realmente implementato oggi

Verificato da codice (`src/`) e da verifica live su dragold.org il 12 agosto, non dal vecchio piano.

**Informazione architettura / navigazione**
- Bottom nav e topnav desktop: **2 voci primarie** — `Markets` (ricerca) e `Explore` (browse set). `Portfolio` e `Alerts` sono stati retrocessi nel menu account (dropdown), non più tab di pari livello — **questo era il P0 #6 del vecchio piano, è già fatto.**
- Nessuna voce "Collection" distinta da "Portfolio" — il concetto è ancora unico, chiamato "Portfolio", linguaggio broker (`positions`, `P&L`) presumibilmente ancora presente (non ri-verificato in questa sessione, era già segnalato nel piano precedente come modulo Archived).
- `/academy` **non esiste** — zero riferimenti nel codice (`grep academy` → nessun match). MVP da PRODUCT_SPEC §3 non è stato iniziato.
- Copy "Coming soon" (Binder/Blog/Community) è ora in inglese consistente — il bug IT/EN misto segnalato nel vecchio piano è **già risolto**.

**Discovery loop (P0/P1/P1.5 — nuovo dal vecchio piano)**
- Explore esiste ed è cliccabile: tile set → Set Detail → Card Detail → rail "Other versions" / "More from this set" → torna a Set Detail o Explore con back-context sensato. Questo era il gap #1 del vecchio piano ("zero discoverability") — **chiuso.**
- Raggruppamento varianti lingua in ricerca (P0-E) — fatto, non più righe duplicate piatte.
- Fallback branding per loghi One Piece non disponibili (chip codice set, niente rettangoli bianchi vuoti) — fatto in P1.5.
- Normalizzazione ID set tra fonti dati (case/trattino) per navigazione Explore→Set — fatto in P1.5, zero nuova infrastruttura.

**Visual language — stato reale**
- CSS puro, ~390 righe totali in `src/styles.css`, densamente scritto. Nessuna libreria di animazione (`package.json` conferma: solo `@supabase/supabase-js`, `@vercel/analytics`, `node-html-parser`, `react`, `react-dom`, `sharp` — **zero dipendenze di motion/UI**, invariato dal vecchio piano).
- Superfici scure a livelli (`--surface`, `--surface-2`, `--surface-3`), bordi 1px bassa opacità invece di ombre pesanti — **il sistema descritto nel vecchio piano §4 "Surfaces" è già in uso**, non era ancora verificato da codice all'epoca.
- Radius: 4-14px in uso, non rigorosamente a due soli step come raccomandato (chip 100px pill, card 14px, bottoni 9-11px, input 8-11px) — coerente ma non ancora sistematizzato su una scala esplicita.
- Font: contrasto serif/sans confermato in uso (font-syne per logo, numeri in Space Mono per prezzi/badge/codici set) — **il principio tipografico del vecchio piano è già rispettato nella pratica**, anche se non documentato come sistema formale.
- Colore: oro (`--gold`) come unico accento primario, usato con disciplina su focus-ring, hover link, prezzo — **coerente col principio "un solo accento" del vecchio piano.**
- Skeleton loading: presente non solo in ricerca (come diceva il vecchio piano) ma **anche in Explore** (`skel-card` in `SetsView.jsx`) — copertura più ampia di quanto documentato, ma non ancora su Set Detail (usa lo stesso `SearchResults` skeleton, quindi in realtà sì) né su Card Detail (che ha un proprio skeleton dedicato, da riverificare).
- Hover states: presenti ma minimi — solo cambio colore/bordo/background, **nessun transform/scale su hover carte**, nessuno zoom immagine, nessuna elevazione. Il "leggero scale/elevazione su hover card-tile" proposto nel vecchio piano §7 **non è mai stato implementato.**
- Focus states: presenti su search, input, card-item (`:focus-visible` con outline oro) — buona base di accessibilità già in codice, non segnalata esplicitamente come "fatta" nel vecchio piano.
- `prefers-reduced-motion`: **zero occorrenze nel codice.** Non è ancora un problema pratico solo perché non c'è quasi nessuna animazione da rispettare — ma è un debito che va aperto insieme al motion system, non dopo.
- View Transitions API: **non usata.** Nessuna transizione di continuità tra griglia e dettaglio.
- Rail orizzontali (Other versions / More from this set): scroll-snap CSS nativo, funzionante, zero dipendenze — pattern già stabilito e riusabile per qualunque futura rail.

**Cosa è rimasto invariato dal vecchio audit (non toccato in P0/P1/P1.5, quindi presumibilmente ancora vero salvo verifica dedicata)**
- Command palette: non esiste.
- Filtri di ricerca (set/rarità/lingua): non esistono.
- Sidebar desktop: non esiste, resta topnav orizzontale a 2 voci.
- Collection come vista a griglia/binder con % completamento: non esiste.
- Card Detail arricchita (illustratore, personaggi, prev/next nel set): non fatta — la pagina ha guadagnato rail correlate (P1) ma non i metadata aggiuntivi previsti dal vecchio piano §6.3.

---

## B. RECOVERED ROADMAP — tutto ciò che era pianificato e non è ancora fatto

Ricostruito da `DraGold-UXUI-Master-Plan.md` §7-9, filtrato per escludere ciò che risulta già fatto in A.

**Motion (mai iniziato)**
- Card grid enter/exit/reorder su filtri (`@formkit/auto-animate` proposto).
- Hover scale/elevazione su card-tile.
- Transizione di continuità griglia→dettaglio (View Transitions API).
- Shimmer skeleton esteso a tutte le superfici mancanti (verificare Card Detail).
- Transizione morbida su reflow filtri/risultati.
- Micro-feedback su azioni (aggiunto a collezione, check animato).
- Count-up sui numeri che cambiano (Collection, Portfolio).
- `prefers-reduced-motion` come requisito trasversale.

**Discovery avanzata**
- Command palette ⌘K cross-entità (`cmdk` proposto).
- Filtri reali (set/rarità/lingua) con chip.
- Ricerche recenti persistite.
- Card Detail arricchita: illustratore, personaggi raffigurati, prev/next nel set, azione "condividi" esposta in UI.

**Collection (mai iniziato come concetto distinto)**
- Vista griglia/binder visiva.
- % completamento per set come metrica hero.
- Empty state con CTA/template invece di griglia vuota.
- Badge/traguardi.
- Relazione esplicita Collection ↔ Explore (es. badge "posseduto" sulle tile di Set Detail).

**IA / Navigazione**
- Sidebar verticale collassabile desktop (oggi: topnav orizzontale a 2 voci, funziona ma non scala se Explore cresce con molte TCG/serie).
- Rinominare "Markets" in qualcosa meno finanziario (es. "Search") — non ancora fatto, il tab si chiama ancora "Markets".
- Route `/academy` — MVP intero, non solo UI.

**Componenti/accessibilità**
- Primitivi Radix/Base UI per modali/dropdown esistenti (Auth, Alert, Portfolio modal) — nessuna verifica fatta in questa sessione su focus-trap reale dei modali esistenti.

**Esplicitamente NON recuperare** (obsoleto o già gestito diversamente):
- "Introdurre voce Explore/Sets in navigazione" — fatto, e meglio di quanto pianificato (Explore è cliccabile end-to-end fino a Card, non solo una lista statica).
- "Raggruppare varianti lingua" — fatto (P0-E).
- "Fix bug scala asse Y grafico" / "fix stringhe tecniche" / "fix testo sovrapposto Alerts" — bug P0 specifici del vecchio audit, presumibilmente chiusi in P0-A (non ri-verificati in questa sessione, ma fuori scope Phase 2 salvo segnalazione contraria di Ermal).

---

## C. GAP ANALYSIS — piano vecchio vs produzione attuale

| Area | Piano vecchio (11 ago) | Stato reale oggi (12 ago) | Verdetto |
|---|---|---|---|
| Explore/discoverability | Da costruire da zero (P0 #5) | Costruito, cliccabile end-to-end, verificato live | **Superato il piano** — il piano immaginava solo una lista statica di set, oggi c'è il loop completo fino a Card Detail |
| IA nav (Portfolio/Alerts fuori dal loop primario) | P0 #6 | Fatto | **Chiuso** |
| Varianti lingua raggruppate in ricerca | P0 #7 | Fatto | **Chiuso** |
| Skeleton esteso | P0 #8, "solo in search oggi" | Presente anche in Explore | **Parzialmente superato**, da verificare su Card Detail |
| Motion system | P1, mai iniziato | Ancora zero — nessuna dipendenza, zero keyframe oltre shimmer | **Invariato, ancora valido come da fare** |
| Card hover scale/elevazione | P1 (§7) | Non implementato | **Invariato** |
| Command palette | P1 | Non implementato | **Invariato** |
| Collection distinta da Portfolio | P1 | Non implementato (nome "Portfolio" ancora in uso) | **Invariato** |
| Card Detail arricchita (illustratore/personaggi/prev-next) | P1 | Parzialmente: rail correlate sì (P1), metadata aggiuntivi no | **Parziale** |
| Sidebar desktop | P1 | Non implementato (topnav 2 voci, comunque non ancora un problema con solo 2 voci) | **Invariato, priorità abbassata** — con solo 2 tab primarie il problema "tab orizzontali non scalano" non è ancora urgente |
| Academy | P1/PRODUCT_SPEC §3 | Non esiste | **Invariato — fuori scope Phase 2** (è prodotto, non polish) |
| `prefers-reduced-motion` | Menzionato come principio (§7) | Zero implementazione | **Invariato, ora più urgente** — se si introduce motion in Phase 2 questo diventa un prerequisito, non un nice-to-have |

**Sintesi:** la parte "discovery/IA" del vecchio piano è stata eseguita ed è **più avanti** di quanto il piano stesso prevedeva. La parte "motion/premium feel/collection" del vecchio piano è **rimasta ferma al palo** — zero lavoro fatto, resta interamente valida come backlog. Non ci sono contraddizioni tra piano vecchio e stato attuale, solo un piano parzialmente eseguito (la metà "struttura/IA", non la metà "rifinitura visiva").

---

## D. PRIORITIZED UX POLISH ROADMAP — solo polish, nessuna feature di prodotto nuova

### P0 — polish ad alto impatto, basso rischio, nessuna nuova dipendenza necessaria

| # | Intervento | Perché ora | Tech |
|---|---|---|---|
| 1 | Hover/press feedback su card-tile (Explore, Set Detail, rail, search results): scale leggero (1.00→1.02) + ombra sottile | Oggi le carte — il cuore visivo del prodotto — non reagiscono al tocco: sembra statico, non premium | CSS transition pura |
| 2 | `prefers-reduced-motion` come guardrail globale, scritto PRIMA di aggiungere qualunque nuova animazione | Prerequisito di accessibilità; più facile da rispettare fin dall'inizio che retrofittare dopo | Media query CSS globale |
| 3 | Immagine carta: zoom sottile on hover/tap in Card Detail (l'immagine è "prima cosa vista", oggi statica) | Il vecchio piano lo segnalava come pattern ad alto valore percepito, mai fatto | CSS transform + transition |
| 4 | Skeleton loading verificato/esteso su Card Detail (oggi non confermato coerente col resto) | Coerenza percezione velocità, già in gran parte esistente altrove | CSS, riuso pattern esistente |
| 5 | Stati vuoti onesti e con direzione (es. "nessun risultato" già presente in ricerca — estendere lo stesso pattern a Set Detail/Explore se un set non ha carte, invece di griglia bianca muta) | Coerenza con principio "onesto sui dati, mai finto" | Riuso `.zero-state` esistente |
| 6 | Rinominare tab "Markets" → "Search" (o equivalente) | Il tab di ricerca principale porta ancora un nome da mercato finanziario, in contraddizione diretta col pivot di prodotto | Frontend, solo label + verifica route interne |

### P1 — costruisce il "premium feel" sistemico

| # | Intervento | Perché | Tech |
|---|---|---|---|
| 7 | Transizione di continuità griglia → Card Detail (View Transitions API nativa, feature-detected con fallback silenzioso su browser non supportati) | Il salto secco oggi tra griglia e dettaglio è il gap più visibile rispetto a Linear/Vercel/Apple | `document.startViewTransition`, zero KB, zero dipendenze |
| 8 | Sistema di motion micro-feedback su azioni (aggiunto a collezione/portfolio, alert creato): check animato breve, non toast invasivo | Feedback = fiducia che l'azione sia avvenuta, oggi assente | CSS keyframe breve |
| 9 | `@formkit/auto-animate` (~2KB) su griglie con filtri/risultati che cambiano (ricerca, Explore) | Basso costo, salto di qualità percepita immediato quando i risultati cambiano senza reload secco | Nuova micro-dipendenza, giustificata dal rapporto costo/beneficio |
| 10 | Scala tipografica e spacing esplicitati come sistema (oggi rispettati "a occhio" ma non documentati/enforced) | Previene deriva incoerente man mano che si aggiungono pagine | CSS custom properties, refactor incrementale non visivo |
| 11 | Focus-trap reale sui modali esistenti (Auth, Alert, Portfolio) — verificare prima quanto manca oggi | Accessibilità concreta, non solo estetica | Verifica + eventuale primitivo headless minimale, solo se il gap è reale |

### P2 — rifinitura, void non urgenti

| # | Intervento | Perché rimandare |
|---|---|---|
| 12 | Command palette ⌘K | Alto valore ma è un salto di IA, non "polish" — da trattare come feature P2/P3 di prodotto, non Phase 2 |
| 13 | Sidebar desktop collassabile | Con solo 2 tab primarie oggi non è ancora un problema reale; rivalutare quando Explore cresce (Academy, Collection) |
| 14 | Count-up numerico su cambi di valore | Rifinitura minore, basso impatto rispetto al costo di implementazione corretta |
| 15 | Ottimizzazione tablet-specifica | Nessuna evidenza ancora che sia un problema reale distinto da mobile/desktop |

---

## E. MOTION SYSTEM — proposta concreta

**Filosofia:** motion è feedback di stato, mai decorazione. Se un'animazione non risponde a un'azione dell'utente o a un cambio di stato reale, non esiste. Coerente col principio §7 del vecchio piano, qui reso operativo.

**Duration ranges**
- Micro-interazioni (hover, focus, press): **120–180ms**. Sotto i 100ms è impercettibile, sopra i 200ms sembra lento su un'azione diretta.
- Transizioni di stato UI (apertura menu, cambio tab, reveal filtri): **200–280ms**.
- Transizioni di navigazione (griglia → dettaglio via View Transitions): **250–350ms**, mai oltre 400ms — è comunque un'attesa percepita, deve restare "veloce ma visibile".
- Feedback di conferma azione (check animato, aggiunta a collezione): **300–500ms** totali inclusa eventuale pausa di lettura, ma l'animazione stessa resta breve (~150-200ms) seguita da uno stato fermo leggibile.
- Skeleton shimmer: loop continuo, **1.2–1.5s per ciclo** (il valore attuale, 1.4s, è già in questo range — corretto, non toccare).

**Easing philosophy**
- Default: `ease-out` (o cubic-bezier equivalente, es. `cubic-bezier(0.16, 1, 0.3, 1)`) per qualunque elemento che *entra* o *reagisce* a un'azione — parte veloce, atterra morbido, sensazione di reattività immediata.
- `ease-in` solo per elementi che *escono* (exit di modali, dismiss) — accelera verso l'uscita, non lascia "aspettare" l'elemento che se ne va.
- Nessun bounce/spring/overshoot decorativo — coerente con l'estetica "editoriale densa, non giocosa" del prodotto. Un solo possibile spring sottile e misurato è accettabile SOLO per il check di conferma azione (es. aggiunta a collezione), mai altrove.
- Nessuna curva "ease" generica browser-default lasciata per caso: ogni transition dichiara la propria curva esplicitamente.

**Cosa anima**
- Hover/press su elementi cliccabili (card-tile, set-tile, bottoni, link rail).
- Apertura/chiusura menu, modali, sheet.
- Cambio di risultati filtrati (via auto-animate).
- Navigazione griglia→dettaglio (View Transitions, solo per il salto card-grid → card-detail, non per ogni cambio tab).
- Skeleton/shimmer durante il caricamento.
- Micro-feedback di conferma azione.

**Cosa NON anima**
- Testo primario di lettura (titoli, descrizioni, prezzo) — mai un fade/slide sul contenuto che l'utente deve leggere subito.
- Ingresso a cascata di ogni elemento pagina ("tutto fade-in") — puramente decorativo, rallenta la percezione senza comunicare nulla.
- Filtri/ricerca durante la digitazione — l'input utente non deve mai essere bloccato o rallentato da un'animazione in corso.
- Cambi di tab primari (Markets/Explore) — sono context switch netti, non devono sembrare un "viaggio", un cambio istantaneo è più onesto.

**`prefers-reduced-motion` — comportamento**
- Query globale in cima a `styles.css`: quando attiva, tutte le `transition`/`animation` non essenziali vengono ridotte a `0.01ms` (pattern standard, non `display:none` che romperebbe layout/logica dipendente da eventi `transitionend`).
- Le View Transitions vanno disabilitate esplicitamente (skip transition, navigazione istantanea) quando la preferenza è attiva — l'API lo supporta nativamente via check prima di invocare `startViewTransition`.
- Lo shimmer skeleton è un'eccezione ragionevole da valutare caso per caso (comunica stato di caricamento, non è puramente decorativo) — ma va comunque rallentato/reso più discreto, non necessariamente eliminato del tutto.

---

## F. TOP 10 — le dieci modifiche a più alto impatto percepito, ordinate per impatto/sforzo

1. **Hover/press feedback su ogni card-tile** (scale + ombra sottile). Impatto altissimo — è l'elemento più visto e più cliccato di tutto il prodotto, oggi completamente statico. Sforzo: minimo (CSS puro).
2. **Rinominare "Markets" → "Search"**. Impatto alto sulla coerenza percepita col pivot, visibile in ogni sessione utente. Sforzo: minimo.
3. **Zoom sottile sull'immagine carta in Card Detail**. La pagina carta è il cuore del prodotto (PRODUCT_SPEC: "deve diventare una delle migliori pagine del prodotto") — oggi l'immagine è statica come una foto in un catalogo stampato. Sforzo: minimo.
4. **`prefers-reduced-motion` globale**. Invisibile per la maggior parte degli utenti ma prerequisito serio prima di aggiungere altro motion — evita di dover rifare lavoro dopo. Sforzo: minimo, alto valore strutturale.
5. **Transizione di continuità griglia→Card Detail (View Transitions API)**. Il salto più "premium" possibile per zero KB di dipendenze, usa un'API nativa già pensata per questo esatto pattern SPA. Sforzo: medio (va testato bene su Safari/Firefox per fallback).
6. **Empty state onesti estesi a Set Detail/Explore**. Coerenza col principio "onesto sui dati" — basso sforzo, ma chiude un buco di percezione qualità ogni volta che capita un caso limite. Sforzo: basso.
7. **Micro-feedback su azioni (aggiunta a collezione, alert creato)**. Oggi un'azione importante non ha conferma visiva chiara — rischio di doppio-click involontario e di percezione "non ha funzionato". Sforzo: basso-medio.
8. **`@formkit/auto-animate` su griglie filtrate**. 2KB per un salto di qualità percepita ogni volta che l'utente filtra/cerca — alto rapporto valore/costo. Sforzo: basso.
9. **Focus-trap reale sui modali esistenti**. Non è "bello", ma è la differenza tra un prodotto che sembra costruito con cura e uno che no per chi naviga da tastiera — e oggi non è verificato. Sforzo: da misurare, potenzialmente medio.
10. **Scala tipografica/spacing dichiarati come sistema esplicito**. Impatto meno immediato visivamente (il prodotto già "sembra" abbastanza coerente), ma è la base che rende sostenibili tutti i punti sopra man mano che il catalogo di pagine cresce (Card Detail, Set Detail, futura Collection). Sforzo: medio, refactor incrementale.

---

## G. DO NOT DO — cosa peggiorerebbe DraGold

- **Glassmorphism diffuso.** Il vecchio piano lo validava "selettivamente" per bottom-nav/overlay ispirandosi a Collectr — ma con zero motion system esistente oggi, introdurlo ora rischia di diventare decorazione senza base, non "profondità intenzionale". Rimandare a dopo che il motion system base esiste.
- **Bounce/spring/elastic easing generalizzato.** Coerente col principio "editoriale, non giocoso" — un prodotto di reference/collezione seria non deve sembrare un'app consumer gamificata nell'interazione, anche se lo sarà nei contenuti (Academy).
- **Fade-in a cascata su ogni elemento di pagina al caricamento.** Pattern da landing page marketing, non da prodotto denso e informativo — rallenta la lettura senza comunicare nulla, esplicitamente sconsigliato anche dal vecchio piano.
- **Parallax scrolling o scroll-jacking.** Nessuna prova che serva al caso d'uso (sfogliare carte/dati), alto rischio di rallentare/confondere la lettura su mobile, dove il prodotto vive principalmente.
- **Librerie di animazione pesanti generaliste** (Framer Motion, GSAP come motore generale). Sproporzionate rispetto ai bisogni reali (hover, transizioni di stato, view transitions native coprono il 90% dei casi) e in diretto conflitto con la filosofia "dipendenze minime" del progetto.
- **shadcn/ui o qualunque kit Tailwind-based.** Confermato dal vecchio piano, ancora valido: introdurrebbe un secondo sistema di styling in conflitto diretto con CSS puro.
- **Skeleton/loading finti troppo a lungo o troppo elaborati** (es. skeleton con dettagli iper-realistici che imitano il contenuto finale al pixel). Comunicano attesa, non devono diventare essi stessi un elemento su cui investire design — il valore è nella percezione di velocità, non nell'estetica dello skeleton stesso.
- **Colori verde/rosso stile trading per qualunque dato numerico** (già vietato dal vecchio piano — riconfermato: nessun linguaggio "guadagno/perdita" visivo, nemmeno per metriche di collezione tipo "completamento +5% questa settimana").
- **Notifiche/streak colpevolizzanti stile Duolingo** se e quando arriverà Academy — fuori scope Phase 2 (è prodotto, non polish) ma da tenere a mente come vincolo di tono per quando arriverà.
- **Un design system formale/completo costruito ora.** Confermato dal vecchio piano: le pagine core (Explore, futura Collection, futura Academy) non sono ancora tutte esistenti — sistematizzare la cornice prima dei contenuti principali è lavoro che rischia di essere rifatto. La scala tipografica/spacing (F.10) va dichiarata in modo leggero e incrementale, non come iniziativa "design system v1" a sé stante.
- **Virtualizzazione liste preventiva.** Nessuna pagina ha dimostrato di averne bisogno; motion/polish non è la ragione per introdurla ora.
- **Router SPA completo (React Router ecc.) motivato "per fare transizioni pagina più belle".** Se mai arriverà, è una decisione architetturale SEO-driven (P2 del vecchio piano), non uno strumento di polish — non va introdotto come scorciatoia per ottenere transizioni che le View Transitions API native possono già dare nell'architettura state-driven esistente.

---

## Nota metodologica

- Nessuna modifica al codice, nessun commit, nessun push in questa fase, come richiesto.
- "Current state" (sezione A) è verificato da lettura diretta di `src/DraGold.jsx`, `src/styles.css`, `package.json` e dalla verifica live in produzione della sessione precedente — non dedotto dal vecchio piano.
- Il vecchio piano (`DraGold-UXUI-Master-Plan.md`) resta il documento di riferimento per il contesto di ricerca (competitor, principi DNA, IA completa) — questo documento lo aggiorna solo dove la produzione è cambiata, non lo sostituisce integralmente.
