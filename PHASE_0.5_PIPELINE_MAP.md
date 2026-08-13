# DraGold — Phase 0.5: mappa pipeline di sync + scheduler, dipendenze `tk`/One Piece `_p`/`P`/`SV`/`M-P`

Data: 12 agosto 2026, stessa sessione. **Nessuna modifica a codice, schema, dati. Nessuna migration, nessun
backfill, nessun sync, nessun commit, nessun push.** Fonti usate: `.github/workflows/*.yml` (letti per
intero, 8 file), `supabase/functions/*/index.ts` (letti dal repository locale, non solo via tool MCP),
`cron.job` (Postgres, via `execute_sql`), query dirette su `cards`/`card_prices`/`collection`/
`canonical_cards`. Ogni affermazione è VERIFIED, INFERRED o UNKNOWN.

---

## 1. Mappa completa delle pipeline

| Pipeline | Trigger | Frequenza | Scrive `cards`? | Stato |
|---|---|---|---|---|
| `scripts/sync-cards.js` (`sync-cards.yml`) | GitHub Actions `schedule` | **Giornaliero, 03:00 UTC** (`0 3 * * *`) | Sì — pokemon, mtg, ygo, **op** (tutti e 4 i TCG) | **ATTIVA, principale** |
| `scripts/sync-full.js` (`sync-full.yml`) | GitHub Actions `schedule` | Settimanale, domenica 04:00 UTC (`0 4 * * 0`) | Sì — pokemon, op (EN+JA) | **ATTIVA** |
| `scripts/sync-pokemon-ja.js` (`sync-pokemon-ja.yml`) | GitHub Actions `schedule` | Settimanale, domenica 05:00 UTC (`0 5 * * 0`) | Sì — pokemon JA | **ATTIVA** |
| `scripts/enrich-cards.js` (`enrich-cards.yml`) | GitHub Actions `schedule` | **Ogni 2 ore** (`15 */2 * * *`) | Update (illustrator/evolveFrom/rarity), non insert | **ATTIVA, molto frequente** |
| `scripts/sync-pokemon-ptcg.js` (`sync-pokemon-ptcg.yml`) | **solo `workflow_dispatch`** | Nessuna — manuale | Sì, quando lanciato a mano | **NON schedulata** — manuale/on-demand |
| `scripts/sync-onepiece-ja.js` (`sync-onepiece-ja.yml`) | **solo `workflow_dispatch`** | Nessuna | Sì, quando lanciato a mano | **NON schedulata**. Il file stesso si dichiara "TEMPORANEO... da rimuovere dopo la validazione" (commento nel workflow) — **correzione rispetto al report precedente**, che aveva descritto questa pipeline come "già scritta e funzionante" senza verificarne lo stato di scheduling. Le 687 righe JA con `ja_official` sono quindi il risultato di run manuali, non di un processo continuo |
| `scripts/cache-onepiece-images.js` (`cache-onepiece-images.yml`) | solo `workflow_dispatch` | Nessuna | No (solo immagini) | Non schedulata |
| Edge Function `bulk-import-pokemon` | **`pg_cron` su Postgres** (non GitHub Actions) | **Settimanale, domenica 04:00 UTC** — **stesso slot esatto di `sync-full.js`** | Sì — pokemon, tutte le lingue, via endpoint TCGdex flat `/v2/{lang}/cards` | **ATTIVA**, confermata via `cron.job` |
| Edge Function `refresh-prices` | `pg_cron` | Ogni 6 ore (`0 */6 * * *`) | No (scrive `card_prices`) | Attiva, non pertinente a questo audit |
| Edge Function `compute-hot-picks` | `pg_cron` | Giornaliero 03:00 UTC | No | Attiva, non pertinente |
| Edge Function `check-alerts` | `pg_cron` | Ogni 15 minuti | No | Attiva, non pertinente |
| Edge Function `bulk-import-onepiece` | **Nessun job in `cron.job`** | — | Sì, quando invocata | **Deployata ma non schedulata automaticamente** (assente da `cron.job`) — **non presente nemmeno come cartella nel repository locale** (`supabase/functions/` contiene `bulk-import-mtg`, `bulk-import-pokemon`, `bulk-import-ygo`, `check-alerts`, `compute-hot-picks`, `fetch-ebay-prices`, `refresh-prices`, `sync-sets`, ma **non** `bulk-import-onepiece`) — è stata deployata direttamente su Supabase, non tramite questo repository Git. Il tool MCP per leggerne il codice ha fallito due volte ("Failed to retrieve function bundle") — **contenuto UNKNOWN**, non leggibile in questa sessione da nessuna delle due fonti disponibili |
| Edge Function `bulk-import-mtg`, `bulk-import-ygo`, `sync-sets`, `fetch-ebay-prices` | Nessun job in `cron.job` | — | Sì/No a seconda | Deployate, non schedulate automaticamente — presumibilmente manuali/on-demand, coerente con l'assenza in `cron.job` |
| `deploy-edge-functions.yml` | push su `supabase/functions/**` o manuale | — | Non scrive dati, **deploya** le Edge Function | Attiva come CI/CD, non come sync |

