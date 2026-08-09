# CLAUDE.md — DraGold

Manuale operativo per agenti AI che lavorano su questo repository.
Non è documentazione di prodotto (→ PRODUCT_SPEC.md) né stato storico (→ git log / CodeGraph).

## 0. Gerarchia delle fonti

1. Istruzioni esplicite di Ermal nel task corrente.
2. PRODUCT_SPEC.md — visione e specifiche di prodotto.
3. Codice reale / repository — stato tecnico effettivo.
4. Questo file — regole operative e vincoli architetturali.

Numeri, conteggi, date, audit e descrizioni di stato non sono verità permanenti.
Se un dato è verificabile da repo/DB/CodeGraph, verificalo invece di fidarti di quanto scritto qui.
Se CLAUDE.md e il codice/DB reale divergono, segnala la contraddizione — non dare per buona questa pagina.

## 1. Direzione prodotto

DraGold = TCG Knowledge Graph + Academy + Collection Layer. Non un price tracker finanziario:
pricing, alert e portfolio avanzato sono moduli Future/Archived (PRODUCT_SPEC §5-6), non il core.

Priorità TCG: Pokémon → One Piece → MTG/Yu-Gi-Oh (solo architettura, zero lavoro attivo).
Priorità lingue: EN, JA.

Prima di ogni nuovo task: "questo aumenta il valore del knowledge graph, dell'Academy, della
Collection, o la capacità di scalare l'architettura?" Se la risposta riguarda solo
pricing/portfolio/alert avanzati, non proporlo autonomamente come priorità — procedi solo
quando Ermal lo richiede esplicitamente.

Dettagli di prodotto (entità del grafo, MVP Academy, moduli archiviati): PRODUCT_SPEC.md, non qui.

## 2. Workflow

Repository locale → agente AI / CodeGraph → verifica → Git → GitHub → Vercel.

- Il repository locale è l'ambiente di lavoro; GitHub è il remoto versionato.
- Prima di modifiche importanti: `git status`, sincronizza con `origin` se necessario.
- Cambi rischiosi: branch dedicato → implementazione → build/verifica locale → push →
  Vercel preview deployment → controllo → merge su main.
- Build: Vite (`npm run build`). `build-esbuild.mjs` è legacy, non usato in produzione.

## 3. CodeGraph

Il progetto è indicizzato con CodeGraph. Privilegialo per: dove è definito un simbolo, come
fluisce una dipendenza, caller/callee, impatto architetturale di una modifica, struttura del
repo. Ricerca testuale/grep resta valida quando è lo strumento più appropriato per il caso
specifico. La regola che conta: non fidarti delle descrizioni statiche di questo file quando
il repository può darti la risposta direttamente.

## 4. Ricerca prima di costruire

Prima di progettare/implementare una feature o tecnologia significativa: ricerca web aggiornata
→ ricerca soluzioni open source/GitHub esistenti → valutazione (qualità, manutenzione, licenza,
uso commerciale) → progettazione → implementazione. Non reinventare ciò che si può riusare o
adattare meglio. Vale soprattutto per librerie, API, dataset, modelli, componenti, infrastrutture.

## 5. Architettura — vincoli fissi

- JavaScript, non TypeScript (per ora).
- React + Vite. Niente Redux/Zustand, niente nuovi build tool senza decisione esplicita.
- Modularizzazione progressiva per dominio (`src/components/<dominio>/`, `src/lib/`,
  `src/pages/<entità>/`).
- Nuove pagine → `src/pages/<entità>/`, mai dentro `DraGold.jsx`.
- Nuove feature non vanno aggiunte direttamente in `DraGold.jsx`: deve evolvere verso
  orchestratore (stato globale, composizione), non tornare contenitore monolitico.
- `DraGold.legacy.jsx` non si tocca senza motivo esplicito.

## 6. Stato condiviso (Shared State Rule)

Stato condiviso persistente/cache/singleton → `src/lib/state.js` (o il futuro livello
orchestratore). I componenti di dominio non importano `lib/state.js` direttamente quando
possono ricevere stato e callback via props. Non spostare costanti statiche per estetica —
solo per una responsabilità architetturale chiara.

## 7. UX / Design

"Minimal" non significa statico. Direzione: premium, moderna, distintiva, esplorabile.
Animazioni, transizioni, micro-interazioni e feedback visivi sono incoraggiati quando
migliorano comprensione, qualità percepita, scoperta, engagement o senso di progressione.
Evitare motion puramente decorativo.

## 8. Verifica prima di dichiarare completo un task

- Rileggi il diff.
- Verifica import/export e dipendenze (CodeGraph aiuta qui).
- Esegui build/test appropriati.
- Controlla regressioni sui flussi toccati.
- Cambi rischiosi → verifica su Vercel preview prima del merge.
- Il codice che "sembra corretto" non è un lavoro concluso senza verifica.
- Se uno strumento di verifica non è disponibile, non aggirare il problema fingendo una
  verifica equivalente; usa gli strumenti disponibili e dichiara chiaramente cosa è stato e
  non è stato verificato.

## 9. Database / dati

Non inventare lo stato dello schema. Se il codice usa una colonna/entità non presente nelle
migration versionate in `supabase/migrations/`, non presentarla come schema riproducibile senza
qualifica — segnala il gap e proponi un task dedicato, non risolverlo di riflesso durante un
task diverso. Per numeri reali (righe tabelle, % errori sorgenti, ecc.) verifica su Supabase
diretto; se li riporti in una risposta, indica sempre la data della verifica.

## 10. Cosa non documentare qui

Changelog di fase, commit hash, PR storiche, conteggi righe file, elenchi di config leggibili
dal codice (costanti, PLANS, TCG_LIST, ecc.), audit lunghi, dettagli statici non operativi
(es. asset PWA). Se un'informazione serve ma è volatile, scrivi come verificarla, non il suo
valore congelato nel tempo.

## 11. Documentazione

Se trovi documentazione obsoleta o contraddittoria durante un task, segnalala. Non aggiornare
automaticamente CLAUDE.md o PRODUCT_SPEC.md salvo richiesta esplicita o task dedicato.

## Link operativi

- App: https://dragold.org · GitHub: https://github.com/dragold/DraGold
- Vercel: https://vercel.com/dra-gold-s-projects
- Supabase: https://supabase.com/dashboard/project/pimwkmwrduqkaydyvxqz
