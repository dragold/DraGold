import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getServiceClient } from '../_shared/fetch-with-log.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export async function handleRequest(req) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { limit = 20, offset = 0, tcg: tcgFilter } = await req.json()

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  // Documentazione: questa funzione usa SERVICE_ROLE_KEY perché deve scrivere
  // su card_prices, che ha RLS abilitata con policy SELECT-only per anon_key.
  // Tutte le funzioni del progetto che scrivono su card_prices usano lo stesso pattern
  // (getServiceClient() da _shared/fetch-with-log.ts, oppure client con
  // SUPABASE_SERVICE_ROLE_KEY diretto).
  //
  // Se il secret non è configurato nella funzione Supabase, la funzione fallirà
  // all'insert con errore RLS. Configurazione necessaria:
  // Supabase Dashboard → Edge Functions → sync-prices-multi → Settings → Secrets
  //   SUPABASE_SERVICE_ROLE_KEY = <service role key>
  //
  // Alternativa: importare getServiceClient da ../_shared/fetch-with-log.ts
  // che gestisce già SERVICE_ROLE_KEY in modo centralizzato.

  // Magic non implementato — escluso dal loop.
  const tcgs = tcgFilter
    ? [tcgFilter === 'yugioh' ? 'ygo' : tcgFilter]
    : ['pokemon', 'onepiece', 'ygo']

  let totalSynced = 0
  let totalSkipped = 0
  let totalErrors = 0
  let nextOffset = offset

  for (const tcg of tcgs) {
    const { data: cards, error: cardsError } = await supabase
      .from('cards')
      .select('id, tcg, name, lang, set_id, card_number, source_id')
      .eq('tcg', tcg)
      .order('id')
      .range(offset, offset + limit - 1)

    if (cardsError) {
      totalErrors++
      console.error(`[sync-prices-multi] Error fetching cards for ${tcg}:`, cardsError)
      continue
    }

    if (!cards || cards.length === 0) {
      console.log(`[sync-prices-multi] No cards to sync for ${tcg} at offset ${offset}`)
      continue
    }

    console.log(`[sync-prices-multi] Processing ${cards.length} cards for ${tcg} (offset ${offset})`)

    for (const card of cards) {
      try {
        // FIX: controllo preventivo — se esiste un prezzo recente con fonte
        // affidabile (entro 7 giorni), non sovrascrivere con dati gratuiti.
        const hasReliablePrice = await hasRecentReliablePrice(supabase, card.id)
        if (hasReliablePrice) {
          totalSkipped++
          continue
        }

        let priceData

        if (tcg === 'pokemon') {
          priceData = await fetchPokemonPrice(card)
        } else if (tcg === 'onepiece') {
          priceData = await fetchOnePiecePrice(card)
        } else if (tcg === 'ygo' || tcg === 'yugioh') {
          priceData = await fetchYugiohPrice(card)
        } else {
          continue
        }

        if (!priceData) {
          console.log(`[sync-prices-multi] No price found for ${card.tcg}-${card.set_id}-${card.card_number}`)
          continue
        }

        // FIX: verifica se questa fonte è già stata scritta per questa carta.
        const existing = await supabase
          .from('card_prices')
          .select('id')
          .eq('card_id', card.id)
          .eq('source', priceData.source)
          .maybeSingle()

        if (existing) {
          console.log(`[sync-prices-multi] Skip ${card.id}/${priceData.source} — fonte già presente`)
          continue
        }

        // FIX: campi corretti per lo schema reale (002_data_architecture.sql):
        //   source, currency, price_market, raw_response, captured_at.
        const { error: insertError } = await supabase.from('card_prices').insert({
          card_id: card.id,
          source: priceData.source,
          currency: priceData.currency,
          price_market: priceData.market,
          raw_response: JSON.stringify({
            artifactId: `${card.set_id}-${card.card_number}`,
            fetchedAt: new Date().toISOString(),
          }),
          captured_at: new Date().toISOString(),
        })

        if (insertError) {
          if (insertError.message?.includes?.('duplicate')) {
            console.log(`[sync-prices-multi] Duplicate skip ${card.id}/${priceData.source}`)
            continue
          }
          console.error(`[sync-prices-multi] Error inserting ${card.id}:`, insertError)
          totalErrors++
          continue
        }

        totalSynced++
      } catch (err) {
        console.error(`[sync-prices-multi] Error processing card ${card.id}:`, err)
        totalErrors++
      }
    }

    nextOffset += cards.length
  }

  return new Response(JSON.stringify({
    synced: totalSynced,
    skipped: totalSkipped,
    errors: totalErrors,
    next_offset: nextOffset,
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function fetchPokemonPrice(card) {
  // TCGdex API: https://api.tcgdex.net/v2/{lang}/cards/{sourceId}
  // Il sourceId è il terzo segmento del card_id (dopo le prime due ':')
  // Esempio: pokemon:tcgdex:xy12-12 -> sourceId = xy12-12
  const parts = card.id.split(':')
  if (parts.length < 3) {
    console.log(`[sync-prices-multi] Card ID malformed: ${card.id}`)
    return null
  }
  const sourceId = parts[2]
  const lang = card.lang || 'en'
  const url = `https://api.tcgdex.net/v2/${lang}/cards/${encodeURIComponent(sourceId)}`

  try {
    const response = await fetchWithRetry(
      url,
      { headers: { 'Accept': 'application/json' } }
    )

    if (!response.ok) {
      console.log(`[sync-prices-multi] TCGdex non trovato per ${sourceId}: ${response.status}`)
      return null
    }

    const cardData = await response.json()

    // TCGdex include pricing.cardmarket (EUR) e pricing.tcgplayer (USD)
    if (cardData.pricing?.cardmarket?.avg) {
      return { market: cardData.pricing.cardmarket.avg, currency: 'EUR', source: 'tcgdex-cardmarket' }
    }

    if (cardData.pricing?.tcgplayer?.normal?.marketPrice) {
      return { market: cardData.pricing.tcgplayer.normal.marketPrice, currency: 'USD', source: 'tcgdex-tcgplayer' }
    }

    // Fallback: prendere il più basso tra i due
    const cardmarketPrice = cardData.pricing?.cardmarket?.avg
    const tcgplayerPrice = cardData.pricing?.tcgplayer?.normal?.marketPrice

    if (cardmarketPrice || tcgplayerPrice) {
      return {
        market: cardmarketPrice || tcgplayerPrice,
        currency: cardmarketPrice ? 'EUR' : 'USD',
        source: cardmarketPrice ? 'tcgdex-cardmarket' : 'tcgdex-tcgplayer',
      }
    }

    return null
  } catch (err) {
    console.error(`[sync-prices-multi] Error fetching TCGdex for ${sourceId}:`, err)
    return null
  }
}

async function fetchOnePiecePrice(card) {
  // optcg-api: https://api.optcgapi.com/cards/{cardId}
  // Il cardId è set_id-card_number (es. OP01-001)
  const cardId = `${card.set_id}-${card.card_number}`

  try {
    const response = await fetchWithRetry(
      `https://api.optcgapi.com/cards/${encodeURIComponent(cardId)}`,
      { headers: { 'Accept': 'application/json' } }
    )

    if (!response.ok) {
      console.log(`[sync-prices-multi] optcg-api non trovato per ${cardId}: ${response.status}`)
      return null
    }

    const cardData = await response.json()

    if (cardData.price) {
      return { market: cardData.price, currency: 'USD', source: 'optcg-api' }
    }

    return null
  } catch (err) {
    console.error(`[sync-prices-multi] Error fetching optcg-api for ${cardId}:`, err)
    return null
  }
}

async function fetchYugiohPrice(card) {
  // YGOPRODeck API per YGO: https://db.ygoprodeck.com/api/v7/cardinfo.php?id={sourceId}
  // Per YGO il sourceId è il terzo segmento del card_id (es. ygo:ygoprodeck:52900379:en)
  const parts = card.id.split(':')
  if (parts.length < 3) {
    console.log(`[sync-prices-multi] Card ID malformed: ${card.id}`)
    return null
  }
  const sourceId = parts[2]
  const url = `https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${encodeURIComponent(sourceId)}`

  try {
    const response = await fetchWithRetry(
      url,
      { headers: { 'Accept': 'application/json' } }
    )

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    const cardData = data?.data?.[0]
    const p = cardData?.card_prices?.[0]

    if (p?.cardmarket_price) {
      const price = parseFloat(p.cardmarket_price)
      if (!isNaN(price) && price > 0) {
        return { market: price, currency: 'EUR', source: 'ygoprodeck' }
      }
    }

    if (p?.tcgplayer_price) {
      const price = parseFloat(p.tcgplayer_price)
      if (!isNaN(price) && price > 0) {
        return { market: price, currency: 'USD', source: 'ygoprodeck' }
      }
    }

    return null
  } catch (err) {
    console.error(`[sync-prices-multi] Error fetching YGOPRODeck for YGO ${sourceId}:`, err)
    return null
  }
}

/** Controlla se esiste un prezzo recente con fonte affidabile (entro 7 giorni). */
async function hasRecentReliablePrice(supabase, cardId) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('card_prices')
    .select('source, captured_at')
    .eq('card_id', cardId)
    .in('source', ['ebay_sold', 'ebay_finding', 'justtcg', 'pokemontcgio', 'scryfall', 'ygoprodeck', 'tcglookup'])
    .gte('captured_at', sevenDaysAgo)
    .limit(1)

  if (error) {
    console.error(`[sync-prices-multi] Error checking price for ${cardId}:`, error)
    return false
  }

  return !!(data && data.length > 0)
}

/** Fetch con retry e backoff esponenziale (3 tentativi: 1s, 2s, 4s). */
async function fetchWithRetry(url, options, maxAttempts = 3) {
  let lastError
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      const response = await fetch(url, { ...options, signal: controller.signal })
      clearTimeout(timeout)
      if (response.ok) return response
      lastError = new Error(`HTTP ${response.status}`)
    } catch (err) {
      lastError = err
    }
    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000))
    }
  }
  throw lastError
}
