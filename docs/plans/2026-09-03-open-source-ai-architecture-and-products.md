# DraGold — Open Source AI Architecture & Product Opportunities

> **Autore:** agente Principal Architect · **Data:** 2026-09-03
> **Scope:** analisi concreta, basata sul repository reale, di come integrare AI e componenti open source in DraGold e quali prodotti costruirci. **Nessun file di prodotto toccato.**
> **Base verificata:** `package.json`, `vercel.json`, `api/`, `scripts/lib/valuation/`, `scripts/lib/reconcile/`, `src/lib/`, estensioni Postgres disponibili su Supabase, licenza repo, stato utenti — tutto controllato oggi.

---

## 0. Punto di partenza reale

| Fatto | Dettaglio |
|---|---|
| Stack | React 18 + Vite 5 · Supabase Postgres 17 · Vercel serverless (Node ESM, `"type":"module"`) · **no TypeScript** · no state lib |
| AI oggi | **Zero.** Nessuna dipendenza `ai`/`@anthropic-ai/sdk`/`@google/*`, nessun endpoint, nessun Python. |
| **Licenza repo** | 🔴 **Nessuna.** `licenseInfo: null`, `visibility: PRIVATE`. Il repo **non è ancora open source** — è un requisito da realizzare, non uno stato. |
| Utenti | ~0 (3 profili, 1 collezione, 5 righe academy). Pre-lancio. |
| Market layer | `market_valuations` 6.706 carte · `market_observations` 20.117 · tutto `confidence ≤ medium` (1 fonte: TCGCSV). Motore puro in `scripts/lib/valuation/` (testato). |
| Identità | `card_versions` RPC in costruzione (Fase A spec) — tool deterministico cross-lingua. |
| Estensioni Postgres su Supabase | **disponibili non installate:** `vector` 0.8 (pgvector), `pgroonga` 3.2 (full-text JA-aware), `pgmq` (coda), `http`. **installate:** `pg_cron`, `pg_net`, `pg_trgm`. |
| Vercel | `vercel.json` minimale (rewrite SPA + cache asset). Funzioni serverless Node; timeout dipende dal piano (Hobby 10s / Pro 60s, estendibile). |
| Riuso pronto | `scripts/lib/valuation/{valuation,confidence,ebay-browse,obs-store,stats}.js` · `src/lib/search.js` · `src/lib/portfolio/*` · `api/live-market.js` + `api/_lib/ebay.js` · `scripts/lib/reconcile/*` · RPC `portfolio_valuations`/`portfolio_value_history`/`set_identity_key`/`search_cards` |

**Implicazione:** l'AI su DraGold non è un progetto infrastrutturale. È un **layer di orchestrazione sottile** sopra dati e funzioni che in gran parte esistono già. Il lavoro vero è: (a) rendere il repo davvero open source, (b) scegliere un'astrazione provider che non crei lock-in, (c) costruire i *tool* (che sono il valore), (d) un buon eval.

---

## 1. Componenti AI / open source integrabili davvero

Solo ciò che ha senso per DraGold, con licenza e ruolo.

