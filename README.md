# DraGold

Fair Market Value aggregator per carte TCG con focus mercato europeo.

## Stack

- React 18 + Vite
- Supabase (auth + db + RLS)
- Pokemon TCG API + Cardmarket
- Deploy: Vercel

## Setup

```bash
npm install
cp .env.example .env
# Inserisci VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev
```

## Deploy

Push su GitHub, importa su Vercel, aggiungi le env vars. Vedi `LAUNCH_CHECKLIST.md` per i dettagli.

## Struttura

```
DraGold/
  src/
    DraGold.jsx       componente principale (single file MVP)
    main.jsx          entry point
    styles.css        design system: palette, font, animazioni
  public/
    assets/           logo + immagini
    manifest.webmanifest
    robots.txt
    sitemap.xml
    privacy.html / terms.html / cookies.html
  supabase/
    schema.sql        schema completo da incollare in Supabase
  blog/
    *.md              articoli blog pronti
  LAUNCH_CHECKLIST.md
```
