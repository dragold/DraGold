// sync-sets: sincronizza tutti i set da TCG Price Lookup -> tabella public.sets
// Rate limit: 200 req/day. 12 chiamate totali per tutti i giochi.
// Eseguire massimo 1 volta al giorno.
//
// CONFIGURAZIONE: TCG_LOOKUP_API_KEY deve essere impostato come variabile
// d'ambiente / Supabase Edge Function secret. Non è presente alcun valore
// hardcoded nel codice. Vedere .github/workflows/sync-set-catalog.yml e
// la documentazione in docs/secrets.md per l'installazione.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_KEY')!
const TCG_KEY      = Deno.env.get('TCG_LOOKUP_API_KEY')

if (!TCG_KEY) {
  throw new Error(
    'TCG_LOOKUP_API_KEY non configurato. Impostalo come secret nell\'Edge Function ' +
    'o come variabile d\'ambiente. Vedere docs/secrets.md.'
  )
}

const GAMES = ['pokemon', 'mtg', 'yugioh', 'onepiece', 'lorcana', 'fab']
const LIMIT = 200
const SLEEP_MS = 1500

interface TcgSet {
  id: string
  slug: string
  name: string
  game: string
  count: number
  released_at: string | null
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function fetchSetsForGame(game: string): Promise<TcgSet[]> {
  const all: TcgSet[] = []
  let offset = 0
  while (true) {
    await sleep(SLEEP_MS)
    const url = `https://api.tcgpricelookup.com/v1/sets?game=${game}&limit=${LIMIT}&offset=${offset}`
    const r = await fetch(url, { headers: { 'x-api-key': TCG_KEY } })
    if (!r.ok) { console.error(`Error ${game} offset ${offset}: ${r.status}`); break }
    const data = await r.json()
    if (data.error) { console.error(`API error ${game}: ${data.error}`); break }
    all.push(...(data.data as TcgSet[]))
    if (offset + data.data.length >= data.total) break
    offset += data.data.length
  }
  return all
}

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${SERVICE_KEY}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const before: Record<string, number> = {}
  const after: Record<string, number> = {}

  for (const game of GAMES) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/sets?select=id&game=eq.${game}`,
      { headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` } }
    )
    const rows = await r.json()
    before[game] = Array.isArray(rows) ? rows.length : 0
  }

  const allSets: TcgSet[] = []
  for (const game of GAMES) {
    const sets = await fetchSetsForGame(game)
    console.log(`${game}: ${sets.length} sets`)
    allSets.push(...sets)
  }

  const BATCH = 200
  let upserted = 0
  for (let i = 0; i < allSets.length; i += BATCH) {
    const batch = allSets.slice(i, i + BATCH).map(s => ({
      id: s.id, slug: s.slug, game: s.game, name: s.name,
      card_count: s.count, released_at: s.released_at,
      synced_at: new Date().toISOString(),
    }))
    const r = await fetch(`${SUPABASE_URL}/rest/v1/sets`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(batch),
    })
    if (!r.ok) console.error(`Upsert error batch ${i}: ${await r.text()}`)
    else upserted += batch.length
  }

  for (const game of GAMES) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/sets?select=id&game=eq.${game}`,
      { headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` } }
    )
    const rows = await r.json()
    after[game] = Array.isArray(rows) ? rows.length : 0
  }

  const summary = GAMES.map(g => ({
    game: g, before: before[g], after: after[g], new: (after[g]||0) - (before[g]||0),
  }))

  return new Response(JSON.stringify({ ok: true, total_fetched: allSets.length, upserted, summary }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
