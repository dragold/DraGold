// Script per popolare i prezzi via sync-prices-multi
const TARGETS = [
  { tcg: 'pokemon', label: 'Pokemon' },
  { tcg: 'onepiece', label: 'One Piece' },
]

const FUNCTION_URL = 'https://pimwkmwrduqkaydyvxqz.supabase.co/functions/v1/sync-prices-multi'

async function invokeSync(tcg, offset = 0, limit = 20) {
  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tcg, offset, limit }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json()
}

async function main() {
  console.log('=== POPOLAMENTO PREZZI ===')
  console.log(`Time: ${new Date().toISOString()}\n`)

  for (const target of TARGETS) {
    console.log(`--- ${target.label} (${target.tcg}) ---`)
    let offset = 0
    let round = 0
    let totalSynced = 0
    let totalSkipped = 0
    let totalErrors = 0

    while (true) {
      round++
      try {
        const result = await invokeSync(target.tcg, offset, 20)
        console.log(`Round ${round}: offset=${offset} → synced=${result.synced}, skipped=${result.skipped}, errors=${result.errors}, next_offset=${result.next_offset}`)

        totalSynced += result.synced || 0
        totalSkipped += result.skipped || 0
        totalErrors += result.errors || 0

        if (!result.next_offset || result.next_offset <= offset) {
          console.log(`→ Fine ${target.label}: totali synced=${totalSynced}, skipped=${totalSkipped}, errors=${totalErrors}`)
          break
        }

        offset = result.next_offset
        await new Promise(r => setTimeout(r, 500))
      } catch (err) {
        console.error(`ERROR round ${round}: ${err.message}`)
        totalErrors++
        break
      }
    }
    console.log('')
  }

  console.log('=== FINITO ===')
  console.log(`Time: ${new Date().toISOString()}`)
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})