| Componente | OSS scelto | Licenza | Ruolo in DraGold | Alternativa commerciale |
|---|---|---|---|---|
| **Astrazione provider LLM + loop agente** | **Vercel AI SDK** (`ai` + `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/openai-compatible`) | MIT | Un'unica API (`streamText`/`generateText` con `tools` + `stopWhen`) per Anthropic, Gemini, Ollama, vLLM, OpenRouter, Groq… Streaming, tool-calling, structured output normalizzati. **È già il layer provider-agnostic — non se ne costruisce uno.** | — |
| **Schema output / validazione** | `zod` | MIT | Schema della "answer card" (`required` sui campi di provenienza), validazione tool input. Micro-dipendenza. | — |
| **Modelli locali** | **Ollama** (+ `llama.cpp`/`vLLM` per deploy serio) | MIT / Apache-2.0 | Endpoint OpenAI-compatible (`/v1/chat/completions`, `/api/embeddings`). Un fork punta lì e non serve nessuna API key. | Groq / DeepInfra / Together (OpenAI-compatible, a consumo) |
| **Modelli agente locali** | `qwen2.5:7b/14b`, `llama3.1:8b`, `mistral-nemo:12b` | Apache-2.0 / Llama-3.1 (permissiva per <700M MAU) | Tool-calling sui 5-6 tool read-only di DraGold. Meno robusti di Claude/Gemini su catene lunghe, adeguati su tool ben scoped. | Claude Haiku 4.5 / Gemini 2.0 Flash |
| **Full-text search JA-aware** | **pgroonga** | LGPL-2.1 (estensione Postgres, non infetta il codice app) | Tokenizzazione giapponese reale per i nomi carta JA — molto meglio di `pg_trgm` per JA. **Utile alla multilingua indipendentemente dall'AI.** Supabase lo supporta nativamente. | Algolia / Meilisearch (servizio a parte) |
| **Embeddings (solo se servono — §4)** | `@xenova/transformers` (Transformers.js) con `bge-m3` / `gte-multilingual` ONNX; oppure `nomic-embed-text`/`bge-m3` via Ollama | Apache-2.0 / MIT | Embedding di testo carta multilingue, in Node o browser, senza servizio esterno. | Voyage / Cohere / OpenAI embeddings |
| **Vector store** | **pgvector** (già disponibile su Supabase) | PostgreSQL License | Storage + HNSW. Nessun DB nuovo. | Pinecone / Qdrant (servizio a parte) |
| **Reranking (opzionale)** | `bge-reranker-v2-m3` via Transformers.js | Apache-2.0 | Riordina i candidati di ricerca semantica. Solo se §4 diventa reale. | Cohere Rerank |
| **Eval agenti** | **`promptfoo`** (matrice modelli + assert + LLM-judge, report CI) + `node:test` per gli assert deterministici | MIT | Confronta Gemini Flash vs Haiku vs Ollama sullo stesso set di domande; assert "prezzo sempre con provenienza", "carta identificata". | Braintrust / LangSmith (SaaS) |
| **Web research** | Anthropic `web_search` server tool **oppure** SearXNG self-hosted + `node-html-parser` (già dep) su allowlist | tool: a consumo · SearXNG: AGPL-3.0 (servizio separato) | "Quanto vale *oggi*" quando la cache è vecchia. Allowlist: cardmarket, pricecharting, tcgplayer. | Gemini grounding · Tavily · Exa |
| **Guardrail contenuti (probabilmente non serve)** | `llama-guard`/`granite-guardian` via Ollama | permissive | Filtro I/O. Per un dominio TCG è overkill; basta lo scoping nel system prompt + structured output. | Anthropic/Google safety nativa |
| **Parsing HTML (già presente)** | `node-html-parser` | MIT | Scraping mirato (immagini OP, nomi JA) — già usato. | — |
| **Coda job (se serve)** | `pgmq` (disponibile su Supabase) | PostgreSQL License | Se un prodotto AI diventa async (report lunghi). Per ora `catalog_gaps.status` fa da coda. | — |

**Cosa NON integrare:** LangChain / LlamaIndex / CrewAI / AutoGPT (framework pesanti per 6 tool), un SDK provider proprio, un vector DB dedicato, un eval framework da zero, un modello fine-tunato.

---

## 2. Ollama e modelli locali — analisi concreta

**Cosa abilita:** un contributor (o DraGold stesso su un box con GPU) esegue l'intero stack AI senza nessuna API key e senza che nulla "telefoni a casa".

```
ollama serve                                   # espone :11434
ollama pull qwen2.5:14b                         # agente
ollama pull bge-m3                              # embeddings (se §4)
# .env del fork:
DRAGOLD_LLM_PROVIDER=openai-compatible
DRAGOLD_LLM_BASE_URL=http://localhost:11434/v1
DRAGOLD_LLM_MODEL=qwen2.5:14b
DRAGOLD_LLM_API_KEY=ollama                      # placeholder, Ollama non lo verifica
```

**Idoneità al compito:**
- I 6 tool di DraGold sono read-only, con schema stretto, e la risposta è structured output. Questo è il caso *favorevole* per un modello locale: poca creatività, molta disciplina.
- `qwen2.5` e `llama3.1` supportano il tool-calling nativo. Su una catena di 2-4 tool ("cerca → versioni → valutazione EN → valutazione JA") sono adeguati; su catene di 6+ passi con ragionamento ambiguo degradano più di Claude/Gemini.
- Latenza: su hardware consumer (RTX 4070/4090, o Apple M-series) `qwen2.5:14b` gira a ~20-40 tok/s → una risposta agente in ~5-15s. Accettabile con streaming.
- **Mitigazione della fragilità:** l'affidabilità dell'identificazione carta **non dipende dal modello** — dipende da `card_search` + `card_versions` (SQL deterministico). Il modello sceglie *quale* tool chiamare e *sintetizza*; i fatti vengono dai tool. Un modello locale che sbaglia a formattare produce comunque i numeri giusti (dai tool) o un errore visibile, mai un prezzo inventato (structured output `required`).

**Deployment DraGold-hosted:** per il free tier pubblico su dragold.org, tre opzioni, tutte compatibili con "genuinamente open source":
1. Ollama/vLLM su un piccolo box GPU (self-managed) — costo fisso, zero per-query.
2. Un provider OpenAI-compatible a consumo (Groq `llama-3.3-70b` è economico e veloce; DeepInfra; Together) — stesso adapter di Ollama.
3. Gemini 2.0 Flash / Flash-Lite via `@ai-sdk/google` — l'opzione qualità/prezzo migliore per il tier hosted.

