# DraGold: Checklist di lancio

Data target: oggi, 16 maggio 2026.

Diviso in due colonne: cosa fai TU (Ermal), cosa ho fatto IO (Claude). Le tue azioni sono quelle che richiedono account personali, carte di credito o decisioni di brand. Tutto il resto è già pronto nella cartella del progetto.

---

## FASE 1: Setup base (45 minuti)

### TU (Ermal)

1. **Compra il dominio**: vai su Namecheap o Cloudflare Registrar. Suggerito: `dragold.app` (15 euro/anno) oppure `dragold.io` (35 euro/anno). Se hanno entrambi gli .app, prendi quello, è più moderno e SEO-neutrale.

2. **Crea account GitHub** (se non lo hai): github.com/signup. Username consigliato: dragold-app o ermalmalali.

3. **Crea account Vercel**: vercel.com. Connetti con GitHub. È gratuito e automatico.

4. **Crea account Supabase**: supabase.com. New project, regione Frankfurt (più vicina ai tuoi utenti EU). Salva la password del database in un posto sicuro.

5. **Account eBay Partner Network**: partnernetwork.ebay.com. Sei già registrato (Campaign ID 5339152703). Verifica che sia attivo per i mercati EU principali (IT, DE, FR, ES, UK).

### IO ho già fatto

- Logo salvato in `public/assets/logo-gold.png` e `logo-bw.png`
- Struttura React completa: `package.json`, `vite.config.js`, `index.html` con SEO meta, Open Graph, JSON-LD
- Componente principale `src/DraGold.jsx` con Hero, ricerca, FMV, geo-routing eBay, Top Movers, Pricing, Blog, Newsletter, Auth modal, Footer
- Stile CSS completo con palette, font, holofoil effect, aurora animata, glassmorphism
- PWA manifest, robots.txt, sitemap.xml
- Pagine legali: Privacy, Terms, Cookies (GDPR compliant)
- Configurazione Vercel pronta (`vercel.json`)
- Schema Supabase completo da incollare (`supabase/schema.sql`)
- Tre articoli blog pronti da pubblicare (`blog/*.md`)

---

## FASE 2: Setup Supabase (15 minuti)

### TU

1. Vai su Supabase: dashboard del tuo progetto.
2. Apri **SQL Editor** (icona a sinistra).
3. Apri il file `supabase/schema.sql` dalla cartella del progetto.
4. Copia tutto. Incolla. Premi **Run**. Aspetta che diventi verde.
5. Vai su **Settings > API**. Copia:
   - `Project URL`
   - `anon public key`
6. Settings > Authentication > URL Configuration: imposta Site URL a `https://dragold.app` (o il tuo dominio).
7. Settings > Authentication > Email: assicurati che sia abilitato come provider.

### IO ho fatto

- Schema con 7 tabelle: profiles, binders, collection, alerts, blog_posts, newsletter, price_history, ebay_clicks
- Row Level Security configurato per ogni tabella
- Trigger automatico per creare il profilo alla registrazione
- Indici per performance su query frequenti

---

## FASE 3: Deploy (20 minuti)

### TU

1. Apri il terminale nella cartella `DraGold`.
2. Installa dipendenze: `npm install` (richiede Node.js installato, scarica da nodejs.org se non lo hai).
3. Inizializza Git: `git init && git add . && git commit -m "DraGold MVP"`.
4. Su GitHub crea un nuovo repository chiamato `dragold` (privato).
5. Collega: `git remote add origin https://github.com/TUO-USERNAME/dragold.git && git push -u origin main`.
6. Su Vercel: **Add New Project > Import** dal tuo GitHub > seleziona `dragold`.
7. Nella schermata di configurazione Vercel, sezione **Environment Variables**, aggiungi:
   - `VITE_SUPABASE_URL` = (il valore copiato da Supabase)
   - `VITE_SUPABASE_ANON_KEY` = (il valore copiato da Supabase)
