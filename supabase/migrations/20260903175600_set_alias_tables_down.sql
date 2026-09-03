drop trigger if exists set_alias_updated_at on public.set_alias;
drop trigger if exists card_number_alias_updated_at on public.card_number_alias;
drop trigger if exists set_alias_no_self_ref_trg on public.set_alias;
drop function if exists public.set_alias_no_self_ref();
drop table if exists public.card_number_alias;
drop table if exists public.set_alias;