Il fork sceglie. Il codice è identico.

---

## 3. Anthropic / Gemini e provider abstraction

**Decisione: Vercel AI SDK come astrazione. Non costruire un'interfaccia `LlmProvider` propria — esiste già ed è MIT.**

```js
// api/_lib/llm/index.js  (~40 righe)
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

export function getModel() {
  const p = process.env.DRAGOLD_LLM_PROVIDER || 'google';
  switch (p) {
    case 'anthropic': return anthropic(process.env.DRAGOLD_LLM_MODEL || 'claude-haiku-4-5');
    case 'google':    return google(process.env.DRAGOLD_LLM_MODEL || 'gemini-2.0-flash');
    case 'openai-compatible': {   // Ollama, vLLM, Groq, OpenRouter, Together…
      const o = createOpenAICompatible({
        name: 'local', baseURL: process.env.DRAGOLD_LLM_BASE_URL,
        apiKey: process.env.DRAGOLD_LLM_API_KEY,
      });
      return o(process.env.DRAGOLD_LLM_MODEL || 'qwen2.5:14b');
    }
    default: throw new Error(`unknown DRAGOLD_LLM_PROVIDER: ${p}`);
  }
}
```

```js
// l'endpoint agente non conosce il provider
import { streamText } from 'ai';
import { getModel } from './_lib/llm/index.js';
const result = streamText({
  model: getModel(),
  system: SYSTEM_PROMPT,           // cached
  messages,
  tools: AGENT_TOOLS,              // 6 tool, definiti una volta
  stopWhen: stepCountIs(6),
});
```

**Costi indicativi per query** (input ~3k tok con prompt caching, output ~500 tok):
| Modello | $/query | Note |
|---|---|---|
| Gemini 2.0 Flash-Lite | ~$0,002 | più economico "capace" |
| Gemini 2.0 Flash | ~$0,005 | **raccomandato per il tier hosted** |
| Claude Haiku 4.5 | ~$0,012 | ottimo tool-calling |
| Claude Sonnet 5 | ~$0,02 | escalation query difficili |
| Groq llama-3.3-70b | ~$0,003 | veloce, OpenAI-compatible |
| Ollama locale | ~$0 | hardware del fork |

**Provider-neutralità garantita per costruzione:** i tool (`card_versions`, `card_valuation`, …) sono SQL/RPC. Cambiare `DRAGOLD_LLM_PROVIDER` non cambia una sola query dati.

---

## 4. Embeddings / vector search — servono davvero?

**Per i primi 3 prodotti: NO. Rimandare.**

| Serve embeddings? | Caso d'uso | Coperto da |
|---|---|---|
| ❌ No | "quanto vale il mio Charizard 199/165" | `card_search` (trigram/pgroonga) + `card_valuation` (lookup tabella) |
| ❌ No | "versioni EN/JA di questa carta" | `card_versions` (SQL) |
| ❌ No | "carte del set X che mi mancano" | `collection` + `catalog_gaps` (SQL) |
| ❌ No | "Charizard sotto €100 in crescita" | query su `market_valuations.trend_30d_pct` |
| 🟡 Forse (Fase 2+) | "carte che fanno pescare 2 carte dal mazzo" (ricerca semantica sul testo effetto) | embedding del testo carta + pgvector |
| 🟡 Forse (Fase 2+) | Retrieval contenuti Academy per l'agente | embedding contenuti Academy |
| 🟡 Forse | "trova carte visivamente/tematicamente simili" | embedding immagine (CLIP) — costoso, valore incerto |

**Se e quando:** pgvector 0.8 è già disponibile su Supabase (un `create extension`). Embedding di `name + name_en + testo carta` (dove esiste) con `bge-m3` (multilingue EN/JA, gira locale via Transformers.js o Ollama). ~204k carte × 1024 dim ≈ 800 MB — sta in Supabase. Job batch nel pattern GitHub Actions esistente. Costo one-time: ~$0 (locale) o ~$2-20 (API).

**Verdetto:** non installare pgvector per i primi prodotti. La ricerca lessicale (trigram oggi, pgroonga per il JA) + il KG + `card_versions` bastano. Il testo-effetto semantico è un prodotto a sé, dopo.

---

## 5. Agent / tool architecture

**Un endpoint. Sei tool. Zero framework di orchestrazione.**

```
POST /api/ask   (Vercel serverless Node, streaming, ~60s max)
  ├─ getModel()                          → provider da env (§3)
  ├─ streamText({ model, system, messages, tools, stopWhen: stepCountIs(6) })
  ├─ structured output: AnswerCard (zod, required: value/currency/confidence/as_of/sources)
  ├─ auth: JWT Supabase utente → i tool con dati personali girano con la sua RLS
  └─ log → agent_queries (question, tools_called[], tokens, cost_usd, model, resolved)
```

