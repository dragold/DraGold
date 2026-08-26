-- Alpha Core P0.1 fix (Preview E2E, commit 0843921): decrement_or_remove_collection
-- raised "ERROR 42702: column reference \"quantity\" is ambiguous" on every real
-- decrement of a card with quantity > 1 in the user's collection. Confirmed live
-- against this exact deployed function (reproduced with a scratch temp table
-- shaped like public.collection plus local vars named like the RETURNS TABLE
-- OUT params, then re-applied and re-verified end-to-end via a real insert ->
-- decrement (2->1) -> decrement/remove (1->deleted) cycle on project
-- pimwkmwrduqkaydyvxqz on 2026-08-25).
--
-- Root cause: the function's own RETURNS TABLE(id uuid, quantity integer,
-- out_deleted boolean) declares an OUT parameter named `quantity`. The
-- UPDATE ... SET quantity = quantity - 1 ... WHERE ... quantity > 1 body left
-- every reference to that identifier unqualified, so Postgres can't tell
-- whether it means the OUT parameter or public.collection.quantity.
-- add_or_increment_collection (same migration, 20260825084634) never hit
-- this: its SET target list doesn't need qualification (INSERT ... ON
-- CONFLICT DO UPDATE SET always resolves to the table) and its RHS was
-- already written as public.collection.quantity.
--
-- Fix: qualify every collection.* reference in the UPDATE/DELETE (WHERE,
-- RETURNING, and the SET right-hand side) with the table name, exactly like
-- the sibling RPC already does. No signature change, no behavior change
-- beyond removing the ambiguity error.
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
  set quantity = public.collection.quantity - 1
  where public.collection.user_id = v_user_id
    and public.collection.card_api_id = p_card_api_id
    and public.collection.quantity > 1
  returning public.collection.id, public.collection.quantity into v_id, v_quantity;

  if v_id is not null then
    return query select v_id, v_quantity, false;
    return;
  end if;

  delete from public.collection
  where public.collection.user_id = v_user_id
    and public.collection.card_api_id = p_card_api_id
  returning public.collection.id into v_id;

  if v_id is not null then
    return query select v_id, 0, true;
    return;
  end if;

  return;
end;
$function$;
