# PRODUCT_SPEC.md — DraGold

Aggiornato: 2026-08-05 — Pivot strategico approvato da Ermal. Questa versione sostituisce integralmente la precedente (che impostava DraGold come "Trade Republic per carte TCG" con portfolio/FMV/alert come core loop). Se il codice e questa spec divergono, vince la spec.

## 0. Cosa è DraGold (in una frase)

DraGold è il knowledge graph dei TCG (Pokémon, One Piece, e in futuro MTG/Yu-Gi-Oh) — un posto dove ogni carta, set, personaggio, illustratore, rarità e serie ha una pagina pubblica, indicizzabile, che informa e insegna — più un layer di collezione personale che rende il possesso delle carte un'esperienza di progresso, non solo di tracking.

Core loop: Scopri un'entità del grafo (carta/personaggio/set/illustratore) → impari qualcosa (dati + curiosità + lezione + quiz) → la aggiungi alla tua collezione → vedi il tuo progresso (completamento set, XP, badge).

Non è più: cerca prezzo → aggiungi a portfolio finanziario → ricevi alert. Quel loop resta possibile ma è un modulo futuro, non l'architettura.

### Principi di prodotto (non negoziabili)

- Ogni entità del grafo (carta, set, personaggio, illustratore, rarità, serie) deve poter generare una pagina pubblica utile anche a chi non è loggato e anche senza dati di prezzo.
- Non mostrare mai una pagina "vuota di valore". Se manca il prezzo, la pagina vive comunque grazie a dati, storia, curiosità, quiz.
- Look dark, denso, editoriale — non marketplace, non trading terminal.
- Onestà sui dati: se un'informazione manca o è incompleta, si dice, non si finge.
- Mobile-first.
- Priorità TCG: Pokémon (massima) e One Piece (seconda). MTG e Yu-Gi-Oh restano solo a livello architetturale — indicizzabili, compatibili con grafo/collection/SEO — ma zero lavoro attivo di audit/contenuti finché non cambia la priorità.
- Priorità lingue: EN e JA. Le altre lingue restano nel DB ma fuori dai filtri UI e fuori dal lavoro di qualità dati nel breve periodo.

### Vincoli tecnici (invariati da CLAUDE.md)

Single-file DraGold.jsx, niente TypeScript, niente Redux/Zustand (useState basta), niente nuove librerie oltre a quelle già presenti. Build Vite/esbuild esistente, verificare sempre con esbuild prima del commit. Deploy: commit su main via GitHub web → Vercel auto-deploya. Niente terminali locali. Auth: magic link via src/supabase.js riusato così com'è.

## 1. CORE DATA LAYER — il cuore del prodotto

Obiettivo: costruire il database più completo e interconnesso dei TCG (partendo da Pokémon e One Piece, EN+JA). Tutto il resto del prodotto (SEO, Academy, Collection) si appoggia su questo layer.

Entità del grafo (esistenti o da consolidare nel DB Supabase, RLS attivo):

- cards — catalogo carte (~200k righe oggi). Sorgente di ricerca.
- canonical_card_id (già presente su cards) — raggruppa varianti/ristampe/lingue della stessa carta sotto un'identità canonica. La canonicalizzazione multi-lingua è un lavoro aperto e bloccante per le pagine SEO di entità aggregate (personaggio, set) — va chiusa come priorità nel Core Data Layer prima di scalare il motore SEO.
- set — set/espansione di appartenenza.
- character — personaggio raffigurato (es. Charizard, Monkey D. Luffy). Nuova entità o consolidamento di un campo esistente: da verificare nello schema attuale.
- illustrator — illustratore della carta. Nuova entità o consolidamento di un campo esistente: da verificare nello schema attuale.
- rarity — rarità.
- series — serie/blocco a cui appartiene un set (es. Scarlet & Violet).
- product — prodotto fisico (box, bustina, ecc.), dove rilevante per collection/SEO.
- Relazioni: card→set, card→character, card→illustrator, card→rarity, set→series. Queste relazioni sono ciò che rende il grafo navigabile e le pagine di entità aggregata (es. "tutte le carte di questo illustratore") possibili.

card_prices resta la tabella reale degli snapshot prezzo (non toccare lo schema), ma nel Core Data Layer i prezzi sono un attributo opzionale della carta, non il centro del modello dati.

### Stato reale verificato nell'audit del 2026-08-05 (da mantenere aggiornato):

