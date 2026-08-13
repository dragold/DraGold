# DraGold — UX/UI Master Plan
Documento strategico · 11 agosto 2026 · Solo ricerca/analisi, nessuna modifica al codice.

---

## 0. Executive summary — la cosa più importante emersa dall'audit

**Il prodotto live non riflette il pivot.** PRODUCT_SPEC.md (approvato 5 agosto 2026) dice che DraGold è ora "knowledge graph + Academy + Collection", con pricing/portfolio/alert relegati a modulo Future/Archived. Il sito live (dragold.org), verificato oggi in sessione autenticata, è ancora al 100% il vecchio prodotto:

- Title tab e hero copy: *"DraGold — Fair Market Value for Serious TCG Collectors"*, *"Find a card. See its real market value."*
- Bottom nav: **Markets / Portfolio / Alerts** — esattamente le tre tab pre-pivot.
- `/academy` non esiste: redirect silenzioso alla home. Nessuna traccia di XP, streak, quiz, knowledge graph.
- "Portfolio" fa da surrogato di "Collection", con linguaggio da broker: *positions*, *P&L*, *vs paid*, percentuali verdi/rosse in stile Trade Republic.

Questo non è un problema di rifinitura: è la ragione strutturale per cui, oggi, DraGold *si comporta e si presenta* come un price tracker finanziario anche se la direzione approvata dice il contrario. Qualsiasi lavoro di redesign visivo fatto sopra questa IA senza prima risolvere la disallineamento tra prodotto live e PRODUCT_SPEC rischia di essere un restyling del prodotto sbagliato.

**Raccomandazione che precede tutto il resto di questo piano:** il P0 reale non è "rendere le pagine più belle" — è far emergere Collection/Academy come concetti di prima classe nell'IA e nel copy, e retrocedere Markets/Portfolio/Alerts a moduli secondari, *prima o in parallelo* al lavoro visivo. Il resto del documento è scritto assumendo che questa correzione di rotta avvenga; le priorità P0 in fondo riflettono questo.

**Bug di produzione trovati durante l'audit** (non sono opinioni di design, sono difetti verificabili — vanno riparati indipendentemente dalla strategia):
- Stringhe tecniche/interne in UI: `"ebay_sold"` mostrato come fonte prezzo, nome carta letteralmente `"_____'s Pikachu"`.
- Card "SAMPLE" (placeholder watermarked) nel modulo "Hot Picks" in home.
- Grafico prezzo con bug di scala asse Y (picchi rossi sproporzionati rispetto al prezzo reale).
- Testo sovrapposto in Alerts: `"Below €0.87Active"` senza spazio.
- Scroll infinito che termina in un vuoto nero senza stato di fine risultati.
- Copy misto IT/EN non localizzato nella sezione "Coming soon".

---

## 1. Ricerca — sintesi dei riferimenti (dettaglio completo in appendice research log)

Riferimenti analizzati: Linear, Vercel, Notion, Apple (Wallet/HIG), Duolingo, Stripe, Arc/Zen Browser, TCGdex, Pokellector, Collectr, PriceCharting, + CollX e TCGplayer (emersi come rilevanti durante la ricerca).

Pattern trasversali che sono ormai standard 2025-26 e che DraGold non ha:

