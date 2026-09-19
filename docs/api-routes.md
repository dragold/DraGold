# API Routes — DraGold

Documentazione degli API routes Vercel serverless esposti da DraGold. Tutti gli endpoint sono
documentati con: metodo, parametri, risposta, autenticazione, rate limiting, note.

---

## 1. Image proxy per WebGL — `GET /api/img`

**Scopo:** Proxy read-only per immagini card usate come texture WebGL. Poiché la maggior parte
delle CDN card image non invia CORS headers, una `<img>` cross-origin funziona nel DOM ma non può
essere caricata come texture WebGL. Questo endpoint streams l'immagine attraverso l'origine DraGold
con CORS permessive e cache long-lived.

**Method:** `GET`

**Query params:**
| Param | Tipo | Descrizione |
|---|---|---|
| `u` / `url` | string | URL dell'immagine sorgente (obbligatoria) |

**Response:** `200` — image binary (image/*), headers:
- `Access-Control-Allow-Origin: *`
- `Cache-Control: public, maxage=31536000, immutable`

**Errori:**
- `400` — URL non valida
- `403` — hostname non consentito
- `415` — content-type non image/*
- `413` — dimensione superiore a MAX_BYTES (6 MB)
- `408` — timeout (8 secondi)

**Autenticazione:** Nessuna (endpoint pubblico, read-only).

**Rate limiting:** Nessuna implementazione attuale. **Da investigare.**

**Note:**
- Host allow-list: `images.pokemontcg.io`, `assets.tcgdex.net`, `tcgdex.net`,
  `den-cards.pokellector.com`, `*.supabase.co`
- Max 6 MB, timeout 8s
- Stream diretto, nessuna trasformazione

---

## 2. Image cache proxy — `POST /api/cache-image`

**Scopo:** Fetch server-side un'immagine card da una fonte esterna consentita, convertirla
a WebP con sharp, caricare su Supabase Storage e registrare il risultato in `card_image_cache`.
Endpoint interno, non pubblico.

**Method:** `POST`

**Headers:**
| Header | Descrizione |
|---|---|
| `x-internal-key` | Deve matchare `IMAGE_CACHE_KEY` env var (autenticazione interna) |

**Body:**
| Field | Tipo | Obblig. | Descrizione |
|---|---|---|---|
| `cardId` | string | Sì | matches `cards.id` |
| `source` | string | Sì | es. `"onepiece-cardgame.com"`, `"optcgapi.com"` |
| `imageUrl` | string | Sì | URL immagine originale (hostname deve essere in ALLOWED_SOURCE_HOSTS) |
| `language` | string | No | es. `"JA"`, `"EN"` — normalizzato a `"any"` se omesso |
| `variant` | string | No | default `"default"` (es. `"alt"`, `"promo"`) |

**Response `200` — `{ ok: true, status: "ready", cached_url, original_url, format, width, height, bytes, error: null }`**

**Response `202` — `{ ok: true, status: "queued", ... }` — quando l'immagine è già stata richiesta e
è in queue per la conversione.**

**Errori:**
- `401` — chiave non valida
- `403` — source host non consentito
- `405` — metodo non consentito
- `413` — immagine troppo grande (>8 MB raw, >300 KB convertita)
- `500` — errore server (es. IMAGE_CACHE_KEY non configurato)
- `502` — errore upstream (es. storage upload fallito)

**Autenticazione:** `x-internal-key` header matching `IMAGE_CACHE_KEY`.

**Rate limiting:** Nessuna implementazione attuale. **Da investigare.**

**Note:**
- Buckets: `card-images` su Supabase Storage
- Max width: 480px (downscaling se necessario)
- Quality: 80% (retry 65% se >300 KB)
- Retry: backoff esponenziale su 429/5xx (max 4 tentativi)
- Timeout fetch: 15s
- Max raw download: 8 MB

---

## 3. eBay Browse Search — `GET /api/ebay-search`

**Scopo:** Proxy al eBay Browse API per ricercare listing attivi per una query.

**Method:** `GET`

**Query params:**
| Param | Tipo | Default | Descrizione |
|---|---|---|---|
| `q` | string | — | Query di ricerca (obbligatoria) |
| `market` | string | `"US"` | Mercato eBay (US, GB, DE, IT, FR, ES, CA) |
| `limit` | string | `"5"` | Numero di risultati (max 20) |

**Response `200` — `{ lowest: number, count: number, currency: string, items: [...] }`**

**Errori:**
- `400` — `q` mancante
- `405` — metodo non consentito
- `502` — errore eBay API

**Autenticazione:** Nessuna (endpoint pubblico).

**Env vars (Vercel):**
- `EBAY_CLIENT_ID`
- `EBAY_CLIENT_SECRET`

**Rate limiting:** Nessuna implementazione attuale. **Da investigare.**

**Note:**
- OAuth client-credentials (shared con `api/live-market.js`)
- Marketplace map: US→EBAY_US/USD, GB→EBAY_GB/GBP, DE/IT/FR/ES→EBAY_*/EUR

---

## 4. Live Market — `GET /api/live-market`

**Scopo:** Restituisce annunci eBay ATTIVI per una carta specifica, separato dalla valutazione
DraGold (che usa `compute-valuations.js`). "Cosa offre il mercato ORA", non "quanto vale".

**Method:** `GET`

**Query params:**
| Param | Tipo | Default | Descrizione |
|---|---|---|---|
| `cardId` | string | — | `cards.id` (obbligatoria) |
| `market` | string | `"IT"` | Mercato eBay |
| `limit` | string | `"8"` | Numero di risultati |
| `record` | string | — | Se "1", registra l'osservazione |

**Response `200` — `{ card, query, listings: [...], summary: { count, lowest, median, currency } }`**

**Errori:**
- `400` — `cardId` mancante
- `404` — carta non trovata in database
- `405` — metodo non consentito
- `500` — env vars mancanti / server misconfigured

**Autenticazione:** Nessuna (endpoint pubblico).

**Env vars (Vercel):**
- `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

**Rate limiting:** Nessuna implementazione attuale. **Da investigare.**

**Note:**
- Legge dal DB la carta per cardId, poi query eBay Browse API
- Link di acquisto affiliati (EPN) in `src/lib/ebayLinks.js`
- Separato da `market_valuations` (valutazione DraGold)

---

## 5. GDPR Account Deletion — `POST /api/delete-account`

**Scopo:** Elimina l'account utente (Auth/Profile/Username feature). Verifica il token
accesso server-side, rimuove avatar da Storage, delega l'utente via Admin API.

**Method:** `POST`

**Headers:**
| Header | Descrizione |
|---|---|
| `Authorization: Bearer <access_token>` | Token accesso Supabase dell'utente |

**Body:** Nessuno (tutto dai header)

**Response `200` — `{ ok: true }`**

**Errori:**
- `401` — token mancante o non valido
- `405` — metodo non consentito
- `500` — backend non configurato / errore eliminazione

**Autenticazione:** `Authorization: Bearer <access_token>` verificato server-side con
Supabase Admin client (service role key, mai raggiunta dal browser).

**Env vars (Vercel):**
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (o `SUPABASE_SERVICE_KEY`)

**Cascata eliminazione:** Le tabelle con FK a `profiles`/`auth.users` con `ON DELETE CASCADE`
(elenco in `supabase/migrations/20260826150000_google_oauth_profile_management.sql` §8):
`collection`, `alerts`, `watchlist`, `binders`, `posts`, `comments`, `likes`, `followers`,
`academy_progress`, `card_submissions`.

**Note:**
- Endpoint interno a uso utente autenticato
- Rimuove avatar da Storage bucket "avatars"
- Il service role key non va mai nel browser

---

## 6. Image Scan (read-only) — `GET /api/scan-images` e `POST /api/scan-images`

**Scopo:** Task 3 — full breakage scan. Endpoint read-only che non scrive nulla.

**GET method:**
**Query params:**
| Param | Tipo | Default | Descrizione |
|---|---|---|---|
| `mode` | string | — | `"list"` |
| `tcg` | string | — | `"pokemon"` o `"onepiece"` |
| `lang` | string | — | `"en"` o `"ja"` |
| `cursor` | string | `"0"` | Pagination cursor |
| `limit` | string | `"1000"` | Righe per page |

**Response GET `200` — `{ ok: true, rows: [{id, tcg, lang, name, set_name, source, image_url}], nextCursor }`**

**POST method:**
**Body:** `{ imageUrl: string }`

**Response POST `200` — `{ ok: true, status: number, method: "HEAD"|"GET", ms: number, contentType: string, contentLength: number }`

**Autenticazione:**
- GET: Nessuna (read-only pubblico)
- POST: `x-internal-key` header matching `IMAGE_CACHE_KEY` (stesso segreto di cache-image.js)

**Env vars (Vercel):**
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (o `SUPABASE_SECRET_KEY`)
- `IMAGE_CACHE_KEY` (per POST auth)

**Note:**
- ALLOWED_SOURCE_HOSTS: assets.tcgdex.net, images.pokemontcg.io, images.scrydex.com,
  optcgapi.com, onepiece-cardgame.com (e varianti)
- UA: browser mimetic per evitare blocchi
- Timeout: 10s

---

## 7. Dynamic Sitemap — Cards — `GET /api/sitemap-cards`

**Scopo:** Sitemap dinamico per pagine `/carta/{slug}`. Priorità: Pokemon > One Piece > MTG > YGO.

**Method:** `GET`

**Query params:**
| Param | Tipo | Default | Descrizione |
|---|---|---|---|
| `tcg` | string | — | Filtro per TCG (opzionale, default: tutti) |

**Response `200` — XML sitemap con `<url>` entries per ogni carta con slug.**
- Priorità: pokemon > onepiece > mtg > ygo
- Max 49.000 URL per TCG (sotto il limite sitemap spec di 50.000)
- `<changefreq>weekly</changefreq>` per tutte le entry

**Errori:**
- `405` — metodo non consentito

**Autenticazione:** Nessuna (pubblico, per crawler search engine).

**Env vars (Vercel):**
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

**Rate limiting:** Nessuna implementazione attuale. **Da investigare.**

**Note:**
- Split per-TCG (ogni TCG ha la propria sitemap sotto 50k URL)
- Fonte: `canonical_cards` table (slug, tcg, updated_at)
- `escapeXml()` perescaping sicuro
- Hardcoded base URL: `https://dragold.org` — **da rendere configurabile**

---

## 8. Dynamic Sitemap — Sets — `GET /api/sitemap-sets`

**Scopo:** Sitemap dinamico per pagine `/set/{slug}`. Stessa architettura di sitemap-cards.

**Method:** `GET`

**Query params:**
| Param | Tipo | Default | Descrizione |
|---|---|---|---|
| `tcg` | string | — | Filtro per TCG (opzionale) |

**Response `200` — XML sitemap con `<url>` entries per ogni set con slug.**

**Errori:**
- `405` — metodo non consentito

**Autenticazione:** Nessuna (pubblico).

**Env vars (Vercel):**
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

**Note:**
- Fonte: `canonical_cards` (tcg + set_id + updated_at), deduplicato per (tcg, set_id)
- Fallback per TCG senza set_id in canonical_cards (es. One Piece): legge da `cards` table
  solo per il TCG specifico (colonna `set_id` sempre popolata)
- Max 50.000 righe per TCG
- Hardcoded base URL: `https://dragold.org` — **da rendere configurabile**
- `slugifySetId()` funzione separata (stessa logica di `src/lib/setSlug.js`)

---

## 9. Dynamic Sitemap — Illustrators — `GET /api/sitemap-illustrators`

**Scopo:** Sitemap dinamico per pagine `/illustrator/{slug}`.

**Method:** `GET`

**Query params:** Nessuno (single file, non partizionato).

**Response `200` — XML sitemap con `<url>` entries per ogni illustratore con slug.**

**Errori:**
- `405` — metodo non consentito

**Autenticazione:** Nessuna (pubblico).

**Env vars (Vercel):**
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

**Note:**
- Fonte: `cards.illustrator` colonna indicizzata (cards_illustrator_idx)
- ~418 illustratori distinti oggi (solo pokemon, ben sotto 50k limite)
- Non partizionato per ?tcg= perché illustratore è entità globale
- `slugifyIllustrator()` funzione separata (stessa logica di `src/lib/illustratorSlug.js`)
- Hardcoded base URL: `https://dragold.org` — **da rendere configurabile**

---

## Riepilogo env vars richiesti

| Endpoint | Env vars richiesti |
|---|---|
| `/api/img` | Nessuna (pubblico, read-only) |
| `/api/cache-image` | `IMAGE_CACHE_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `/api/ebay-search` | `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` |
| `/api/live-market` | `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `/api/delete-account` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (o `SUPABASE_SERVICE_KEY`) |
| `/api/scan-images` (GET) | Nessuna |
| `/api/scan-images` (POST) | `IMAGE_CACHE_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `/api/sitemap-*` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |

---

## Rate limiting — stato

**Nessun endpoint ha rate limiting implementato.** Questo è un problema per sicurezza/abuso
(specie per `/api/img` che è pubblico e potrebbe essere usato come open proxy se non per
allow-list). **Da investigare per production.**

Pattern consigliati:
- `/api/img`: rate limit per IP (es. 100 req/min) + conferma allow-list
- `/api/cache-image`: già protetto da `x-internal-key`, rate limit per key
- `/api/ebay-search`, `/api/live-market`: rate limit per IP (eBay API ha i propri limiti)
- `/api/sitemap-*`: rate limit moderato per IP (crawler friendly, non abusivo)
