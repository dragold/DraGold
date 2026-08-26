-- DraGold: card_number normalizzato per ricerca robusta alla formattazione.
--
-- Problema: la search (src/components/search/SearchView.jsx) cerca card code via
-- ilike su card_number con il token grezzo digitato dall'utente. Quando la
-- formattazione dell'utente non coincide esattamente con quella salvata (es. utente
-- digita "P159" o "P 159", il DB ha "P-159"), ilike '%p159%' non trova una substring
-- contigua e la card non emerge. Un pattern costruito lato client spezzando il token
-- in run alfabetiche/numeriche (wildcard tra le run) copre la maggior parte dei casi,
-- ma fallisce quando l'utente omette OGNI separatore in un codice che nel DB ha un
-- trattino tra due gruppi di sole cifre (es. utente digita "OP01001", DB ha
-- "OP01-001": lato client non c'è modo di sapere dove ricade quel trattino).
-- Bug generale di robustezza della ricerca, non specifico a One Piece o a P-159.
--
-- Fix: colonna generata `card_number_norm` = card_number senza separatori e in
-- minuscolo (stessa normalizzazione già usata lato client da src/lib/search.js#norm).
-- La search può quindi fare un semplice substring match ilike su una forma
-- compatta, senza dover indovinare dove ricadono i separatori nel valore originale
-- (P-159/P 159/P159/p-159 diventano tutte "p159", OP01-001/OP01 001/OP01001
-- diventano tutte "op01001"). Generico per qualsiasi TCG/formato di card_number,
-- nessuna logica specifica per set o gioco.
--
-- Indice trgm (pg_trgm già abilitato nel progetto, usato da similarity() nelle
-- migration 003/005) per rendere performante l'ilike '%...%' su questa colonna.

alter table public.cards
  add column if not exists card_number_norm text
  generated always as (lower(regexp_replace(coalesce(card_number, ''), '[^a-zA-Z0-9]', '', 'g'))) stored;

create index if not exists cards_card_number_norm_trgm_idx
  on public.cards using gin (card_number_norm gin_trgm_ops);
