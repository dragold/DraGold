# DraGold Blog: Editorial Strategy

Tutto in inglese (mercato globale). Cadenza, processo, calendario chiaro.

## Cadenza

**3 articoli a settimana**, pubblicati lunedì, mercoledì, venerdì.
- Lunedì: rubrica ricorrente (formato familiare, costruisce abitudine nel lettore)
- Mercoledì: articolo SEO long-form (1500-2500 parole, parole chiave specifiche)
- Venerdì: investing/market analysis (più tecnico, attira il pubblico investitore)

Sabato/domenica: niente articoli, solo social post.

Per stare in cadenza ti basta **dirmi "scrivi gli articoli della settimana"** e in 1 conversazione te ne preparo 3 pronti da pubblicare. Tempo tuo: 10 minuti per leggere e approvare. Tempo mio: 30-40 minuti di ricerca + scrittura.

## Le 4 rubriche ricorrenti (lunedì)

Ogni lunedì cambio rubrica a rotazione, così il lettore sa cosa aspettarsi:

**1. Monday Movers** (settimana 1 di ogni mese)
Le 5 carte che hanno fatto il movimento più grande nella settimana, con grafico, motivazione, e "is it a buy or hold". Formato breve, 800 parole.

**2. Set Spotlight** (settimana 2)
Analisi completa di un set: chase card, hit rate dichiarato vs reale, sealed product ROI, prediction a 12 mesi. Formato lungo, 2000+ parole.

**3. Grading Watchdog** (settimana 3)
Caso studio reale: una carta gradata in PSA/CGC/BGS, costi totali, tempo, premium di vendita, lezione imparata. Formato medio, 1200 parole.

**4. Language Arbitrage** (settimana 4)
Il vero killer di DraGold. "Charizard ex SAR EN vs JP vs IT: chi vince oggi". Calcolo opportunità di arbitraggio cross-lingua. Solo noi possiamo farlo bene. Formato medio, 1500 parole.

## Articoli SEO (mercoledì)

Mirati a parole chiave alto volume con bassa difficoltà. Esempi pronti da scrivere:

- "Most valuable Pokemon cards 2026" (volume USA: 18.000/mese)
- "How to grade Pokemon cards yourself before sending to PSA" (volume: 4.400/mese)
- "Best Pokemon booster boxes to invest in 2026" (volume: 6.600/mese)
- "Japanese vs English Pokemon cards: which to collect" (volume: 3.300/mese)
- "Pokemon card centering guide with ruler" (volume: 2.900/mese)
- "Are reverse holos worth anything? Real data" (volume: 1.900/mese)
- "Fake Charizard cards: how to spot counterfeits" (volume: 12.000/mese)
- "One Piece TCG investment guide 2026" (volume: 2.400/mese, low competition)
- "Best apps to track Pokemon card prices" (volume: 4.400/mese, this is OUR keyword)
- "Cardmarket vs TCGPlayer: which has better prices" (volume: 1.600/mese)

Posso scriverne 2 a settimana per 6 mesi consecutivi senza ripeterti.

## Articoli investing/market (venerdì)

Più tecnici, attirano un pubblico di "smart money" disposto a pagare Pro.

- "Why Japanese Pokemon cards command 35% premium: structural analysis"
- "The case for not opening sealed product: 5-year ROI data"
- "Pokemon market is recession-resistant: data from 2020 vs 2023"
- "PSA pop report manipulation: how to read between the lines"
- "One Piece TCG: the second wave or a bubble"
- "Building a €10,000 Pokemon portfolio: allocation strategy"
- "Tax implications of selling graded cards (Italy, Germany, France, UK)"
- "Sealed booster boxes as alternative asset class: comparison vs S&P 500"

## Come scrivo (processo di ricerca)

Ogni articolo segue questo flusso:

1. **Dati reali**: prendo prezzi correnti da Cardmarket + TCGPlayer + eBay sold listings. Niente prezzi inventati.
2. **Storia recente**: ultimi 18 mesi di trend, eventi rilevanti (reprint annunciati, set chiusi, tornei).
3. **Cross-verifica**: confronto multi-fonte, evidenzio dove le fonti divergono.
4. **Tone of voice**: come un collezionista esperto che parla a un altro, mai hype, mai "questo decuplicherà il vostro investimento".
5. **CTA naturale**: alla fine, sempre un link a una funzione DraGold rilevante (alert, ricerca, portfolio). Mai "compra Pro!". Sempre "imposta un alert per monitorare questo".

## SEO setup tecnico (già fatto)

- `sitemap.xml` e `robots.txt` in `/public/`
- Schema.org Article markup
- Open Graph + Twitter Card per ogni post
- Slug in inglese, URL pulite (es. `/blog/top-5-pokemon-investments-2026`)
- Internal linking: ogni articolo linka 2-3 altri articoli del blog
- External authority: linko Cardmarket, PSA, Bulbapedia (dofollow ok per loro)

## Distribuzione (ogni articolo, no manual work tuo)

- Auto-tweet con immagine generata dal `social/generator.html` (template "Card of the day")
- Newsletter: include il nuovo articolo + 2 carte hot della settimana
- Reddit cross-post: r/PokemonTCG, r/PkmnTcgCollections, r/MagicTCG (solo per articoli rilevanti, niente spam)
- Indexing: Google Search Console "Request indexing" subito dopo la pubblicazione

## Calendario primo mese (pronto da partire)

| Settimana | Lunedì (rubrica) | Mercoledì (SEO) | Venerdì (investing) |
|---|---|---|---|
| 1 | Monday Movers | Most valuable Pokemon cards 2026 | Why Japanese commands 35% premium |
| 2 | Set Spotlight: Surging Sparks | Fake Charizard: how to spot counterfeits | Building a €10k Pokemon portfolio |
| 3 | Grading Watchdog: Lugia V Alt Art | Cardmarket vs TCGPlayer | Sealed boxes as asset class vs S&P |
| 4 | Language Arbitrage: Charizard ex SAR | Best apps to track Pokemon prices | One Piece TCG: real opportunity? |

Tutti articoli che ti porto io quando mi dici "scrivi la settimana".

## Quando inizia il vero traffico

Onesto:
- Settimana 1-4: traffico ~0, Google sta indicizzando
- Mese 2: 50-300 visite/giorno se gli articoli sono buoni
- Mese 4-6: 1.000-5.000 visite/giorno se hai 30-50 articoli e ranking su 10-15 keyword
- Mese 9-12: 10.000+ visite/giorno realistico se non interrompi mai la pubblicazione

Il SEO è un investimento di 6-12 mesi. Chi smette al mese 3 ha buttato 3 mesi di lavoro. La regola è: **una volta che parti, NON ti fermi**.

## Da fare ora (tu)

Nulla. Il primo batch di 3 articoli è già in `/blog/` (3 file .md tradotti in inglese).
Quando vuoi gli altri, scrivi: "scrivi la settimana 1" oppure "scrivi 3 articoli per il blog".
