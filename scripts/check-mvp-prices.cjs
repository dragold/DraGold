require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

async function checkPrices() {
  const mvpSets = ['OP-01', 'OP-02', 'EB-01', 'EB-02', 'SV07', 'SV08'];
  
  for (const setId of mvpSets) {
    const tcg = setId.startsWith('OP') || setId.startsWith('EB') ? 'onepiece' : 'pokemon';
    const candidates = [setId, setId.toLowerCase(), setId.toUpperCase(), setId.replace(/-/g, ''), setId.replace(/-/g, '').toLowerCase()];
    const { data: cards } = await supabase
      .from('cards')
      .select('id, set_id, card_number, lang, tcg')
      .eq('tcg', tcg)
      .in('set_id', candidates)
      .limit(5000);
    
    if (cards && cards.length) {
      const cardIds = cards.map(c => c.id);
      const { data: prices } = await supabase
        .from('card_prices_latest')
        .select('card_id, price_market, currency, source, captured_at')
        .in('card_id', cardIds);
      
      console.log(setId + ': ' + cards.length + ' cards, ' + (prices?.length || 0) + ' priced');
      
      const langs = [...new Set(cards.map(c => c.lang))];
      console.log('  Languages: ' + langs.join(', '));
      
      if (prices && prices.length) {
        const sample = prices.slice(0, 3).map(p => p.price_market + ' ' + p.currency + ' (' + p.source + ')').join(', ');
        console.log('  Sample prices: ' + sample);
      }
    } else {
      console.log(setId + ': NO CARDS FOUND');
    }
  }
}

checkPrices().catch(console.error);