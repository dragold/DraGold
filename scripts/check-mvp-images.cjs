require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

async function checkImages() {
  const mvpSets = ['OP-01', 'OP-02', 'EB-01', 'EB-02', 'SV07', 'SV08'];
  
  for (const setId of mvpSets) {
    const tcg = setId.startsWith('OP') || setId.startsWith('EB') ? 'onepiece' : 'pokemon';
    const candidates = [setId, setId.toLowerCase(), setId.toUpperCase(), setId.replace(/-/g, ''), setId.replace(/-/g, '').toLowerCase()];
    const { data: cards } = await supabase
      .from('cards')
      .select('id, set_id, card_number, lang, tcg, image_url, image_url_hi')
      .eq('tcg', tcg)
      .in('set_id', candidates)
      .limit(5000);
    
    if (cards && cards.length) {
      const withImage = cards.filter(c => c.image_url || c.image_url_hi).length;
      const withHi = cards.filter(c => c.image_url_hi).length;
      
      console.log(setId + ': ' + cards.length + ' cards, ' + withImage + ' with image (' + Math.round(withImage/cards.length*100) + '%), ' + withHi + ' hi-res');
      
      // By language
      const langs = [...new Set(cards.map(c => c.lang))];
      for (const lang of langs) {
        const langCards = cards.filter(c => c.lang === lang);
        const langWithImg = langCards.filter(c => c.image_url || c.image_url_hi).length;
        console.log('  ' + lang + ': ' + langCards.length + ' cards, ' + langWithImg + ' with image (' + Math.round(langWithImg/langCards.length*100) + '%)');
      }
    } else {
      console.log(setId + ': NO CARDS FOUND');
    }
  }
}

checkImages().catch(console.error);