-- 20260917_mvp_set_logos_and_counts.sql
-- Popola/aggiorna set_logos per i 6 set MVP.
-- Idempotente: usa INSERT ... ON CONFLICT e UPDATE con guardie.

-- OP-01: Romance Dawn — set_logos MISSING, crea da dati ufficiali + cards nel DB
INSERT INTO public.set_logos (tcg, set_code, set_name, logo_url, symbol_url, release_date, source, retrieved_at)
VALUES ('onepiece', 'OP-01', 'Romance Dawn', 'https://en.onepiece-cardgame.com/images/cardlist/set/OP-01.png', 'https://en.onepiece-cardgame.com/images/cardlist/set/OP-01.png', '2022-09-16', 'onepiece-cardgame.com', now())
ON CONFLICT (tcg, set_code) DO NOTHING;

-- OP-02: Paramount War — set_logos MISSING, crea da dati ufficiali + cards nel DB
INSERT INTO public.set_logos (tcg, set_code, set_name, logo_url, symbol_url, release_date, source, retrieved_at)
VALUES ('onepiece', 'OP-02', 'Paramount War', 'https://en.onepiece-cardgame.com/images/cardlist/set/OP-02.png', 'https://en.onepiece-cardgame.com/images/cardlist/set/OP-02.png', '2023-02-25', 'onepiece-cardgame.com', now())
ON CONFLICT (tcg, set_code) DO NOTHING;

-- SV07: aggiorna card_count da 142 a 175 (TCGdex VERIFIED)
UPDATE public.set_logos
SET card_count = 175, updated_at = now()
WHERE tcg = 'pokemon' AND set_code = 'sv07' AND (card_count IS NULL OR card_count <> 175);

-- SV08: aggiorna card_count da 191 a 252 (TCGdex VERIFIED)
UPDATE public.set_logos
SET card_count = 252, updated_at = now()
WHERE tcg = 'pokemon' AND set_code = 'sv08' AND (card_count IS NULL OR card_count <> 252);

-- EB-01: aggiorna card_count (calcolato dai cards nel DB) + logo
UPDATE public.set_logos
SET card_count = (SELECT count(*) FROM public.cards WHERE set_id = 'EB-01'),
    logo_url = 'https://en.onepiece-cardgame.com/images/cardlist/set/EB-01.png',
    updated_at = now()
WHERE tcg = 'onepiece' AND set_code = 'EB-01';

-- EB-02: aggiorna card_count (calcolato dai cards nel DB) + logo
UPDATE public.set_logos
SET card_count = (SELECT count(*) FROM public.cards WHERE set_id = 'EB-02'),
    logo_url = 'https://en.onepiece-cardgame.com/images/cardlist/set/EB-02.png',
    updated_at = now()
WHERE tcg = 'onepiece' AND set_code = 'EB-02';