**Conclusione decisiva**: **due pipeline scrivono attivamente le carte Pokémon nello stesso momento esatto ogni
domenica alle 04:00 UTC** — `scripts/sync-full.js` (corretta, deriva `set_id` dall'endpoint `/sets`) e la
Edge Function `bulk-import-pokemon` (bacata, deriva `set_id` con `.split('-')[0]` dall'endpoint flat
`/cards`). Non sono coordinate tra loro, non si conoscono a vicenda, entrambe scrivono su `cards` con `id` di
riga diverso (quindi nessun conflitto di upsert, ma duplicazione fisica dei dati). **VERIFIED** con certezza,
non più un'ipotesi.

---

## 2. `bulk-import-pokemon`: la causa esatta, confermata da codice + cron

Codice esatto (`supabase/functions/bulk-import-pokemon/index.ts`, letto per intero dal repository locale):
```ts
const res = await loggedFetch(supabase, 'tcgdex', `https://api.tcgdex.net/v2/${lang}/cards`, { timeout: 60000 })
// ...
const chunk = cards.slice(i, i + 500).map((c) => ({
  id:           `pokemon:tcgdex:${c.id}:${lang}`,
  source_id:    c.id,
  set_id:       (c.id || '').split('-')[0] || null,
  card_number:  c.localId || null,
  rarity:       null,
  set_name:     null,
  metadata:     c,
  ...
}))
```
Schedulazione (`cron.job`, query diretta): `jobid 3, jobname 'bulk-import-weekly', schedule '0 4 * * 0', active
true`, invoca `POST /functions/v1/bulk-import-pokemon`. **VERIFIED**, non inferito: questa funzione gira
davvero, ogni settimana, e continua a scrivere righe con lo stesso bug ad ogni esecuzione.

---

## 3. `tk`, `P`, `SV`, `M-P`: cosa è davvero lo stesso bug e cosa no

Ho verificato, per ciascun gruppo, (a) il `created_at` (per capire se appartengono allo stesso batch/incidente),
(b) se l'aritmetica `source_id.split('-')[0]` produce davvero quel `set_id`, (c) se esiste una riga "gemella
corretta" con lo stesso identificatore ma set_id completo.

| set_id | Righe | Creato | `source_id` campione | `split('-')[0]` atteso | Gemello corretto trovato? | Conclusione |
|---|---|---|---|---|---|---|
| `tk` | 1.020 | 2026-05-19/20 (stesso batch di `P`) | `tk-xy-su-4` | `tk` ✓ | Sì: `tk-xy-su` (30 righe, creato 2026-05-18, prima del batch bacato) | **VERIFIED — stesso bug** |
| `P` | 311 | 2026-05-19/20 (stesso batch di `tk`) | `P-A-001` | `P` ✓ | Sì: `P-A` (100 righe, creato 2026-05-18, prima del batch bacato) | **VERIFIED — stesso bug** |
| `SV` | 95 | 2026-05-20 (stesso batch di `tk`/`P`) | `SV-P-001` | `SV` ✓ | Nessun gruppo `SV-P` trovato nel database oggi (cercato esplicitamente) | **INFERRED, non VERIFIED al 100%**: batch e aritmetica coincidono con lo stesso incidente, ma manca la controparte corretta da confrontare — possibile che la versione "giusta" di questo set non sia mai stata sincronizzata da nessuna pipeline, quindi oggi **queste 95 righe sono l'unica copia esistente**, sbagliata, di quelle carte |
| `M-P` | 83 | **2026-07-19** — batch **diverso e molto più tardo** (2 mesi dopo l'incidente `tk`/`P`/`SV`) | `M-P-001` | `M` (non `M-P`!) | Nessun gruppo `M` trovato | **NON lo stesso bug.** L'aritmetica non torna (`.split('-')[0]` su `M-P-001` darebbe `M`, non `M-P`) e il batch è temporalmente separato. **Conclusione: `M-P` è quasi certamente un set_id TCGdex legittimo e corretto** (una linea promozionale con quel codice), non una troncatura. **Non va incluso** nella correzione delle 1.020+311+95 righe |

**Numero corretto di righe da trattare come "stesso incidente confermato o quasi-confermato"**: **1.020 (`tk`) +
311 (`P`) + 95 (`SV`) = 1.426 righe**, non 1.509 come stimato nel documento precedente (che includeva `M-P`
per prudenza, ora escluso con evidenza propria).

---

## 4. Dipendenze delle 1.020+311+95 righe (`tk`/`P`/`SV`)

Verificato con query dirette, **prima di qualunque correzione**, come richiesto:

- **`canonical_card_id`**: **0 delle 1.020 righe `tk`** hanno un gruppo canonico assegnato (`canonical_card_id
  IS NOT NULL`). Coerente con la Fase A del documento precedente: il batch di backfill del 5 agosto non le ha
  toccate. **Implicazione pratica importante**: correggere o deprecare queste righe **non rischia di rompere
  nessuna pagina carta pubblica** (`/carta/{slug}`), perché nessuna di esse è oggi raggiungibile da lì.
- **`card_prices`**: **96 righe** tra `tk`+`P`+`SV` hanno almeno uno storico prezzo collegato (`card_prices.
  card_id` → `cards.id`). Non enorme, ma non zero: una correzione che cambia l'`id` di riga (invece di solo il
  campo `set_id`) romperebbe questi 96 storici se non gestita con un `UPDATE card_prices SET card_id = ...`
  in accompagnamento, non una `DELETE`+`INSERT`.
- **`collection`**: **2 righe** in `collection` referenziano (via `card_api_id` testo libero) una di queste
  carte. Impatto utente reale ma minimo — utile saperlo prima di agire, non un blocco.

---

## 5. One Piece: le 4 righe `_p` già presenti

Verificato nel dettaglio (non solo contate, come nella sessione precedente):

Tutte e 4 appartengono allo stesso set **`ST-16`** (Starter Deck a tema Uta/Film Red), rarità `PR` (promo),
`card_number` che **preserva il suffisso `_p1` per intero** (es. `P-058_p1`, non ripulito), tutte create nello
stesso istante `2026-05-25 11:18:43`. Questo è **un batch isolato e distinto** sia dal batch `tk`/`P`/`SV`
(19-20 maggio) sia dai run settimanali standard.

**UNKNOWN il motivo esatto per cui il filtro `/_p\d+$/` di `sync-full.js` non le ha bloccate.** Ipotesi
plausibile non verificata: potrebbero provenire da un run di `scripts/sync-cards.js` (che ha una `syncOnePiece`
diversa, basata su `en.onepiece-cardgame.com`/`www.onepiece-cardgame.com` direttamente, **non** su optcgapi, e
**non contiene lo stesso filtro regex** — verificato leggendo `syncOnePiece()` in `sync-cards.js` in questa
sessione: non ho trovato alcun controllo `_p\d+$` in quella funzione). Se questa ipotesi è corretta, vorrebbe
dire che **`sync-cards.js`, la pipeline più frequente (giornaliera) per One Piece, non ha mai avuto il filtro
Parallel** — cosa che cambierebbe la valutazione della Fase E del piano precedente (rimuovere il filtro da
`sync-full.js` non basterebbe a spiegare da sola perché ci sono solo 4 righe e non centinaia, se `sync-cards.js`
gira ogni giorno senza filtro). **Non lo dichiaro VERIFIED**: non ho ancora eseguito un confronto riga per riga
tra cosa scrive `sync-cards.js` per One Piece e cosa c'è oggi in tabella — lo segnalo come domanda aperta
concreta, non lo risolvo qui per restare dentro il perimetro "solo Phase 0.5" che mi hai dato.

---

## 6. Decisioni ora possibili con certezza

1. **`bulk-import-pokemon` va disattivata o corretta prima di qualunque altra cosa**: è VERIFIED attiva
   (cron settimanale), VERIFIED bacata (root cause nel codice), e continuerà a produrre nuove righe `set_id`
   troncato ogni domenica finché resta così. Questa non è più una domanda aperta come nel documento precedente
   — è una decisione che puoi prendere subito: la disattivazione è un'operazione su Supabase (`cron.job`/
   dashboard Edge Functions), non tocca `cards` né richiede migration.
2. **La correzione delle 1.020+311+95 righe (`tk`/`P`/`SV`) è a basso rischio per `canonical_cards`** (zero
   righe con gruppo canonico assegnato) ma **deve gestire esplicitamente i 96 riferimenti in `card_prices` e
   le 2 righe in `collection`** — non una semplice riscrittura di colonna.
3. **`M-P` va escluso dalla correzione**: nessuna evidenza che sia un problema, evidenza indiretta ma solida
   che sia un set id TCGdex legittimo.
4. **Le 4 righe One Piece `_p` non vanno "corrette" nel senso di eliminarle**: sono probabilmente le uniche
   Parallel già presenti per coincidenza di pipeline — vanno lasciate come base di partenza per Fase E, non
   trattate come anomalia da rimuovere.
5. **Prima di attivare Fase E (rimozione filtro Parallel) serve leggere per intero `syncOnePiece()` in
   `scripts/sync-cards.js`** (non solo `sync-full.js`) — è la pipeline giornaliera, quindi quella che ha
   l'impatto maggiore, e la sua gestione dei Parallel non è ancora stata verificata in nessuna sessione finora.
   Lo segnalo come prossimo passo, non lo eseguo qui (fuori dal perimetro Phase 0.5 richiesto).

---

## Riepilogo file/query usati in questa fase (per riproducibilità)

- `.github/workflows/*.yml` — 8 file, letti per intero via `cat`.
- `supabase/functions/bulk-import-pokemon/index.ts` — letto per intero dal repository locale (non dal tool
  MCP, che in Phase 0 aveva funzionato solo per questa funzione e falliva per `bulk-import-onepiece`).
- `cron.job` (Postgres, extension `pg_cron` v1.6.4 + `pg_net` v0.20.0, entrambe installate) — query diretta,
  4 job attivi elencati per intero in §1.
- Query dirette su `cards` (`set_id`, `created_at`, `metadata`, `canonical_card_id`), `card_prices`
  (`card_id`), `collection` (`card_api_id`) — tutte read-only, nessuna scrittura.

## Mi fermo qui

Nessuna modifica eseguita. In attesa di indicazioni su: (a) disattivare o correggere `bulk-import-pokemon`,
(b) come trattare le 1.426 righe `tk`/`P`/`SV` dato il vincolo dei 96 riferimenti prezzo, (c) se vuoi che
approfondisca `syncOnePiece()` in `sync-cards.js` prima di procedere con la Fase E.
