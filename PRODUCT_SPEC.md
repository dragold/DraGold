# PRODUCT_SPEC.md — DraGold

Aggiornato: 2026-08-05 — Pivot strategico approvato da Ermal. Questa versione sostituisce integralmente la precedente (che impostava DraGold come "Trade Republic per carte TCG" con portfolio/FMV/alert come core loop). Se il codice e questa spec divergono, vince la spec.

## 0. Cosa è DraGold (in una frase)

DraGold è il knowledge graph dei TCG (Pokémon, One Piece, e in futuro MTG/Yu-Gi-Oh) — un posto dove ogni carta, set, personaggio, illustratore, rarità e serie ha una pagina pubblica, indicizzabile, che informa e insegna — più un layer di collezione personale che rende il possesso delle carte un'esperienza di progresso, non solo di tracking.

Core loop: Scopri un'entità del grafo (carta/personaggio/set/illustratore) → impari qualcosa (dati + curiosità + lezione + quiz) → la aggiungi alla tua collezione → vedi il tuo progresso (completamento set, XP, badge).

Non è più: cerca prezzo → aggiungi a portfolio finanziario → ricevi alert. Quel loop resta possibile ma è un modulo futuro, non l'architettura.

### Principi di prodotto (non negoziabili)

- Ogni entità del grafo (carta, set, personaggio, illustratore, rarità, serie) deve poter generare una pagina pubblica utile anche a chi non è loggato e anche senza dati di prezzo.
- - Non mostrare mai una pagina "vuota di valore". Se manca il prezzo, la pagina vive comunque grazie a dati, storia, curiosità, quiz.
  - - Look dark, denso, editoriale — non marketplace, non trading terminal.
    - - Onestà sui dati: se un'informazione manca o è incompleta, si dice, non si finge.
      - - Mobile-first.
        - - Priorità TCG: Pokémon (massima) e One Piece (seconda). MTG e Yu-Gi-Oh restano solo a livello architetturale — indicizzabili, compatibili con grafo/collection/SEO — ma zero lavoro attivo di audit/contenuti finché non cambia la priorità.
          - - Priorità lingue: EN e JA. Le altre lingue restano nel DB ma fuori dai filtri UI e fuori dal lavoro di qualità dati nel breve periodo.
           
            - ### Vincoli tecnici (invariati da CLAUDE.md)
           
            - Single-file DraGold.jsx, niente TypeScript, niente Redux/Zustand (useState basta), niente nuove librerie oltre a quelle già presenti. Build Vite/esbuild esistente, verificare sempre con esbuild prima del commit. Deploy: commit su main via GitHub web → Vercel auto-deploya. Niente terminali locali. Auth: magic link via src/supabase.js riusato così com'è.
           
            - ## 1. CORE DATA LAYER — il cuore del prodotto
           
            - Obiettivo: costruire il database più completo e interconnesso dei TCG (partendo da Pokémon e One Piece, EN+JA). Tutto il resto del prodotto (SEO, Academy, Collection) si appoggia su questo layer.
           
            - Entità del grafo (esistenti o da consolidare nel DB Supabase, RLS attivo):
           
            - - cards — catalogo carte (~200k righe oggi). Sorgente di ricerca.
              - - canonical_card_id (già presente su cards) — raggruppa varianti/ristampe/lingue della stessa carta sotto un'identità canonica. La canonicalizzazione multi-lingua è un lavoro aperto e bloccante per le pagine SEO di entità aggregate (personaggio, set) — va chiusa come priorità nel Core Data Layer prima di scalare il motore SEO.
                - - set — set/espansione di appartenenza.
                  - - character — personaggio raffigurato (es. Charizard, Monkey D. Luffy). Nuova entità o consolidamento di un campo esistente: da verificare nello schema attuale.
                    - - illustrator — illustratore della carta. Nuova entità o consolidamento di un campo esistente: da verificare nello schema attuale.
                      - - rarity — rarità.
                        - - series — serie/blocco a cui appartiene un set (es. Scarlet & Violet).
                          - - product — prodotto fisico (box, bustina, ecc.), dove rilevante per collection/SEO.
                            - - Relazioni: card→set, card→character, card→illustrator, card→rarity, set→series. Queste relazioni sono ciò che rende il grafo navigabile e le pagine di entità aggregata (es. "tutte le carte di questo illustratore") possibili.
                             
                              - card_prices resta la tabella reale degli snapshot prezzo (non toccare lo schema), ma nel Core Data Layer i prezzi sono un attributo opzionale della carta, non il centro del modello dati.
                             
                              - ### Stato reale verificato nell'audit del 2026-08-05 (da mantenere aggiornato):
                             
                              - - cards: 200.939 righe. card_prices: 162.877 snapshot. canonical_card_id popolato su tutte le righe controllate.
                                - - Immagini: Pokémon EN e One Piece EN/JA hanno image_url popolato al 100% nel DB. Il problema immagini note non è di dati mancanti ma di rendering — per One Piece è quasi certamente hotlink/referrer protection lato onepiece-cardgame.com/optcgapi.com. Vedi Fix immagini sotto.
                                  - - Fonte dati pokemontcgio: 81% di chiamate fallite negli ultimi 7 giorni (HTTP 500 in maggioranza) — dipendenza fragile, da isolare o sostituire, non da cui dipendere per nuove feature.
                                    - - Fonte tcgdex: uso irregolare (poche chiamate, non quotidiane) — verificare se è nello scheduling corretto.
                                      - - Lingue Pokémon fuori priorità (TH, ID, ZH-CN, KO) hanno copertura immagini bassa o nulla: accettabile, non prioritario.
                                       
                                        - ### Fix richiesti nel Core Data Layer (prima di scalare SEO/Academy):
                                       
                                        - 1. Eliminare dipendenze fragili dove possibile — non costruire nuove feature sopra pokemontcgio finché non è stabilizzata o sostituita.
                                          2. 2. Pipeline immagini proprietaria quando fattibile: scaricare e servire le immagini da storage nostro (es. Supabase Storage o equivalente) invece di hotlinkare le fonti originali. Priorità: One Piece (blocco noto), poi Pokémon EN/JA.
                                             3. 3. Chiudere la decisione di canonicalizzazione multi-lingua (modello dati) — blocca le pagine di entità aggregata.
                                               
                                                4. ## 2. SEO ENGINE
                                               
                                                5. Obiettivo: migliaia di pagine pubbliche indicizzabili, una per ogni entità del grafo con contenuto reale (non pagine sottili).
                                               
                                                6. ### Priorità di rollout (in quest'ordine):
                                               
                                                7. 1. Card pages — già in produzione (canonical tag, OG/Twitter meta, JSON-LD Product/ImageObject/BreadcrumbList, sitemap dinamica: lavoro già fatto e valido, non si butta).
                                                   2. 2. Set pages — tutte le carte di un set, tasso di completamento, storia del set.
                                                      3. 3. Character pages — tutte le carte che raffigurano un personaggio, la sua storia/evoluzione se pertinente al TCG.
                                                         4. 4. Illustrator pages — tutte le carte di un illustratore, bio se disponibile.
                                                            5. 5. Rarity pages — cos'è una rarità, quali carte la usano, come riconoscerla.
                                                               6. 6. Series pages — set raggruppati per serie/blocco.
                                                                 
                                                                  7. Ogni pagina di entità deve rispettare gli stessi principi già validati sulla CardPage: canonical tag, meta OG/Twitter, JSON-LD dove applicabile, inclusione in sitemap. Non duplicare tecnica SEO diversa per ogni tipo di pagina: riusare lo stesso pattern.
                                                                 
                                                                  8. Le pagine di entità aggregata (character, illustrator, series) dipendono dalle relazioni del Core Data Layer — non partire su queste finché canonicalizzazione e relazioni non sono affidabili, altrimenti si generano pagine sottili o duplicate (rischio SEO, non solo tecnico).
                                                                  9. 
