# Font Licenses — DraGold

Documentazione delle licenze dei font inclusi nel repository DraGold.

---

## Font inclusi

### 1. Fraunces

| Attributo | Dettaglio |
|---|---|
| **Nome** | Fraunces |
| **Font designer** | Undercase Type (Holotype Foundry) |
| **Versione** | 1.0 (font in `public/fonts/`: fraunces.woff2, fraunces-ext.woff2, fraunces-italic.woff2, fraunces-italic-ext.woff2) |
| **Licenza** | SIL Open Font License (OFL) v1.1 |
| **Fonte ufficiale** | [github.com/undercasetype/Fraunces](https://github.com/undercasetype/Fraunces/blob/master/OFL.txt) |
| **Google Fonts** | [fonts.google.com/specimen/Fraunces](https://fonts.google.com/specimen/Fraunces) |
| **Compatibile con repo pubblico** | Sì — SIL OFL 1.1 permette redistribuzione, uso commerciale, embedding web, modifica. See OFL.txt per condizioni. |

**Cosa permette SIL OFL:**
- Uso personale e commerciale
- Ridistribuzione del font (in origine o modificato)
- Embedding in documenti e siti web (via @font-face)
- Modifica del font (con restrizioni sul nome se modificato)

**Cosa NON permette:**
- Vendere il font da solo
- Usare il nome del designer per endorsement senza permesso

**Condizioni per redistribuzione:**
- Includere il file OFL.txt e la copyright notice
- Se modificato, non usare il nome originale "Fraunces" per il font modificato

---

### 2. Space Mono

| Attributo | Dettaglio |
|---|---|
| **Nome** | Space Mono |
| **Font designer** | Colophon (fontspace) / Google Fonts |
| **Versione** | 1.0 (font in `public/fonts/`: space-mono-400.woff2, space-mono-400-ext.woff2, space-mono-700.woff2, space-mono-700-ext.woff2) |
| **Licenza** | SIL Open Font License (OFL) v1.1 |
| **Fonte ufficiale** | [github.com/googlefonts/spacemono](https://github.com/googlefonts/spacemono/blob/main/OFL.txt) |
| **Google Fonts** | [fonts.google.com/specimen/Space+Mono](https://fonts.google.com/specimen/Space+Mono) |
| **Compatibile con repo pubblico** | Sì — SIL OFL 1.1, stessa condizioni di Fraunces. |

---

### 3. Plus Jakarta Sans

| Attributo | Dettaglio |
|---|---|
| **Nome** | Plus Jakarta Sans |
| **Font designer** | Tokotype (dipinto per la città di Jakarta) |
| **Versione** | 1.0 (font in `public/fonts/`: jakarta.woff2, jakarta-ext.woff2) |
| **Licenza** | SIL Open Font License (OFL) v1.1 |
| **Fonte ufficiale** | [github.com/tokotype/PlusJakartaSans](https://github.com/tokotype/PlusJakartaSans) |
| **Google Fonts** | [fonts.google.com/specimen/Plus+Jakarta+Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans) |
| **Compatibile con repo pubblico** | Sì — SIL OFL 1.1, stessa condizioni. |

---

## Impatto per fork e redistribuzione

### Per il repo DraGold Community Core

I font sono **distribuiti sotto SIL OFL 1.1**. Questo è compatibile con la licenza BSD 3-Clause
del codice DraGold. Fork che redistribuiscono i font devono:

1. Includere il file OFL.txt per ciascun font (o un riferimento alla licenza OFL 1.1)
2. Non vendere i font singolarmente
3. Rinomare i font modificati (non usare "Fraunces", "Space Mono", o "Plus Jakarta Sans"
   per versioni modificate)

### Font mancanti nella repo

Attualmente non c'è un file OFL.txt incluso nel repo per ciascun font. Per completezza:

- **Opzionale:** aggiungere `public/fonts/OFL.txt` con il testo della SIL OFL 1.1
- **Opzionale:** aggiungere `public/fonts/NOTICE.txt` con attribuzione dei designer

Questo è da considerare per la community ready.

---

## Font esterni (non inclusi)

DraGold usa Google Fonts API per alcuni font? No — tutti i font sono inclusi localmente in
`public/fonts/`. Non c'è dipendenza da Google Fonts CDN.

---

## Note sui font nel progetto

I font sono caricati via `@font-face` in `src/styles.css`:

```css
@font-face {
  font-family: 'Fraunces';
  src: url('/fonts/fraunces.woff2') format('woff2');
  /* ... */
}
@font-face {
  font-family: 'Plus Jakarta Sans';
  src: url('/fonts/jakarta.woff2') format('woff2');
  /* ... */
}
@font-face {
  font-family: 'Space Mono';
  src: url('/fonts/space-mono-400.woff2') format('woff2');
  /* ... */
}
```

Gli estensioni (.woff2) sono il formato moderno supportato da tutti i browser maggiori.
I file .woff2 "ext" sono per charset estesi (latin extended characters).