- cards: 200.939 righe. card_prices: 162.877 snapshot. canonical_card_id popolato su tutte le righe controllate.
- Immagini: Pokémon EN e One Piece EN/JA hanno image_url popolato al 100% nel DB. Il problema immagini note non è di dati mancanti ma di rendering — per One Piece è quasi certamente hotlink/referrer protection lato onepiece-cardgame.com/optcgapi.com. Vedi Fix immagini sotto.
- Fonte dati pokemontcgio: 81% di chiamate fallite negli ultimi 7 giorni (HTTP 500 in maggioranza) — dipendenza fragile, da isolare o sostituire, non da cui dipendere per nuove feature.
- Fonte tcgdex: uso irregolare (poche chiamate, non quotidiane) — verificare se è nello scheduling corretto.
- Lingue Pokémon fuori priorità (TH, ID, ZH-CN, KO) hanno copertura immagini bassa o nulla: accettabile, non prioritario.

### Fix richiesti nel Core Data Layer (prima di scalare SEO/Academy):

1. Eliminare dipendenze fragili dove possibile — non costruire nuove feature sopra pokemontcgio finché non è stabilizzata o sostituita.
2. Pipeline immagini proprietaria quando fattibile: scaricare e servire le immagini da storage nostro (es. Supabase Storage o equivalente) invece di hotlinkare le fonti originali. Priorità: One Piece (blocco noto), poi Pokémon EN/JA.
3. Chiudere la decisione di canonicalizzazione multi-lingua (modello dati) — blocca le pagine di entità aggregata.

## 2. SEO ENGINE

Obiettivo: migliaia di pagine pubbliche indicizzabili, una per ogni entità del grafo con contenuto reale (non pagine sottili).

### Priorità di rollout (in quest'ordine):

1. Card pages — già in produzione (canonical tag, OG/Twitter meta, JSON-LD Product/ImageObject/BreadcrumbList, sitemap dinamica: lavoro già fatto e valido, non si butta).
2. Set pages — tutte le carte di un set, tasso di completamento, storia del set.
3. Character pages — tutte le carte che raffigurano un personaggio, la sua storia/evoluzione se pertinente al TCG.
4. Illustrator pages — tutte le carte di un illustratore, bio se disponibile.
5. Rarity pages — cos'è una rarità, quali carte la usano, come riconoscerla.
6. Series pages — set raggruppati per serie/blocco.

Ogni pagina di entità deve rispettare gli stessi principi già validati sulla CardPage: canonical tag, meta OG/Twitter, JSON-LD dove applicabile, inclusione in sitemap. Non duplicare tecnica SEO diversa per ogni tipo di pagina: riusare lo stesso pattern.

Le pagine di entità aggregata (character, illustrator, series) dipendono dalle relazioni del Core Data Layer — non partire su queste finché canonicalizzazione e relazioni non sono affidabili, altrimenti si generano pagine sottili o duplicate (rischio SEO, non solo tecnico).

## 3. ACADEMY — differenziante principale

DraGold deve diventare il modo più semplice per imparare i TCG. Questo è il layer che nessun price-tracker competitor ha, ed è la ragione per cui un utente torna anche senza voler "tracciare" nulla.

### MVP (prima versione, non piattaforma complessa):

- /academy — hub.
- Daily quiz — una domanda al giorno, collegata a un'entità del grafo.
- XP — punteggio che cresce con quiz e interazioni.
- Streak — giorni consecutivi di attività.
- Curiosità — micro-contenuti collegati alle entità (es. "lo sapevi che...") mostrati sulle pagine di entità e nell'hub.
- Micro lezioni — brevi contenuti collegati ai nodi del grafo (storia, evoluzione, rarità, illustratore), non un corso strutturato nell'MVP.

Esempio guida (da CLAUDE.md/PRODUCT_SPEC precedente, confermato valido come visione): una pagina Charizard non deve limitarsi a mostrare la carta — deve permettere di imparare storia, rarità, evoluzione, curiosità sull'illustratore, e offrire un quiz collegato.

Cosa NON fa l'MVP: niente percorsi di apprendimento strutturati multi-livello, niente certificazioni, niente community/social attorno ai quiz, niente contenuti generati in tempo reale per ogni pagina (i contenuti Academy sono creati/curati, non generati on-the-fly senza controllo qualità).

## 4. COLLECTION — layer di engagement

La collezione personale resta, ma il suo scopo primario cambia: non è più "il tuo portfolio finanziario", è il modo in cui l'utente segna il proprio progresso nel grafo.

