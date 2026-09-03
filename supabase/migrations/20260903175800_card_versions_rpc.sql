-- Cross-Language Identity (Fase A) — M3: xlang_key + card_versions RPCs.
-- security invoker, search_path='', read-only, grant to anon+authenticated.
-- Spec: docs/plans/2026-09-03-cross-language-identity-spec.md §4
-- DOWN: 20260903175800_card_versions_rpc_down.sql
--
-- card_versions is plpgsql (not sql) + `set plan_cache_mode = force_custom_plan`:
-- a `language sql` function with `set search_path` cannot be inlined, and the
-- resulting generic plan seq-scanned cards (~1s). plpgsql + forced custom plan
-- re-plans per call with the resolved key parts bound, so the functional index
-- on set_identity_key(set_id) is used (~25-95ms).
--
-- CROSS-LANGUAGE SAFETY: set_identity_key collapses zero-padding ('sv08' -> 'sv8'),
-- which is correct for spelling variants WITHIN one region (tcgdex 'sv03.5' vs
-- ptcg 'sv3pt5') but NOT across regions: JA 'SV8' also collapses to 'sv8' yet is a
-- different set from EN 'sv08'. So a bare spelling-collapse match (link_basis
-- 'same_concept') is kept ONLY for rows whose language is already anchored in the
-- concept — the language of a self/same_canonical/alias row, or of a row in the
-- queried set itself. Crossing a language boundary requires self, same_canonical,
-- or a curated set_alias / card_number_alias. "In dubbio -> nessun link."

create or replace function public.xlang_key(p_tcg text, p_set_id text, p_card_number text)
returns text language sql stable set search_path = '' as $$
  with num_alias as (
    select canonical_set_id, canonical_card_number
    from public.card_number_alias
    where tcg = p_tcg and alias_set_id = p_set_id
      and regexp_replace(lower(alias_card_number),'[^a-z0-9]','','g')
        = regexp_replace(lower(coalesce(p_card_number,'')),'[^a-z0-9]','','g')
      and confidence = 'confirmed'
    limit 1
  ),
  set_equiv as (
    select canonical_set_id from public.set_alias
    where tcg = p_tcg and alias_set_id = p_set_id
      and confidence = 'confirmed' and relation = 'equivalent'
    limit 1
  )
  select lower(coalesce(p_tcg,'')) || ':'
    || public.set_identity_key(coalesce(
         (select canonical_set_id from num_alias),
         (select canonical_set_id from set_equiv),
         p_set_id))
    || ':'
    || regexp_replace(
         coalesce(
           (select regexp_replace(lower(canonical_card_number),'[^a-z0-9]','','g') from num_alias),
           regexp_replace(lower(coalesce(p_card_number,'')),'[^a-z0-9]','','g')),
         '^0+([0-9])', '\1');
$$;

drop function if exists public.card_versions(text,uuid,text,text,text,boolean);

create function public.card_versions(
  p_card_id           text  default null,
  p_canonical_card_id uuid  default null,
  p_tcg               text  default null,
  p_set_id            text  default null,
  p_card_number       text  default null,
  p_include_self      boolean default true
)
returns table (
  card_id text, canonical_card_id uuid, slug text,
  tcg text, lang text, set_id text, set_name text, card_number text,
  name text, name_en text, rarity text, print_variant text,
  image_url text, is_query_row boolean, link_basis text,
  link_confidence text, alias_note text, xlang_key text
)
language plpgsql stable security invoker
set search_path = ''
set plan_cache_mode = 'force_custom_plan'
as $$
declare
  v_tcg text; v_set text; v_num text;
  v_k text; v_kset text; v_knum text;
  v_ids text[]; v_canons uuid[];
  v_has_active_alias boolean;
  v_has_active_xlink boolean;
  v_alias_note text;
