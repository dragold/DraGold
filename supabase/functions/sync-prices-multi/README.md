# Supabase Edge Function — sync-prices-multi

Sincronizza i prezzi delle carte da TCGdex (Pokemon) e optcg-api (One Piece)
nei campi price_market, price_currency e price_updated_at della tabella card_prices.

## Endpoint

POST /functions/v1/sync-prices-multi

## Body

```json
{
  "limit": 100,
  "offset": 0,
  "tcg": "pokemon" | "onepiece" | "yugioh" | "magic" | null (all)
}
```

## Response

```json
{
  "synced": 42,
  "updated": 12,
  "errors": 0,
  "next_offset": 142
}
```

## Frequenza consigliata

- Pokemon: ogni 6 ore (TCGdex update frequente, gratis)
- One Piece: ogni 12 ore (optcg-api update giornaliero)
- YGO: ogni 24 ore (existing refresh-prices)
- MTG: ogni 24 ore

## Rate limits

- TCGdex: 100 req/min gratis (verificare documentazione ufficiale)
- optcg-api: 1000 req/giorno gratis (verificare)
- Bulk: processare in batch di 100 carte per chiamata per non superare i limiti
