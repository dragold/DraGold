# DraGold — Report dal concetto a oggi + validazione mercato

**Data:** 2026-09-20  
**Stato:** analisi completa + validazione + piano esecuzione  
**Autori:** Ermal + assistente AI

---

## 1. L'idea di partenza

### Problema osservato
I collezionisti di TCG (Pokemon, One Piece, YGO, MTG) hanno tre problemi non risolti insieme:

1. **Non sanno cosa hanno** — la collezione è sparsa, non catalogata
2. **Non sanno cosa manca** — un set di 180 carte, quante ne ho? quali mancano?
3. **Non sanno cosa valgano** — senza prezzi affidabili, non possono decidere cosa comprare o vendere

Esistono tool parziali (Collectr per iOS, OP.TCG per One Piece, TCG Collector per Pokemon), ma nessuno fa tutto insieme con EN/JA variant clarity e value summary.

### Visione
Un tracker di collezione TCG che:
- Mostra per ogni set: carte owned / missing + EN/JA tabs + value summary
- Aiuta il collezionista a decidere "cosa comprare prossimo"
- Funziona su web (accessibile da qualsiasi device)
- Supporta EN e JA come lingue native delle carte

### Nome
DraGold — riferimento a "Dra" (dragon, elemento comune nei TCG) + "Gold" (valore, collezionismo).

---

## 2. Cosa è stato costruito

### Infrastruttura
- **Frontend:** React + Vite, deploy su Vercel
- **Backend:** Supabase (Postgres + Edge Functions + Storage)
- **Dati:** 209k cards importati da TCGdex, 88k canonical_cards, 172k price snapshots (99.9% YGO), 5k image cache entries
- **Set MVP:** 6 set con logos e card_count definiti (OP-01, OP-02, SV07, SV08, EB-01, EB-02)

### Funzionalità esistenti
- **SetPage:** tabs lingua EN/JA, completion metric (collected/missing + barra progresso), value summary (prezzi per currency), filter, adjacent sets, SEO
- **CardPage:** dettaglio carta con varianti lingua
- **Portfolio:** visualizzazione collezione con valutazione
- **Auth:** registrazione/login
- **Edge Functions:** sync-sets, bulk-import-pokemon, bulk-import-ygo, bulk-import-mtg, refresh-prices, fetch-ebay-prices, compute-hot-picks, check-alerts
- **API routes (Vercel):** cache-image, img, live-market, ebay-search, scan-images, sitemap
- **Image cache:** pipeline per caching card image da fonti esterne

### Stato prodotto
- Build funzionante (exit 0)
- 41 test pass
- Repo pubblico su GitHub (8 clone totali, 0 stelle, 0 visite)
- Dominio: dragold.org
- Zero fatturazione attiva

---

## 3. Gap identificati

### Gap critici (blocano il prodotto come MV P credibile)

| Gap | Stato | Cosa serve per chiuderlo |
|-----|-------|--------------------------|
| Prezzi: 0.2% coverage (501/209k carte) | 🔴 Edge function scritta, non deployata | Deploy `sync-prices-multi`, popolamento iniziale |
| Immagini: 0.5% cards con image_url (1k/209k) | 🟡 Pipeline esistente, scalabile | Bulk cache existing cards, ottimizzazione |
| Set completion UI | 🟡 Base presente (filter, collection), manca visual indicator | Modifiche UI SetPage (fatto in parte) |
| EN/JA variant clarity | 🟡 CanonicCards + tabs lingua — base presente | Miglioramento UI per mostrarlo |
| Monitoring/observability | 🔴 Non presente | Sentry/analytics, Web Vitals, logging |
| Test coverage | 🟡 41 test per ~30+ componenti | Scrittura test aggiuntivi |
| Set logos OP-03+ | 🔴 Mancanti | Migration + dati ufficiali |
| Roadmap documentata | 🟢 `docs/roadmap.md` creato | — |

### Gap di business (bloccano la monetizzabilità)