begin
  with seed as (
    select c.tcg, c.set_id, c.card_number, c.id as scid, c.canonical_card_id as scanon
    from public.cards c where p_card_id is not null and c.id = p_card_id
    union all
    select c.tcg, c.set_id, c.card_number, c.id, c.canonical_card_id
    from public.cards c where p_card_id is null and p_canonical_card_id is not null and c.canonical_card_id = p_canonical_card_id
    union all
    select p_tcg, p_set_id, p_card_number, null::text, null::uuid
    where p_card_id is null and p_canonical_card_id is null
      and p_tcg is not null and p_set_id is not null and p_card_number is not null
  )
  select array_agg(distinct scid) filter (where scid is not null),
         array_agg(distinct scanon) filter (where scanon is not null),
         max(seed.tcg), max(seed.set_id), max(seed.card_number)
    into v_ids, v_canons, v_tcg, v_set, v_num
  from seed;

  if v_tcg is null then return; end if;

  v_k := public.xlang_key(v_tcg, v_set, v_num);
  v_kset := split_part(v_k, ':', 2);
  v_knum := split_part(v_k, ':', 3);
  v_ids := coalesce(v_ids, array[]::text[]);
  v_canons := coalesce(v_canons, array[]::uuid[]);

  select exists (
    select 1 from public.set_alias sa
    where sa.tcg = v_tcg and sa.confidence='confirmed' and sa.relation='equivalent'
      and public.set_identity_key(sa.canonical_set_id) = v_kset
  ),
  (select sa.note from public.set_alias sa
   where sa.tcg = v_tcg and sa.confidence='confirmed' and sa.relation='equivalent'
     and public.set_identity_key(sa.canonical_set_id) = v_kset
   order by length(coalesce(sa.note,'')) desc limit 1)
  into v_has_active_alias, v_alias_note;

  -- an active curated cross-language bridge (set_alias equivalent OR card_number_alias)
  -- anchors the reference-region languages so their spelling-variant rows survive.
  v_has_active_xlink := v_has_active_alias or exists (
    select 1 from public.card_number_alias cna
    where cna.tcg = v_tcg and cna.confidence = 'confirmed'
      and public.set_identity_key(cna.canonical_set_id) = v_kset
  );

  return query
  with cand_sets as (
    select c.set_id from public.cards c
      where c.tcg = v_tcg and public.set_identity_key(c.set_id) = v_kset
      group by c.set_id
    union
    select sa.alias_set_id from public.set_alias sa
      where sa.tcg = v_tcg and sa.confidence='confirmed' and sa.relation='equivalent'
        and public.set_identity_key(sa.canonical_set_id) = v_kset
    union
    select sa.canonical_set_id from public.set_alias sa
      where sa.tcg = v_tcg and sa.confidence='confirmed' and sa.relation='equivalent'
        and sa.alias_set_id = v_set
  ),
  matched0 as (
    select c.* from public.cards c
      where c.tcg = v_tcg
        and c.set_id in (select cs.set_id from cand_sets cs)
        and regexp_replace(c.card_number_norm, '^0+([0-9])', '\1') = v_knum
        and not exists (
          select 1 from public.card_number_alias cna
          where cna.tcg = c.tcg and cna.alias_set_id = c.set_id and cna.confidence='confirmed'
            and regexp_replace(lower(cna.alias_card_number),'[^a-z0-9]','','g')
              = regexp_replace(lower(c.card_number),'[^a-z0-9]','','g'))
    union
    select c.* from public.cards c
      join public.card_number_alias cna
        on cna.tcg = c.tcg and cna.alias_set_id = c.set_id and cna.confidence='confirmed'
       and regexp_replace(lower(cna.alias_card_number),'[^a-z0-9]','','g')
         = regexp_replace(lower(c.card_number),'[^a-z0-9]','','g')
      where c.tcg = v_tcg and public.xlang_key(c.tcg, c.set_id, c.card_number) = v_k
  ),
  classified as (
    select m.*,
      case
        when m.id = any(v_ids) then 'self'
        when m.canonical_card_id is not null and m.canonical_card_id = any(v_canons) then 'same_canonical'
        when exists (select 1 from public.card_number_alias cna
                     where cna.tcg=m.tcg and cna.alias_set_id=m.set_id and cna.confidence='confirmed'
                       and regexp_replace(lower(cna.alias_card_number),'[^a-z0-9]','','g')
                         = regexp_replace(lower(m.card_number),'[^a-z0-9]','','g')) then 'number_alias'
        when exists (select 1 from public.set_alias sa
                     where sa.tcg=m.tcg and sa.alias_set_id=m.set_id
                       and sa.confidence='confirmed' and sa.relation='equivalent') then 'set_alias'
        when v_has_active_alias and public.set_identity_key(m.set_id) = v_kset then 'set_alias'
        else 'same_concept'
      end as lb
    from matched0 m
  ),
  anchor_langs as (
    select array(
      select distinct cl.lang from classified cl where cl.lb <> 'same_concept'
      union
      select distinct c.lang from public.cards c where c.tcg = v_tcg and c.set_id = v_set
      union
      select distinct c.lang from public.cards c
        where v_has_active_xlink and c.tcg = v_tcg and public.set_identity_key(c.set_id) = v_kset
    ) as langs
  )
  select
    m.id,
    m.canonical_card_id,
    cc.slug,
    m.tcg, m.lang, m.set_id, m.set_name, m.card_number,
    m.name, m.name_en, m.rarity, m.print_variant,
    coalesce(m.image_url_hi, m.image_url),
    (m.id = any(v_ids)
      or (m.canonical_card_id is not null and m.canonical_card_id = any(v_canons))),
    m.lb,
    case when m.lb in ('self','same_canonical') then 'exact' else 'confirmed' end,
    case
      when m.lb = 'number_alias' then
        (select cna.note from public.card_number_alias cna
         where cna.tcg=m.tcg and cna.alias_set_id=m.set_id and cna.confidence='confirmed'
           and regexp_replace(lower(cna.alias_card_number),'[^a-z0-9]','','g')
             = regexp_replace(lower(m.card_number),'[^a-z0-9]','','g') limit 1)
      when m.lb = 'set_alias' then
        coalesce(
          (select sa.note from public.set_alias sa
           where sa.tcg=m.tcg and sa.alias_set_id=m.set_id
             and sa.confidence='confirmed' and sa.relation='equivalent' limit 1),
          v_alias_note)
      else null
    end,
    v_k
  from classified m
  cross join anchor_langs al
  left join public.canonical_cards cc on cc.id = m.canonical_card_id
  where (p_include_self or not (m.id = any(v_ids)))
    and (m.lb <> 'same_concept' or m.lang = any(al.langs))
  order by case m.lang when 'en' then 1 when 'ja' then 2 else 3 end, m.lang, m.card_number, m.id
  limit 200;
