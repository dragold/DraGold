-- Card -> Collection journey: atomic decrement/remove companion to
-- add_or_increment_collection (that RPC was applied directly on Supabase
-- on 18/08/2026 — see src/supabase.js comment — but was never committed as
-- a migration; documented here as-is, idempotent, alongside its pair, so
-- schema stays reproducible per CLAUDE.md §9. Live signature/body verified
-- against Supabase (project pimwkmwrduqkaydyvxqz) on 2026-08-25.

CREATE OR REPLACE FUNCTION public.add_or_increment_collection(
  p_card_api_id text, p_tcg text, p_card_name text, p_set_name text,
  p_image_url text, p_card_number text DEFAULT NULL, p_rarity text DEFAULT NULL,
  p_language text DEFAULT NULL
)
RETURNS TABLE(id uuid, quantity integer, out_inserted boolean)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_id uuid;
  v_quantity int;
  v_inserted boolean;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  insert into public.collection (user_id, card_api_id, tcg, card_name, set_name, image_url, card_number, rarity, language, quantity)
  values (v_user_id, p_card_api_id, p_tcg, p_card_name, p_set_name, p_image_url, p_card_number, p_rarity, coalesce(p_language, 'EN'), 1)
  on conflict (user_id, card_api_id)
  do update set quantity = public.collection.quantity + 1
  returning collection.id, collection.quantity, (collection.quantity = 1) into v_id, v_quantity, v_inserted;

  return query select v_id, v_quantity, v_inserted;
end;
$function$;

-- Atomic decrement/remove. Mirrors add_or_increment_collection: single
-- query, no client-side SELECT->-1 race. quantity>1 => decrement by 1 (row
-- stays). quantity=1 => row deleted (out_deleted=true, quantity=0 returned
-- for UI). Row not found / not owned by caller => no rows returned (UI
-- treats as no-op). auth.uid() check + RLS ("collection_own", FOR ALL
-- USING auth.uid()=user_id) both scope every write to the caller.
CREATE OR REPLACE FUNCTION public.decrement_or_remove_collection(p_card_api_id text)
RETURNS TABLE(id uuid, quantity integer, out_deleted boolean)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_id uuid;
  v_quantity int;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  update public.collection
  set quantity = quantity - 1
  where user_id = v_user_id and card_api_id = p_card_api_id and quantity > 1
  returning collection.id, collection.quantity into v_id, v_quantity;

  if v_id is not null then
    return query select v_id, v_quantity, false;
    return;
  end if;

  delete from public.collection
  where user_id = v_user_id and card_api_id = p_card_api_id
  returning collection.id into v_id;

  if v_id is not null then
    return query select v_id, 0, true;
    return;
  end if;

  return;
end;
$function$;