| Gap | Stato | Cosa serve |
|-----|-------|-----------|
| Nessun utente reale | 🔴 0 visitatori noti | Acquisition strategy + first users |
| Nessuna monetizzazione | 🔴 0 revenue | Pricing strategy + feature gating |
| Repo pubblico con 0 engagement | 🟡 8 clone, 0 stelle | Community building, valore visibile |
| Nessuna comunicazione del valore | 🔴 Nessun copy che spiega il prodotto | Landing page improvement, value props |

---

## 4. Validazione di mercato

### Analisi competitor (verificata con ricerca live)

| Competitor | Piattaforme | Prezzo | Features chiave | Utenti stimati |
|------------|-------------|--------|-----------------|----------------|
| **Collectr** | iOS + Android | Free → $4.99/mo (annual) o $7.99/mo | 25+ TCGs, valuation, scanning, portfolio | ~42k recensioni, revenue ~$500k/mese (Sensor Tower) |
| **OP.TCG** | iOS + Android | Free → PLUS | 20k+ cards, 225+ series, EN/JA/ZH/FR, prezzi Cardmarket/TCGPlayer/eBay/PSA | 160k+ utenti |
| **Dex** | iOS + Android | Freemium | Collection tracking, value, set min/max | Recensioni positive |
| **pkmn.gg** | Web + app | Freemium | Deck builder, collection tracking, compare with friends | — |
| **TCGplayer** | Web + app | Free (marketplace) | Collection tracking + marketplace | Grande (marketplace) |
| **PriceCharting** | Web | Free → Premium | Price history, collection tracker | — |

### Cosa dicono gli utenti (da Reddit e recensioni)

**r/PokemonTCG:** "What apps do you use to track/value your collection?"
- Collectr, Dex, pkmn.gg citati più spesso
- Preoccupazione comune: accuratezza prezzi, completeness del catalogo
- Collectr ha recensioni miste sui prezzi (alcuni dicono inaccurate per card di nicchia)

**r/OnePieceTCG:** "What is currently the best One Piece collecting app?"
- OP.TCG è il competitor principale
- Collectr supporta anche One Piece
- Necessità di: collection tracking, prezzi, completion

### Positioning di DraGold vs competitor

**Differenziazione potenziale:**
1. **Web-first** — accessibile da qualsiasi device (nessuno dei competitor principali è web-first)
2. **EN/JA variant clarity** — nessun competitor menziona esplicitamente questa feature
3. **Set-focused value summary** — valore del set completo, non solo singole carte
4. **Open data + trasparenza** — usa TCGdex (gratis) come fonte, dati aperti

**Rischio:** OP.TCG per One Piece è già forte (160k+ utenti, 225+ series, EN/JA/ZH/FR, prezzi da 5 fonti). Per Pokemon, mercato più aperto ma competitive.

### Validazione sintetica

| Ipotesi | Stato | Evidence |
|---------|-------|----------|
| I collezionisti usano app per collection tracking | ✅ Confermato | Reddit discussions, competitor esistono |
| Il mercato è frammentato | ✅ Confermato | Multipli competitor con focus diversi |
| EN/JA variant clarity è un gap | ✅ Plausibile | Nessun competitor menziona esplicitamente |
| Web-first è un differenziamento | ✅ Plausibile | La maggior parte ha app-first |
| Value summary è utile | ✅ Plausibile | Collectr ha valuation, ma non set-focused |
| Pricing model viable | ✅ Confermato | Collectr $4.99/mo annual, OP.TCG PLUS |

### Raccomandazione

DraGold ha senso come prodotto se:
1. **Focus su Pokemon** (mercato più grande, meno dominato da un singolo competitor)
2. **Web-first + EN/JA clarity** come differenziamento chiave
3. **Value summary per set** come feature unique
4. **Acquisition via content** (Reddit, SEO, newsletter) invece di ads

Il rischio maggiore è che il mercato è competitivo e l'acquisition è costosa. La validazione con utenti reali è essenziale prima di investire ulteriore sviluppo.
