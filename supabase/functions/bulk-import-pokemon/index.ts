// DraGold: Bulk import Pokémon cards from TCGdex (multi-language)
// Strategy:
//   1. GET /v2/{lang}/sets         → list of sets with their id+name
//   2. For each set: GET /v2/{lang}/sets/{setId} → full card detail (name, image, rarity, localId)
//   3. Upsert into cards table with set_id, set_name, card_number, rarity all populated.
//
// /v2/{lang}/cards minimal endpoint was returning rarity:null and set_name:null. Using
// the /sets/{setId} endpoint instead gives us complete metadata in roughly the same
// number of total network bytes.
//
// FIX SUPERTYPE (bug verificato in audit 2026-08-19, vedi CHARACTER_ENTITY_AUDIT e
// scripts/enrich-cards.js): questa funzione scriveva `supertype: 'Pokémon'` come
// costante fissa per OGNI riga importata, incluse carte Energia/Trainer (verificato
// su dati reali: righe con nome "Darkness Energy"/"Psychic Energy" registrate con
// supertype='Pokémon'). Causa: GET /v2/{lang}/sets/{setId} restituisce solo il
// CardBrief per ogni carta (id/localId/name/image — vedi commento in
// scripts/lib/pokemon-sync.js), che NON espone `category` (il campo TCGdex che
// distingue Pokemon/Trainer/Energy, verificato su tcgdex.dev/reference/card) — questa
// funzione non ha mai avuto il dato per scrivere un supertype corretto. Non lo si
// inventa più: `supertype` resta `null` (sconosciuto) per le righe scritte da questa
// funzione; la classificazione corretta è responsabilità di scripts/enrich-cards.js,
// che fa un fetch di dettaglio per carta e da questo stesso fix legge `category`.
// Questa funzione non è schedulata in alcun workflow GitHub Actions (nessun file in
// .github/workflows la invoca): il fix qui evita che una futura invocazione manuale
// riscriva lo stesso bug, non corregge da solo le righe già scritte in passato.
//
// Invocation: POST https://{project}.supabase.co/functions/v1/bulk-import-pokemon
//   Optional body: { langs: ['en','ja','it'], limit_per_lang: 50000 }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { getServiceClient, loggedFetch } from '../_shared/fetch-with-log.ts'

const ALL_LANGS = ['en','ja','ko','fr','de','it','es','pt','zh-tw','zh-cn','id','th']

serve(async (req) => {
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
  const langs: string[] = body.langs || ALL_LANGS
  const maxPerLang: number = body.limit_per_lang || 50000

  const supabase = getServiceClient()
  const stats: Record<string, any> = {}

  for (const lang of langs) {
    const langStart = Date.now()
    let imported = 0
    let setsProcessed = 0
    let setsFailed = 0

    // 1) Fetch sets list for this language
    const setsRes = await loggedFetch(supabase, 'tcgdex',
      `https://api.tcgdex.net/v2/${lang}/sets`,
      { timeout: 30000 })
    if (!setsRes.ok || !Array.isArray(setsRes.data)) {
      stats[lang] = { error: setsRes.error || 'no sets data', count: 0 }
      continue
    }
    const sets: any[] = setsRes.data

    // 2) For each set, fetch full detail (cards array with full metadata)
    for (const setMeta of sets) {
      const setId = setMeta.id
      const setName = setMeta.name || setMeta.id
      try {
        const detRes = await loggedFetch(supabase, 'tcgdex',
          `https://api.tcgdex.net/v2/${lang}/sets/${setId}`,
          { timeout: 20000 })
        if (!detRes.ok) { setsFailed++; continue }
        const setDetail = detRes.data
        const cardsArr: any[] = setDetail?.cards || []
        if (cardsArr.length === 0) { setsProcessed++; continue }

        const rows = cardsArr.slice(0, maxPerLang - imported).map((c) => ({
          id: `pokemon:tcgdex:${c.id}:${lang}`,
          tcg: 'pokemon',
          source: 'tcgdex',
          source_id: c.id,
          lang,
          name: c.name || '',
          set_id: setId,
          set_name: setName,
          card_number: c.localId ? String(c.localId) : null,
          rarity: c.rarity || null,
          // FIX SUPERTYPE (vedi commento in testa al file): CardBrief non espone
          // `category`, quindi non possiamo saperlo qui. `null` (sconosciuto) invece
          // di una costante fissa che si è già dimostrata falsa per Energia/Trainer.
          supertype: null,
          image_url: c.image ? `${c.image}/low.webp` : null,
          image_url_hi: c.image ? `${c.image}/high.webp` : null,
          metadata: { localId: c.localId, setReleaseDate: setMeta.releaseDate },
          updated_at: new Date().toISOString(),
        }))

        // Batch into chunks of 500 (Supabase upsert limit comfort)
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500)
          const { error } = await supabase.from('cards').upsert(chunk, { onConflict: 'id' })
          if (!error) imported += chunk.length
        }
        setsProcessed++
        if (imported >= maxPerLang) break
      } catch (e) {
        setsFailed++
      }
    }

    stats[lang] = {
      sets_total: sets.length,
      sets_processed: setsProcessed,
      sets_failed: setsFailed,
      cards_imported: imported,
      duration_ms: Date.now() - langStart,
    }
  }

  return new Response(JSON.stringify({ ok: true, stats }, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  })
})