8. Click **Deploy**. Aspetta 2 minuti.
9. Quando è online, vai su Project Settings > Domains > aggiungi il tuo dominio (es. dragold.app).
10. Configura DNS sul tuo registrar puntando a Vercel (Vercel ti dà le istruzioni esatte).

### IO ho fatto

- `vercel.json` con rewrites per SPA e cache headers per assets
- `.env.example` come template per le variabili
- `.gitignore` corretto

---

## FASE 4: Analytics e tracking (10 minuti)

### TU

1. **Plausible Analytics**: plausible.io (9 euro/mese, GDPR-compliant, no cookie banner necessario). Aggiungi il dominio `dragold.app`.
2. Copia il loro script e dimmelo: lo aggiungo io in 30 secondi all'`index.html`.
3. **Google Search Console**: search.google.com/search-console. Aggiungi il dominio, verifica via DNS TXT record o file HTML.
4. **Bing Webmaster Tools**: bing.com/webmasters. Importa direttamente da Google Search Console.

### IO farò

- Inserire lo script Plausible quando me lo confermi
- Aggiungere il tag di verifica Search Console nell'`<head>`
- Aggiornare il sitemap quando pubblichi nuovi articoli

---

## FASE 5: Marketing dal giorno 1 (continuativo)

### TU

1. **Reddit**:
   - r/PokemonTCG (1.2M utenti)
   - r/MagicTCG (700K)
   - r/yugioh (500K)
   - r/PkmnTcgCollections (200K)
   Crea post utili (NON spam): "Ho fatto uno strumento per vedere il valore reale delle carte con focus mercato EU. Cerco feedback." Link al sito. Risponde a ogni commento.

2. **Discord**: entra nei top 5 server Pokemon TCG italiani ed europei. Presentati, non spammare, condividi quando qualcuno chiede uno strumento di valutazione.

3. **TikTok / Instagram Reels**: account `@dragold.app`. Pubblica 1 video al giorno: "La carta più costosa di oggi", "Sbustamento + valore", "PSA vs raw". Non servono montaggi pro, basta autenticità.

4. **Twitter / X**: account `@dragold_app`. Posta i Top Movers ogni giorno alle 19:00.

5. **Product Hunt**: prepara il lancio per la prossima settimana. Pre-launch page subito.

### IO farò

- Scrivere i copy dei post Reddit (NON spam, post di valore)
- Scrivere gli script dei primi 7 video TikTok
- Generare i template per i post Twitter "Top Movers giornalieri"
- Scrivere la pagina Product Hunt

Basta che me lo chiedi quando vuoi cominciare ciascuno.

**Generatore post pronto adesso**: apri `social/generator.html` con doppio click. Genera PNG 1080x1080 in 30 secondi, 3 template (Card of day, Top Mover, Pack ROI), search Pokemon TCG integrata. Routine + caption nel file `social/README.md`.

---

## FASE 5b: eBay Browse API (per prezzi real-time)

### TU

1. Vai su **developer.ebay.com** (stesso login del tuo Partner Network).
2. **Sign in** > **My Account** > **Application Keysets**.
3. Crea una **Production Keyset** (nome: "DraGold"). Salva:
   - `App ID (Client ID)`
   - `Cert ID (Client Secret)`
4. Su Vercel > Project Settings > Environment Variables, aggiungi:
   - `EBAY_CLIENT_ID` = il tuo App ID
   - `EBAY_CLIENT_SECRET` = il tuo Cert ID
5. Redeploy del progetto su Vercel (in 30 secondi).

### IO ho già fatto

- `api/ebay-search.js`: serverless function su Vercel che fa OAuth e chiama Browse API
- Cache 15 minuti per ridurre carico
- Geo-routing automatico (mercato IT, DE, FR, UK, US in base al paese utente)
- Filtro lingua carta (italiano, japanese, ecc.)
- UI nel sito: ogni risultato ha sezione "⚡ Live on eBay" espandibile

**Differenza vs concorrenza**: Collectr, TCGPlayer e simili mostrano solo i loro prezzi aggregati (24h vecchi). Tu mostri "prezzo minimo attivo ADESSO su eBay.it" + i 3 listing più economici linkabili. Nessuno fa questo.