**Tool (`api/_lib/agent-tools.js`, tutti read-only, tutti wrapper su codice esistente):**

| Tool | Wrappa | Riuso reale |
|---|---|---|
| `card_search(query)` | `search_cards`/`suggest_cards` RPC + `src/lib/search.js` ranking | esiste |
| `card_versions(card_id\|canonical\|tcg+set+number)` | RPC `card_versions` | Fase A |
| `card_valuation(card_id, currency)` | tabella `market_valuations` | esiste (6.706 righe) |
| `price_history(card_id, days)` | RPC `portfolio_value_history` / `market_observations` | esiste |
| `live_market(card_id, market)` | `api/live-market.js` (fetch interno) | esiste |
| `collection()` | RPC `portfolio_valuations` con JWT utente | esiste |
| `set_search(query)` / `set_progress(set_id)` | `set_logos` / `collection` | esiste |

**Regole anti-allucinazione (system prompt + schema):**
1. L'agente non fa aritmetica sui prezzi. Ogni numero economico viene *verbatim* da un tool result.
2. Output structured: `AnswerCard` richiede `value` + `currency` + `confidence` + `as_of` + `sources[]`. Se un tool non li fornisce → l'agente non può compilarli → dice "dato non disponibile".
3. `confidence='none'` o riga `market_valuations` assente → "non ho abbastanza dati di mercato" (+ opz. `live_market`).
4. `card_search` con >1 candidato plausibile (set/numero/lingua diversi) → l'agente **chiede**, non indovina.
5. EN vs JA: l'agente legge l'identità da `card_versions.link_basis` + `alias_note`, non la deduce dal nome.
6. Scope TCG/carte/collezione. Fuori scope → declina.

**Observability & cost control:** `agent_queries` (unica tabella nuova). Rate limit: counter per-utente/giorno + edge middleware per-IP anon + kill-switch env. Cap mensile per-utente.

**OSS impiegato:** `ai` + `@ai-sdk/*` (loop + provider), `zod` (schema). Il resto è codice DraGold.

---

## 6. Web research e fonti prezzo

**Due modalità nette, già la separazione giusta nel repo:**

| Modalità | Quando | Come | Persistito? |
|---|---|---|---|
| **Cached** | `market_valuations.computed_at` < 48h e `confidence ≥ medium` | tool `card_valuation` | sì (già) |
| **Live** | `confidence='none'`, cache vecchia, carta nuova, "quanto vale *oggi*" | tool `live_market` (eBay Browse) + (Fase 2) `web_research` | no — mostrato come "annunci attivi ora" |

**Espansione fonti prezzo (indipendente dall'AI, dall'audit vNext):** aggiungere **Cardmarket** (via feed `cardmarket.prices` di pokemontcg.io/Scrydex) + **eBay-sold** (riconciliando `refresh-prices` v14 → `market_observations` `kind='sold'`). Con ≥2 fonti indipendenti le carte raggiungono `confidence='high'` — la rubrica in `scripts/lib/valuation/confidence.js` è già pronta.

**`web_research` tool (Fase 2):** server tool `web_search` (Anthropic) o Gemini grounding, `allowed_domains` fissi (cardmarket.com, pricecharting.com, tcgplayer.com). Per il self-host: SearXNG (AGPL, servizio a parte) + `node-html-parser` (già dep), o il fork mette la propria chiave. **Mai scraping di marketplace che lo vietano** (TCGplayer/Cardmarket/eBay listing-sold).

---

## 7. Eval / testing degli agenti

Il repo ha già una cultura `node:test` forte (567 test scripts). Si estende, non si reinventa.

**Livello 1 — assert deterministici (`node:test`, in CI ad ogni PR):**
- `scripts/__tests__/agent-tools.test.mjs` — ogni tool wrapper: input valido → shape output attesa, input malformato → errore pulito, mai una scrittura.
- `xlang_key` SQL ≡ JS (già nel piano Fase A).

**Livello 2 — eval agente (`promptfoo`, trigger manuale/notturno, NON per-PR perché costa):**
- `evals/agent/questions.yaml` — ~30 domande reali:
  - identificazione: "Charizard ex 199/165 Pokémon 151" → carta giusta
  - disambiguazione: "Pikachu" → chiede quale
  - onestà: carta senza dati → "non lo so", **0 prezzi inventati** (assert hard)
  - cross-lingua: "Charizard giapponese vs inglese" → 2 valutazioni distinte + spiegazione
  - fuori scope: "che tempo fa" → declina
- Matrice: Gemini Flash × Claude Haiku × `qwen2.5:14b` (Ollama) → report comparativo.
- Metriche: accuratezza identificazione (target ≥ 90%), **0 fabbricazioni prezzo** (bloccante), costo/query, tasso "resolved".