- Aggiungi carta alla collezione (funzione esistente, riusata: addToCollection/listCollection/removeFromCollection).
- Completamento set — percentuale di un set posseduta, collegato alle set pages del motore SEO.
- Progressi — vista aggregata di cosa manca, cosa si ha.
- Badge — riconoscimenti legati a traguardi (primo set completato, prima carta di un illustratore, streak Academy, ecc.).

Il valore economico della collezione (quanto vale in euro) resta visibile se disponibile, ma non è più l'elemento organizzativo principale della schermata: il completamento e il progresso lo sono.

### Addendum 2026-08-19 — Portfolio 2.0 (decisione di Ermal, sostituisce parzialmente quanto sopra per la sola schermata Portfolio)

"Add to Collection" e "Add to Portfolio" sono state unificate in un'unica azione/etichetta ("Add to Portfolio" / "In Portfolio · X copies"): non esiste più un concetto di Collection separato dal Portfolio. Per la schermata Portfolio stessa (non per Set/Character/Illustrator pages, che restano guidate dal completamento come sopra), il valore economico torna a essere centrale: valore totale, andamento storico (7D/30D/90D/1Y/ALL), quantità e valore per posizione (unit price × quantity), Biggest Movers, Most Valuable. Nessuna nuova tabella: lo storico è derivato a lettura da `card_prices` (bucket giornaliero sull'ultimo prezzo noto), non da uno snapshot scritto periodicamente. Vedi src/pages/portfolio/PortfolioView.jsx.

## 5. MARKET DATA — fase successiva (non guida l'architettura)

Prezzi e alert restano possibili e utili, ma sono un layer sopra il Core Data Layer, non il centro del prodotto. Non si costruisce nuova architettura per servirli meglio finché il grafo e l'Academy non hanno utenti.

Estimated Market Value (EMV) — unica cosa di pricing da preparare ora, come struttura minima opzionale:

- valore stimato
- fonte (quale fonte ha prodotto la stima)
- confidence score (quanto è affidabile la stima)

Nessuna dipendenza forte su eBay per il pricing primario. eBay, se usato, resta un link/CTA esterno onesto ("vedi su eBay"), non una fonte su cui costruire logica di prodotto.

## 6. Archived / Future Modules

Questi elementi non vengono eliminati — sono lavoro valido che resta nel codice/DB come modulo disattivabile o secondario, pronto a essere riattivato quando il prodotto avrà utenti e la priorità cambierà:

- Portfolio avanzato in stile "broker" (valore totale, P&L per posizione) — RIATTIVATO il 2026-08-19 per la sola schermata Portfolio (vedi Addendum §4), ma senza estetica trading/crypto: niente verde/rosso dominante, palette neutra + gold DraGold, artwork della carta protagonista. Le altre 4 schermate core restano guidate da Search/Explore/Academy come da pivot precedente.
- Alert prezzo (soglie sopra/sotto, direction, is_active) — funzione esistente in DB (alerts, Edge Function check-alerts), resta funzionante ma non è più un'area di investimento attivo.
- Pricing evoluto (multi-fonte comparato, storico prezzo per condizione/grade, stime PSA avanzate) — non prioritario.
- PLANS (Free/Collector/Pro) — esistono già in codice ma non gatekeepano nulla: la monetizzazione via piani resta un modulo futuro, non un focus adesso.

## 7. Cosa resta fondamenta valida (non si butta, non si rifà)

- canonical_cards / canonical_card_id come meccanismo di raggruppamento varianti.
- CardPage e tutto il lavoro SEO tecnico già fatto (canonical tag, OG/Twitter meta, JSON-LD, sitemap dinamica).
- Il Core Data Layer esistente (cards, card_prices, collection, alerts, watchlist, profiles).
- La pipeline di deploy (Vercel + build-esbuild.mjs, commit via GitHub web).

## 8. Regola decisionale permanente

Prima di ogni nuovo task, la domanda guida è: "questo aumenta il valore del knowledge graph, dell'Academy, della Collection, o la capacità di scalare l'architettura?" Se la risposta riguarda solo pricing/portfolio/alert avanzati, il task va in Archived/Future Modules e si rimanda, salvo blocchi architetturali generali che impediscano al resto di funzionare.

## 9. Definizione di "fatto" per questa spec

PRODUCT_SPEC.md è su main, Ermal l'ha approvata (2026-08-05), e CLAUDE.md rimanda a questa sezione come direzione vincolante. Da qui parte la roadmap tecnica ordinata (prossimo step, non ancora scritta in questa versione).
