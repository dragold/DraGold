-- Dedup righe duplicate su 3 set Pokémon JA (sv10/sm10/sm12) — trovato durante
-- verifica fedeltà asset del 2026-09-02.
--
-- Causa: TCGdex restituisce l'id dello stesso set con casing diverso a seconda
-- dell'endpoint/lingua interrogato durante il sync (verificato dal vivo:
-- /en/sets restituisce "sv10", /ja/sets e /zh-cn/sets restituiscono "SV10").
-- Un sync ha scritto le carte JA sotto il set_id minuscolo (probabilmente
-- riusando la stessa casing dell'edizione EN), un altro sotto il set_id
-- maiuscolo (quello realmente restituito da TCGdex per l'edizione JA) —
-- risultato: la stessa carta esiste due volte con id diversi
-- (es. pokemon:tcgdex:sv10-001:ja E pokemon:tcgdex:SV10-001:ja).
--
-- Verificato prima di cancellare (2026-09-02):
--   - sm10: 116 minuscole == 116 maiuscole, overlap 116/116 (duplicati esatti).
--   - sm12: 117 minuscole == 117 maiuscole, overlap 117/117 (duplicati esatti).
--   - sv10: 132 minuscole vs 98 maiuscole, overlap 98/98 (le maiuscole sono un
--     sottoinsieme esatto delle minuscole per card_number — le minuscole hanno
--     34 carte extra, es. rare segrete, che il sync "maiuscolo" non aveva).
--   - card_image_cache: 0 riferimenti alle righe maiuscole.
--   - canonical_cards.primary_image_card_id: 0 riferimenti alle righe maiuscole.
--   - collection/alerts/watchlist: 0 righe utente reali puntano a nessuna delle
--     righe coinvolte (nessun rischio di rompere dati di collezione reali).
--
-- Si tengono le righe minuscole (coprono sempre un superset >= delle maiuscole)
-- e si cancellano le maiuscole dove esiste già una riga minuscola con lo stesso
-- card_number.

delete from public.cards a
where a.tcg = 'pokemon' and a.lang = 'ja' and a.set_id in ('SV10', 'SM10', 'SM12')
  and exists (
    select 1 from public.cards b
    where b.tcg = 'pokemon' and b.lang = 'ja'
      and b.set_id = lower(a.set_id)
      and b.card_number = a.card_number
  );
