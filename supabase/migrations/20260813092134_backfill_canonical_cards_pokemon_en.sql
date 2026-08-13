-- 20260813092134_backfill_canonical_cards_pokemon_en.sql
--
-- Fix mirato: risolve la causa del tasso anomalo di cards.canonical_card_id NULL
-- riscontrato nell'era Sun & Moon (e in misura minore in altri set) per
-- tcg='pokemon' lang='en', trovata durante l'analisi di reconciliation
-- (vedi scripts/lib/reconcile/).
--
-- Causa (verificata via query read-only su produzione, 2026-08-13):
--   cards.canonical_card_id viene collegato a canonical_cards in modo
--   puramente passivo tramite la chiave (tcg, set_id, card_number) — vedi
--   l'unique index canonical_cards_group_uk in
--   20260809_knowledge_graph_schema_baseline.sql. Questo collegamento non e'
--   mai stato scritto da nessuno script di ingestion versionato in questo
--   repository (supabase/functions/bulk-import-pokemon/index.ts scrive righe
--   in `cards` ma non tocca mai canonical_cards). L'intera popolazione di
--   canonical_cards preesistente (43.215 righe pokemon) era stata creata in
--   un'unica operazione batch il 2026-08-05 (stesso created_at::date su tutte
--   le righe) — un backfill una tantum eseguito fuori da questo repository,
--   quindi non presente come file .sql versionato prima d'ora.
--
--   Verificato che 1.217 combinazioni distinte di (tcg, set_id, card_number)
--   non avevano ALCUNA riga canonical_cards, per nessuna lingua: quel
--   backfill non le aveva mai coperte. Di queste, 1.105 avevano un pari
--   cross-source (tcgdex+ptcg) con nome compatibile in 983 casi (differenze
--   solo di punteggiatura/simboli, es. "Lycanroc GX" vs "Lycanroc-GX") o
--   chiaramente diverso in 112 casi (es. "Empoleon" vs "Empoleon LV.X" —
--   carte diverse, MAI da unire); le restanti 122 erano a fonte singola.
--   Le restanti 2 combinazioni residue sono le collisioni same-source gia'
--   note (cel25c #15, zsv10pt5 #60, vedi Problem 1 del design doc).
--
-- Fix applicato: crea la riga canonical_cards mancante SOLO per i gruppi dove
-- il nome e' univoco o compatibile (stesso criterio di normalizzazione gia'
-- usato e testato in scripts/lib/reconcile/identity-cascade.js
-- #sameEntityNameSignal — lowercase + rimozione caratteri non alfanumerici —
-- replicato qui in SQL, NON una regola nuova). I gruppi con nomi chiaramente
-- diversi vengono deliberatamente ESCLUSI e restano NULL: unirli
-- richiederebbe una decisione di identity-matching (Pass S / name-signal
-- ampliato) non ancora autorizzata.
--
-- Scope: tcg='pokemon' AND lang='en' soltanto (unica lingua verificata in
-- questa analisi). Altre lingue potrebbero avere lo stesso gap, non toccate
-- qui — fuori perimetro di questo fix mirato.
--
-- Risultato verificato dopo applicazione (2026-08-13): canonical_card_id NULL
-- su cards (pokemon/en) sceso da 2.316 a 230 righe (era sm* passata da 1.152
-- a 0). Le 230 righe residue sono interamente le 114 combinazioni ambigue
-- (112 collisioni cross-source + 2 collisioni same-source), lasciate NULL
-- per design. Nessuna riga con canonical_card_id gia' non-null e' stata
-- toccata (nessuna regressione sui 594 CANONICAL_IDENTITY_SPLIT gia' noti,
-- es. svp-044/svp-44, verificati invariati).
--
-- Idempotente: ogni statement puo' essere rieseguito senza effetti collaterali
-- (NOT EXISTS / ON CONFLICT DO NOTHING / WHERE canonical_card_id IS NULL).

insert into public.canonical_cards (tcg, base_name, set_id, card_number)
select
  c.tcg,
  min(c.name) as base_name,
  c.set_id,
  c.card_number
from public.cards c
where c.tcg = 'pokemon'
  and c.lang = 'en'
  and c.canonical_card_id is null
  and c.set_id is not null
  and c.card_number is not null
  and c.name is not null
  and c.name <> ''
  and not exists (
    select 1 from public.canonical_cards cc
    where cc.tcg = c.tcg and cc.set_id = c.set_id and cc.card_number = c.card_number
  )
group by c.tcg, c.set_id, c.card_number
having count(distinct lower(regexp_replace(c.name, '[^a-zA-Z0-9]', '', 'g'))) = 1
on conflict (tcg, set_id, card_number) do nothing;

update public.cards c
set canonical_card_id = cc.id,
    updated_at = now()
from public.canonical_cards cc
where c.tcg = 'pokemon'
  and c.lang = 'en'
  and c.canonical_card_id is null
  and cc.tcg = c.tcg
  and cc.set_id = c.set_id
  and cc.card_number = c.card_number;