1. **Command palette (⌘K)** — Linear, Vercel, Arc, Stripe convergono tutti su ricerca/navigazione unificata da tastiera. Per un catalogo multi-entità (carte/set/personaggi/illustratori/Academy) è il pattern a più alto leverage: sostituisce sia una mega-nav sia un motore di ricerca debole.
2. **Skeleton loading** reale (DraGold ce l'ha parzialmente nei risultati di ricerca — va esteso ovunque).
3. **Vista riepilogo opinionata** (4-6 numeri chiave, non dashboard configurabile) — Vercel/Stripe/Collectr.
4. **Ricerca cross-entità** — una sola search bar per carte, set, Academy, grafo (pattern Stripe).
5. **Dark mode come sistema, non improvvisazione** — DraGold ha già una base dark ma incoerente (vedi Fase 4).
6. **Glassmorphism selettivo** per profondità su overlay/bottom-nav — validato specificamente nella categoria da Collectr.
7. **Meccaniche streak/gamification basate su loss-aversion**, calibrate su un uso "a scoppi" (nuovi set, aperture pacchetti) e non su cadenza giornaliera forzata come Duolingo — e senza le notifiche colpevolizzanti che Duolingo stesso sta correggendo.
8. **% di completamento set come metrica hero**, sempre visibile — la leva motivazionale numero uno secondo sia Pokellector sia Collectr, riformulata attorno a completamento/conoscenza invece che valore in euro (coerente col pivot).
9. **Micro-interazioni/motion** — oggi assenti (nessuna libreria di animazione installata).
10. **Empty state con CTA chiare / onboarding a template** (lezione Notion): "inizia a tracciare Base Set" invece di griglia vuota.
11. **Card come oggetto con azione primaria in-front** (pattern Apple Wallet): la card in griglia dovrebbe esporre un'azione ovvia (aggiungi/segna posseduta) senza aprire il dettaglio.
12. **Sidebar verticale collassabile** per liste lunghe enumerable (set, binder, TCG) invece di tab orizzontali — pattern Arc/Zen/Vercel.

**Cosa NON copiare, esplicitamente:**
- L'austerità quasi monocromatica di Linear/Vercel va applicata solo al *chrome* (nav, tabelle, form), non alle immagini delle carte, che sono il cuore emotivo del prodotto.
- Il linguaggio finanziario di Stripe/Collectr ("portfolio", "P&L", valore in euro come metrica organizzativa primaria) è esattamente ciò che il pivot vuole abbandonare — va evitato attivamente, non solo "non copiato".
- Le notifiche colpevolizzanti di Duolingo (streak-guilt) sono discutibili anche nel prodotto originale; DraGold, con un pubblico adulto e un uso bursty, non dovrebbe replicarle.
- L'ambizione "reinventiamo tutto" di Arc è un monito: Arc stesso è oggi in maintenance mode. Un piccolo team non deve costruire paradigmi di interazione completamente custom che non può sostenere nel tempo.

**Concorrenti diretti — cosa impariamo:**
- **Pokellector**: la % di completamento set è la leva motivazionale numero uno, ma l'esecuzione visiva è definita dagli utenti stessi "not special" — è l'apertura competitiva più chiara di DraGold: stesso mental model, esecuzione premium.
- **Collectr**: interfaccia "una delle più pulite da tempo", bottom nav glassmorphic, vista aggregata "All Portfolios" con rollup istantaneo — pattern riusabile, ma va reintitolato attorno a completamento/conoscenza, non valore.
- **CollX/TCGplayer** (trend recenti): layer social/community sopra i dati di collezione, ottimizzazioni tablet-specifiche — segnali di dove va la categoria, utili come riferimento per fasi successive, non per il P0.

---

## 2. Ricerca open source — sintesi (dettaglio completo in appendice)

Stack reale: React 18.3 + Vite 5, JS puro (no TS), CSS puro (no Tailwind), nessuna libreria di animazione/router/state management. Filosofia storica: dipendenze minime.

**Da adottare, rischio basso/valore alto:**
1. `@formkit/auto-animate` (~2KB) — animazioni enter/exit/reorder automatiche su griglie carte/filtri/liste. Costo quasi nullo, salto di qualità percepita immediato.
2. Primitivi headless **Radix UI o Base UI** (Dialog, Popover, Tooltip, DropdownMenu), selettivi — comprano correttezza di accessibilità (focus trap, ARIA, keyboard nav) genuinamente difficile da costruire a mano bene. Nessuna dipendenza da Tailwind, si stilizzano con CSS puro.
3. `cmdk` — command palette non stilizzata, leggera, usata da Vercel-style UI. Alto valore per un prodotto knowledge-graph dove il salto rapido a un'entità è un bisogno naturale.
4. `react-virtuoso` (o `@tanstack/react-virtual` per controllo layout totale) — solo quando una pagina catalogo specifica renderizza migliaia di righe/nodi in modo misurabilmente lento. Non prematuro.
5. **Router** — se serve SEO su pagine entità (carta/set/personaggio/illustratore), **React Router v7** (modalità dichiarativa, non framework/SSR mode inizialmente) è la scelta più sicura; TanStack Router è sconsigliato specificamente perché le fonti 2026 lo segnalano debole su SEO/SSR, proprio il requisito che conta di più qui. La decisione framework-mode vs SSR va trattata come decisione architetturale separata, non presa di default.

**Da costruire internamente, zero nuove dipendenze:**
- Skeleton loading → CSS puro (shimmer keyframe), nessuna libreria giustificata.
- Griglia carte → CSS Grid nativa (`auto-fill`/`minmax`) — le carte TCG hanno aspect ratio uniforme, la masonry non serve per il catalogo core (utile solo per un'eventuale galleria illustratore con immagini miste).
- Filtri a faccette/chip → nessuna libreria trovata supera la soglia di manutenzione/qualità; è comunque UX core che conviene possedere per controllo del look "premium editoriale".
- Motion semplice (hover, fade, transizioni di pagina) → CSS transitions + **View Transitions API** nativa, pensata esattamente per la navigazione SPA state-driven che DraGold già usa. Zero KB.

**Da evitare:**
- shadcn/ui (porta Tailwind, conflitto diretto con lo stack).
- Librerie di faceted-search trovate (react-structured-filter è abbandonata dal 2018; le altre sono troppo piccole/non mantenute o accoppiate a Solr).
- TanStack Router (debole su SEO/SSR).
- GSAP come sostituto generale (paradigma imperativo, adatto solo a casi specifici come morphing SVG/scroll timeline, non a un refactor generale).

**Da verificare in task dedicato, non qui:** licenza `pokemon-tcg-data`, valutazione `tcgdex/cards-database` come fonte dati complementare (allineata alla priorità EN/JA), decisione framework-mode del router.

---

## 3. DraGold UX Principles (DNA)

Derivati dalla ricerca sui riferimenti e dai gap reali osservati nell'audit — non un elenco generico.

1. **Sfogliabile prima che cercabile.** Oggi DraGold risponde solo a query esatte. Un knowledge graph si dimostra lasciando scoprire, non solo rispondendo. Ogni entità deve essere raggiungibile per esplorazione, non solo per ricerca.
2. **Un'azione primaria per oggetto, sempre visibile.** Ogni card-tile espone un'azione ovvia (aggiungi/segna posseduta) senza richiedere un drill-down per il caso comune.
3. **Onesto sui dati, mai finto.** Nessuna stringa tecnica in UI (`ebay_sold`), nessun placeholder watermarked spacciato per contenuto reale, nessun dato mancante mascherato — si dice chiaramente cosa manca (già un principio di PRODUCT_SPEC, va applicato all'UI).
4. **Denso ma leggibile, non spreadsheet.** La densità informativa è un valore (PriceCharting insegna che density fatta bene funziona), ma va ottenuta con gerarchia tipografica e spaziatura, non con tabelle a righe.
5. **Il completamento è la metrica hero, non il valore in euro.** Coerente col pivot: % set posseduto, non P&L, è il numero che l'utente deve vedere per primo su Collection.
6. **Veloce percepito prima che veloce reale.** Skeleton state, transizioni istantanee, ricerca istantanea: la percezione di velocità è un requisito di prodotto, non un dettaglio tecnico.
7. **Motion come feedback, mai decorazione.** Ogni animazione deve rispondere a un'azione dell'utente (aggiunto, filtrato, caricato) — se non comunica nulla, non esiste.
8. **Le carte sono il materiale visivo, il resto è cornice.** Chrome (nav, tabelle, form) resta austero e disciplinato (griglia 4px, gerarchia via opacità); il colore/ricchezza visiva va riservato all'artwork delle carte.
9. **Mobile è il prodotto primario, non desktop ridotto.** Bottom nav, sheet, gesture — pensati per il contesto reale d'uso (sfogliare carte), non un adattamento responsive del desktop.
10. **Coerente col grafo, non un'accozzaglia di schermate.** Ogni pagina entità (carta/set/personaggio/illustratore) condivide lo stesso linguaggio visivo e lo stesso pattern SEO — non si inventa una tecnica diversa per ogni tipo.

---

## 4. Visual Language

**Typography** — Mantenere il contrasto serif display / sans body già presente in home (funziona), ma renderlo sistematico: un solo font serif per titoli entità/hero, un solo sans per UI/corpo, scala tipografica a step definiti (non dimensioni libere). Numeri (prezzi, percentuali, contatori) in un font tabulare/monospaced per allineamento pulito nelle liste.

**Spacing & Radius** — Griglia 4px/8px (lezione Linear/Vercel) per tutta la UI chrome. Radius coerente: piccolo (4-6px) per chip/badge, medio (10-12px) per card/modali, mai misto nella stessa gerarchia.

**Surfaces** — Superfici scure a due-tre livelli di elevazione (background → surface → surface elevata), differenziate per luminosità non per bordi pesanti. Bordi sottili (1px, bassa opacità) invece di ombre pesanti per separare i livelli — coerente con l'estetica "editoriale densa" già in PRODUCT_SPEC.

**Color system** — Palette neutra dominante (grigi/neri caldi, non blu-nero da fintech) + un solo accento primario (oro, coerente col naming "DraGold") usato con disciplina solo per stato/azione primaria, mai come colore decorativo diffuso. Eliminare verde/rosso stile "guadagno/perdita" come linguaggio visivo primario — è esattamente il segnale "brokerage" da disinnescare. Rarità/foil delle carte possono avere un proprio micro-sistema cromatico (oro/olografico/ecc.) perché è informazione di dominio, non decorazione.

**Iconography** — Set di icone coerente, stroke uniforme, usato con parsimonia; oggi c'è già un componente `Icon.jsx` centralizzato — buona base da estendere, non da duplicare.

**Imagery / card presentation** — L'immagine della carta è l'elemento con più peso visivo su ogni superficie in cui appare. Aspect ratio uniforme → griglia CSS nativa, zoom on hover/tap sottile, mai ritagliata/schiacciata. Placeholder per immagini mancanti deve essere un componente esplicito e onesto (non un rettangolo nero con una lettera a caso, come oggi nei risultati rotti).

**Charts** — Se/quando il modulo pricing resta visibile, il grafico deve essere ridimensionato in modo proporzionato al prezzo reale (bug attuale: asse Y sproporzionato) e visivamente meno "trading terminal" — linea sottile, area soft, niente rosso/verde aggressivo.

**Motion & transitions** — Vedi Fase 7 dedicata.

**Interaction states** — Ogni elemento interattivo ha stati hover/focus/active/disabled definiti esplicitamente e coerenti nel sistema, non lasciati al default browser (oggi assenti in molti punti, es. nessun feedback su hover risultati ricerca).

---

## 5. Information Architecture

**Problema attuale:** IA a 3 tab (Markets/Portfolio/Alerts) centrata su un loop finanziario che PRODUCT_SPEC ha esplicitamente abbandonato. Nessuna voce di navigazione per Sets, Academy, Collection come concetti distinti.

**IA proposta:**

- **Home** — non un motore di ricerca nudo: mostra ingressi multipli (ricerca, set recenti/in evidenza, progresso collezione se loggato, entry point Academy).
- **Explore** — nuova sezione: sfoglia per TCG → serie → set, con completamento visibile per set. Questo è il gap più grave trovato nell'audit (zero discoverability oggi) ed è coerente col principio "sfogliabile prima che cercabile".
- **Search** — potenziata: command palette globale (⌘K) cross-entità (carte/set/personaggi/illustratori/Academy), filtri (rarità/set/lingua), raggruppamento varianti lingua/regione invece di elenco piatto.
- **Sets** — pagina entità set (già prevista in PRODUCT_SPEC come priorità SEO #2): tutte le carte, tasso di completamento, storia.
- **Card** — pagina entità carta, va arricchita (vedi Fase 6.3).
- **Collection** — nuova sezione distinta da Portfolio: vista a griglia/binder, completamento per set, badge. Il valore economico resta visibile ma secondario (coerente PRODUCT_SPEC §4).
- **Portfolio** — retrocesso a modulo secondario/opzionale, raggiungibile ma non hero; linguaggio "posizioni/P&L" da ammorbidire o isolare in una sezione chiaramente etichettata come facoltativa.
- **Academy** — nuova sezione, oggi inesistente anche come route: hub, quiz giornaliero, XP, streak, micro-lezioni (MVP già specificato in PRODUCT_SPEC §3).
- **Account** — oggi minimo (solo email + logout); va esteso con almeno preferenze lingua/notifiche quando l'Academy introduce notifiche di streak.

Navigazione: sostituire la bottom-tab a 3 voci finanziarie con una nav che rifletta questa gerarchia — su mobile bottom-nav con le 4-5 voci principali (Explore/Search/Collection/Academy/Account), su desktop sidebar verticale collassabile (pattern Arc/Vercel) invece di tab orizzontali, per lasciare spazio a un elenco set/TCG che crescerà.

---

## 6. Redesign concettuale delle pagine chiave

### 6.1 Homepage
Deve rispondere in pochi secondi a: cos'è, perché è diverso, cosa posso fare, perché tornare. Oggi risponde solo a "cerca un prezzo". Redesign concettuale:
- Hero riformulato: da "Find a card. See its real market value" a un messaggio che comunica knowledge graph + collezione (es. framing attorno a "scopri, impara, colleziona" — il copy esatto è lavoro di prossima sessione, non di questo piano).
- Rimuovere immediatamente le card "SAMPLE" placeholder dal modulo Hot Picks — è un problema di fiducia, non di estetica, va corretto indipendentemente dal resto.
- Aggiungere un ingresso "Explore" visivo (set in evidenza/nuovi) accanto alla search bar, non sotto.
- Se loggato: mostrare un riepilogo opinionato (2-4 numeri: completamento collezione, streak Academy se attivo, ultima attività) invece di ripartire da zero ogni volta.
- Unificare il copy in una sola lingua per superficie (oggi IT/EN mescolati nella sezione "Coming soon").

### 6.2 Search
- Introdurre command palette (⌘K / tap su lente) con risultati istantanei mentre si digita (oggi richiede submit+reload).
- Raggruppare varianti lingua/regione della stessa carta sotto un'unica entry espandibile, invece di righe duplicate ("Pikachu #018 FR/IT/PT/ES ES..." — quest'ultimo ha pure un bug di label duplicata).
- Filtri minimi ma reali: set, rarità, lingua.
- Ricerche recenti persistite localmente.
- Mostrare sempre un conteggio risultati e uno stato di fine lista esplicito (oggi: scroll che finisce nel vuoto nero, bug reale).
- Mobile: search a schermo intero con tastiera, non un piccolo input in pagina.

### 6.3 Card Detail
Oggi è tra le pagine più deboli del prodotto (immagine piccola, niente illustratore/rarità/related/prev-next/share). Deve diventare una delle migliori pagine del prodotto, come richiesto:
- Immagine grande, zoomabile, prima cosa vista.
- Metadata completi: set, numero, rarità, illustratore, personaggio/e raffigurati — dati già previsti come entità nel Core Data Layer (PRODUCT_SPEC §1), la UI deve semplicemente esporli quando disponibili.
- Prezzo (quando disponibile) onesto: mai stringhe tecniche come fonte, mai grafico con asse sproporzionato — se il dato manca, dirlo chiaramente invece di mostrare CTA multiple ambigue.
- Varianti linguistiche della stessa carta accessibili da un selettore sulla stessa pagina, non come risultati di ricerca separati.
- Prev/next all'interno del set, related cards (stesso personaggio/illustratore — sfrutta le relazioni del grafo).
- Azioni collezione: aggiungi/segna posseduta come azione primaria in evidenza (non sepolta in un modal con campi da compilare come unico percorso).
- Condivisione (link diretto, già supportato lato SEO/OG secondo PRODUCT_SPEC — va solo esposto in UI).
- Mobile: layout a scroll verticale con immagine hero, azioni sticky in basso.

### 6.4 Collection
Deve smettere di essere "Portfolio con altro nome". Redesign concettuale:
- Vista primaria a griglia/binder visivo (immagini carte), non righe di tabella.
- Completamento per set come elemento organizzativo primario (barra di progresso per ogni set posseduto parzialmente).
- Stato vuoto con template ("inizia a tracciare [set popolare]"), non griglia bianca.
- Valore economico resta accessibile ma come dato secondario (es. un numero discreto in alto, non il titolo della pagina).
- Badge/traguardi (primo set completato, ecc. — già specificato in PRODUCT_SPEC §4) visibili qui.

### 6.5 Portfolio
Ridotto a modulo esplicitamente secondario/opzionale:
- Linguaggio ammorbidito: evitare "positions"/"P&L" come intestazioni primarie; se il dato resta (valore stimato, guadagno/perdita), presentarlo con meno enfasi da trading-terminal (niente aree rosso/verde acceso in stile azionario).
- Accessibile da Collection (es. "vedi valore stimato"), non come tab di pari livello — coerente con PRODUCT_SPEC §4 ("il valore economico... non è più l'elemento organizzativo principale").
- Fix del bug reale del grafico (scala asse Y) resta necessario indipendentemente da dove la sezione finisce nell'IA.

---

## 7. Motion — dove sì, dove no

**Dove il motion aiuta davvero (con tecnica consigliata):**
- Card grid: enter/exit/reorder su filtri e nuovi risultati → `@formkit/auto-animate` (2KB, immediato).
- Hover su card-tile: leggero scale/elevazione per segnalare interattività → CSS transition, zero dipendenze.
- Apertura card detail da griglia: transizione di continuità (l'immagine "vola" dalla griglia al dettaglio) → View Transitions API nativa, adatta esattamente alla navigazione SPA state-driven già in uso.
- Skeleton loading: shimmer discreto → CSS keyframe.
- Filtri/sort: transizione morbida del reflow risultati, non un lampo di layout.
- Feedback su azioni (aggiunto a collezione, streak avanzata): un micro-feedback breve (es. check animato, non un toast invasivo).
- Portfolio/Collection: transizione dei numeri quando cambiano (count-up breve), non un salto secco.

**Dove NON animare:**
- Non animare il testo primario di lettura (titoli, descrizioni) — rallenta la lettura senza beneficio.
- Non animare ogni elemento della pagina all'ingresso (pattern "tutto fade-in a cascata") — è decorativo, non feedback.
- Nessuna animazione che blocchi l'input utente durante il caricamento di azioni frequenti (search, filtri).
- Rispettare sempre `prefers-reduced-motion` — non opzionale, è un requisito di accessibilità di base per qualunque uso di blur/motion (glassmorphism incluso).

Principio guida: motion veloce (150-250ms), naturale (easing standard, non rimbalzi eccessivi), discreta, sempre legata a un'azione dell'utente o a un cambio di stato reale.

---

## 8. Mobile come prodotto primario

Nota metodologica: l'audit live non è riuscito a verificare il rendering mobile reale (limite dello strumento di navigazione usato in sessione, non del prodotto) — le osservazioni sotto vanno confermate con un passaggio dedicato device-emulation prima dell'implementazione. Quello che è verificabile da codice: la bottom-tab bar (Markets/Portfolio/Alerts) è già presente anche a piena larghezza desktop, segno che il prodotto è stato pensato mobile-first ma senza un vero layout desktop dedicato — un problema opposto a quello tipico ("responsive desktop"), ma comunque da correggere nella direzione giusta.

Linee guida:
- **Navigation**: bottom-nav con le voci ridisegnate (Explore/Search/Collection/Academy/Account), mai più di 5 voci.
- **Search**: schermo intero, tastiera immediata, niente piccolo input incassato.
- **Card grid**: 2-3 colonne, touch target ampi, azione primaria raggiungibile col pollice.
- **Card detail**: scroll verticale, immagine hero in alto, azioni (aggiungi a collezione, condividi) sticky in basso — pattern "sticky actions" ormai standard.
- **Filtri**: bottom sheet (pattern Collectr/glassmorphism validato in categoria), non un pannello laterale che ruba spazio su schermo stretto.
- **Collection**: griglia/binder swipeable per set, non tabella compressa.
- **Gesture**: swipe tra carte in un set nella card detail (coerente col prev/next desktop), pull-to-refresh dove sensato.
- **Portfolio** (modulo secondario): accessibile ma non nella bottom-nav primaria.

---

## 9. Roadmap prioritizzata

### P0 — da fare subito (max 8)

| # | Intervento | Problema attuale | Beneficio | Difficoltà | Dipendenze | Tech/componente | Backend/DB? |
|---|---|---|---|---|---|---|---|
| 1 | Rimuovere card "SAMPLE" placeholder da Hot Picks | Contenuto fake in home mina fiducia immediata | Fiducia percepita | Bassa | Nessuna | Solo frontend | No |
| 2 | Fix stringhe tecniche in UI (`ebay_sold`, `_____'s Pikachu`) | Dati grezzi/rotti esposti all'utente | Percezione qualità/premium | Bassa | Verifica dati sorgente | Frontend + query fix | Possibile fix dati minimo |
| 3 | Fix bug scala asse Y grafico prezzo | Grafico visivamente allarmante e sproporzionato | Fiducia sul dato "fair market value" | Bassa-media | Nessuna | Solo frontend (chart config) | No |
| 4 | Fix testo sovrapposto Alerts + fine scroll infinito senza stato | Bug visibili, sembrano prodotto rotto | Percezione qualità | Bassa | Nessuna | Solo frontend (CSS/stato) | No |
| 5 | Introdurre voce "Explore/Sets" in navigazione + pagina base di browsing set | Zero discoverability oggi, unico ingresso è la ricerca esatta | Coerenza con "knowledge graph", engagement | Media | Dati set già in DB (`set_logos`, relazioni set) | Nuova pagina `src/pages/sets/`, CSS grid | Legge dati esistenti, verificare completezza |
| 6 | Rinominare/ristrutturare IA: Collection distinta da Portfolio, entrambe fuori dalla bottom-nav primaria a 3 voci finanziarie | Nav ancorata al framing pre-pivot | Allineamento prodotto-visione, primo passo percepibile del pivot | Media | Decisione di Ermal su copy/naming esatto | Frontend (routing/stato, no nuova lib se si resta su navigazione a stato) | No |
| 7 | Raggruppare varianti lingua/regione nei risultati di ricerca | Risultati duplicati/rumorosi, nessuna gerarchia | Ricerca usabile | Media | Logica di canonical_card_id già presente in DB | Frontend (logica raggruppamento su `lib/search.js`) | No, dato già presente |
| 8 | Skeleton loading esteso a tutte le superfici (già presente solo in search results) | Loading incoerente, percezione di lentezza | Performance percepita | Bassa | Nessuna | CSS puro | No |

### P1 — importante

- Command palette (⌘K) globale cross-entità — `cmdk`, valore alto, rischio basso.
- Card detail arricchita: illustratore, rarità, related cards, prev/next, share — dipende da relazioni grafo (character/illustrator) citate come "da chiudere" in PRODUCT_SPEC §1; **bloccante lato dati prima che lato frontend**.
- Collection ridisegnata a griglia/binder con % completamento per set.
- Route `/academy` reale con MVP (quiz giornaliero, XP, streak) — già specificato in PRODUCT_SPEC §3, oggi non esiste nemmeno come pagina vuota.
- Sistema di motion base (`@formkit/auto-animate` + View Transitions API) su griglie e navigazione carta.
- Filtri di ricerca (set/rarità/lingua) con chip, costruiti internamente.
- Primitivi Radix/Base UI per modali/dropdown esistenti (Auth, Alert, Portfolio modal) → accessibilità reale.
- Sidebar verticale collassabile desktop al posto delle tab orizzontali, per accomodare Explore/Sets in crescita.

### P2 — evolutivo

- Virtualizzazione liste (`react-virtuoso`) quando cataloghi/set superano centinaia-migliaia di righe renderizzate.
- Router dedicato (React Router v7, modalità dichiarativa) per URL SEO-friendly su pagine entità, con decisione framework/SSR separata.
- Pagine entità aggiuntive (character, illustrator, series) — dipendono dalla canonicalizzazione multilingua che PRODUCT_SPEC segnala come lavoro aperto bloccante.
- Layer social/community leggero (ispirato a CollX) — solo dopo che Collection/Academy hanno utenti attivi, coerente con PRODUCT_SPEC §5-6.
- Ottimizzazione layout tablet-specifico.
- Valutazione `tcgdex/cards-database` come fonte dati complementare EN/JA.

---

## 10. Cosa NON fare

- **Non ridisegnare Portfolio come priorità.** È esplicitamente un modulo Future/Archived: lucidarlo ora (grafici migliori, più metriche finanziarie) va contro la direzione di prodotto approvata, anche se tecnicamente "facile" — è il tipo di lavoro che sembra produttivo ma rinforza esattamente il framing che si vuole abbandonare.
- **Non costruire un design system completo prima di avere le pagine core (Explore, Academy) esistenti.** Il rischio è ottimizzare la cornice di un prodotto che ancora non ha i contenuti principali che deve incorniciare.
- **Non adottare shadcn/ui o qualunque kit Tailwind-based.** Richiederebbe di introdurre un intero secondo sistema di styling in conflitto con lo stack CSS puro esistente — costo architetturale sproporzionato al beneficio estetico.
- **Non introdurre virtualizzazione liste in modo preventivo.** Nessuna pagina oggi ha dimostrato di averne bisogno; è complessità aggiunta senza problema misurato.
- **Non replicare le meccaniche di streak "colpevolizzanti" di Duolingo.** Un pubblico adulto di collezionisti con uso bursty (nuovi set, non abitudine quotidiana forzata) risponde male a notifiche di pressione stile "hai rotto lo streak" — rischio di percezione negativa del prodotto.
- **Non inseguire un layout/paradigma di interazione completamente originale in stile Arc.** Arc stesso è oggi in manutenzione: per un team piccolo, un'interfaccia troppo bespoke è un rischio di manutenibilità, non solo di sviluppo iniziale.
- **Non costruire pagine di entità aggregata (character/illustrator/series) prima che la canonicalizzazione multilingua sia chiusa.** PRODUCT_SPEC lo segnala già come bloccante — costruire la UI sopra dati non affidabili genera pagine sottili/duplicate, un rischio SEO oltre che UX.
- **Non aggiungere una libreria di grafici (Recharts/visx/ecc.) ora.** Il modulo pricing è secondario; se e quando verrà rilanciato, `lightweight-charts` (12KB, Apache-2.0) è la scelta segnalata, non prima.
- **Non fare redesign visivo "a schermata" senza risolvere prima la contraddizione IA/copy pre-pivot.** È il rischio più concreto di questo intero piano: bellissime schermate che comunicano ancora "price tracker", non "knowledge graph".

---

## 11. Contraddizioni/gap da segnalare (per trasparenza, non risolte qui)

- **CLAUDE.md §5 vs PRODUCT_SPEC.md "Vincoli tecnici"**: CLAUDE.md attuale richiede modularizzazione progressiva ("nuove pagine mai dentro DraGold.jsx"), mentre PRODUCT_SPEC.md (approvato più di recente, 5/8) dichiara "invariati da CLAUDE.md" un vincolo di file singolo (*"Single-file DraGold.jsx... niente nuove librerie oltre a quelle già presenti"*) che non corrisponde al CLAUDE.md oggi in repo. Il repo reale (`src/pages/card/`, `src/components/...`) segue già la modularizzazione, non il vincolo file-singolo — quindi la spec sembra riportare un vincolo obsoleto. Da chiarire con Ermal prima della prossima sessione di implementazione, perché cambia se le adozioni di libreria proposte in questo piano (P1/P2) sono percorribili o no.
- **Route `/academy` inesistente** nonostante sia MVP specificato in dettaglio in PRODUCT_SPEC §3 — non è chiaro se sia lavoro non ancora iniziato o non deployato; da verificare stato reale prima di pianificare il lavoro P1 su questo modulo.
- **Mobile audit incompleto**: le osservazioni mobile in questo documento sono inferite, non verificate con device emulation reale — richiede un passaggio dedicato prima dell'implementazione P0/P1 mobile-specifica.

---

## Appendice — note metodologiche

- Ricerca web sui riferimenti prodotto: condotta via ricerca aggiornata (agosto 2026), fonti citate nel research log completo disponibile su richiesta.
- Ricerca GitHub/open source: verificata manutenzione/licenza/stelle al momento della ricerca, non assunta da memoria.
- Audit live: condotto in sessione autenticata reale su dragold.org, screenshot e testo osservati direttamente, non dedotti dal codice sorgente.
- Nessun codice modificato, nessun commit, nessun push, nessuna modifica al database in questa fase, come richiesto.