end $$;

revoke all on function public.xlang_key(text,text,text) from public;
grant execute on function public.xlang_key(text,text,text) to anon, authenticated;
revoke all on function public.card_versions(text,uuid,text,text,text,boolean) from public;
grant execute on function public.card_versions(text,uuid,text,text,text,boolean) to anon, authenticated;

create or replace function public.card_versions_batch(p_queries jsonb)
returns table (
  query_idx int, card_id text, canonical_card_id uuid, slug text,
  tcg text, lang text, set_id text, set_name text, card_number text,
  name text, name_en text, rarity text, print_variant text,
  image_url text, is_query_row boolean, link_basis text,
  link_confidence text, alias_note text, xlang_key text
)
language sql stable security invoker set search_path = '' as $$
  select (q.idx - 1)::int as query_idx, v.*
  from jsonb_array_elements(coalesce(p_queries,'[]'::jsonb)) with ordinality as q(elem, idx)
  cross join lateral public.card_versions(
    p_tcg => q.elem->>'tcg',
    p_set_id => q.elem->>'set_id',
    p_card_number => q.elem->>'card_number'
  ) v
  where q.idx <= 200;
$$;

revoke all on function public.card_versions_batch(jsonb) from public;
grant execute on function public.card_versions_batch(jsonb) to anon, authenticated;