**Livello 3 — produzione:** `agent_queries.resolved` + campione settimanale rivisto a mano.

**Regola:** ogni run che tocca un modello costa denaro → gate manuale in CI, mai automatico su ogni push.

---

## 8. Cosa costruiamo noi vs cosa riusiamo OSS

| BUILD (first-party — è il valore difendibile) | REUSE OSS |
|---|---|
| I **tool** (`api/_lib/agent-tools.js`) — sottili, ma codificano il modello dati e le regole di onestà di DraGold | Vercel AI SDK (`ai`, `@ai-sdk/anthropic\|google\|openai-compatible`) — provider + loop |
| Il **system prompt** + guardrail (anti-allucinazione, scope, schema con provenienza obbligatoria) | `zod` — schema output/input |
| `card_versions` RPC (Fase A) | `promptfoo` — matrice eval |
| `agent_queries` schema + rate limiting + cost cap | `@xenova/transformers` / Ollama — embeddings (se §4) |
| Gli **eval fixtures** (~30 domande + risposte attese) | `pgroonga` — search JA-aware (Supabase-native) |
| Il componente UI "answer card" (riusa `ConfidenceBadge`, `portfolio-valuation.css`) | `node-html-parser` — già dep, scraping mirato |
| Il "cheapest completion path" solver (Prodotto B, deterministico) | `pgvector` — vector store (se §4), già su Supabase |
| Il prompt + few-shot per il Catalog Copilot (Prodotto C) | `scripts/lib/reconcile/*` — già esiste (classify-findings, identity-cascade, recovery) |

**Non costruire:** framework agenti, SDK provider, vector DB, eval framework, modello.

---

## 9. Licensing: codice vs dati

