/**
 * DraGold - Card Sync Script
 * Risolve: immagini mancanti, set nuovi, versioni lingua mancanti.
 *
 * Fonti:
 *   Pokemon  -> TCGdex API (gratuita, multilingua, immagini incluse)
 *   MTG      -> Scryfall API (gratuita, set per set)
 *   YGO      -> YGOPRODeck API (gratuita)
 *   One Piece-> TCGdex API (serie "onepiece")
 *
 * Usage:
 *   node scripts/sync-cards.js [--tcg pokemon|mtg|ygo|op] [--lang en,ja,it,...] [--set sv3pt5]
 *   SUPABASE_URL e SUPABASE_SERVICE_KEY devono essere in env.
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: SUPABASE_URL e SUPABASE_SERVICE_KEY mancanti')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const BATCH_SIZE   = 100
const DELAY_MS     = 120
const PKM_LANGS    = ['en','ja','it','fr','de','es','pt','id']
const TCGDEX_BASE  = 'https://api.tcgdex.net/v2'
const SCRYFALL_BASE= 'https://api.scryfall.com'
const YGOPRO_BASE  = 'https://db.ygoprodeck.com/api/v7'

const args = process.argv.slice(2)
const argTcg  = args.find(a => a.startsWith('--tcg='))?.split('=')[1]
const argLang = args.find(a => a.startsWith('--lang='))?.split('=')[1]?.split(',')
const argSet  = args.find(a => a.startsWith('--set='))?.split('=')[1]

const TCG_FILTER  = argTcg  ? argTcg.split(',') : ['pokemon','mtg','ygo','onepiece']
const LANG_FILTER = argLang || PKM_LANGS

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function safeFetch(url, timeout = 15000) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeout) })
    if (!r.ok) return null
    return r.json()
  } catch { return null }
}

async function upsertBatch(rows) {
  if (!rows.length) return
  const { error } = await supabase.from('cards').upsert(rows, { onConflict: 'id', ignoreDuplicates: false })
  if (error) console.warn('  upsert error:', error.message)
}

async function countInDb(setId, lang) {
  const { count } = await supabase.from('cards').select('id', { count: 'exact', head: true }).eq('set_id', setId).eq('lang', lang).eq('tcg', 'pokemon')
  return count || 0
}

async function syncPokemon() {
  console.log('\nSincronizzazione Pokemon (TCGdex)...')
  let totalNew = 0
  const sets = await safeFetch(`${TCGDEX_BASE}/en/sets`)
  if (!Array.isArray(sets)) { console.warn('  TCGdex sets non disponibile'); return }
  const setsToProcess = argSet ? sets.filter(s => s.id === argSet) : sets
  console.log(`  ${setsToProcess.length} set da processare`)
  for (const setMeta of setsToProcess) {
    const setId = setMeta.id, setName = setMeta.name, totalCards = setMeta.cardCount || 0
    for (const lang of LANG_FILTER) {
      if (!argSet) {
        const existing = await countInDb(setId, lang)
        if (existing >= totalCards && totalCards > 0) { process.stdout.write('.'); continue }
      }
      await sleep(DELAY_MS)
      const setData = await safeFetch(`${TCGDEX_BASE}/${lang}/sets/${setId}`)
      if (!setData?.cards?.length) continue
      const rows = setData.cards.filter(c => c.localId && c.name).map(c => ({
        id: `pokemon:tcgdex:${setId}-${c.localId}:${lang}`,
        name: c.name, set_id: setId, set_name: setData.name || setName,
        card_number: String(c.localId), rarity: c.rarity || null,
        image_url: c.image ? `${c.image}/high.webp` : null,
        image_url_hi: c.image ? `${c.image}/high.webp` : null,
        lang, tcg: 'pokemon', series_id: setData.serie?.id || null, series_name: setData.serie?.name || null,
      }))
      for (let i = 0; i < rows.length; i += BATCH_SIZE) await upsertBatch(rows.slice(i, i + BATCH_SIZE))
      totalNew += rows.length
      console.log(`  OK ${setId} (${lang}): ${rows.length} carte`)
    }
  }
  await fixMissingImages()
  console.log(`\n  Pokemon sync: +${totalNew} righe`)
}

async function fixMissingImages() {
  console.log('  Fix immagini mancanti...')
  let offset = 0, fixed = 0
  while (true) {
    const { data, error } = await supabase.from('cards').select('id, set_id, card_number, lang')
      .eq('tcg', 'pokemon').is('image_url', null).not('set_id', 'is', null).not('card_number', 'is', null).range(offset, offset + 199)
    if (error || !data?.length) break
    const updates = data.map(c => {
      const img = `https://assets.tcgdex.net/${c.lang}/${c.set_id}/${c.card_number}/high.webp`
      return { id: c.id, image_url: img, image_url_hi: img }
    })
    for (let i = 0; i < updates.length; i += BATCH_SIZE) await upsertBatch(updates.slice(i, i + BATCH_SIZE))
    fixed += data.length; offset += 200
    if (data.length < 200) break
  }
  if (fixed) console.log(`  OK ${fixed} immagini aggiornate`)
}

async function syncOnePiece() {
  console.log('=== Sync One Piece (Bandai EN + JP) ===')

  const BANDAI_EN = 'https://en.onepiece-cardgame.com'
  const BANDAI_JA = 'https://www.onepiece-cardgame.com'

  const EN_SERIES = [
    [569116,'OP-16','THE TIME OF BATTLE'],
    [569115,'OP-15','PILLARS OF STRENGTH (EB04)'],
    [569114,'OP-14','THE AZURE SEA SEVEN'],
    [569113,'OP-13','CARRYING ON HIS WILL'],
    [569112,'OP-12','LEGACY OF THE MASTER'],
    [569111,'OP-11','A FIST OF DIVINE SPEED'],
    [569110,'OP-10','ROYAL BLOOD'],
    [569109,'OP-09','EMPERORS IN THE NEW WORLD'],
    [569108,'OP-08','TWO LEGENDS'],
    [569107,'OP-07','500 YEARS IN THE FUTURE'],
    [569106,'OP-06','WINGS OF THE CAPTAIN'],
    [569105,'OP-05','AWAKENING OF THE NEW ERA'],
    [569104,'OP-04','KINGDOMS OF INTRIGUE'],
    [569103,'OP-03','PILLARS OF STRENGTH'],
    [569102,'OP-02','PARAMOUNT WAR'],
    [569101,'OP-01','ROMANCE DAWN'],
    [569030,'ST-30','Luffy & Ace'],
    [569029,'ST-29','Egghead'],
    [569028,'ST-28','Straw Hat Crew (2)'],
    [569027,'ST-27','Navy'],
    [569026,'ST-26','Seven Warlords (2)'],
    [569025,'ST-25','FILM RED'],
    [569024,'ST-24','Big Mom Pirates'],
    [569023,'ST-23','Rocks Pirates'],
    [569022,'ST-22','Supernovas'],
    [569021,'ST-21','Navy (2)'],
    [569020,'ST-20','Three Captains'],
    [569019,'ST-19','WORST GENERATION (2)'],
    [569018,'ST-18','Charlotte Katakuri'],
    [569017,'ST-17','FORMER MEMBER OF THE SEVEN WARLORDS'],
    [569016,'ST-16','ULTRA DECK: THE THREE CAPTAINS'],
    [569015,'ST-15','KINGDOM OF INTRIGUE'],
    [569014,'ST-14','3D2Y'],
    [569013,'ST-13','THE THREE BROTHERS'],
    [569012,'ST-12','ZORO & SANJI'],
    [569011,'ST-11','UTA'],
    [569010,'ST-10','NAVY ABSOLUTE FORCE'],
    [569009,'ST-09','YAMATO'],
    [569008,'ST-08','MONKEY.D.LUFFY'],
    [569007,'ST-07','NAVY HEADQUARTERS'],
    [569006,'ST-06','ABSOLUTE JUSTICE'],
    [569005,'ST-05','THE WORST GENERATION'],
    [569004,'ST-04','ANIMAL KINGDOM PIRATES'],
    [569003,'ST-03','THE SEVEN WARLORDS OF THE SEA'],
    [569002,'ST-02','WORST GENERATION'],
    [569001,'ST-01','STRAW HAT CREW'],
    [569203,'EB-03','ONE PIECE HEROINES EDITION'],
    [569202,'EB-02','Anime 25th Collection'],
    [569201,'EB-01','MEMORIAL COLLECTION'],
    [569302,'PRB-02','ONE PIECE CARD THE BEST vol.2'],
    [569301,'PRB-01','ONE PIECE CARD THE BEST'],
    [569901,'P','Promotion'],
    [569801,'OTHER','Other Product']
  ]

  const JA_SERIES = [
    ...EN_SERIES,
    [400401,'OP-17','(JP Only - OP17)'],
    [569204,'EB-04','EGGHEAD CRISIS']
  ]

  async function parseBandaiPage(baseUrl, seriesId, setCode, setName, lang) {
    const url = `${baseUrl}/cardlist/?series=${seriesId}`
    let html = ''
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 DraGold/1.0' } })
      if (!res.ok) return []
      html = await res.text()
    } catch (e) {
      console.error(`  FETCH ERROR ${setCode}: ${e.message}`)
      return []
    }

    const seen = new Set()
    const cards = []

    // Match each <dl class="modalCol"> block
    const dlRe = /<dl[^>]*class="[^"]*modalCol[^"]*"[^>]*>([sS]*?)<\/dl>/gi
    const spanRe = /<span[^>]*>([^<]*)<\/span>/gi
    const nameRe = /class="cardName"[^>]*>\s*([^<]+)/

    let dlMatch
    while ((dlMatch = dlRe.exec(html)) !== null) {
      const dtHtml = dlMatch[1]
      const spans = []
      let sm
      const spanReCopy = new RegExp(spanRe.source, 'gi')
      while ((sm = spanReCopy.exec(dtHtml)) !== null) spans.push(sm[1].trim())

      const cardNum = spans[0]
      const rarity   = spans[1] || null
      const supertype= spans[2] || null
      const nm = dtHtml.match(nameRe)
      const name = nm ? nm[1].trim() : null

      if (!cardNum || !name || !/^[A-Z0-9]/.test(cardNum)) continue
      const id = `onepiece:optcg:${cardNum}:${lang}`
      if (seen.has(id)) continue
      seen.add(id)

      const imgBase = lang === 'en' ? BANDAI_EN : BANDAI_JA
      cards.push({
        id,
        tcg: 'onepiece',
        source: 'optcg',
        source_id: cardNum,
        card_number: cardNum,
        set_id: setCode,
        set_name: setName,
        lang,
        name,
        name_en: lang === 'en' ? name : null,
        supertype,
        rarity,
        image_url: `${imgBase}/images/cardlist/card/${cardNum}.png`,
        image_url_hi: `${imgBase}/images/cardlist/card/${cardNum}.png`
      })
    }

    // Fallback: match <dt> blocks if no <dl> found
    if (cards.length === 0) {
      const dtRe = /<dt[\s\S]*?<\/dt>/gi
      let dtMatch2
      while ((dtMatch2 = dtRe.exec(html)) !== null) {
        const dtHtml2 = dtMatch2[0]
        const spans = []
        let sm2
        const spanReCopy2 = new RegExp(spanRe.source, 'gi')
        while ((sm2 = spanReCopy2.exec(dtHtml2)) !== null) spans.push(sm2[1].trim())

        const cardNum = spans[0]
        const rarity   = spans[1] || null
        const supertype= spans[2] || null
        const nm2 = dtHtml2.match(nameRe)
        const name = nm2 ? nm2[1].trim() : null

        if (!cardNum || !name || !/^[A-Z0-9]/.test(cardNum)) continue
        const id = `onepiece:optcg:${cardNum}:${lang}`
        if (seen.has(id)) continue
        seen.add(id)

        const imgBase = lang === 'en' ? BANDAI_EN : BANDAI_JA
        cards.push({
          id,
          tcg: 'onepiece',
          source: 'optcg',
          source_id: cardNum,
          card_number: cardNum,
          set_id: setCode,
          set_name: setName,
          lang,
          name,
          name_en: lang === 'en' ? name : null,
          supertype,
          rarity,
          image_url: `${imgBase}/images/cardlist/card/${cardNum}.png`,
          image_url_hi: `${imgBase}/images/cardlist/card/${cardNum}.png`
        })
      }
    }

    return cards
  }

  const isJA = process.argv.includes('--ja')
  const series = isJA ? JA_SERIES : EN_SERIES
  const lang = isJA ? 'ja' : 'en'
  const baseUrl = isJA ? BANDAI_JA : BANDAI_EN

  let totalSynced = 0

  for (const [seriesId, setCode, setName] of series) {
    try {
      const cards = await parseBandaiPage(baseUrl, seriesId, setCode, setName, lang)
      if (cards.length === 0) {
        console.log(`  SKIP ${setCode} - no cards found`)
        continue
      }

      for (let i = 0; i < cards.length; i += BATCH_SIZE) {
        const batch = cards.slice(i, i + BATCH_SIZE)
        const { error } = await supabase.from('cards').upsert(batch, { onConflict: 'id' })
        if (error) console.error(`  ERROR ${setCode} batch ${i}: ${error.message}`)
      }
      console.log(`  OP ${lang.toUpperCase()} ${setCode}: ${cards.length} cards synced`)
      totalSynced += cards.length
    } catch (e) {
      console.error(`  ERROR ${setCode}: ${e.message}`)
    }
    await sleep(DELAY_MS)
  }
  console.log(`One Piece sync done: ${totalSynced} cards processed`)
}

async function syncMTG() {
  console.log('\nSincronizzazione MTG (Scryfall)...')
  let totalNew = 0
  const setsData = await safeFetch(`${SCRYFALL_BASE}/sets`)
  if (!setsData?.data) { console.warn('  Scryfall sets non disponibile'); return }
  const validTypes = ['core','expansion','masters','draft_innovation','commander','starter','funny']
  const sets = setsData.data.filter(s => validTypes.includes(s.set_type))
  const setsToProcess = argSet ? sets.filter(s => s.code === argSet) : sets
  console.log(`  ${setsToProcess.length} set da processare`)
  for (const set of setsToProcess) {
    const setCode = set.code
    if (!argSet) {
      const { count } = await supabase.from('cards').select('id', { count: 'exact', head: true }).eq('set_id', setCode).eq('tcg', 'mtg')
      if ((count || 0) >= set.card_count * 0.9) { process.stdout.write('.'); continue }
    }
    let page = 1, hasMore = true, setCards = []
    while (hasMore) {
      await sleep(100)
      const data = await safeFetch(`${SCRYFALL_BASE}/cards/search?q=set:${setCode}&order=set&page=${page}&unique=prints`)
      if (!data?.data?.length) break
      for (const c of data.data) {
        if (!c.name || c.layout === 'art_series' || c.layout === 'token') continue
        const imgUri = c.image_uris || c.card_faces?.[0]?.image_uris
        setCards.push({ id: `mtg:scryfall:${c.id}`, name: c.name, set_id: setCode, set_name: set.name,
          card_number: c.collector_number, rarity: c.rarity || null,
          image_url: imgUri?.normal || null, image_url_hi: imgUri?.large || null,
          lang: c.lang || 'en', tcg: 'mtg' })
      }
      hasMore = data.has_more; page++
    }
    if (!setCards.length) continue
    for (let i = 0; i < setCards.length; i += BATCH_SIZE) await upsertBatch(setCards.slice(i, i + BATCH_SIZE))
    totalNew += setCards.length
    console.log(`  OK ${setCode} (${set.name}): ${setCards.length} carte`)
  }
  console.log(`\n  MTG sync: +${totalNew} righe`)
}

async function syncYGO() {
  console.log('\nSincronizzazione YGO (YGOPRODeck)...')
  const data = await safeFetch(`${YGOPRO_BASE}/cardinfo.php?misc=yes`, 60000)
  if (!data?.data) { console.warn('  YGOPRODeck non disponibile'); return }
  const rows = data.data.map(c => {
    const s = c.card_sets?.[0]
    return { id: `ygo:ygoprodeck:${c.id}`, name: c.name,
      set_id: s?.set_code?.toLowerCase() || 'unknown', set_name: s?.set_name || 'Unknown',
      card_number: String(c.id), rarity: s?.set_rarity || null,
      image_url: c.card_images?.[0]?.image_url_small || null,
      image_url_hi: c.card_images?.[0]?.image_url || null,
      lang: 'en', tcg: 'ygo' }
  })
  let count = 0
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    await upsertBatch(rows.slice(i, i + BATCH_SIZE))
    count += Math.min(BATCH_SIZE, rows.length - i)
    if (count % 2000 === 0) console.log(`  YGO: ${count}/${rows.length}...`)
  }
  console.log(`  OK YGO sync: ${rows.length} carte`)
}

const start = Date.now()
console.log('DraGold Card Sync - start')
console.log(`   TCG: ${TCG_FILTER.join(', ')} | Set: ${argSet || 'tutti'} | Lingue: ${LANG_FILTER.join(', ')}`)
try {
  if (TCG_FILTER.includes('pokemon')) await syncPokemon()
  if (TCG_FILTER.includes('onepiece'))      await syncOnePiece()
  if (TCG_FILTER.includes('mtg'))     await syncMTG()
  if (TCG_FILTER.includes('ygo'))     await syncYGO()
} catch (err) { console.error('Errore critico:', err.message); process.exit(1) }
const elapsed = ((Date.now() - start) / 1000).toFixed(1)
console.log(`\nSync completato in ${elapsed}s`)