---

## FASE 6: Automazioni Make (giorno 2-3)

### TU

1. Account Make.com (gratis fino a 1000 operazioni/mese).
2. Crea 3 scenari (ti scrivo io le configurazioni):
   - Alert prezzi giornalieri (controlla soglie utenti)
   - Pubblicazione blog automatizzata (1 articolo ogni 2 giorni)
   - Snapshot prezzi notturni per Top Movers

### IO farò

- Scriverti la configurazione passo-passo di ogni scenario Make
- Generare un nuovo articolo blog ogni 2 giorni con dati real-time
- Mantenere aggiornati i Top Movers basandosi su variazioni reali

---

## Numeri realistici (no hype)

Per essere onesto con te, ecco cosa puoi aspettarti:

**Mese 1**: 200-800 visitatori. 5-20 iscritti newsletter. Click eBay: 50-200. Affiliate revenue: 5-30 euro.

**Mese 3**: 2.000-8.000 visitatori se hai pubblicato consistentemente. 100-300 newsletter. Affiliate: 80-250 euro. Primi 3-10 utenti Pro (15-50 euro/mese).

**Mese 6**: 10.000-30.000 visitatori se SEO funziona. 500-1500 newsletter. Affiliate: 300-800 euro. 30-100 utenti Pro (150-500 euro/mese). Totale: 450-1300 euro/mese.

**Mese 12**: realisticamente per lasciare un lavoro 9-18 servono 2500-3500 euro/mese netti. Questo lo puoi raggiungere con 200-400 utenti Pro + 500-1500 euro/mese di affiliate. Fattibile con SEO + community attiva.

**Non aspettarti di lasciare il lavoro nei primi 6 mesi.** Aspettati di iniziare a ricevere segnali concreti di product-market fit nei primi 90 giorni. Se a 90 giorni hai 0 visitatori organici e 0 conversioni, ripensa la strategia. Se hai 50+ utenti attivi che tornano, scala.

---

## La verità sul mercato

DraGold compete con: Collectr (5M+ utenti USA), TCGPlayer, CardLadder, PriceCharting. Sono tutti USA-first. **Il tuo vantaggio reale è il geo-routing eBay europeo**, che nessuno fa bene. Vendilo in ogni angolo del sito.

Differenziatore secondario: design premium. La concorrenza ha siti che sembrano del 2015. Il tuo è del 2026.

Vantaggio terziario: il blog editoriale. Nessun aggregatore prezzi ha contenuto editoriale serio in italiano e altre lingue EU. Pubblica 2-3 articoli a settimana e in 12 mesi domini la SERP italiana per "valore carte pokemon".

---

## Cosa NON fare (per favore)

- Non pagare ads prima di avere 100 utenti organici e 10% di retention settimanale
- Non aggiungere features fino a 1000 utenti attivi (lavora su retention, non su scope)
- Non lanciare in 4 lingue subito. Italiano + inglese, basta. Le altre vengono dopo
- Non promettere "alert in real-time" fino a quando non li fai davvero
- Non parlare di crypto, NFT o web3 sulla landing: la community TCG lo odia

---

## Riassunto: oggi (16 maggio 2026)

| Tempo | TU | IO |
|-------|----|----|
| 0:00-0:30 | Compra dominio, crea account Vercel/Supabase/GitHub | Già fatto: codice completo nella cartella |
| 0:30-0:50 | Incolla schema SQL su Supabase, copia API keys | Già fatto: schema pronto in supabase/schema.sql |
| 0:50-1:30 | npm install, git push, deploy Vercel con env vars | Già fatto: vercel.json e .env.example |
| 1:30-2:00 | Configura DNS dominio, attiva Plausible | Pronto a inserire Plausible quando me lo dici |
| 2:00-2:30 | Primo post Reddit + Discord + X | Posso scrivertelo subito quando me lo chiedi |

**Sei online entro stasera.** Punto.
