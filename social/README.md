# DraGold Social Generator

Generatore di post social statico, zero dipendenze esterne (eccetto html2canvas da CDN).

## Come usarlo

1. Apri `social/generator.html` con doppio click (si apre nel browser).
2. Scegli template (Card of day, Top Mover, Pack ROI) e formato (1080x1080 o 1080x1920).
3. Per "Card of day" / "Top Mover": digita nella search box, scegli la carta dai risultati, i campi si auto-compilano (nome, set, FMV, immagine).
4. Modifica manualmente delta % o qualsiasi campo.
5. **Download PNG** salva il file pronto da postare.

## Routine consigliata (5 minuti/giorno)

**Mattina (8:00)**
- Apri generator.html, template "Top Mover"
- Cerca la carta più calda della giornata (vai su DraGold, guarda Top Movers o scegli una dal feed)
- Download PNG, posta su Instagram, X, TikTok (stessa immagine va su tutti)
- Caption suggerita: "X salita del Y% in 24h. Set Z, FMV €K. dragold.org per i prezzi del tuo paese"

**Sera (19:00)**
- Template "Card of the Day": una carta specifica con valore + un commento corto
- Buono per coinvolgere la community ("voi tenete questa carta?")

**Domenica**
- Template "Pack ROI": apri 10-100 buste, traccia, posta i numeri reali
- Più engagement perché la gente vuole sapere se conviene aprire

## Caption template

Card of the day:
```
La {name} di {set} oggi vale {price}. {delta} nelle ultime 24h.
Tienila? Vendila? Dimmi sotto.

🔗 dragold.org per il prezzo nel tuo paese.

#pokemon #pokemontcg #tcg #cardcollecting #pokemoncards
```

Top mover:
```
TOP MOVER 🚀

{name} oggi è salita del {delta}%.
FMV: {price}

Tu l'hai presa in tempo?

🔗 dragold.org

#pokemontcg #tcgmarket #cardinvesting
```

Pack ROI:
```
{packs} buste di {set}.
Speso: €{cost}
Pullato: €{pulled}
Risultato: {verdict}

🔗 dragold.org per fare i calcoli sui tuoi set.

#pokemontcg #boosterbox #cardopening
```

## Cosa NON funziona

- Se il logo non appare nell'anteprima: l'apertura locale via file:// può bloccare l'asset. Soluzione: avvia un piccolo server locale con `npx serve .` dentro DraGold/ e apri http://localhost:3000/social/generator.html
- Se l'immagine carta dà errore CORS al download: alcune immagini bloccano cross-origin. Le immagini di images.pokemontcg.io di solito funzionano. Per sicurezza testa il download con una carta diversa.
