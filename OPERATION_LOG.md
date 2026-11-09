# Opera in corso, autorizzazione: esecuzione autonoma

## Stato attuale
- Work in corso: Error Boundary globale + alt text + console.error fix — ROUND 1
- Branch: main
- Commit corrente: fd1ba18 "feat: prepare DraGold for GitHub community — license, docs, security fix"

## Piano
1. Round 1: Error Boundary globale (ErrorBoundary.jsx + main.jsx), alt text su tutte le <img>, console.error fix
2. Round 2: WebGL cleanup, legacy refactoring, script tests
3. Round 3: API docs

## Regole
- Non toccare: database, dati produzione, catalogo, SetPage, home page, package.json, package-lock.json
- Non fare history rewrite
- Non commettere automaticamente — l'utente decide su commit/push
- Mantenere working tree pulito, commmit per commit
