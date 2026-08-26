-- Phase 3 (Fase 1, priorita' alta su richiesta esplicita di Ermal): sblocca
-- hot_picks per One Piece. compute_hot_picks_today() aveva `where c.tcg = 'pokemon'`
-- hardcoded (commento originale: "start with Pokemon, extend later" — 003_search_v2_and_hotpicks.sql).
-- Verificato live il 26/08/2026: card_prices ha dati reali anche per onepiece (120 righe/48h,
-- 15 carte distinte) — sufficiente per calcolare delta reali, nessun dato inventato.
--
-- Rank cambia da globale (1..10 su tutto il set di carte) a per-tcg (1..N per ciascun tcg),
-- altrimenti Pokemon (piu' carte tracciate) monopolizzerebbe la classifica combinata.
-- L'indice unico su (computed_date, rank) va quindi allargato a (computed_date, tcg, rank),
-- altrimenti pokemon rank=1 e onepiece rank=1 nello stesso giorno collidono.

drop index if exists public.hot_picks_date_rank_idx;
create unique index if not exists hot_picks_date_tcg_rank_idx
  on public.hot_picks(computed_date, tcg, rank);

create or replace function public.compute_hot_picks_today() returns int
language plpgsql security definer as $$
declare
  inserted_count int := 0;
begin
  delete from public.hot_picks where computed_date = current_date;

  with latest_prices as (
    select distinct on (card_id) card_id, price_market as current_price, captured_at
    from public.card_prices
    where captured_at > now() - interval '30 hours'
      and price_market > 0
    order by card_id, captured_at desc
  ),
  prev_prices as (
    select distinct on (card_id) card_id, price_market as previous_price
    from public.card_prices
    where captured_at between now() - interval '48 hours' and now() - interval '20 hours'
      and price_market > 0
    order by card_id, captured_at desc
  ),
  deltas as (
    select l.card_id, l.current_price, p.previous_price,
      round(((l.current_price - p.previous_price) / p.previous_price * 100)::numeric, 2) as delta_pct
    from latest_prices l
    join prev_prices p using (card_id)
    where p.previous_price > 0 and abs(l.current_price - p.previous_price) > 0.01
  ),
  ranked as (
    select d.card_id, c.tcg, d.delta_pct, d.current_price, d.previous_price,
      row_number() over (partition by c.tcg order by abs(d.delta_pct) desc) as rnk
    from deltas d
    join public.cards c on c.id = d.card_id
    where c.tcg in ('pokemon', 'onepiece')  -- Phase 3: esteso da solo 'pokemon'. MTG/YGO restano
                                             -- fuori per priorita' di prodotto (CLAUDE.md SS1),
                                             -- non per limite tecnico di questa query.
  )
  insert into public.hot_picks (rank, card_id, tcg, delta_pct, current_price, previous_price, reason)
  select rnk, card_id, tcg, delta_pct, current_price, previous_price,
    case when delta_pct > 0 then 'Trending up · ' || delta_pct::text || '% in 24h'
         else 'Sliding · ' || delta_pct::text || '% in 24h' end
  from ranked where rnk <= 10;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;