**Precondizione (oggi mancante): il repo è privato e senza licenza. "Genuinamente open source" richiede prima:**
1. Rendere il repo **pubblico**.
2. Aggiungere una **`LICENSE`** — raccomando **Apache-2.0** (come MIT ma con clausola brevetti esplicita e `NOTICE`, standard per progetti che possono scalare) o **AGPL-3.0** se si vuole che ogni fork ospitato ricontribuisca (più protettivo, ma frena adozione commerciale — sconsigliato se l'obiettivo è massima adozione).
3. Un **`LICENSING.md`** che distingue software e dati (sotto).

| Classe | Esempi in DraGold | Redistribuibile? | Licenza |
|---|---|---|---|
| **Software** | migrazioni, RPC, `scripts/`, `src/`, i tool AI, il system prompt | ✅ | Apache-2.0 (repo) |
| **Schema DB** | le migration in `supabase/migrations/` | ✅ | Apache-2.0 |
| **Dati curati first-party** | `data/cross-language/*` (set alias), futuri edge KG, note editoriali, contenuti Academy | ✅ | **CC0-1.0** (o CC-BY-SA) — dichiarata nel file |
| **Dati catalogo di terzi** | nomi/immagini carta da TCGdex, prezzi/immagini da TCGCSV, immagini Bandai | ❌ **non nostri da relicenziare** | Un fork esegue la propria sync (tutte fonti free/no-key). Il dump DB di DraGold **non** è "open data" per queste parti. |
| **Dati derivati** | `market_valuations`, `market_observations` (derivati da TCGCSV/TCGplayer market price) | 🟡 il **metodo** è aperto (il codice); i **valori** sono un derivato di una fonte commerciale | Pubblicare la metodologia + il codice; un bulk-dump di prezzi è zona grigia — non prometterlo come open data. |
| **Output AI** | risposte dell'agente | generati per-richiesta, non un dataset | — |

**Messaggio chiaro nel README:** *"Il software è open (Apache-2.0). Eseguirlo richiede di ottenere i dati catalogo dagli stessi upstream che usiamo noi — tutti gratuiti e senza API key. Le mappature curate che pubblichiamo sono CC0."*

---

## 10. Open source reale e self-hostable

**Regole non negoziabili (dal brief):**
- ❌ Nessun feature flag che chiude comportamento core dietro una license key.
- ❌ Nessuna "Pro edition", nessuna feature che scade, nessun AI Agent / KG proprietario.
- ✅ Agente, KG, valuation, search — tutto nel repo, tutto eseguibile da un fork.

**Deliverable per il self-host:**
- `docker-compose.yml`: Postgres 17 + pgroonga + le migration + `pgvector` opzionale.
- `.env.example` con i default che funzionano (provider = Ollama locale, o Gemini free tier).
- `SELF_HOSTING.md`: `supabase start` locale **oppure** Postgres + il frontend statico su qualsiasi host Node/Cloudflare + le funzioni serverless.
- Uno script `scripts/bootstrap-catalog.mjs` che esegue la prima sync (TCGdex + TCGCSV) — così un fork parte da zero con dati veri.

**Monetizzazione COSTRUITA INTORNO (non chiudendo il software):**
| Modello | Cosa vendi | Il software resta |
|---|---|---|
| **Hosting gestito** (dragold.org) | catalogo sempre fresco + free tier generoso + limiti più alti a pagamento. Vendi *l'operatività*, non il codice. | 100% open |
| **DraGold Cloud API** | endpoint agente/valuation gestito, pay-per-use. Vendi *la compute e la manutenzione*. | 100% open |
| **Data subscription** | un feed prezzi/mapping curato, verificato, sempre aggiornato (il *lavoro di curatela*). | 100% open |
| **Sponsorship / OpenCollective / GitHub Sponsors** | — | 100% open |
| **Supporto / consulenza / white-label** per chi vuole il proprio istanza | — | 100% open |

**Precedenti che lo fanno bene:** Supabase, Cal.com, PostHog, Plausible, Gitea/Forgejo — stesso codice per tutti, si paga hosting + supporto + servizi opzionali.

---

## 11. Costi e complessità operativa

| Voce | Costo | Complessità |
|---|---|---|
| Endpoint agente `/api/ask` | 1 funzione serverless. Vercel Pro $20/mo per 60s+ (o Fly.io/Railway self-host). | **Bassa** — 1 file + `agent-tools.js` |
| Inference (hosted, Gemini Flash) | ~$0,005/query. 1000 utenti × 5/gg ≈ $25/gg. Prompt caching −50-80% input. | Bassa |
| Inference (self-host Ollama) | elettricità + 1 box GPU | Media (gestione GPU) |
| Espansione fonti prezzo (Cardmarket + eBay-sold) | ~0 (free) | **Media** — 2 nuovi ingestor nel pattern esistente + riconciliare `refresh-prices` |
| pgroonga (search JA) | 0 (Supabase-native) | **Media** — 1 migration + reindex |
| Embeddings + pgvector (se §4) | one-time ~$0-20 + ~800MB storage | Media-alta — job batch + reindex |
| `agent_queries` + rate limiting | ~0 | Bassa |
| Eval (`promptfoo`, notturno) | ~$1-5/run (30 domande × 3 modelli) | Bassa |
| SearXNG self-host (web research) | 1 container | Media (opzionale) |

**Ordine di complessità crescente:** agente → `agent_queries` → fonti prezzo → pgroonga → embeddings → infra search/inference self-hosted.

---

## 12. Sicurezza, rate limiting, API keys

- **API key** (`ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / `DRAGOLD_LLM_BASE_URL`): solo env Vercel, mai nel client. Un fork usa la propria o punta a Ollama locale (nessuna key).
- **Endpoint agente:** tutti i tool read-only, JWT utente per i dati personali (RLS Supabase applicata), nessun tool che scrive.
- **Prompt injection:** i tool result (titoli annunci eBay, `raw` jsonb) sono **dati non fidati** → system prompt li tratta come dati, mai istruzioni; structured output limita la superficie.
- **Rate limiting:** counter `agent_queries` per-utente/giorno · edge middleware per-IP (anon) · kill-switch env globale · cap mensile per-utente.
- **Abuso di costo:** alert su spesa aggregata giornaliera oltre soglia.
- **Self-host:** il fork possiede chiavi, limiti, Supabase. Niente telemetria verso DraGold.
- Aggiungere `SECURITY.md`. L'hardening esistente (RLS ovunque, `search_path=''` sulle RPC, `x-internal-key` su `cache-image`) è già una buona base.

---

## 13. Parti dell'attuale DraGold riutilizzabili

| Componente esistente | Riuso per l'AI |
|---|---|
| `scripts/lib/valuation/valuation.js#computeValuation` + `confidence.js#computeConfidence` | il tool `card_valuation` legge `market_valuations` prodotta da questi |
| `scripts/lib/valuation/ebay-browse.js` (`buildBrowseQuery`, `parseBrowseResponse`, `summarizeListings`) | il tool `live_market` |
| `scripts/lib/valuation/obs-store.js` (`observationsForCards`, `cardIdsWithRecentObservations`) | il tool `price_history` |
| `src/lib/search.js` (`searchCards`, `rankSearchResults`, `groupByCanonical`) | il tool `card_search` |
| `src/pages/card/cardPageData.js` (pattern query) | il tool `card_lookup` |
| `api/live-market.js` + `api/_lib/ebay.js` (OAuth, `MARKETPLACE_MAP`) | `live_market` (fetch interno) |
| RPC `portfolio_valuations` / `portfolio_value_history` | tool `collection` / `price_history` |
| RPC `card_versions` (Fase A) + `set_identity_key` | tool `card_versions` |
| `market_valuations` / `market_observations` / `fx_rates` | i dati |
| `catalog_gaps` / `catalog_freshness_runs` | tool "questa carta è in catalogo / quando è uscita" |
| `src/pages/portfolio/ConfidenceBadge.jsx` + `PortfolioConfidence.jsx` + `portfolio-valuation.css` | il componente "answer card" |
| `src/lib/portfolio/*` (5 moduli puri: valuation, insights, history, confidence, unavailableReason) | **~70% del Prodotto B è già qui** |
| `scripts/lib/reconcile/*` (classify-findings, identity-cascade, recovery, fetch-tcgdex/optcg) | il Prodotto C (Catalog Copilot) |
| `.github/workflows/*` (pattern cron + artifact) | job batch embed / eval |
| cultura `node:test` (567 test) | eval agente livello 1 |

**Unica tabella genuinamente nuova per l'AI: `agent_queries`.**

---

## 14. Tre prodotti AI concreti

### Prodotto A — "Ask DraGold" (il card value assistant)

| | |
|---|---|
| **Problema** | "Quanto vale il mio X?" / "la JP vs la EN?" / "cosa sta salendo sotto €100?" — nessun tool risponde in linguaggio naturale con provenienza onesta. TCGplayer/Cardmarket sono cataloghi, non assistenti. |
| **Utente** | Ogni collezionista, in particolare EU (compra sia EN che JA). |
| **Input** | Domanda NL (+ auth opzionale per la collezione). |
| **Output** | "Answer card" strutturata: carta identificata · valore + range + confidence + as-of + fonti · trend 30d · azioni (aggiungi a portfolio, vedi su eBay, apri card page). Oppure un onesto "non ho abbastanza dati". |
| **Dati/tool DraGold** | `card_search`, `card_versions` (Fase A), `card_valuation`, `price_history`, `live_market`, `collection` — tutti esistenti o Fase A. |
| **OSS necessari** | Vercel AI SDK (`ai` + 1 `@ai-sdk/*`), `zod`, `promptfoo` (eval). |
| **Nuovo codice** | `/api/ask` (~150 righe) · `api/_lib/agent-tools.js` (~200 righe di wrapper) · `api/_lib/llm/index.js` (~40) · system prompt · migration `agent_queries` · `<AnswerCard>` (riusa componenti portfolio) · campo "Ask" in home · ~30 fixture eval. |
| **Difficoltà** | **Media.** Il rischio è l'identificazione carta — mitigato da `card_search` + `card_versions` deterministici. |
| **Tempo stimato** | **5–8 giorni.** |
| **Valore potenziale** | **Alto.** È la porta d'ingresso, il gancio di retention, ciò che rende DraGold "the AI intelligence layer for TCG collectors". |
| **Perché prodotto reale** | Differenziatore difendibile ("l'AI che non si inventa i prezzi" — l'onestà è codificata nei tool). L'ingresso conversazionale a un knowledge graph è genuinamente nuovo nei TCG. Monetizzabile via limiti hosted più alti **senza chiudere niente**. |

### Prodotto B — "Collection Intelligence" (report valutazione + insight)

| | |
|---|---|
| **Problema** | "Quanto vale tutta la mia collezione, cosa è cambiato, cosa mi conviene comprare per completare il set X?" — oggi manuale, nessun tool lo fa attraverso EN/JA con confidence onesta. |
| **Utente** | Collezionisti seri (100+ carte), completisti di set. |
| **Input** | La collezione dell'utente (tabella `collection` esistente) + opz. un set da completare. |
| **Output** | Valore totale EUR (breakdown per lingua/set) · mix di confidence · top movers · sezione "carte non ancora valutate" · **"percorso più economico per completare il set X"** (quali carte mancano, prezzo di mercato di ciascuna, totale) · snapshot condivisibile. **L'LLM genera solo la narrativa e il ragionamento "cosa comprare" su numeri deterministici — mai i numeri.** |
| **Dati/tool DraGold** | RPC `portfolio_valuations` (esiste) · `card_versions` (Fase A) · `set_search` / `set_progress` · `market_observations` (storico) · `catalog_gaps` (cosa esiste nel set) · **`src/lib/portfolio/*` fa già l'aggregazione**. |
| **OSS necessari** | Vercel AI SDK (solo per il riassunto narrativo). |
| **Nuovo codice** | `/api/collection-report` · il "cheapest completion path" solver (~100 righe, **deterministico**: ordina le carte mancanti per prezzo di mercato) · 1 chiamata LLM per il riassunto · UI report / export PDF. |
| **Difficoltà** | **Media.** Le parti difficili (valuation, aggregazione portfolio) sono **fatte** in `src/lib/portfolio/`. |
| **Tempo stimato** | **6–10 giorni.** |
| **Valore potenziale** | **Alto.** È il momento "wow" che converte un visitatore in utente ricorrente. Il "percorso più economico" è una feature genuinamente utile e nuova. |
| **Perché prodotto reale** | Valore ricorrente (il valore della collezione cambia). I completisti sono un segmento appassionato. Monetizzabile come "report mensile" hosted o refresh più frequente — il software resta aperto. |

### Prodotto C — "Catalog Copilot" (l'agente di data-quality per contributor)

| | |
|---|---|
| **Problema** | Il catalogo ha gap reali (9.306 carte senza canonical, `me4/me04`, link EN↔JA mancanti, `sets` rotta, illustrator testo libero). Sistemarli è lavoro manuale lento. `catalog_gaps` rileva gap *set/carta* ma non gap di *qualità*. |
| **Utente** | Manutentori DraGold + contributor open source (uno strumento interno/community — molto on-brand per "genuinamente open source"). |
| **Input** | Una carta / un set / una riga `catalog_gaps` / un diff DraGold ↔ upstream (TCGdex/TCGCSV). |
| **Output** | Una **proposta strutturata**: "il set JA SV6a sembra l'EN sv06.5 perché [evidenza]; ecco la riga `set-aliases.json` (`confidence: candidate`)" · "queste 40 carte dovrebbero condividere `canonical_card_id` X perché [set+numero]" · "'Kagemaru Himeno' e 'Himeno Kagemaru' sono la stessa persona". **Propone, non scrive mai** — output = diff rivedibile o riga `candidate`. |
| **Dati/tool DraGold** | `card_versions`, `set_identity_key`, `catalog_gaps`, **`scripts/lib/reconcile/*` (esiste)**, `cards`/`canonical_cards`, fetcher upstream (esistono). |
| **OSS necessari** | Vercel AI SDK · `scripts/lib/reconcile/*` · opz. `@xenova/transformers` `bge-m3` per similarità nomi · `promptfoo` (eval robusto). |
| **Nuovo codice** | `scripts/catalog-copilot.mjs` (batch, GitHub Actions) · prompt + few-shot per ogni tipo di proposta · output → righe `catalog_gaps` `candidate` o artifact JSON PR-shaped. |
| **Difficoltà** | **Media-Alta.** Il ragionamento è sfumato; serve un eval forte per non proporre spazzatura. |
| **Tempo stimato** | **10–15 giorni.** |
| **Valore potenziale** | **Medio-alto per il progetto** (accelera il lavoro di data-quality da cui dipende tutto il resto), **basso come valore utente diretto**. |
| **Perché prodotto reale** | Rende il progetto open source **davvero manutenibile da una community** — un contributor lo esegue, rivede le proposte, apre PR. È così che DraGold scala senza un team grosso. È anche un template che altri progetti TCG/catalogo vorrebbero. Non monetizzabile direttamente, ma è il moltiplicatore di forza. |

---

## 15. Classifica e raccomandazione

### 🥇 #1 — Prodotto A "Ask DraGold"

La porta d'ingresso. Il più piccolo. Prova la tesi ("l'AI onesta sui prezzi"). E **ogni altro prodotto riusa il suo `agent-tools.js` + `llm/index.js` + l'eval harness** — costruirlo per primo de-rischia tutto il resto. 5–8 giorni, riusa tutto, non chiude niente.

### 🥈 #2 — Prodotto B "Collection Intelligence"

Il valore di retention/conversione più alto, e **~70% è già in `src/lib/portfolio/`**. Trasforma i visitatori in utenti ricorrenti. Da fare per secondo, quando i tool di A esistono.

### 🥉 #3 — Prodotto C "Catalog Copilot"

Leva più alta per la **salute a lungo termine del progetto** e per la storia open-source/community, ma il più difficile da far bene (eval-heavy) e con valore indiretto. Da fare per terzo, quando l'harness di A e gli eval esistono su cui costruire.

### Raccomandazione netta

**Costruisci il Prodotto A per primo**, come l'MVP definito nell'audit AI-native, usando **Vercel AI SDK** come astrazione provider (Anthropic / Gemini / Ollama, un solo switch di config), con **`card_versions` (Fase A) come backbone di identità**.

Sequenza:
1. **Ora:** rendi il repo pubblico + `LICENSE` (Apache-2.0) + `LICENSING.md` (software vs dati). *Senza questo, "genuinamente open source" non è vero.*
2. **Fase A** (cross-language identity) — già pianificata, merge-abile da sola.
3. **Prodotto A** (5–8 gg) — dietro beta flag, misurato con `agent_queries`.
4. **Go/no-go** su dati reali → poi B (retention) o C (project health) secondo cosa emerge dall'uso.
5. **In parallelo, indipendente:** espansione fonti prezzo (Cardmarket + eBay-sold) per rompere il cap `confidence='medium'` — vale per A e B.

Tutto self-hostable, tutto provider-agnostic, tutto nel repo. La monetizzazione (hosting gestito, Cloud API, data subscription, sponsorship) si costruisce **intorno**, mai chiudendo il software.
