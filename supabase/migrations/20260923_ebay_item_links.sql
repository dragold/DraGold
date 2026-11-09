-- 20260923_ebay_item_links.sql
-- Tabella per salvare item ID eBay associati alle carte (per link diretti).
-- Permette di generare link diretti agli item eBay specifici invece di link di ricerca.

create table if not exists public.card_ebay_items (
  id bigint generated always as identity primary key,
  card_id text not null references public.cards(id) on delete cascade,
  ebay_item_id text not null,           -- l'Item ID di eBay (16 cifre o simili)
  ebay_siteid text not null default '0', -- sito eBay (0=US, 77=DE, ecc.)
  found_at timestamptz default now(),
  last_verified timestamptz,
  price_snapshot numeric(10,2),          -- prezzo catturato al momento della scoperta
  currency text default 'EUR',
  constraint card_ebay_items_unique unique (card_id, ebay_item_id)
);

create index if not exists idx_card_ebay_items_card on public.card_ebay_items(card_id);
create index if not exists idx_card_ebay_items_item on public.card_ebay_items(ebay_item_id);

alter table public.card_ebay_items enable row level security;
create policy "card_ebay_items_public_read" on public.card_ebay_items for select using (true);

comment on table public.card_ebay_items is 'Item eBay associati alle carte per link diretti (affiliate)';

-- Funzione helper per ottenere il link eBay migliore per una carta.
-- Preferisce link diretto all'item se disponibile, altrimenti link di ricerca.
create or replace function public.get_ebay_link_for_card(
  p_card_id text,
  p_country text default 'IT',
  p_include_affiliate boolean default true
) returns text as $$
declare
  v_card record;
  v_ebay_item record;
  v_search_url text;
  v_item_url text;
  v_site record;
  v_mkcid text := '1';
  v_mkrid text := '724-53478-19255-0';  -- eBay Italia
  v_siteid text := '101';
  v_campaign_id text := '5339152703';     -- eBay Partner Network campaign
  v_tool_id text := '10001';
  v_market text;
begin
  -- 1. Prende la carta dal database
  select * into v_card
  from public.cards
  where id = p_card_id;

  if not found then
    return null;
  end if;

  -- 2. Determina il sito eBay in base al country
  case p_country
    when 'IT' then v_mkcid := '1'; v_mkrid := '724-53478-19255-0'; v_siteid := '101'; v_market := 'ebay.it';
    when 'DE' then v_mkcid := '1'; v_mkrid := '707-53477-19255-0'; v_siteid := '77';  v_market := 'ebay.de';
    when 'FR' then v_mkcid := '1'; v_mkrid := '709-53476-19255-0'; v_siteid := '71';  v_market := 'ebay.fr';
    when 'ES' then v_mkcid := '1'; v_mkrid := '1185-53479-19255-0'; v_siteid := '186'; v_market := 'ebay.es';
    when 'GB' then v_mkcid := '1'; v_mkrid := '710-53481-19255-0'; v_siteid := '3';   v_market := 'ebay.co.uk';
    when 'US' then v_mkcid := '1'; v_mkrid := '711-53200-19255-0'; v_siteid := '0';   v_market := 'ebay.com';
    else v_mkcid := '1'; v_mkrid := '724-53478-19255-0'; v_siteid := '101'; v_market := 'ebay.it';
  end case;

  -- 3. Controlla se esiste un item ID associato a questa carta
  select * into v_ebay_item
  from public.card_ebay_items
  where card_id = p_card_id
  order by last_verified desc nulls last, found_at desc
  limit 1;

  -- 4. Se esiste item ID, costruisci link diretto con affiliate params
  if v_ebay_item is not null and p_include_affiliate then
    v_item_url := format(
      'https://www.%s/itm/%s?mkcid=%s&mkrid=%s&siteid=%s&campid=%s&toolid=%s&mkevt=1',
      v_market, v_ebay_item.ebay_item_id, v_mkcid, v_mkrid, v_siteid, v_campaign_id, v_tool_id
    );
    return v_item_url;
  end if;

  -- 5. Se non c'è item ID, costruisci link di ricerca ottimizzato
  --    Keyword: nome carta + numero collezione + nome set + tipo TCG
  declare
    v_keyword text;
    v_cat text;
    v_tcg text := v_card.tcg;
    v_card_num text := nullif(v_card.card_number, '');
    v_set_name text := nullif(v_card.set_name, '');
    v_name text := v_card.name;
  begin
    -- TCG category per eBay
    case v_tcg
      when 'pokemon' then v_cat := '183454';
      when 'mtg' then v_cat := '183448';
      when 'ygo' then v_cat := '183468';
      when 'onepiece' then v_cat := '183454';  -- stessa categoria di pokemon
      else v_cat := '';
    end case;

    -- Costruisci keyword ottimizzata
    if v_card_num is not null and v_set_name is not null then
      v_keyword := format('%s %s %s %s', v_name, v_card_num, v_set_name,
        case v_tcg when 'mtg' then 'magic the gathering card'
              when 'ygo' then 'yugioh card'
              when 'onepiece' then 'one piece card game'
              else 'pokemon card' end);
    elsif v_card_num is not null then
      v_keyword := format('%s %s %s', v_name, v_card_num,
        case v_tcg when 'mtg' then 'magic the gathering card'
              when 'ygo' then 'yugioh card'
              when 'onepiece' then 'one piece card game'
              else 'pokemon card' end);
    elsif v_set_name is not null then
      v_keyword := format('%s %s %s', v_name, v_set_name,
        case v_tcg when 'mtg' then 'magic the gathering card'
              when 'ygo' then 'yugioh card'
              when 'onepiece' then 'one piece card game'
              else 'pokemon card' end);
    else
      v_keyword := format('%s %s', v_name,
        case v_tcg when 'mtg' then 'magic the gathering card'
              when 'ygo' then 'yugioh card'
              when 'onepiece' then 'one piece card game'
              else 'pokemon card' end);
    end if;

    if p_include_affiliate then
      v_search_url := format(
        'https://www.%s/sch/i.html?_nkw=%s&_sop=12&LH_BIN=1&mkcid=%s&mkrid=%s&siteid=%s&campid=%s&toolid=%s&mkevt=1',
        v_market, encodeURIComponent(v_keyword), v_mkcid, v_mkrid, v_siteid, v_campaign_id, v_tool_id
      );
    else
      v_search_url := format(
        'https://www.%s/sch/i.html?_nkw=%s&_sop=12&LH_BIN=1',
        v_market, encodeURIComponent(v_keyword)
      );
    end if;

    return v_search_url;
  end;
end;
$$ language plpgsql;

comment on function public.get_ebay_link_for_card is
  'Restituisce il link eBay migliore per una carta: preferisce link diretto all''item se disponibile, altrimenti link di ricerca ottimizzato con affiliate tracking';
