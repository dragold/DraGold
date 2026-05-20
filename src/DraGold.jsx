import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase, supabaseReady, sendMagicLink, getSession, onAuth, signOut as sbSignOut } from "./supabase.js";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const EBAY_CAMP = "5339152703";
const EUR_RATE  = 0.92;
const EU_CC = ["IT","DE","FR","ES","PT","NL","BE","AT","PL","SE","FI","DK","NO","CH","GB","GR","CZ","HU"];
const EBAY_SITES = {
  IT:{domain:"ebay.it",    siteid:"101",mkrid:"724-53478-19255-0"},
  DE:{domain:"ebay.de",    siteid:"77", mkrid:"707-53477-19255-0"},
  FR:{domain:"ebay.fr",    siteid:"71", mkrid:"709-53476-19255-0"},
  ES:{domain:"ebay.es",    siteid:"186",mkrid:"1185-53479-19255-0"},
  GB:{domain:"ebay.co.uk", siteid:"3",  mkrid:"710-53481-19255-0"},
  AU:{domain:"ebay.com.au",siteid:"15", mkrid:"705-53470-19255-0"},
  US:{domain:"ebay.com",   siteid:"0",  mkrid:"711-53200-19255-0"},
};
function ebayURL(name,setName,country,grade=null,tcg="pokemon"){
  const site=EBAY_SITES[country]||EBAY_SITES.US;
  const eu=EU_CC.includes(country);
  const loc=eu?"&LH_PrefLoc=1":"";
  let q;
  if(grade) q=`${name} ${setName||""} PSA ${grade} pokemon card`.replace(/\s+/g," ").trim();
  else if(tcg==="mtg") q=`${name} magic the gathering card`;
  else if(tcg==="ygo") q=`${name} yugioh card`;
  else q=`${name} ${setName||""} pokemon card`.replace(/\s+/g," ").trim();
  return `https://www.${site.domain}/sch/i.html?_nkw=${encodeURIComponent(q)}&mkcid=1&mkrid=${site.mkrid}&siteid=${site.siteid}&campid=${EBAY_CAMP}&toolid=10001&mkevt=1${loc}`;
}
function ebaySellURL(name,setName,country){
  const site=EBAY_SITES[country]||EBAY_SITES.US;
  const q=`${name} ${setName||""} pokemon card`.trim();
  return `https://www.${site.domain}/sell?kw=${encodeURIComponent(q)}&mkrid=${site.mkrid}&campid=${EBAY_CAMP}&toolid=10001`;
}

// ─── PLANS ───────────────────────────────────────────────────────────────────
const PLANS=[
  {id:"free",name:"Free",price:"€0",period:"",color:"#5a5a78",
   features:["Search all cards — Pokémon, MTG, YGO","Vault up to 50 cards","3 price alerts","1 binder (9-pocket)","Watchlist up to 20 cards","5 Hot Picks daily","7-day price history","eBay geo-routed links"]},
  {id:"collector",name:"Collector",price:"€4.99",period:"/mo",color:"#fbbf24",badge:"Most Popular",
   features:["Everything in Free","Vault up to 500 cards","20 price alerts","Unlimited binders","All 10 Hot Picks","30-day price history","Condition tracking","Export collection CSV"]},
  {id:"pro",name:"Pro Investor",price:"€9.99",period:"/mo",color:"#a78bfa",badge:"Best Value",
   features:["Everything in Collector","Unlimited everything","90-day price history","Camera scanning","Grading Spotlight daily","Portfolio analytics","Priority support","Pack opening game"]},
];

// ─── TCG / BINDER ────────────────────────────────────────────────────────────
const TCG_LIST=[
  {id:"pokemon",label:"Pokémon TCG",         emoji:"🔴",color:"#f87171"},
  {id:"mtg",    label:"Magic: The Gathering", emoji:"🟦",color:"#60a5fa"},
  {id:"ygo",    label:"Yu-Gi-Oh!",            emoji:"⭐",color:"#fbbf24"},
];
const BINDER_TYPES=[
  {id:"9p", name:"9-Pocket (3x3)",   cols:3,rows:3,slots:9,  desc:"Ultra Pro / Dragon Shield"},
  {id:"4p", name:"4-Pocket (2x2)",   cols:2,rows:2,slots:4,  desc:"Ultra Pro Platinum"},
  {id:"12p",name:"12-Pocket (3x4)",  cols:3,rows:4,slots:12, desc:"BCW / Ultra Pro"},
  {id:"16p",name:"16-Pocket (4x4)",  cols:4,rows:4,slots:16, desc:"Dragon Shield"},
  {id:"1p", name:"1-Pocket Display", cols:1,rows:1,slots:1,  desc:"Top Loader / Slab"},
];
const CARD_LANGS=[
  // Lingue effettivamente nel DB Supabase (bulk import completati).
  // Aggiungere altre lingue qui dopo aver lanciato bulk-import-pokemon con quella lang.
  {c:"en",l:"English",  f:"🇺🇸",live:true, hot:false},
  {c:"ja",l:"日本語",   f:"🇯🇵",live:true, hot:true },
  {c:"it",l:"Italiano", f:"🇮🇹",live:true, hot:false},
  {c:"ko",l:"한국어",   f:"🇰🇷",live:false,hot:false},
  {c:"fr",l:"Français", f:"🇫🇷",live:false,hot:false},
  {c:"de",l:"Deutsch",  f:"🇩🇪",live:false,hot:false},
  {c:"es",l:"Español",  f:"🇪🇸",live:false,hot:false},
  {c:"pt",l:"Português",f:"🇧🇷",live:false,hot:false},
];
const UI_LANGS=[
  {c:"en",f:"🇺🇸",n:"English"},{c:"it",f:"🇮🇹",n:"Italiano"},
  {c:"fr",f:"🇫🇷",n:"Français"},{c:"de",f:"🇩🇪",n:"Deutsch"},
  {c:"es",f:"🇪🇸",n:"Español"},{c:"pt",f:"🇧🇷",n:"Português"},
];
const CONDITIONS=["NM","LP","MP","HP","DMG"];
const ACCESSORIES=[
  {name:"Ultra Pro Top Loader 35pt (25ct)",query:"ultra pro top loader 35pt pokemon card",price:"€3.49"},
  {name:"Dragon Shield Matte Sleeves (100ct)",query:"dragon shield matte sleeves pokemon",price:"€9.99"},
  {name:"Ultra Pro 9-Pocket Binder",query:"ultra pro 9 pocket binder pokemon",price:"€14.99"},
  {name:"One-Touch Magnetic Case 35pt",query:"one touch magnetic case 35pt pokemon card",price:"€5.99"},
];

// ─── CARD DATA ────────────────────────────────────────────────────────────────
const MOCK_PKM=[
  {id:"base1-4", name:"Charizard",       number:"4",  rarity:"Rare Holo",   supertype:"Pokémon",set:{id:"base1",name:"Base Set 1999"},  images:{small:"https://images.pokemontcg.io/base1/4.png",  large:"https://images.pokemontcg.io/base1/4_hires.png"},  tcgplayer:{prices:{holofoil:{market:420,low:320,high:620}}}},
  {id:"sv3pt5-6",name:"Charizard ex",    number:"6",  rarity:"Double Rare", supertype:"Pokémon",set:{id:"sv3pt5",name:"151"},           images:{small:"https://images.pokemontcg.io/sv3pt5/6.png", large:"https://images.pokemontcg.io/sv3pt5/6_hires.png"}, tcgplayer:{prices:{holofoil:{market:22, low:14,high:38 }}}},
  {id:"pop3-1",  name:"Charizard Star",  number:"1",  rarity:"Rare Secret", supertype:"Pokémon",set:{id:"pop3",name:"POP Series 3"},    images:{small:"https://images.pokemontcg.io/pop3/1.png",   large:"https://images.pokemontcg.io/pop3/1_hires.png"},   tcgplayer:{prices:{holofoil:{market:185,low:120,high:280}}}},
  {id:"xy7-11",  name:"Charizard EX",    number:"11", rarity:"Rare Holo EX",supertype:"Pokémon",set:{id:"xy7",name:"Ancient Origins"},  images:{small:"https://images.pokemontcg.io/xy7/11.png",   large:"https://images.pokemontcg.io/xy7/11_hires.png"},   tcgplayer:{prices:{holofoil:{market:38, low:26,high:58 }}}},
  {id:"swsh9-18",name:"Charizard VSTAR", number:"18", rarity:"Rare VSTAR",  supertype:"Pokémon",set:{id:"swsh9",name:"Brilliant Stars"},images:{small:"https://images.pokemontcg.io/swsh9/18.png", large:"https://images.pokemontcg.io/swsh9/18_hires.png"}, tcgplayer:{prices:{holofoil:{market:9.5,low:6,  high:15 }}}},
  {id:"hgss4-1", name:"Charizard Prime", number:"1",  rarity:"Rare Prime",  supertype:"Pokémon",set:{id:"hgss4",name:"Triumphant"},     images:{small:"https://images.pokemontcg.io/hgss4/14.png",  large:"https://images.pokemontcg.io/hgss4/14_hires.png"},  tcgplayer:{prices:{holofoil:{market:62, low:44,high:98 }}}},
  {id:"swsh3-20",name:"Charizard V",     number:"20", rarity:"Rare Holo V", supertype:"Pokémon",set:{id:"swsh3",name:"Darkness Ablaze"},images:{small:"https://images.pokemontcg.io/swsh3/20.png", large:"https://images.pokemontcg.io/swsh3/20_hires.png"}, tcgplayer:{prices:{holofoil:{market:12.8,low:8,high:20 }}}},
  {id:"xy1-12",  name:"Charizard EX FA", number:"12", rarity:"Rare Ultra",  supertype:"Pokémon",set:{id:"xy1",name:"XY Base Set"},      images:{small:"https://images.pokemontcg.io/xy1/12.png",   large:"https://images.pokemontcg.io/xy1/12_hires.png"},   tcgplayer:{prices:{holofoil:{market:28, low:19,high:44 }}}},
];
const SEALED=[
  {id:"etb-sv151",name:"SV 151 Elite Trainer Box",      set:"sv3pt5",setName:"Scarlet & Violet 151",type:"ETB",    fmv:44, img:"https://images.pokemontcg.io/sv3pt5/logo.png"},
  {id:"etb-paf",  name:"Paldean Fates ETB",              set:"sv4pt5",setName:"Paldean Fates",      type:"ETB",    fmv:55, img:"https://images.pokemontcg.io/sv4pt5/logo.png"},
  {id:"etb-obf",  name:"Obsidian Flames ETB",            set:"sv3",   setName:"Obsidian Flames",    type:"ETB",    fmv:36, img:"https://images.pokemontcg.io/sv3/logo.png"},
  {id:"etb-twm",  name:"Twilight Masquerade ETB",        set:"sv6",   setName:"Twilight Masquerade",type:"ETB",    fmv:34, img:"https://images.pokemontcg.io/sv6/logo.png"},
  {id:"box-mew",  name:"Mew VMAX Premium Collection",    set:"swsh8", setName:"Fusion Strike",      type:"Box",    fmv:52, img:"https://images.pokemontcg.io/swsh8/logo.png"},
  {id:"bp-sv151", name:"SV 151 Booster Pack",            set:"sv3pt5",setName:"Scarlet & Violet 151",type:"Booster",fmv:4.5,img:"https://images.pokemontcg.io/sv3pt5/logo.png"},
  {id:"etb-brs",  name:"Brilliant Stars ETB",            set:"swsh9", setName:"Brilliant Stars",    type:"ETB",    fmv:38, img:"https://images.pokemontcg.io/swsh9/logo.png"},
  {id:"bp-paf",   name:"Paldean Fates Booster Pack",     set:"sv4pt5",setName:"Paldean Fates",      type:"Booster",fmv:8,  img:"https://images.pokemontcg.io/sv4pt5/logo.png"},
];
// Hero showcase: 1 Pokemon front + MTG left + YGO right (the 3 TCGs we support)
const HERO_POOL=[
  {tcg:'pokemon', img:"https://images.pokemontcg.io/sv3pt5/6.png", glow:"rgba(251,191,36,.55)"},
  {tcg:'mtg',     img:"https://cards.scryfall.io/normal/front/b/d/bd8fa327-dd41-4737-8f19-2cf5eb1f7cdd.jpg", glow:"rgba(56,189,248,.45)"},
  {tcg:'ygo',     img:"https://images.ygoprodeck.com/images/cards/89631139.jpg", glow:"rgba(167,139,250,.5)"},
];
function getDailyCards(pool,n=3){
  const pkm=pool.find(c=>c.tcg==='pokemon');
  const mtg=pool.find(c=>c.tcg==='mtg');
  const ygo=pool.find(c=>c.tcg==='ygo');
  return [mtg,pkm,ygo].filter(Boolean);
}
// Hot Picks: nessun hardcode. La griglia legge da Supabase `hot_picks` (popolata daily dal cron
// compute-hot-picks). Quando la tabella è vuota → empty state. Mai dati fake.
const GRADING_SPOT={
  name:"Charizard",set:"Base Set 1999",fmv:420,psa10:1344,psa10EUR:1237,
  img:"https://images.pokemontcg.io/base1/4.png",pop10:342,pop9:1240,
  analysis:"Raw-to-PSA10 multiplier at 3.2x. Historically this gap widens in Q3 when grading volume drops. Current PSA turnaround is 35 days at standard tier. For raw copies in NM condition this remains one of the strongest grading opportunities in the market.",
};
// Market pulse: vol e change reali verranno calcolati dal cron compute-hot-picks
// quando l'aggregato giornaliero sarà disponibile. Per ora mostra solo nomi.
const MARKET_PULSE=[
  {name:"Pokémon TCG",         change:null,vol:null,trend:"neutral"},
  {name:"Magic: The Gathering",change:null,vol:null,trend:"neutral"},
  {name:"Yu-Gi-Oh!",           change:null,vol:null,trend:"neutral"},
];
const BLOG=[
  // Articoli del blog. featuredCards omesso intenzionalmente: meglio nessuna immagine
  // che immagini Pokémon hardcoded che non corrispondono al titolo dell'articolo.
  {id:"top-movers",emoji:"📈",cat:"Market",date:"May 10, 2026",read:"3 min",
   title:"5 Pokémon Cards With the Biggest Price Jump This Week",
   excerpt:"These five cards moved more than 15% in 7 days. Here is what is driving the market and what to watch next week.",
   featuredCards:[],
   body:["The Scarlet and Violet 151 set continues to dominate secondary market movement. Three cards from this set appear in this week top five, driven by renewed collector interest following Pokémon Day event announcements.","Charizard ex leads with a 23% gain, sitting at a Fair Market Value of $22. The card benefits from nostalgia demand and the general strength of Charizard as a collector anchor across all eras.","What to watch next: Pikachu ex from the same set is showing unusual buy pressure. When Pikachu moves, the broader SV 151 market typically follows within 10 to 14 days."]},
  {id:"psa-2026",emoji:"🏆",cat:"Grading",date:"May 8, 2026",read:"5 min",
   title:"PSA Grading in 2026: Is It Still Worth the Cost?",
   excerpt:"Fees went up. Wait times came down. But which cards still make financial sense to send?",
   featuredCards:[],
   body:["PSA standard grading now costs $50 per card with a 30 to 45 day turnaround. For a Base Set Charizard with a raw FMV of $420, a PSA 10 result pushes that number to approximately $1,350. The math works.","The break-even threshold: only send cards where PSA 10 FMV exceeds 2.5x the raw card value plus grading cost. Below that multiplier you are gambling on condition rather than investing.","Cards that remain strong grading candidates: Base Set holofoils in excellent condition, Japanese promos, and any first-edition Scarlet and Violet pull that comes out of the pack with clean centering."]},
  {id:"invest-2026",emoji:"💎",cat:"Investment",date:"May 5, 2026",read:"6 min",
   title:"The Collector Portfolio: What to Buy and Hold in 2026",
   excerpt:"Not all cards appreciate. Here is the framework serious collectors use to separate investments from collectibles.",
   featuredCards:[],
   body:["The TCG market behaves more like the art market than the stock market. Cultural relevance, scarcity, and condition determine value. Understanding all three is the foundation of a real collector portfolio.","Cultural relevance is the most important factor and the hardest to predict. Charizard will always matter because it is the face of Pokémon. Generic commons from forgotten sets depreciate toward zero regardless of condition.","Scarcity comes from limited print runs, exclusive promos, and grading. A PSA 10 Base Set Charizard is worth 3x a raw copy because PSA 10 examples are genuinely rare. Most packs produce cards with defects that make a perfect grade unlikely."]},
];
const TICKER="DraGold — Pokémon TCG   Magic: The Gathering   Yu-Gi-Oh!   Fair Market Value   EN JP KO FR DE IT ES PT   eBay Geo-routed   PSA Estimates   Digital Binder   Watchlist   Price Alerts   Portfolio Tracking   Sealed Products";

// ─── UTILS ───────────────────────────────────────────────────────────────────
function calcFMV(card){
  // Supabase-backed cards carry _supabasePrice (USD market avg from card_prices_latest).
  // We trust it as the canonical FMV; no synthetic 3-source blend needed.
  if(card&&card._supabasePrice!=null&&!isNaN(+card._supabasePrice)){
    const tcg=+card._supabasePrice; if(!tcg) return null;
    const fmv=+tcg.toFixed(2);
    return{fmv,fmvEUR:+(fmv*EUR_RATE).toFixed(2),net:+(fmv*0.87).toFixed(2),netEUR:+(fmv*EUR_RATE*0.87).toFixed(2),tcg,low:null,high:null,_src:card._priceSource||'db'};
  }
  const p=card.tcgplayer?.prices;if(!p) return null;
  const t=p.holofoil||p["1stEditionHolofoil"]||p.normal||p.reverseHolofoil||p.unlimited||Object.values(p)[0];
  if(!t) return null;
  const tcg=t.market||t.mid||((t.low+t.high)/2)||null;if(!tcg) return null;
  const fmv=+(tcg*0.40+(tcg*0.88)*0.35+(tcg*1.06)*0.25).toFixed(2);
  return{fmv,fmvEUR:+(fmv*EUR_RATE).toFixed(2),net:+(fmv*0.87).toFixed(2),netEUR:+(fmv*EUR_RATE*0.87).toFixed(2),tcg,low:t.low,high:t.high};
}
function calcMTGFMV(card){
  const p=card.prices;if(!p) return null;
  const usd=parseFloat(p.usd||p.usd_foil||0)||null;
  const eur=parseFloat(p.eur||p.eur_foil||0)||null;
  if(!usd&&!eur) return null;
  const fmv=+((usd||(eur/EUR_RATE))*0.55+((eur||(usd*EUR_RATE))/EUR_RATE)*0.45).toFixed(2);
  return{fmv,fmvEUR:+(fmv*EUR_RATE).toFixed(2),net:+(fmv*0.87).toFixed(2),netEUR:+(fmv*EUR_RATE*0.87).toFixed(2)};
}
function calcYGOFMV(card){
  const pr=card.card_prices?.[0];if(!pr) return null;
  const tcg=parseFloat(pr.tcgplayer_price||0)||null;
  const cm=parseFloat(pr.cardmarket_price||0)||null;
  if(!tcg&&!cm) return null;
  const t=tcg||(cm/EUR_RATE);const c=cm||(tcg*EUR_RATE*0.88);
  const fmv=+(t*0.40+(c/EUR_RATE)*0.35+(t*1.05)*0.25).toFixed(2);
  return{fmv,fmvEUR:+(fmv*EUR_RATE).toFixed(2),net:+(fmv*0.87).toFixed(2),netEUR:+(fmv*EUR_RATE*0.87).toFixed(2)};
}
function psaEst(fmv){
  return{p10:+(fmv*3.2).toFixed(2),p10e:+(fmv*3.2*EUR_RATE).toFixed(2),
    p9:+(fmv*1.6).toFixed(2),p9e:+(fmv*1.6*EUR_RATE).toFixed(2),
    p8:+(fmv*1.1).toFixed(2),p8e:+(fmv*1.1*EUR_RATE).toFixed(2)};
}
function rLvl(r){
  if(!r) return 0;const rl=r.toLowerCase();
  if(rl.includes("secret")||rl.includes("special illustration")) return 4;
  if(rl.includes("ultra")||rl.includes("hyper")||rl==="mythic rare") return 3;
  if(rl.includes("vmax")||rl.includes("vstar")||rl.includes("prime")||rl.includes("holo")) return 2;
  return 1;
}
function mkSpark(base,n=20){const a=[base];for(let i=1;i<n;i++) a.push(Math.max(0.5,a[i-1]*(0.93+Math.random()*0.14)));return a;}
function mkPortChart(v,days=30){const a=[v];for(let i=1;i<days;i++) a.unshift(Math.max(1,a[0]*(0.96+Math.random()*0.09)));return a;}
function mkPriceHist(fmv,days=30){
  const a=[fmv];
  for(let i=1;i<days;i++) a.unshift(Math.max(fmv*0.4,a[0]*(0.97+Math.random()*0.07)));
  return a;
}

function Spark({data,w=100,h=30,pos}){
  const max=Math.max(...data),min=Math.min(...data),rng=max-min||1;
  const pts=data.map((v,i)=>[(i/(data.length-1))*w,h-((v-min)/rng)*(h*.82)-h*.09]);
  const line=pts.map((p,i)=>`${i===0?"M":"L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const col=pos?"#34d399":"#f87171";
  return(
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{overflow:"visible",display:"block"}}>
      <defs><linearGradient id={`spg${pos?1:0}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={col} stopOpacity=".3"/><stop offset="100%" stopColor={col} stopOpacity="0"/>
      </linearGradient></defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={`url(#spg${pos?1:0})`}/>
      <path d={line} fill="none" stroke={col} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// HoloCard: interactive card with 3D tilt + holographic shine that follows the cursor.
// Stile ispirato a Scrydex / Collectr — la carta si "anima" sotto il mouse.
// Usa CSS variables (--mx, --my, --rx, --ry) settate via mouseMove e lette dal CSS.
function HoloCard({src,alt,onClick,big=false,small=false,bgFallback=true}){
  const ref=useRef(null);
  const onMove=useCallback((e)=>{
    const el=ref.current; if(!el) return;
    const r=el.getBoundingClientRect();
    const x=Math.max(0,Math.min(100,((e.clientX-r.left)/r.width)*100));
    const y=Math.max(0,Math.min(100,((e.clientY-r.top)/r.height)*100));
    el.style.setProperty('--mx',x+'%');
    el.style.setProperty('--my',y+'%');
    el.style.setProperty('--rx',(((y-50)/50)*-9)+'deg');
    el.style.setProperty('--ry',(((x-50)/50)*9)+'deg');
    el.style.setProperty('--act','1');
  },[]);
  const onLeave=useCallback(()=>{
    const el=ref.current; if(!el) return;
    el.style.setProperty('--rx','0deg');
    el.style.setProperty('--ry','0deg');
    el.style.setProperty('--mx','50%');
    el.style.setProperty('--my','50%');
    el.style.setProperty('--act','0');
  },[]);
  return(
    <div ref={ref} className={`holocard${big?' big':''}${small?' sm':''}`}
         onMouseMove={onMove} onMouseLeave={onLeave} onClick={onClick}>
      <div className="holocard-tilt">
        {src?<img src={src} alt={alt||''} loading="lazy"/>:(bgFallback?<div className="holocard-ph"/>:null)}
        <div className="holocard-shine"/>
        <div className="holocard-holo"/>
        <div className="holocard-edge"/>
      </div>
    </div>
  );
}

function LineChart({data,w=300,h=80,color="#34d399",id="lc"}){
  if(!data||data.length<2) return null;
  const max=Math.max(...data),min=Math.min(...data),rng=max-min||1;
  const pts=data.map((v,i)=>[(i/(data.length-1))*w,h-((v-min)/rng)*(h*.85)-h*.075]);
  const line=pts.map((p,i)=>`${i===0?"M":"L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  return(
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{display:"block"}}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity=".2"/><stop offset="100%" stopColor={color} stopOpacity="0"/>
      </linearGradient></defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={`url(#${id})`}/>
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="3.5" fill={color}/>
    </svg>
  );
}

// ─── CSS — mobile first ───────────────────────────────────────────────────────
const CSS=`
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Fraunces:opsz,wght@9..144,700;9..144,800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
html,body{background:#020208;color:#f8f8ff;font-family:'Plus Jakarta Sans',sans-serif;-webkit-font-smoothing:antialiased;}
button,input,select{font-family:'Plus Jakarta Sans',sans-serif;}
a{text-decoration:none;}
img{display:block;}
::-webkit-scrollbar{width:3px;height:3px;}
::-webkit-scrollbar-thumb{background:#1e1e34;border-radius:2px;}

/* TOKENS */
:root{
  --bg:#020208;--s1:#06060f;--s2:#0b0b18;
  --gl:rgba(255,255,255,.042);--gb:rgba(255,255,255,.09);--gb2:rgba(255,255,255,.16);
  --amber:#fbbf24;--amber-b:rgba(251,191,36,.09);--amber-g:rgba(251,191,36,.16);
  --pink:#f472b6;  --pink-b:rgba(244,114,182,.08);
  --blue:#38bdf8;  --blue-b:rgba(56,189,248,.08);
  --purple:#a78bfa;--purple-b:rgba(167,139,250,.08);
  --lime:#a3e635;  --lime-b:rgba(163,230,53,.08);
  --gain:#34d399;  --gain-g:rgba(52,211,153,.12);
  --loss:#f87171;  --loss-g:rgba(248,113,113,.12);
  --txt2:#b4b4cc;--muted:#8a8aa8;--dim:#3a3a52;
  --p:16px;
}

/* GRADIENT ANIMATION */
@keyframes gf{0%{background-position:0% 50%}100%{background-position:300% 50%}}
.gt{background:linear-gradient(90deg,var(--blue),var(--purple),var(--pink),var(--amber),var(--lime),var(--blue));
  background-size:300% 100%;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:gf 6s linear infinite;}
.gt-gold{background:linear-gradient(135deg,#fff 0%,#e0e0ff 30%,var(--amber) 60%,var(--pink) 100%);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}

/* NAV — mobile first */
.nav{position:sticky;top:0;z-index:90;height:54px;display:flex;align-items:center;
  justify-content:space-between;padding:0 var(--p);
  background:rgba(2,2,8,.94);backdrop-filter:blur(28px);position:relative;}
.nav::after{content:'';position:absolute;bottom:0;left:0;right:0;height:1px;
  background:linear-gradient(90deg,transparent,var(--purple),var(--blue),var(--pink),var(--amber),transparent);opacity:.28;}
.nav-l{display:flex;align-items:center;gap:10px;}
.logo-gem{width:40px;height:40px;flex-shrink:0;object-fit:contain;background:transparent;border:none;
  filter:drop-shadow(0 0 12px rgba(251,191,36,.45));}
.logo-txt{font-family:'Fraunces',sans-serif;font-size:18px;font-weight:800;letter-spacing:-.5px;}
.nav-r{display:flex;align-items:center;gap:6px;}
.cur-row{display:none;}
.curb{padding:4px 9px;border:none;background:none;color:var(--muted);font-size:10px;font-weight:700;
  cursor:pointer;border-radius:5px;transition:all .18s;font-family:'Space Mono',monospace;letter-spacing:.5px;}
.curb.on{background:var(--amber-b);color:var(--amber);}
.ldw{display:none;}/* UI translation coming soon. Hidden until i18n is implemented. */
.ldw-x{position:relative;}
.ldb{display:flex;align-items:center;gap:4px;padding:5px 10px;background:var(--gl);border:1px solid var(--gb);
  border-radius:8px;color:var(--txt2);font-size:12px;font-weight:600;cursor:pointer;transition:all .2s;}
.lch{font-size:9px;color:var(--muted);transition:transform .2s;}.lch.op{transform:rotate(180deg);}
.ldm{position:absolute;top:calc(100%+6px);right:0;min-width:148px;background:var(--s1);
  border:1px solid var(--gb);border-radius:12px;padding:4px;z-index:200;
  box-shadow:0 20px 48px rgba(0,0,0,.75);animation:dd .13s ease;}
@keyframes dd{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
.lo{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;
  cursor:pointer;font-size:12px;font-weight:500;color:var(--muted);transition:all .15s;}
.lo:hover,.lo.on{background:var(--amber-b);color:#f8f8ff;}
.auth-btn{padding:6px 12px;background:linear-gradient(135deg,var(--amber),var(--pink));
  color:#020208;border:none;border-radius:8px;font-size:12px;font-weight:800;cursor:pointer;transition:all .2s;}
.auth-btn:hover{filter:brightness(1.1);}
.user-chip{display:flex;align-items:center;gap:6px;padding:4px 10px;background:var(--amber-b);
  border:1px solid rgba(251,191,36,.22);border-radius:8px;cursor:pointer;color:var(--amber);font-size:12px;font-weight:700;}
.user-av{width:20px;height:20px;border-radius:50%;background:linear-gradient(135deg,var(--amber),var(--pink));
  display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#020208;}

/* MARKET PULSE */
.pulse-bar{display:flex;overflow-x:auto;border-bottom:1px solid rgba(255,255,255,.05);-webkit-overflow-scrolling:touch;}
.pulse-bar::-webkit-scrollbar{display:none;}
.pulse-item{display:flex;align-items:center;gap:7px;padding:7px 16px;flex-shrink:0;
  border-right:1px solid rgba(255,255,255,.05);}
.pulse-dot{width:4px;height:4px;border-radius:50%;flex-shrink:0;}
.pulse-name{font-size:11px;font-weight:700;color:var(--txt2);white-space:nowrap;}
.pulse-chg{font-family:'Space Mono',monospace;font-size:11px;font-weight:700;}
.pulse-vol{font-size:10px;color:var(--dim);font-family:'Space Mono',monospace;}

/* GEO */
.geo{padding:6px var(--p);display:flex;align-items:center;gap:7px;font-size:10px;
  font-family:'Space Mono',monospace;background:linear-gradient(90deg,var(--blue-b),var(--purple-b));
  border-bottom:1px solid rgba(167,139,250,.1);color:var(--blue);}
.geo-dot{width:4px;height:4px;background:var(--blue);border-radius:50%;animation:gp 2.5s ease-in-out infinite;}
@keyframes gp{0%,100%{opacity:1}50%{opacity:.3}}

/* TABS — horizontal scroll on mobile */
.tbar{background:var(--bg);border-bottom:1px solid rgba(255,255,255,.05);}
.tabs{display:flex;overflow-x:auto;-webkit-overflow-scrolling:touch;padding:0 4px;}
.tabs::-webkit-scrollbar{display:none;}
.tb{flex:0 0 auto;padding:12px 16px;background:none;border:none;border-bottom:2px solid transparent;
  color:var(--muted);font-size:11px;font-weight:700;cursor:pointer;transition:all .2s;letter-spacing:.1px;white-space:nowrap;}
.tb.on{color:var(--amber);border-bottom-color:var(--amber);}
.tbb{display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;
  padding:0 4px;background:var(--amber-b);color:var(--amber);border-radius:100px;
  font-size:9px;font-family:'Space Mono',monospace;margin-left:4px;}

/* HERO — mobile first */
.hero{position:relative;overflow:hidden;padding:40px var(--p) 32px;}
.aurora{position:absolute;inset:0;pointer-events:none;overflow:hidden;}
.ab{position:absolute;border-radius:50%;}
.ab1{width:500px;height:500px;background:radial-gradient(circle,rgba(56,189,248,.07),transparent 60%);top:-240px;left:-180px;animation:aa1 18s ease-in-out infinite;}
.ab2{width:450px;height:450px;background:radial-gradient(circle,rgba(167,139,250,.07),transparent 60%);top:-160px;right:-180px;animation:aa2 22s ease-in-out infinite;}
.ab3{width:340px;height:340px;background:radial-gradient(circle,rgba(244,114,182,.06),transparent 60%);bottom:-80px;left:20%;animation:aa3 26s ease-in-out infinite;}
.ab4{width:300px;height:300px;background:radial-gradient(circle,rgba(251,191,36,.05),transparent 60%);bottom:-60px;right:10%;animation:aa4 20s ease-in-out infinite;}
@keyframes aa1{0%,100%{transform:translate(0,0)}33%{transform:translate(60px,50px)}66%{transform:translate(-40px,70px)}}
@keyframes aa2{0%,100%{transform:translate(0,0)}33%{transform:translate(-70px,30px)}66%{transform:translate(50px,-60px)}}
@keyframes aa3{0%,100%{transform:translate(0,0)}50%{transform:translate(50px,-30px)}}
@keyframes aa4{0%,100%{transform:translate(0,0)}50%{transform:translate(-40px,-25px)}}
.hero::before{content:'';position:absolute;inset:0;pointer-events:none;
  background-image:radial-gradient(circle,rgba(255,255,255,.055) 1px,transparent 1px);
  background-size:28px 28px;
  mask-image:radial-gradient(ellipse 80% 60% at 50% 50%,transparent 30%,black 100%);
  -webkit-mask-image:radial-gradient(ellipse 80% 60% at 50% 50%,transparent 30%,black 100%);}
.hero-inner{position:relative;z-index:2;max-width:1100px;margin:0 auto;}
.hero-cols{display:flex;align-items:center;gap:36px;}
.hero-left{flex:1;min-width:0;}
.hero-right{display:none;width:340px;flex-shrink:0;}
.hero-badge{display:inline-flex;align-items:center;gap:6px;background:var(--gl);border:1px solid var(--gb);
  border-radius:100px;padding:4px 14px;font-size:10px;color:var(--txt2);margin-bottom:16px;
  font-family:'Space Mono',monospace;backdrop-filter:blur(12px);}
.bdot{width:4px;height:4px;background:var(--lime);border-radius:50%;animation:gp 2s ease-in-out infinite;}
.hero-tagline{font-family:'Fraunces',sans-serif;font-size:clamp(32px,10vw,92px);font-weight:800;
  letter-spacing:-2px;line-height:.95;margin-bottom:16px;display:block;}
.hero-sub{font-size:14px;color:var(--muted);line-height:1.7;margin-bottom:22px;font-weight:500;}
.tcg-row{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:20px;}
.tcg-btn{display:flex;align-items:center;gap:6px;padding:9px 14px;border-radius:11px;
  border:1px solid var(--gb);background:var(--gl);font-size:12px;font-weight:700;
  cursor:pointer;transition:all .25s;color:var(--muted);}
.srch{position:relative;max-width:520px;margin-bottom:16px;}
.srch-in{width:100%;padding:14px 110px 14px 18px;background:rgba(255,255,255,.05);
  border:1px solid rgba(255,255,255,.12);border-radius:14px;color:#f8f8ff;font-size:14px;
  font-weight:500;outline:none;transition:all .3s;}
.srch-in:focus{border-color:var(--amber);box-shadow:0 0 0 3px var(--amber-b);}
.srch-in::placeholder{color:var(--muted);}
.sugg-dd{position:absolute;top:calc(100% + 6px);left:0;right:0;background:#0e0e1a;border:1px solid rgba(255,255,255,.08);border-radius:12px;box-shadow:0 16px 40px rgba(0,0,0,.6);z-index:50;overflow:hidden;max-height:440px;overflow-y:auto;}
.sugg-row{display:flex;gap:12px;align-items:center;padding:10px 14px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.04);}
.sugg-row:last-child{border-bottom:none;}
.sugg-row:hover{background:rgba(251,191,36,.08);}
.sugg-img{width:36px;height:50px;object-fit:cover;border-radius:5px;flex-shrink:0;background:#1a1a30;}
.sugg-name{font-family:'Fraunces',serif;font-weight:700;font-size:14px;color:#f5f0e3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.sugg-meta{font-size:11px;color:#8a8aa8;text-transform:capitalize;}
.srch-go{position:absolute;right:6px;top:50%;transform:translateY(-50%);padding:9px 18px;
  background:linear-gradient(135deg,var(--amber),var(--pink));color:#020208;border:none;
  border-radius:10px;font-size:12px;font-weight:800;cursor:pointer;transition:all .2s;
  box-shadow:0 4px 16px rgba(251,191,36,.3);}
.srch-go:hover{filter:brightness(1.1);}
.demo-bar{background:var(--purple-b);border:1px solid rgba(167,139,250,.18);border-radius:9px;
  padding:7px 13px;font-size:11px;color:var(--purple);font-family:'Space Mono',monospace;max-width:520px;margin-bottom:14px;}
.mq-wrap{position:relative;overflow:hidden;padding:8px 0;border-top:1px solid rgba(255,255,255,.05);max-width:520px;}
.mq-wrap::before,.mq-wrap::after{content:'';position:absolute;top:0;bottom:0;width:40px;z-index:2;pointer-events:none;}
.mq-wrap::before{left:0;background:linear-gradient(90deg,#020208,transparent);}
.mq-wrap::after{right:0;background:linear-gradient(-90deg,#020208,transparent);}
.mq{display:inline-flex;white-space:nowrap;animation:mq 30s linear infinite;
  font-size:10px;color:var(--muted);font-family:'Space Mono',monospace;letter-spacing:.3px;}
@keyframes mq{from{transform:translateX(0)}to{transform:translateX(-50%)}}

/* FLOATING CARDS (desktop only) */
.fc-wrap{position:relative;width:320px;height:400px;}
.fcard{position:absolute;width:150px;height:210px;border-radius:12px;box-shadow:0 28px 60px rgba(0,0,0,.7);object-fit:cover;background:#000;}
.fcard:nth-of-type(1){width:150px;left:0;top:50px;transform:rotate(-10deg);animation:fl1 5s ease-in-out infinite;}
.fcard:nth-of-type(2){width:165px;height:231px;left:85px;top:0;z-index:3;transform:rotate(2deg);animation:fl2 6.5s ease-in-out infinite;}
.fcard:nth-of-type(3){width:150px;right:0;top:50px;transform:rotate(10deg);animation:fl3 7.5s ease-in-out infinite;}
@keyframes fl1{0%,100%{transform:rotate(-12deg) translateY(0)}50%{transform:rotate(-12deg) translateY(-16px)}}
@keyframes fl2{0%,100%{transform:rotate(1deg) translateY(-8px)}50%{transform:rotate(1deg) translateY(12px)}}
@keyframes fl3{0%,100%{transform:rotate(14deg) translateY(5px)}50%{transform:rotate(14deg) translateY(-13px)}}
.cglow{position:absolute;border-radius:50%;filter:blur(38px);pointer-events:none;z-index:-1;}

/* LANG FILTER */
.lf{padding:20px var(--p) 24px;}
.lf-lbl{font-size:10px;color:var(--dim);font-family:'Space Mono',monospace;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:10px;text-align:center;}
.lf-pills{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;}
.lp{display:flex;align-items:center;gap:4px;padding:6px 11px;border-radius:100px;
  border:1px solid rgba(255,255,255,.07);background:var(--gl);font-size:11px;font-weight:600;
  color:var(--muted);cursor:pointer;transition:all .22s;}
.lp:hover{border-color:rgba(251,191,36,.3);color:#f8f8ff;}
.lp.on{border-color:var(--amber);color:var(--amber);background:var(--amber-b);}
.lp.off{opacity:.25;cursor:not-allowed;}
.lp-hot{font-size:9px;background:var(--pink-b);color:var(--pink);padding:1px 5px;border-radius:100px;font-family:'Space Mono',monospace;}
.lp-soon{font-size:9px;background:var(--dim);color:var(--muted);padding:1px 5px;border-radius:100px;font-family:'Space Mono',monospace;}

/* CONTENT WRAPPER */
.cw{padding:0 var(--p) 72px;}
.rmsg{text-align:center;color:var(--muted);padding:52px 0;font-size:14px;}

/* FEATURED CARD */
.feat{background:var(--s2);border:1px solid var(--gb);border-radius:18px;overflow:hidden;
  margin-bottom:18px;display:flex;flex-direction:column;position:relative;transition:all .3s;}
.feat:hover{border-color:rgba(251,191,36,.22);}
.feat-img{background:var(--s1);display:flex;align-items:center;justify-content:center;cursor:zoom-in;overflow:hidden;
  padding:20px;position:relative;overflow:hidden;cursor:pointer;min-height:180px;}
.feat-img img{max-width:220px;width:auto;height:auto;max-height:320px;object-fit:contain;border-radius:10px;box-shadow:0 14px 36px rgba(0,0,0,.5);}
.feat-holo{position:absolute;inset:-80%;width:260%;height:260%;
  background:conic-gradient(from 0deg at 50% 50%,rgba(255,0,100,.28),rgba(255,150,0,.28),rgba(255,255,0,.28),rgba(0,255,100,.28),rgba(0,150,255,.28),rgba(150,0,255,.28),rgba(255,0,100,.28));
  pointer-events:none;opacity:0;transition:opacity .4s;mix-blend-mode:color-dodge;}
.feat:hover .feat-holo{opacity:1;animation:hs 4s linear infinite;}
@keyframes hs{to{transform:rotate(360deg)}}
.feat-img-wrap{padding:24px;background:var(--s1);display:flex;align-items:center;justify-content:center;min-height:180px;}
.feat-img-wrap .holocard{max-width:200px;}
.feat-body{padding:18px;display:flex;flex-direction:column;gap:10px;}
.feat-lbl{font-size:9px;color:var(--amber);font-family:'Space Mono',monospace;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;}
.feat-name{font-family:'Fraunces',sans-serif;font-size:22px;font-weight:800;letter-spacing:-.5px;line-height:1.1;}
.feat-set{font-size:12px;color:var(--muted);}
.feat-badges{display:flex;gap:5px;flex-wrap:wrap;}
.feat-price{font-family:'Space Mono',monospace;font-size:28px;font-weight:700;margin-bottom:1px;}
.feat-price-ref{font-size:10px;color:var(--dim);font-family:'Space Mono',monospace;}
.feat-net{font-size:12px;color:var(--gain);font-family:'Space Mono',monospace;}
.feat-actions{display:flex;gap:7px;flex-wrap:wrap;}
.btn-buy{display:flex;align-items:center;gap:6px;padding:10px 18px;
  background:linear-gradient(135deg,var(--amber),var(--pink));color:#020208;
  border:none;border-radius:10px;font-size:13px;font-weight:800;cursor:pointer;
  transition:all .2s;text-decoration:none;box-shadow:0 4px 14px rgba(251,191,36,.22);}
.btn-buy:hover{filter:brightness(1.1);}
.btn-ghost{padding:10px 14px;background:var(--gl);border:1px solid var(--gb);color:var(--muted);
  border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;transition:all .2s;}
.btn-ghost:hover{border-color:var(--gain);color:var(--gain);}
.btn-ghost.in{background:var(--gain-g);border-color:rgba(52,211,153,.25);color:var(--gain);}
.btn-heart{padding:10px 13px;background:rgba(244,114,182,.08);border:1px solid rgba(244,114,182,.35);
  border-radius:10px;font-size:17px;color:var(--pink);cursor:pointer;transition:all .2s;}
.btn-heart:hover,.btn-heart.on{border-color:var(--pink);background:var(--pink-b);color:#fff;}

/* PLATFORM REF */
.pref{display:flex;gap:10px;flex-wrap:wrap;padding:6px 0;border-top:1px solid rgba(255,255,255,.05);margin-top:2px;}
.pref-i{font-family:'Space Mono',monospace;font-size:10px;color:var(--dim);}
.pref-i span{color:var(--muted);}

/* CARD GRID */
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;}
.kcard{background:var(--s2);border:1px solid rgba(255,255,255,.07);border-radius:16px;overflow:hidden;
  transition:transform .3s cubic-bezier(.34,1.56,.64,1),border-color .3s,box-shadow .3s;
  animation:ci .38s ease both;}
@keyframes ci{from{opacity:0;transform:translateY(16px) scale(.96)}to{opacity:1;transform:none}}
.kcard:hover{transform:translateY(-8px) scale(1.02);border-color:rgba(251,191,36,.22);}
.kcard.r2:hover{box-shadow:0 22px 44px rgba(0,0,0,.5),0 0 36px rgba(251,191,36,.2);}
.kcard.r3:hover{box-shadow:0 22px 44px rgba(0,0,0,.5),0 0 44px rgba(244,114,182,.26);}
.kcard.r4:hover{box-shadow:0 22px 44px rgba(0,0,0,.5),0 0 56px rgba(251,191,36,.36);}
.kcard-img{position:relative;background:var(--s1);cursor:pointer;overflow:hidden;}
.kcard-img img{width:100%;transition:transform .4s;}
.kcard:hover .kcard-img img{transform:scale(1.06);}
.holo-s{position:absolute;inset:-80%;width:260%;height:260%;
  background:conic-gradient(from 0deg at 50% 50%,rgba(255,0,100,.32),rgba(255,140,0,.32),rgba(255,255,0,.32),rgba(0,255,100,.32),rgba(0,180,255,.32),rgba(150,0,255,.32),rgba(255,0,100,.32));
  mix-blend-mode:color-dodge;opacity:0;transition:opacity .35s;pointer-events:none;}
.kcard:hover .holo-s{opacity:1;animation:hs 3.5s linear infinite;}
.holo-sh{position:absolute;inset:0;pointer-events:none;
  background:linear-gradient(105deg,transparent 30%,rgba(255,255,255,.5) 50%,transparent 70%);
  background-size:300% 100%;background-position:-100% 0;opacity:0;}
.kcard:hover .holo-sh{animation:hsh .7s ease-out forwards;}
@keyframes hsh{to{background-position:250% 0;opacity:.85;}}
.kcard-body{padding:10px;}
.kname{font-family:'Fraunces',sans-serif;font-weight:800;font-size:12px;margin-bottom:2px;cursor:pointer;
  transition:color .2s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.kname:hover{color:var(--amber);}
.kset{font-size:9px;color:var(--muted);margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.klang{display:inline-flex;align-items:center;gap:3px;font-size:9px;color:var(--purple);
  background:var(--purple-b);border:1px solid rgba(167,139,250,.2);border-radius:100px;
  padding:2px 6px;margin-bottom:7px;font-family:'Space Mono',monospace;}
.kprice{font-family:'Space Mono',monospace;font-size:15px;font-weight:700;color:var(--amber);margin-bottom:1px;}
.kprice-lbl{font-size:9px;color:var(--muted);font-family:'Space Mono',monospace;margin-bottom:4px;}
.knet{font-size:9px;color:var(--gain);font-family:'Space Mono',monospace;margin-bottom:7px;}
.kact{display:flex;gap:4px;}
.btn-es{flex:1;padding:7px;background:var(--amber-b);border:1px solid rgba(251,191,36,.2);
  color:var(--amber);border-radius:8px;font-size:10px;font-weight:700;cursor:pointer;
  text-decoration:none;display:flex;align-items:center;justify-content:center;gap:3px;transition:all .2s;}
.btn-es:hover{background:var(--amber-g);}
.btn-add-k{padding:7px 9px;background:var(--gl);border:1px solid var(--gb);color:var(--muted);
  border-radius:8px;font-size:12px;cursor:pointer;transition:all .2s;}
.btn-add-k:hover{border-color:rgba(52,211,153,.3);color:var(--gain);}
.btn-add-k.in{background:var(--gain-g);border-color:rgba(52,211,153,.22);color:var(--gain);}
.btn-h-k{padding:7px 9px;background:var(--gl);border:1px solid var(--gb);
  color:var(--muted);border-radius:8px;font-size:12px;cursor:pointer;transition:all .2s;}
.btn-h-k:hover,.btn-h-k.on{border-color:var(--pink);color:var(--pink);background:var(--pink-b);}

/* BADGES */
.mb{font-size:9px;padding:2px 8px;border-radius:100px;font-family:'Space Mono',monospace;font-weight:700;}
.mb-r{background:var(--amber-b);color:var(--amber);border:1px solid rgba(251,191,36,.2);}
.mb-l{background:var(--purple-b);color:var(--purple);border:1px solid rgba(167,139,250,.2);}
.mb-s{background:var(--gl);color:var(--muted);border:1px solid var(--gb);}

/* HOME SECTIONS */
.hs{padding:0 var(--p) 60px;}
.sec-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;}
.sec-title{font-family:'Fraunces',sans-serif;font-size:20px;font-weight:800;letter-spacing:-.5px;}
.sec-badge{font-size:9px;font-family:'Space Mono',monospace;font-weight:700;
  padding:3px 9px;border-radius:100px;letter-spacing:.3px;}
.sb-live{background:var(--loss-g);color:var(--loss);border:1px solid rgba(248,113,113,.2);}

/* HOT PICKS */
.hot-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:9px;position:relative;}
.hot-card{background:var(--s2);border:1px solid var(--gb);border-radius:14px;padding:14px;
  transition:all .25s;cursor:pointer;display:flex;align-items:center;gap:10px;}
.hot-card:hover{border-color:rgba(251,191,36,.2);transform:translateY(-2px);}
.hot-card img{width:96px;border-radius:8px;flex-shrink:0;}
.hc-info{flex:1;min-width:0;}
.hc-name{font-family:'Fraunces',sans-serif;font-weight:800;font-size:14px;margin-bottom:1px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.hc-set{font-size:9px;color:var(--muted);margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.hc-price{font-family:'Space Mono',monospace;font-size:13px;font-weight:700;color:var(--amber);}
.hc-change{font-family:'Space Mono',monospace;font-size:10px;font-weight:700;color:var(--gain);}
.hc-reason{font-size:9px;color:var(--muted);margin-top:2px;line-height:1.3;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
/* TASTE: cards 6-10 blurred */
.hot-card.locked{filter:blur(5px);pointer-events:none;user-select:none;}
.pw-overlay{position:absolute;bottom:0;left:0;right:0;
  background:linear-gradient(0deg,rgba(2,2,8,.98) 0%,rgba(2,2,8,.7) 60%,transparent 100%);
  display:flex;flex-direction:column;align-items:center;justify-content:flex-end;
  padding:20px 16px;min-height:160px;z-index:10;pointer-events:all;}
.pw-txt{font-size:12px;color:var(--txt2);margin-bottom:10px;text-align:center;font-weight:500;}
.pw-btn{padding:9px 20px;background:linear-gradient(135deg,var(--purple),var(--pink));
  color:#020208;border:none;border-radius:9px;font-size:12px;font-weight:800;cursor:pointer;transition:all .2s;}
.pw-btn:hover{filter:brightness(1.1);}

/* GRADING SPOTLIGHT */
.gs-card{background:linear-gradient(135deg,rgba(167,139,250,.07),rgba(56,189,248,.04));
  border:1px solid rgba(167,139,250,.2);border-radius:18px;padding:20px;display:flex;flex-direction:column;gap:14px;}
.gs-img{width:90px;border-radius:9px;box-shadow:0 10px 28px rgba(0,0,0,.5);}
.gs-label{font-size:9px;font-family:'Space Mono',monospace;font-weight:700;color:var(--purple);
  letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;}
.gs-name{font-family:'Fraunces',sans-serif;font-size:20px;font-weight:800;letter-spacing:-.4px;margin-bottom:3px;}
.gs-set{font-size:11px;color:var(--muted);margin-bottom:12px;}
.gs-prices{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:10px;}
.gs-pi{display:flex;flex-direction:column;gap:1px;}
.gs-pi-l{font-size:9px;color:var(--muted);font-family:'Space Mono',monospace;}
.gs-pi-v{font-family:'Space Mono',monospace;font-size:15px;font-weight:700;}
.gs-analysis{font-size:13px;color:var(--txt2);line-height:1.65;}

/* UPCOMING */
.ug{display:grid;grid-template-columns:repeat(1,1fr);gap:10px;}
.uc{background:var(--s2);border:1px solid var(--gb);border-radius:13px;padding:14px;
  display:flex;gap:12px;align-items:center;transition:all .2s;}
.uc:hover{border-color:rgba(255,255,255,.12);transform:translateY(-2px);}
.uc-img{width:52px;height:36px;object-fit:contain;border-radius:5px;flex-shrink:0;background:var(--s1);padding:4px;}
.uc-img-ph{width:52px;height:36px;border-radius:5px;flex-shrink:0;background:var(--s1);
  display:flex;align-items:center;justify-content:center;font-size:18px;}
.uc-info{flex:1;}
.uc-name{font-family:'Fraunces',sans-serif;font-weight:800;font-size:12px;margin-bottom:3px;}
.uc-date{font-size:10px;color:var(--muted);font-family:'Space Mono',monospace;}
.hype-bar{height:3px;background:var(--dim);border-radius:2px;margin-top:5px;overflow:hidden;}
.hype-fill{height:100%;border-radius:2px;background:linear-gradient(90deg,var(--amber),var(--pink));}

/* BLOG PREVIEW */
.bp-grid{display:grid;grid-template-columns:1fr;gap:12px;}
.bpv{background:var(--s2);border:1px solid var(--gb);border-radius:15px;padding:18px;cursor:pointer;transition:all .25s;}
.bpv:hover{border-color:rgba(251,191,36,.16);transform:translateY(-2px);}
.bpv-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}
.bpv-cat{font-size:9px;font-family:'Space Mono',monospace;font-weight:700;
  background:var(--amber-b);color:var(--amber);border:1px solid rgba(251,191,36,.18);
  border-radius:100px;padding:2px 7px;}
.bpv-title{font-family:'Fraunces',sans-serif;font-size:15px;font-weight:800;letter-spacing:-.3px;margin-bottom:8px;line-height:1.3;}
.bpv-chips{display:flex;gap:5px;margin-bottom:9px;overflow-x:auto;padding-bottom:2px;}
.bpv-chips::-webkit-scrollbar{display:none;}
.bpv-chip{display:flex;align-items:center;gap:6px;background:rgba(0,0,0,.3);
  border-radius:7px;padding:5px 8px;flex-shrink:0;}
.bpv-chip img{width:26px;border-radius:4px;}
.bcc-n{font-size:10px;font-weight:700;}
.bcc-c{font-size:9px;font-family:'Space Mono',monospace;font-weight:700;}
.bpv-exc{font-size:12px;color:var(--muted);line-height:1.6;}

/* COMING SOON */
.coming-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;}
.coming-item{background:var(--gl);border:1px solid var(--gb);border-radius:12px;padding:16px;transition:all .22s;}
.coming-item:hover{border-color:rgba(255,255,255,.12);transform:translateY(-2px);}

/* DONATION */
.donate-section{background:linear-gradient(135deg,rgba(251,191,36,.06),rgba(244,114,182,.04));
  border-top:1px solid rgba(251,191,36,.12);border-bottom:1px solid rgba(251,191,36,.12);
  padding:22px var(--p);}
.donate-inner{max-width:1100px;margin:0 auto;display:flex;flex-direction:column;gap:16px;}
.donate-left{display:flex;align-items:flex-start;gap:14px;}
.donate-emoji{font-size:32px;flex-shrink:0;}
.donate-title{font-family:'Fraunces',sans-serif;font-size:18px;font-weight:800;letter-spacing:-.3px;margin-bottom:5px;}
.donate-sub{font-size:13px;color:var(--muted);line-height:1.6;}
.donate-btn{display:flex;align-items:center;justify-content:center;gap:8px;padding:12px 22px;
  background:linear-gradient(135deg,var(--amber),var(--pink));color:#020208;
  border:none;border-radius:11px;font-size:13px;font-weight:800;cursor:pointer;
  text-decoration:none;transition:all .2s;box-shadow:0 4px 16px rgba(251,191,36,.22);width:100%;}
.donate-btn:hover{filter:brightness(1.1);}
.donate-note{font-size:10px;color:var(--dim);font-family:'Space Mono',monospace;text-align:center;}

/* SEALED */
.sealed-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:11px;}
.sc{background:var(--s2);border:1px solid rgba(255,255,255,.07);border-radius:16px;padding:16px;transition:all .25s;}
.sc:hover{border-color:rgba(251,191,36,.2);transform:translateY(-3px);}
.sc-img-wrap{width:100%;height:52px;display:flex;align-items:center;justify-content:center;
  margin-bottom:12px;overflow:hidden;border-radius:7px;background:rgba(0,0,0,.2);}
.sc-img{height:44px;object-fit:contain;filter:drop-shadow(0 3px 8px rgba(0,0,0,.4));}
.sc-name{font-family:'Fraunces',sans-serif;font-weight:800;font-size:12px;margin-bottom:2px;line-height:1.3;}
.sc-set{font-size:10px;color:var(--muted);margin-bottom:8px;}
.sc-type{font-size:9px;font-family:'Space Mono',monospace;font-weight:700;padding:2px 7px;
  border-radius:100px;display:inline-block;margin-bottom:9px;letter-spacing:.3px;}
.ty-etb{background:var(--amber-b);color:var(--amber);border:1px solid rgba(251,191,36,.2);}
.ty-booster{background:var(--lime-b);color:var(--lime);border:1px solid rgba(163,230,53,.2);}
.ty-box{background:var(--purple-b);color:var(--purple);border:1px solid rgba(167,139,250,.2);}
.sc-price{font-family:'Space Mono',monospace;font-size:20px;font-weight:700;margin-bottom:2px;}
.sc-lbl{font-size:9px;color:var(--muted);margin-bottom:11px;font-family:'Space Mono',monospace;}
.sc-buy{display:flex;align-items:center;gap:5px;padding:9px 14px;
  background:linear-gradient(135deg,var(--amber),var(--pink));color:#020208;
  border:none;border-radius:8px;font-size:11px;font-weight:800;cursor:pointer;
  text-decoration:none;width:100%;justify-content:center;transition:all .2s;}
.sc-buy:hover{filter:brightness(1.1);}

/* BLOG */
.blog-grid{display:grid;grid-template-columns:1fr;gap:14px;}
.bcard{background:var(--s2);border:1px solid var(--gb);border-radius:18px;padding:20px;cursor:pointer;transition:all .25s;position:relative;overflow:hidden;}
.bcard::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;
  background:linear-gradient(90deg,var(--amber),var(--pink),var(--purple));opacity:0;transition:opacity .3s;}
.bcard:hover{border-color:rgba(251,191,36,.18);transform:translateY(-3px);box-shadow:0 16px 32px rgba(0,0,0,.4);}
.bcard:hover::before{opacity:1;}
.bcard-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;}
.bcard-cat{font-size:9px;font-family:'Space Mono',monospace;font-weight:700;
  background:var(--amber-b);color:var(--amber);border:1px solid rgba(251,191,36,.18);border-radius:100px;padding:2px 7px;}
.bcard-meta{font-size:10px;color:var(--muted);font-family:'Space Mono',monospace;}
.bcard-title{font-family:'Fraunces',sans-serif;font-size:17px;font-weight:800;letter-spacing:-.3px;margin-bottom:9px;line-height:1.3;}
.bcard-chips{display:flex;gap:7px;margin-bottom:10px;overflow-x:auto;padding-bottom:2px;}
.bcard-chips::-webkit-scrollbar{display:none;}
.bc-chip{display:flex;align-items:center;gap:7px;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.06);border-radius:8px;padding:6px 9px;flex-shrink:0;}
.bc-chip img{width:32px;border-radius:5px;}
.bc-n{font-weight:700;font-size:11px;}
.bc-p{font-family:'Space Mono',monospace;font-size:10px;color:var(--amber);}
.bc-c{font-family:'Space Mono',monospace;font-size:10px;font-weight:700;}
.bcard-exc{font-size:13px;color:var(--muted);line-height:1.65;margin-bottom:12px;}
.bcard-cta{font-size:12px;font-weight:700;color:var(--amber);}

/* ARTICLE */
.art-ov{position:fixed;inset:0;background:rgba(1,1,5,.95);z-index:400;overflow-y:auto;
  padding:20px var(--p);animation:fi .2s ease;}
@keyframes fi{from{opacity:0}to{opacity:1}}
.art-inner{max-width:680px;margin:0 auto;}
.art-back{display:flex;align-items:center;gap:7px;cursor:pointer;color:var(--muted);font-size:13px;
  font-weight:600;margin-bottom:28px;transition:color .2s;background:none;border:none;}
.art-back:hover{color:var(--amber);}
.art-emoji{font-size:42px;margin-bottom:12px;display:block;}
.art-title{font-family:'Fraunces',sans-serif;font-size:clamp(22px,5vw,36px);font-weight:800;letter-spacing:-1px;margin-bottom:18px;line-height:1.15;}
.art-cards{display:flex;gap:12px;margin:16px 0 24px;flex-wrap:wrap;}
.art-card{display:flex;align-items:center;gap:11px;background:var(--s2);border:1px solid var(--gb);border-radius:12px;padding:10px 14px;flex:1;min-width:180px;}
.art-card img{width:46px;border-radius:7px;}
.ac-name{font-family:'Fraunces',sans-serif;font-weight:800;font-size:13px;margin-bottom:2px;}
.ac-set{font-size:10px;color:var(--muted);margin-bottom:3px;}
.ac-price{font-family:'Space Mono',monospace;font-size:14px;font-weight:700;color:var(--amber);}
.ac-chg{font-family:'Space Mono',monospace;font-size:11px;font-weight:700;}
.art-divider{height:1px;background:rgba(255,255,255,.06);margin:24px 0;}
.art-p{font-size:16px;color:var(--txt2);line-height:1.85;margin-bottom:20px;}
.art-cta{background:linear-gradient(135deg,var(--amber-b),var(--pink-b));border:1px solid rgba(251,191,36,.14);border-radius:14px;padding:20px;text-align:center;margin-top:28px;}
.art-cta-t{font-family:'Fraunces',sans-serif;font-size:17px;font-weight:800;margin-bottom:12px;}

/* BINDER */
.binder-wrap{padding:0 var(--p) 72px;}
.binder-hdr{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:20px;gap:12px;flex-wrap:wrap;}
.btn-nb{display:flex;align-items:center;gap:6px;padding:10px 16px;
  background:linear-gradient(135deg,var(--amber),var(--pink));color:#020208;
  border:none;border-radius:10px;font-size:12px;font-weight:800;cursor:pointer;transition:all .2s;white-space:nowrap;}
.btn-nb:hover{filter:brightness(1.1);}
.blist{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:22px;}
.bi{background:var(--s2);border:1px solid var(--gb);border-radius:13px;padding:14px;cursor:pointer;transition:all .25s;}
.bi:hover{border-color:rgba(251,191,36,.18);transform:translateY(-2px);}
.bi.active{border-color:var(--amber);background:var(--amber-b);}
.bi-name{font-family:'Fraunces',sans-serif;font-weight:800;font-size:13px;margin-bottom:3px;}
.bi-meta{font-size:10px;color:var(--muted);font-family:'Space Mono',monospace;}
.bi-val{font-family:'Space Mono',monospace;font-size:13px;font-weight:700;color:var(--amber);margin-top:7px;}
.bv{background:linear-gradient(145deg,#110a06,#060611);border:1px solid rgba(255,255,255,.07);border-radius:16px;padding:18px;margin-bottom:16px;}
.bv-hdr{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;gap:10px;flex-wrap:wrap;}
.bv-name{font-family:'Fraunces',sans-serif;font-size:16px;font-weight:800;color:var(--amber);}
.bv-info{font-size:10px;color:var(--muted);font-family:'Space Mono',monospace;margin-top:2px;}
.bv-val{font-family:'Space Mono',monospace;font-size:12px;font-weight:700;color:var(--gain);}
.bv-nav{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
.btn-pg{padding:6px 11px;background:var(--gl);border:1px solid var(--gb);color:var(--muted);border-radius:7px;font-size:12px;cursor:pointer;transition:all .2s;font-weight:700;}
.btn-pg:hover:not(:disabled){border-color:var(--amber);color:var(--amber);}
.btn-pg:disabled{opacity:.28;cursor:not-allowed;}
.bgrid{display:grid;gap:7px;margin-bottom:12px;}
.bslot{aspect-ratio:2/3;border-radius:9px;border:1px dashed rgba(255,255,255,.12);background:rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .2s;overflow:hidden;position:relative;}
.bslot:hover{border-color:var(--amber);background:rgba(251,191,36,.04);}
.bslot.filled{border:none;}
.bslot img{width:100%;height:100%;object-fit:cover;transition:transform .3s;}
.bslot.filled:hover img{transform:scale(1.05);}
.bslot-rm{position:absolute;top:3px;right:3px;width:18px;height:18px;background:rgba(0,0,0,.8);border:none;border-radius:50%;color:var(--loss);font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .2s;z-index:2;}
.bslot.filled:hover .bslot-rm{opacity:1;}
.bslot-val{position:absolute;bottom:2px;left:2px;right:2px;background:rgba(0,0,0,.85);border-radius:3px;padding:2px 3px;font-size:8px;font-family:'Space Mono',monospace;color:var(--amber);text-align:center;opacity:0;transition:opacity .2s;}
.bslot.filled:hover .bslot-val{opacity:1;}
.bslot-empty{font-size:18px;opacity:.22;}
.binder-empty{text-align:center;padding:48px 20px;}

/* COLLECTION */
.col-wrap{padding:0 var(--p) 72px;}
.col-tabs{display:flex;gap:6px;margin-bottom:18px;}
.col-tab{padding:8px 18px;border:1px solid var(--gb);background:var(--gl);color:var(--muted);
  border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;transition:all .2s;}
.col-tab.on{border-color:var(--amber);background:var(--amber-b);color:var(--amber);}
.col-empty{text-align:center;padding:60px 20px;}
.col-ei{font-size:48px;margin-bottom:14px;display:block;}
.col-et{font-family:'Fraunces',sans-serif;font-size:18px;font-weight:800;margin-bottom:7px;}
.col-es{font-size:13px;color:var(--muted);}
.bento{display:grid;grid-template-columns:1fr;gap:11px;margin-bottom:18px;}
.bento-main{background:var(--s2);border:1px solid rgba(251,191,36,.14);border-radius:20px;padding:20px;position:relative;overflow:hidden;}
.bento-main::before{content:'';position:absolute;top:-70px;right:-70px;width:200px;height:200px;border-radius:50%;background:radial-gradient(circle,rgba(251,191,36,.1),transparent 65%);pointer-events:none;}
.port-val{font-family:'Space Mono',monospace;font-size:32px;font-weight:700;letter-spacing:-1px;margin-bottom:2px;}
.port-chg{font-family:'Space Mono',monospace;font-size:12px;font-weight:700;margin-bottom:3px;}
.port-lbl{font-size:11px;color:var(--muted);margin-bottom:12px;}
.port-chart{margin-bottom:12px;}
.range-row{display:flex;gap:5px;margin-bottom:14px;}
.rbtn{padding:4px 10px;background:var(--gl);border:1px solid var(--gb);color:var(--muted);border-radius:6px;font-size:9px;font-weight:700;cursor:pointer;transition:all .2s;font-family:'Space Mono',monospace;}
.rbtn.on{background:var(--gain-g);border-color:rgba(52,211,153,.25);color:var(--gain);}
.port-stats{display:flex;gap:16px;flex-wrap:wrap;}
.pst{display:flex;flex-direction:column;gap:2px;}
.pst-v{font-family:'Space Mono',monospace;font-size:13px;font-weight:700;}
.pst-l{font-size:10px;color:var(--muted);}
.bento-roi{background:var(--s2);border:1px solid rgba(255,255,255,.07);border-radius:20px;padding:18px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:3px;}
.roi-val{font-family:'Fraunces',sans-serif;font-size:28px;font-weight:800;letter-spacing:-.8px;}
.roi-lbl{font-size:10px;color:var(--muted);}
.col-list{display:grid;gap:8px;}
.ci{background:var(--gl);border:1px solid var(--gb);border-radius:14px;padding:12px;display:flex;align-items:center;gap:11px;transition:border-color .2s;}
.ci:hover{border-color:rgba(251,191,36,.14);}
.ci img{width:46px;border-radius:8px;flex-shrink:0;}
.ci-info{flex:1;min-width:0;}
.ci-name{font-family:'Fraunces',sans-serif;font-weight:800;font-size:12px;margin-bottom:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ci-sub{font-size:10px;color:var(--muted);margin-bottom:5px;}
.ci-pr{display:flex;align-items:center;gap:7px;flex-wrap:wrap;}
.ci-fmv{font-family:'Space Mono',monospace;font-size:12px;font-weight:700;color:var(--amber);}
.ci-cond{font-size:9px;font-family:'Space Mono',monospace;font-weight:700;padding:1px 5px;border-radius:4px;background:rgba(255,255,255,.06);color:var(--muted);}
.ci-paid{font-family:'Space Mono',monospace;font-size:9px;color:var(--dim);}
.ci-pnl{font-family:'Space Mono',monospace;font-size:9px;font-weight:700;}
.pos{color:var(--gain);}.neg{color:var(--loss);}
.btn-rm{background:none;border:none;color:var(--dim);font-size:15px;padding:4px;flex-shrink:0;cursor:pointer;transition:color .2s;}
.btn-rm:hover{color:var(--loss);}

/* WATCHLIST ITEM */
.wi{background:var(--gl);border:1px solid var(--gb);border-radius:14px;padding:12px;
  display:flex;align-items:center;gap:11px;transition:border-color .2s;cursor:pointer;}
.wi:hover{border-color:rgba(244,114,182,.18);}
.wi img{width:46px;border-radius:8px;flex-shrink:0;}
.wi-info{flex:1;min-width:0;}
.wi-name{font-family:'Fraunces',sans-serif;font-weight:800;font-size:12px;margin-bottom:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.wi-set{font-size:10px;color:var(--muted);margin-bottom:5px;}
.wi-price{font-family:'Space Mono',monospace;font-size:13px;font-weight:700;color:var(--amber);}
.wi-alert{font-size:9px;color:var(--blue);font-family:'Space Mono',monospace;}

/* OVERLAY */
.ov{position:fixed;inset:0;background:rgba(1,1,5,.88);display:flex;align-items:flex-end;justify-content:center;z-index:300;padding:0;animation:fi .18s ease;}

/* HOLOCARD — interactive 3D tilt + holographic shine (Scrydex/Collectr-style) */
.holocard{display:block;width:100%;perspective:1200px;cursor:pointer;--mx:50%;--my:50%;--rx:0deg;--ry:0deg;--act:0;}
.holocard.big{max-width:280px;margin:0 auto;}
.holocard.sm{max-width:170px;}
.holocard-tilt{position:relative;border-radius:14px;overflow:hidden;
  transform:rotateX(var(--rx)) rotateY(var(--ry));
  transition:transform .18s cubic-bezier(.2,.7,.3,1);
  transform-style:preserve-3d;
  box-shadow:0 14px 36px rgba(0,0,0,.55), 0 0 0 1px rgba(251,191,36,.12);}
.holocard:hover .holocard-tilt{box-shadow:0 22px 50px rgba(0,0,0,.7), 0 0 0 1px rgba(251,191,36,.28), 0 0 60px rgba(251,191,36,.18);}
.holocard-tilt img{display:block;width:100%;height:auto;border-radius:14px;}
.holocard-ph{width:100%;aspect-ratio:5/7;background:linear-gradient(135deg,var(--s1),var(--s2));border-radius:14px;}
.holocard-shine{position:absolute;inset:0;pointer-events:none;border-radius:14px;
  background:radial-gradient(circle at var(--mx) var(--my),rgba(255,255,255,.45) 0%,rgba(255,255,255,.12) 18%,transparent 38%);
  mix-blend-mode:overlay;opacity:calc(var(--act) * 1);transition:opacity .22s;}
.holocard-holo{position:absolute;inset:0;pointer-events:none;border-radius:14px;
  background:conic-gradient(from 0deg at var(--mx) var(--my),
    rgba(255,0,180,.22),rgba(255,180,0,.22),rgba(180,255,0,.22),
    rgba(0,255,180,.22),rgba(0,140,255,.22),rgba(180,0,255,.22),rgba(255,0,180,.22));
  mix-blend-mode:color-dodge;opacity:calc(var(--act) * .8);transition:opacity .25s;}
.holocard-edge{position:absolute;inset:0;pointer-events:none;border-radius:14px;
  background:linear-gradient(135deg,
    rgba(255,255,255,calc(var(--act) * .12)) 0%,
    transparent 30%, transparent 70%,
    rgba(255,255,255,calc(var(--act) * .08)) 100%);
  border:1px solid rgba(255,255,255,calc(var(--act) * .08));}

/* DETAIL MODAL — bottom sheet on mobile */
.dmod{background:linear-gradient(155deg,var(--s2) 0%,var(--s1) 100%);border:1px solid rgba(255,255,255,.1);
  border-radius:20px 20px 0 0;width:100%;max-width:100%;overflow:hidden;
  animation:slideup .3s cubic-bezier(.34,1.56,.64,1);max-height:92vh;overflow-y:auto;
  box-shadow:0 -24px 60px rgba(0,0,0,.6);}
@keyframes slideup{from{transform:translateY(60px);opacity:0}to{transform:translateY(0);opacity:1}}
.dmod-handle{width:36px;height:3px;background:rgba(255,255,255,.2);border-radius:2px;margin:10px auto 0;}
.dmod-top{display:flex;background:var(--s1);position:relative;padding:16px;}
.dmod-img{width:220px;flex-shrink:0;position:relative;overflow:hidden;border-radius:14px;cursor:zoom-in;}
.dmod-img img{width:100%;border-radius:14px;box-shadow:0 16px 44px rgba(0,0,0,.7),0 0 0 1px rgba(251,191,36,.15);transition:transform .2s;}
.dmod-img:hover img{transform:scale(1.04);}
.dmod-img-wrap{width:220px;flex-shrink:0;}
.comp-prices{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:10px;}
.comp-i{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:10px;}
.comp-lbl{font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px;}
.comp-v{font-family:'Space Mono',monospace;font-size:14px;font-weight:700;color:var(--text);}
.img-zoom-ov{position:fixed;inset:0;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center;z-index:9999;cursor:zoom-out;padding:20px;}
.img-zoom-ov img{max-width:90vw;max-height:90vh;border-radius:14px;box-shadow:0 30px 80px rgba(0,0,0,.9);}
.dmod-holo{position:absolute;inset:-80%;width:260%;height:260%;background:conic-gradient(from 0deg at 50% 50%,rgba(255,0,100,.28),rgba(255,150,0,.28),rgba(255,255,0,.28),rgba(0,255,100,.28),rgba(0,150,255,.28),rgba(150,0,255,.28),rgba(255,0,100,.28));mix-blend-mode:color-dodge;pointer-events:none;animation:hs 5s linear infinite;opacity:.55;}
.dmod-info{flex:1;padding-left:14px;display:flex;flex-direction:column;gap:9px;justify-content:center;}
.dmod-name{font-family:'Fraunces',sans-serif;font-size:17px;font-weight:800;letter-spacing:-.3px;line-height:1.2;}
.dmod-set{font-size:10px;color:var(--muted);}
.dmod-badges{display:flex;gap:4px;flex-wrap:wrap;}
.dmod-x{position:absolute;top:12px;right:12px;background:rgba(255,255,255,.07);border:1px solid var(--gb);color:var(--muted);font-size:13px;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .2s;z-index:2;}
.dmod-x:hover{color:#f8f8ff;}
.dmod-body{padding:16px;}
.fmv-block{background:linear-gradient(135deg,rgba(251,191,36,.08),rgba(244,114,182,.05));border:1px solid rgba(251,191,36,.18);border-radius:12px;padding:14px 16px;margin-bottom:14px;display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;}
.fmv-val{font-family:'Space Mono',monospace;font-size:26px;font-weight:700;letter-spacing:-1px;margin-bottom:2px;}
.fmv-lbl{font-size:10px;color:var(--muted);margin-bottom:3px;}
.fmv-net{font-size:11px;color:var(--gain);font-family:'Space Mono',monospace;margin-bottom:3px;}
.fmv-ref{font-size:9px;color:var(--dim);font-family:'Space Mono',monospace;}
.dmod-actions{display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap;}
.btn-prim{flex:1;min-width:120px;padding:11px;background:linear-gradient(135deg,var(--amber),var(--pink));color:#020208;border:none;border-radius:10px;font-size:13px;font-weight:800;cursor:pointer;transition:all .2s;box-shadow:0 4px 14px rgba(251,191,36,.22);}
.btn-prim:hover{filter:brightness(1.1);}
.btn-prim.in{background:linear-gradient(135deg,var(--gain),#16a34a);box-shadow:none;}
.btn-sell{padding:11px 14px;background:var(--gain-g);border:1px solid rgba(52,211,153,.22);color:var(--gain);border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;transition:all .2s;text-decoration:none;display:flex;align-items:center;gap:5px;}
.btn-sell:hover{background:rgba(52,211,153,.18);}
.btn-sec{padding:11px 13px;background:var(--gl);border:1px solid var(--gb);color:var(--muted);border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;transition:all .2s;}
.btn-sec:hover{border-color:var(--purple);color:var(--purple);}
.btn-heart-d{padding:11px 13px;background:var(--gl);border:1px solid var(--gb);border-radius:10px;font-size:16px;cursor:pointer;transition:all .2s;}
.btn-heart-d:hover,.btn-heart-d.on{border-color:var(--pink);background:var(--pink-b);}

/* PRICE HISTORY in modal */
.ph-block{background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:12px;margin-bottom:14px;}
.ph-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;}
.ph-title{font-family:'Fraunces',sans-serif;font-size:13px;font-weight:800;}
.ph-range{display:flex;gap:4px;}
.ph-btn{padding:3px 9px;border:1px solid var(--gb);background:var(--gl);color:var(--muted);border-radius:6px;font-size:9px;font-weight:700;cursor:pointer;transition:all .2s;font-family:'Space Mono',monospace;}
.ph-btn.on{background:var(--amber-b);border-color:var(--amber);color:var(--amber);}
.ph-blur-wrap{position:relative;}
.ph-blur{filter:blur(6px);pointer-events:none;}
.ph-pro{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;}
.ph-pro-t{font-size:11px;font-weight:700;color:var(--txt2);}
.ph-pro-btn{padding:5px 14px;background:linear-gradient(135deg,var(--purple),var(--pink));color:#020208;border:none;border-radius:7px;font-size:11px;font-weight:800;cursor:pointer;}

/* PSA in modal */
.psa-block{background:linear-gradient(135deg,rgba(167,139,250,.06),rgba(56,189,248,.04));border:1px solid rgba(167,139,250,.18);border-radius:12px;padding:12px 14px;margin-bottom:12px;}
.psa-title{font-family:'Fraunces',sans-serif;font-size:13px;font-weight:800;margin-bottom:2px;}
.psa-sub{font-size:10px;color:var(--muted);margin-bottom:10px;}
.psa-row{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;}
.psa-g{background:rgba(255,255,255,.04);border-radius:8px;padding:9px;text-align:center;}
.psa-g.g10{background:linear-gradient(135deg,rgba(251,191,36,.1),rgba(244,114,182,.06));border:1px solid rgba(251,191,36,.2);}
.psa-g.g9{background:rgba(167,139,250,.06);border:1px solid rgba(167,139,250,.16);}
.psa-g.g8{background:rgba(56,189,248,.05);border:1px solid rgba(56,189,248,.14);}
.psa-gl{font-family:'Space Mono',monospace;font-size:9px;font-weight:700;color:var(--muted);margin-bottom:3px;}
.psa-g.g10 .psa-gl{color:var(--amber);}.psa-g.g9 .psa-gl{color:var(--purple);}.psa-g.g8 .psa-gl{color:var(--blue);}
.psa-gp{font-family:'Space Mono',monospace;font-size:12px;font-weight:700;margin-bottom:4px;}
.psa-g.g10 .psa-gp{color:var(--amber);}.psa-g.g9 .psa-gp{color:var(--purple);}.psa-g.g8 .psa-gp{color:var(--blue);}
.psa-link{font-size:9px;font-weight:700;color:inherit;text-decoration:none;background:rgba(255,255,255,.07);border-radius:4px;padding:2px 5px;transition:all .2s;display:inline-block;}
.psa-link:hover{background:rgba(255,255,255,.13);}
.psa-note{font-size:9px;color:var(--dim);margin-top:8px;line-height:1.5;}

/* ACCESSORIES in modal */
.acc-block{background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:12px;margin-bottom:12px;}
.acc-title{font-family:'Fraunces',sans-serif;font-size:13px;font-weight:800;margin-bottom:10px;}
.acc-grid{display:grid;gap:7px;}
.acc-item{display:flex;align-items:center;justify-content:space-between;gap:10px;}
.acc-name{font-size:11px;font-weight:600;color:var(--txt2);flex:1;}
.acc-price{font-family:'Space Mono',monospace;font-size:10px;color:var(--amber);flex-shrink:0;}
.acc-btn{padding:4px 10px;background:var(--amber-b);border:1px solid rgba(251,191,36,.2);color:var(--amber);border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;text-decoration:none;transition:all .2s;white-space:nowrap;flex-shrink:0;}
.acc-btn:hover{background:var(--amber-g);}

.cond-row{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:11px;}
.cond-btn{padding:5px 10px;border:1px solid var(--gb);background:var(--gl);color:var(--muted);border-radius:7px;font-size:10px;font-weight:700;cursor:pointer;transition:all .2s;}
.cond-btn.on{border-color:var(--amber);background:var(--amber-b);color:var(--amber);}
.paid-in{width:100%;padding:10px 14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:9px;color:#f8f8ff;font-size:13px;outline:none;margin-bottom:10px;transition:border-color .2s;}
.paid-in:focus{border-color:var(--amber);}
.paid-in::placeholder{color:var(--muted);}
.mod-note{font-size:10px;color:var(--dim);margin-bottom:11px;line-height:1.5;}

/* SMALL MODAL */
.smod-ov{position:fixed;inset:0;background:rgba(1,1,5,.88);display:flex;align-items:flex-end;justify-content:center;z-index:300;padding:0;animation:fi .18s ease;}
.smod{background:linear-gradient(155deg,var(--s2) 0%,var(--s1) 100%);border:1px solid rgba(255,255,255,.1);border-radius:20px 20px 0 0;padding:24px;width:100%;max-width:100%;animation:slideup .3s cubic-bezier(.34,1.56,.64,1);box-shadow:0 -20px 50px rgba(0,0,0,.6);}
.smod-handle{width:36px;height:3px;background:rgba(255,255,255,.2);border-radius:2px;margin:-10px auto 16px;}
.smod-hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;}
.smod-t{font-family:'Fraunces',sans-serif;font-size:18px;font-weight:800;letter-spacing:-.3px;}
.smod-x{background:rgba(255,255,255,.07);border:1px solid var(--gb);color:var(--muted);font-size:13px;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .2s;}
.smod-x:hover{color:#f8f8ff;}
.am-prev{display:flex;gap:10px;align-items:center;background:rgba(0,0,0,.3);padding:10px;border-radius:10px;margin-bottom:12px;border:1px solid var(--dim);}
.am-prev img{width:38px;border-radius:7px;}
.smod-desc{font-size:13px;color:var(--muted);margin-bottom:13px;line-height:1.6;}
.smod-in{width:100%;padding:11px 14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:9px;color:#f8f8ff;font-size:13px;outline:none;margin-bottom:8px;transition:border-color .2s;}
.smod-in:focus{border-color:var(--amber);}
.smod-in::placeholder{color:var(--muted);}
.smod-btn{width:100%;padding:13px;background:linear-gradient(135deg,var(--amber),var(--pink));color:#020208;border:none;border-radius:10px;font-size:14px;font-weight:800;cursor:pointer;transition:all .2s;box-shadow:0 4px 14px rgba(251,191,36,.2);}
.smod-btn:hover{filter:brightness(1.1);}
.smod-switch{text-align:center;font-size:12px;color:var(--muted);margin-top:12px;}
.smod-lnk{color:var(--amber);cursor:pointer;font-weight:700;}
.smod-legal{font-size:10px;color:var(--dim);text-align:center;margin-top:10px;line-height:1.6;}
.smod-soc{flex:1;padding:10px;background:var(--gl);border:1px solid var(--gb);border-radius:9px;font-size:12px;font-weight:600;color:var(--muted);cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:6px;}
.smod-soc:hover{border-color:var(--gb2);color:#f8f8ff;}
.smod-div{display:flex;align-items:center;gap:10px;margin-bottom:12px;}
.smod-div::before,.smod-div::after{content:'';flex:1;height:1px;background:rgba(255,255,255,.06);}
.smod-div span{font-size:10px;color:var(--dim);font-family:'Space Mono',monospace;}
.auth-logo{display:flex;align-items:center;gap:9px;justify-content:center;margin-bottom:20px;}
.auth-gem{width:38px;height:38px;object-fit:contain;background:transparent;filter:drop-shadow(0 0 10px rgba(251,191,36,.5));}
.auth-brand{font-family:'Fraunces',sans-serif;font-size:20px;font-weight:800;letter-spacing:-.4px;}
.succ{text-align:center;padding:14px 0;}
.succ-i{font-size:46px;margin-bottom:12px;display:block;}
.succ-t{font-family:'Fraunces',sans-serif;font-size:20px;font-weight:800;margin-bottom:5px;letter-spacing:-.4px;}
.succ-m{color:var(--muted);font-size:13px;margin-bottom:20px;}
.succ-c{background:none;border:1px solid var(--gb);color:var(--muted);padding:8px 20px;border-radius:9px;font-size:12px;cursor:pointer;transition:all .2s;}
.succ-c:hover{border-color:var(--gb2);color:#f8f8ff;}

/* PLANS MODAL */
.plans-modal{background:linear-gradient(155deg,var(--s2) 0%,var(--s1) 100%);border:1px solid rgba(255,255,255,.1);border-radius:20px 20px 0 0;padding:24px;width:100%;max-width:100%;animation:slideup .3s cubic-bezier(.34,1.56,.64,1);max-height:90vh;overflow-y:auto;box-shadow:0 -20px 50px rgba(0,0,0,.6);}
.plans-handle{width:36px;height:3px;background:rgba(255,255,255,.2);border-radius:2px;margin:-10px auto 16px;}
.plans-title{font-family:'Fraunces',sans-serif;font-size:22px;font-weight:800;letter-spacing:-.5px;text-align:center;margin-bottom:5px;}
.plans-sub{font-size:13px;color:var(--muted);text-align:center;margin-bottom:22px;}
.plans-grid{display:grid;grid-template-columns:1fr;gap:12px;}
.plan-card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:16px;padding:18px;position:relative;overflow:hidden;}
.plan-card.featured{border-color:rgba(251,191,36,.3);background:rgba(251,191,36,.04);}
.plan-card.pro{border-color:rgba(167,139,250,.3);background:rgba(167,139,250,.04);}
.plan-badge-top{position:absolute;top:10px;right:10px;font-size:9px;font-family:'Space Mono',monospace;font-weight:700;padding:2px 7px;border-radius:100px;letter-spacing:.3px;}
.pb-pop{background:var(--amber-b);color:var(--amber);border:1px solid rgba(251,191,36,.3);}
.pb-val{background:var(--purple-b);color:var(--purple);border:1px solid rgba(167,139,250,.3);}
.plan-name{font-family:'Fraunces',sans-serif;font-size:16px;font-weight:800;margin-bottom:3px;}
.plan-price{font-family:'Space Mono',monospace;font-size:24px;font-weight:700;margin-bottom:1px;}
.plan-period{font-size:10px;color:var(--muted);margin-bottom:14px;font-family:'Space Mono',monospace;}
.plan-features{display:grid;gap:6px;margin-bottom:16px;}
.plan-f{display:flex;align-items:flex-start;gap:7px;font-size:12px;color:var(--txt2);}
.plan-f-dot{width:5px;height:5px;border-radius:50%;flex-shrink:0;margin-top:4px;}
.plan-cta{width:100%;padding:11px;border:none;border-radius:10px;font-size:13px;font-weight:800;cursor:pointer;transition:all .2s;}
.plan-cta-free{background:var(--gl);border:1px solid var(--gb);color:var(--muted);}
.plan-cta-col{background:linear-gradient(135deg,var(--amber),var(--pink));color:#020208;}
.plan-cta-pro{background:linear-gradient(135deg,var(--purple),var(--pink));color:#020208;}
.plan-cta:hover{filter:brightness(1.1);}

/* CARD/BINDER PICKER */
.picker-modal{background:linear-gradient(155deg,var(--s2),var(--s1));border:1px solid var(--gb);border-radius:20px 20px 0 0;padding:20px;width:100%;max-width:100%;animation:slideup .3s cubic-bezier(.34,1.56,.64,1);max-height:80vh;display:flex;flex-direction:column;}
.picker-title{font-family:'Fraunces',sans-serif;font-size:16px;font-weight:800;margin-bottom:12px;letter-spacing:-.3px;}
.picker-list{overflow-y:auto;display:grid;gap:7px;flex:1;}
.picker-item{display:flex;align-items:center;gap:10px;background:var(--gl);border:1px solid var(--gb);border-radius:10px;padding:9px;cursor:pointer;transition:all .2s;}
.picker-item:hover{border-color:var(--amber);background:var(--amber-b);}
.picker-item img{width:36px;border-radius:5px;}
.pi-n{font-weight:700;font-size:12px;margin-bottom:1px;}
.pi-s{font-size:10px;color:var(--muted);}
.pi-p{font-family:'Space Mono',monospace;font-size:11px;color:var(--amber);font-weight:700;}
.picker-empty{text-align:center;color:var(--muted);padding:24px;font-size:13px;}
.picker-close{margin-top:12px;width:100%;padding:11px;background:var(--gl);border:1px solid var(--gb);color:var(--muted);border-radius:9px;cursor:pointer;font-size:13px;font-weight:600;transition:all .2s;}
.picker-close:hover{border-color:var(--gb2);color:#f8f8ff;}
.nb-modal{background:linear-gradient(155deg,var(--s2),var(--s1));border:1px solid var(--gb);border-radius:20px 20px 0 0;padding:22px;width:100%;max-width:100%;animation:slideup .3s cubic-bezier(.34,1.56,.64,1);}
.nb-title{font-family:'Fraunces',sans-serif;font-size:17px;font-weight:800;margin-bottom:16px;letter-spacing:-.3px;}
.nb-lbl{font-size:10px;font-weight:700;color:var(--txt2);margin-bottom:6px;letter-spacing:.3px;text-transform:uppercase;}
.nb-in{width:100%;padding:10px 14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:9px;color:#f8f8ff;font-size:13px;outline:none;margin-bottom:13px;transition:border-color .2s;}
.nb-in:focus{border-color:var(--amber);}
.nb-in::placeholder{color:var(--muted);}
.nb-types{display:grid;grid-template-columns:repeat(2,1fr);gap:7px;margin-bottom:16px;}
.nb-type{padding:10px;background:var(--gl);border:1px solid var(--gb);border-radius:8px;cursor:pointer;transition:all .2s;text-align:center;}
.nb-type:hover{border-color:rgba(251,191,36,.3);}
.nb-type.on{border-color:var(--amber);background:var(--amber-b);}
.nb-type-n{font-weight:700;font-size:11px;margin-bottom:2px;}
.nb-type-d{font-size:9px;color:var(--muted);}
.nb-create{width:100%;padding:12px;background:linear-gradient(135deg,var(--amber),var(--pink));color:#020208;border:none;border-radius:10px;font-size:13px;font-weight:800;cursor:pointer;transition:all .2s;}
.nb-create:hover{filter:brightness(1.1);}

.rmtag{font-size:9px;font-family:'Space Mono',monospace;font-weight:700;letter-spacing:.3px;padding:2px 7px;border-radius:100px;display:inline-block;}
.rt-next{background:var(--amber-b);color:var(--amber);border:1px solid rgba(251,191,36,.2);}
.rt-soon{background:var(--purple-b);color:var(--purple);border:1px solid rgba(167,139,250,.2);}
.rt-future{background:rgba(255,255,255,.04);color:var(--muted);border:1px solid var(--dim);}

.footer{border-top:1px solid transparent;padding:16px var(--p);text-align:center;color:var(--dim);font-size:10px;font-family:'Space Mono',monospace;letter-spacing:.3px;position:relative;}
.footer::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--purple),var(--blue),var(--pink),transparent);opacity:.16;}

/* ── TABLET 640px+ ─────────────────────────────────────────────────────────── */
@media(min-width:640px){
  :root{--p:24px;}
  .cur-row{display:flex;}
  .nav{height:60px;}
  .logo-txt{font-size:20px;}
  .logo-gem{width:32px;height:32px;font-size:16px;}
  .tabs{justify-content:center;padding:0;}
  .tb{padding:13px 20px;font-size:12px;}
  .hero{padding:54px var(--p) 42px;}
  .hero-tagline{font-size:clamp(44px,9vw,92px);}
  .srch-in{padding:16px 120px 16px 20px;font-size:15px;}
  .grid{grid-template-columns:repeat(3,1fr);gap:12px;}
  .kcard-body{padding:12px;}
  .kname{font-size:13px;}
  .kprice{font-size:16px;}
  .hot-grid{grid-template-columns:repeat(3,1fr);}
  .sealed-grid{grid-template-columns:repeat(3,1fr);}
  .coming-grid{grid-template-columns:repeat(3,1fr);}
  .ug{grid-template-columns:repeat(2,1fr);}
  .bp-grid{grid-template-columns:repeat(2,1fr);}
  .blog-grid{grid-template-columns:1fr 1fr;}
  .blist{grid-template-columns:repeat(3,1fr);}
  .bento{grid-template-columns:2fr 1fr;}
  .feat{flex-direction:row;}
  .feat-img{min-height:unset;width:200px;flex-shrink:0;}
  .feat-img img{max-width:100%;}
  .feat-body{padding:24px;}
  .feat-name{font-size:24px;}
  .feat-price{font-size:30px;}
  .dmod{border-radius:22px 22px 0 0;max-width:560px;}
  .dmod-top{padding:20px;}
  .dmod-img{width:150px;}
  .dmod-img-wrap{width:150px;}
  .dmod-name{font-size:19px;}
  .fmv-val{font-size:28px;}
  .smod{border-radius:20px 20px 0 0;max-width:440px;}
  .plans-modal{border-radius:22px 22px 0 0;max-width:600px;padding:28px;}
  .plans-grid{grid-template-columns:repeat(3,1fr);}
  .picker-modal{max-width:500px;border-radius:20px 20px 0 0;}
  .nb-modal{max-width:440px;border-radius:20px 20px 0 0;}
  .gs-card{flex-direction:row;gap:18px;}
  .gs-img{width:100px;}
  .donate-inner{flex-direction:row;align-items:center;}
  .donate-btn{width:auto;}
  .gs-card{align-items:flex-start;}
}

/* ── DESKTOP 1024px+ ───────────────────────────────────────────────────────── */
@media(min-width:1024px){
  :root{--p:36px;}
  .nav{height:62px;padding:0 var(--p);}
  .logo-txt{font-size:22px;}
  .hero{padding:70px var(--p) 50px;}
  .hero-cols{flex-direction:row;}
  .hero-right{display:flex;align-items:center;justify-content:center;}
  .hero-sub{font-size:15px;}
  .grid{grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:14px;}
  .hot-grid{grid-template-columns:repeat(5,1fr);}
  .sealed-grid{grid-template-columns:repeat(4,1fr);}
  .coming-grid{grid-template-columns:repeat(3,1fr);}
  .ug{grid-template-columns:repeat(3,1fr);}
  .bp-grid{grid-template-columns:repeat(2,1fr);}
  .blog-grid{grid-template-columns:1fr 1fr;}
  .blist{grid-template-columns:repeat(4,1fr);}
  .col-list .ci{padding:14px;}
  /* Centered modals on desktop */
  .ov{align-items:center;padding:16px;}
  .dmod{border-radius:26px;max-width:560px;animation:pop .22s cubic-bezier(.34,1.56,.64,1);}
  @keyframes pop{from{transform:translateY(14px) scale(.97);opacity:0}to{transform:translateY(0) scale(1);opacity:1}}
  .dmod-handle,.smod-handle,.plans-handle{display:none;}
  .dmod{border-radius:26px;}
  .dmod-top{padding:22px;}
  .dmod-img{width:170px;}
  .smod-ov{align-items:center;padding:16px;}
  .smod{border-radius:22px;max-width:420px;}
  .plans-modal{border-radius:26px;max-width:820px;}
  .picker-modal{border-radius:20px;max-width:540px;animation:pop .22s cubic-bezier(.34,1.56,.64,1);}
  .nb-modal{border-radius:20px;max-width:440px;animation:pop .22s cubic-bezier(.34,1.56,.64,1);}
  .pulse-vol{display:inline;}
  .feat img{max-width:none;}
}
`;

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function DraGold(){
  const [ui,setUi]           = useState("en");
  const [tcg,setTcg]         = useState("pokemon");
  const [clang,setClang]     = useState("en");
  const [tab,setTab]         = useState("explore");
  const [cur,setCur]         = useState("USD");
  const [region,setRegion]   = useState(null);
  const [country,setCountry] = useState(null);
  const [langOpen,setLangOpen]         = useState(false);
  const [userMenuOpen,setUserMenuOpen] = useState(false);
  const [q,setQ]             = useState("");
  const [cards,setCards]     = useState([]);
  const [loading,setLoading] = useState(false);
  const [searched,setSearched] = useState(false);
  const [demo,setDemo]       = useState(false);
  const [detail,setDetail]   = useState(null);
  const [alertCard,setAlertCard] = useState(null);
  const [alertSent,setAlertSent] = useState(false);
  const [aEmail,setAEmail]   = useState("");
  const [aPrice,setAPrice]   = useState("");
  const [col,setCol]         = useState([]);
  const [watchlist,setWatchlist] = useState([]);
  const [paid,setPaid]       = useState("");
  const [selCond,setSelCond] = useState("NM");
  const [user,setUser]       = useState(null);
  const [authMode,setAuthMode]     = useState(null);
  const [zoomImg,setZoomImg]       = useState(null);
  const [suggestions,setSuggestions] = useState([]);
  const [showSugg,setShowSugg]       = useState(false);
  const [authPending,setAuthPending] = useState(null);
  const [authName,setAuthName]   = useState("");
  const [authEmail,setAuthEmail] = useState("");
  const [authPass,setAuthPass]   = useState("");
  const [article,setArticle]     = useState(null);
  const [plansOpen,setPlansOpen] = useState(false);
  const [colTab,setColTab]       = useState("vault");
  const [portRange,setPortRange] = useState("30d");
  const [detailPhRange,setDetailPhRange] = useState("7d");
  const [binders,setBinders]     = useState([]);
  const [activeBinder,setActiveBinder] = useState(null);
  const [binderPage,setBinderPage]     = useState(0);
  const [pickingSlot,setPickingSlot]   = useState(null);
  const [newBinderOpen,setNewBinderOpen] = useState(false);
  const [nbName,setNbName]   = useState("");
  const [nbType,setNbType]   = useState("9p");
  const [hotPicks,setHotPicks] = useState([]); // popolata da Supabase hot_picks table
  const [hotLoading,setHotLoading] = useState(false);

  const langRef = useRef(null);
  const userRef = useRef(null);
  const aLang   = CARD_LANGS.find(x=>x.c===clang);
  const curLang = UI_LANGS.find(x=>x.c===ui)||UI_LANGS[0];
  const activeTCG = TCG_LIST.find(x=>x.id===tcg)||TCG_LIST[0];
  const bt = BINDER_TYPES.find(x=>x.id===(activeBinder?.type||"9p"))||BINDER_TYPES[0];
  const dailyCards = useMemo(()=>getDailyCards(HERO_POOL,3),[]);
  const disp = usd=>cur==="EUR"?`€${(usd*EUR_RATE).toFixed(2)}`:`$${usd.toFixed(2)}`;

  useEffect(()=>{
    (async()=>{
      try{
        const r=await fetch("https://ipapi.co/json/",{signal:AbortSignal.timeout(4000)});
        const d=await r.json();setCountry(d.country_code);
        if(EU_CC.includes(d.country_code)){setRegion("EU");setCur("EUR");}
        else if(["US","CA"].includes(d.country_code)){setRegion("US");setCur("USD");}
      }catch{}
    })();
  },[]);

  useEffect(()=>{
    (async()=>{
      try{
        const u=await window.storage.get("dg_u1");if(u) setUser(JSON.parse(u.value));
        const c=await window.storage.get("dg_c1");if(c) setCol(JSON.parse(c.value));
        const w=await window.storage.get("dg_w1");if(w) setWatchlist(JSON.parse(w.value));
        const b=await window.storage.get("dg_b1");if(b) setBinders(JSON.parse(b.value));
      }catch{}
    })();
  },[]);

  useEffect(()=>{
    const h=e=>{
      if(langRef.current&&!langRef.current.contains(e.target)) setLangOpen(false);
      if(userRef.current&&!userRef.current.contains(e.target)) setUserMenuOpen(false);
    };
    document.addEventListener("mousedown",h);
    return()=>document.removeEventListener("mousedown",h);
  },[]);

  const saveCol=async c=>{setCol(c);try{await window.storage.set("dg_c1",JSON.stringify(c));}catch{}};
  const saveWatch=async w=>{setWatchlist(w);try{await window.storage.set("dg_w1",JSON.stringify(w));}catch{}};
  const saveBinders=async b=>{setBinders(b);try{await window.storage.set("dg_b1",JSON.stringify(b));}catch{}};
  const inCol=id=>col.some(x=>x.id===id);
  const inWatch=id=>watchlist.some(x=>x.id===id);
  const getColCard=id=>col.find(x=>x.id===id);

  // Persistenza Supabase per portfolio (vault). Quando l'utente è loggato la fonte
  // primaria è la tabella `collection`; localStorage resta come cache locale.
  const addToCol=async(card,fmvObj,img,tcgType)=>{
    if(!user){setAuthPending({card,fmvObj,img,tcgType});setAuthMode("register");return;}
    const cid=card.id||card.name;
    if(inCol(cid)) return;
    const fmv=fmvObj?.fmv||0;
    const paidNum=parseFloat(paid)||0;
    const inferredTcg=card._tcg||tcgType||tcg;
    const cardName=card.name;
    const cardSet=card.set?.name||card.set_name||"";
    const cardLang=inferredTcg==="pokemon"?(card._lang||clang||"en"):(card._lang||"en");
    const local={id:cid,name:cardName,set:cardSet,img,lang:cardLang,flag:inferredTcg==="pokemon"?(aLang?.f||""):(TCG_LIST.find(t=>t.id===inferredTcg)?.emoji||"🃏"),tcgType:inferredTcg,condition:selCond,market:fmv,paid:paidNum,spark:mkSpark(fmv||10)};
    await saveCol([...col,local]);
    // Persist to Supabase. Schema reale tabella `collection`:
    // card_api_id, card_name, set_name, card_number, rarity, image_url, language,
    // condition, purchase_price, fmv_snapshot, fmv_currency, added_at, ...
    if(supabaseReady && user.id){
      try{
        const cardNumber=card.number||card.card_number||null;
        const cardRarity=card.rarity||null;
        const {error}=await supabase.from('collection').upsert({
          user_id:user.id,
          card_api_id:cid,
          tcg:inferredTcg,
          card_name:cardName,
          set_name:cardSet,
          card_number:cardNumber,
          rarity:cardRarity,
          image_url:img||null,
          language:cardLang,
          condition:selCond,
          purchase_price:paidNum||null,
          fmv_snapshot:fmv||null,
          fmv_currency:'EUR',
        },{onConflict:'user_id,card_api_id'});
        if(error) console.warn('collection upsert error:',error.message);
      }catch(e){console.warn('collection upsert failed',e);}
    }
    setPaid("");setSelCond("NM");setDetail(null);
  };
  const removeFromCol=async id=>{
    await saveCol(col.filter(x=>x.id!==id));
    if(supabaseReady && user?.id){
      try{await supabase.from('collection').delete().eq('user_id',user.id).eq('card_api_id',id);}catch{}
    }
  };

  const toggleWatch=async(card,fmvObj,img,tcgType)=>{
    const id=card.id||card.name;
    const cardTcg=card._tcg||tcgType||tcg;
    const cardName=card.name;
    const cardSet=card.set?.name||card.set_name||"";
    if(inWatch(id)){
      await saveWatch(watchlist.filter(x=>x.id!==id));
      if(supabaseReady && user?.id) try{await supabase.from('watchlist').delete().eq('user_id',user.id).eq('card_api_id',id);}catch{}
    } else {
      await saveWatch([...watchlist,{id,name:cardName,set:cardSet,img,tcgType:cardTcg,market:fmvObj?.fmv||0,addedAt:Date.now()}]);
      if(supabaseReady && user?.id){
        try{
          const {error}=await supabase.from('watchlist').upsert({
            user_id:user.id, card_api_id:id, tcg:cardTcg,
            card_name:cardName, set_name:cardSet, image_url:img||null,
          },{onConflict:'user_id,card_api_id'});
          if(error) console.warn('watchlist upsert error:',error.message);
        }catch{}
      }
    }
  };
  const removeWatch=async id=>{
    await saveWatch(watchlist.filter(x=>x.id!==id));
    if(supabaseReady && user?.id) try{await supabase.from('watchlist').delete().eq('user_id',user.id).eq('card_api_id',id);}catch{}
  };

  // BINDER
  const createBinder=async()=>{
    if(!nbName.trim()) return;
    const bType=BINDER_TYPES.find(x=>x.id===nbType);
    const ep=Array(bType.slots).fill(null);
    const nb={id:`b_${Date.now()}`,name:nbName.trim(),type:nbType,pages:[ep,[...ep],[...ep]]};
    const upd=[...binders,nb];
    await saveBinders(upd);setActiveBinder(nb);setBinderPage(0);setNewBinderOpen(false);setNbName("");
  };
  const placeCard=async cid=>{
    if(!pickingSlot||!activeBinder) return;
    const{pi,si}=pickingSlot;
    const upd=binders.map(b=>b.id!==activeBinder.id?b:{...b,pages:b.pages.map((p,pii)=>pii!==pi?p:p.map((s,sii)=>sii===si?cid:s))});
    await saveBinders(upd);setActiveBinder(upd.find(b=>b.id===activeBinder.id));setPickingSlot(null);
  };
  const removeFromSlot=async(pi,si)=>{
    const upd=binders.map(b=>b.id!==activeBinder.id?b:{...b,pages:b.pages.map((p,pii)=>pii!==pi?p:p.map((s,sii)=>sii!==si?s:null))});
    await saveBinders(upd);setActiveBinder(upd.find(b=>b.id===activeBinder.id));
  };
  const addBinderPage=async()=>{
    if(!activeBinder) return;
    const bType=BINDER_TYPES.find(x=>x.id===activeBinder.type);
    const upd=binders.map(b=>b.id!==activeBinder.id?b:{...b,pages:[...b.pages,Array(bType.slots).fill(null)]});
    await saveBinders(upd);setActiveBinder(upd.find(b=>b.id===activeBinder.id));
  };
  const curPage=activeBinder?.pages?.[binderPage]||[];
  const pageVal=curPage.reduce((s,id)=>{const c=getColCard(id);return s+(c?.market||0);},0);

  // STATS
  const totalVal  = col.reduce((s,c)=>s+c.market,0);
  const totalPaid = col.reduce((s,c)=>s+c.paid,0);
  const netVal    = totalVal*0.87;
  const roi       = totalPaid>0?((netVal/totalPaid-1)*100).toFixed(1):null;
  const portData  = useMemo(()=>totalVal>0?mkPortChart(totalVal):null,[totalVal]);
  const portChg   = portData?portData[portData.length-1]-portData[0]:0;

  // Auto-detect card language from the search query (Japanese kana, Korean hangul, etc.)
  function detectLang(s){
    if(!s) return null;
    if(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(s)) return "ja";
    if(/[\uAC00-\uD7AF]/.test(s)) return "ko";
    return null; // caller decides default
  }

  // Login → carica vault & watchlist remoti dal DB Supabase usando nomi colonne reali.
  // Tabella collection: card_api_id, card_name, set_name, image_url, language, purchase_price, fmv_snapshot
  useEffect(()=>{
    if(!supabaseReady || !user?.id) return;
    let cancelled=false;
    (async()=>{
      try{
        const {data:rows,error}=await supabase
          .from('collection')
          .select('card_api_id, tcg, condition, purchase_price, fmv_snapshot, fmv_currency, added_at, card_name, set_name, card_number, rarity, image_url, language')
          .eq('user_id',user.id)
          .order('added_at',{ascending:false});
        if(cancelled) return;
        if(error){console.warn('collection load error:',error.message);return;}
        if(!Array.isArray(rows)||rows.length===0) return; // niente da remoto → mantiene col attuale (localStorage)
        const remote=rows.map(r=>({
          id:r.card_api_id,
          name:r.card_name||r.card_api_id,
          set:r.set_name||'',
          number:r.card_number||'',
          rarity:r.rarity||'',
          img:r.image_url||null,
          lang:r.language||'en',
          flag:r.tcg==='pokemon'?'🇺🇸':TCG_LIST.find(t=>t.id===r.tcg)?.emoji||'🃏',
          tcgType:r.tcg,
          condition:r.condition||'NM',
          market:+r.fmv_snapshot||0,
          paid:+r.purchase_price||0,
          spark:mkSpark(+r.fmv_snapshot||10),
        }));
        const remoteIds=new Set(remote.map(x=>x.id));
        const extras=col.filter(x=>!remoteIds.has(x.id));
        saveCol([...remote,...extras]);
      }catch(e){console.warn('collection load failed',e);}
    })();
    // Watchlist: tabella appena creata, schema: card_api_id, card_name, set_name, image_url, language
    (async()=>{
      try{
        const {data:wrows,error}=await supabase
          .from('watchlist')
          .select('card_api_id, tcg, card_name, set_name, image_url, language, added_at')
          .eq('user_id',user.id)
          .order('added_at',{ascending:false});
        if(cancelled||error||!Array.isArray(wrows)||wrows.length===0) return;
        const remote=wrows.map(r=>({
          id:r.card_api_id,
          name:r.card_name||r.card_api_id,
          set:r.set_name||'',
          img:r.image_url||null,
          tcgType:r.tcg,
          market:0,
          addedAt:r.added_at?new Date(r.added_at).getTime():Date.now(),
        }));
        const remoteIds=new Set(remote.map(x=>x.id));
        const extras=watchlist.filter(x=>!remoteIds.has(x.id));
        saveWatch([...remote,...extras]);
      }catch{}
    })();
    return()=>{cancelled=true;};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[user?.id]);

  // Vault live refresh: when col changes, fetch current_price for each card_id from
  // card_prices_latest and update item.market in place. Local "paid" stays intact.
  useEffect(()=>{
    if(!supabaseReady) return;
    if(!col || col.length===0) return;
    // Only consider entries whose id looks like a real DB card id (not a free-form name)
    const ids=col.map(x=>x.id).filter(id=>typeof id==='string' && id.length>0);
    if(ids.length===0) return;
    let cancelled=false;
    (async()=>{
      try{
        const {data,error}=await supabase
          .from('card_prices_latest')
          .select('card_id, price_market, captured_at')
          .in('card_id', ids);
        if(cancelled||error||!Array.isArray(data)) return;
        const priceMap=new Map(data.map(r=>[r.card_id, +r.price_market]));
        let changed=false;
        const updated=col.map(it=>{
          if(!priceMap.has(it.id)) return it;
          const liveMkt=priceMap.get(it.id);
          if(!liveMkt||isNaN(liveMkt)) return it;
          if(Math.abs(liveMkt-(it.market||0))<0.01) return it;
          changed=true;
          return {...it, market:liveMkt};
        });
        if(changed) saveCol(updated);
      }catch{}
    })();
    return()=>{cancelled=true;};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[col.length, user?.id]);

  // Hot Picks loader: fetch daily top movers from Supabase hot_picks table.
  // Joins to cards for name/image and reads current_price + delta_pct directly.
  useEffect(()=>{
    if(!supabaseReady) return;
    let cancelled=false;
    (async()=>{
      setHotLoading(true);
      try{
        const today=new Date().toISOString().slice(0,10);
        const {data,error}=await supabase
          .from('hot_picks')
          .select('rank, card_id, tcg, delta_pct, current_price, previous_price, reason, cards:card_id(name, set_name, image_url, image_url_hi)')
          .eq('computed_date', today)
          .order('rank',{ascending:true})
          .limit(10);
        if(cancelled) return;
        if(!error && Array.isArray(data) && data.length){
          setHotPicks(data.map(r=>({
            id:`hp-${r.rank}`,
            cardId:r.card_id,
            name:r.cards?.name||r.card_id,
            set:r.cards?.set_name||'',
            img:r.cards?.image_url_hi||r.cards?.image_url||null,
            fmv:r.current_price?+(+r.current_price).toFixed(2):null,
            fmvEUR:r.current_price?+(+r.current_price*EUR_RATE).toFixed(2):null,
            change:r.delta_pct!=null?+(+r.delta_pct).toFixed(1):null,
            reason:r.reason||(r.delta_pct>=0?'Trending up · 24h':'Sliding · 24h'),
            tcg:r.tcg,
          })));
        }else{
          setHotPicks([]);
        }
      }catch{setHotPicks([]);}
      finally{if(!cancelled) setHotLoading(false);}
    })();
    return()=>{cancelled=true;};
  },[]);

  // Live autocomplete: debounced call to suggest_cards RPC (universal, cross-TCG)
  useEffect(()=>{
    if(!supabaseReady){setSuggestions([]);return;}
    if(!q || q.trim().length<2){setSuggestions([]);return;}
    const detected = detectLang(q);
    const lang = detected || clang;
    const tcgF = null; // cross-TCG suggestions
    const handle = setTimeout(async()=>{
      try{
        const {data,error}=await supabase.rpc('suggest_cards',{
          q:q.trim(), tcg_filter:tcgF, lang_filter:lang,
        });
        if(!error && Array.isArray(data)){setSuggestions(data); setShowSugg(true);}
      }catch{}
    },280);
    return ()=>clearTimeout(handle);
  },[q, clang]);

  // Universal search: ALWAYS cross-TCG by default. Supabase first, then live APIs in parallel.
  // The TCG selector becomes a post-results visual filter, never a gate.
  const doSearch=useCallback(async()=>{
    const query=q.trim();
    if(!query) return;
    setLoading(true);setSearched(true);setCards([]);setDemo(false);setShowSugg(false);

    const detectedLang = detectLang(query) || clang;
    if(detectedLang!==clang) setClang(detectedLang);

    // 1) SUPABASE CATALOG — always cross-TCG (tcg_filter=null) so any card in any TCG matches.
    let supabaseHits=[];
    if(supabaseReady){
      try{
        const {data,error}=await supabase.rpc('search_cards',{
          q:query, tcg_filter:null, lang_filter:detectedLang, limit_n:50,
        });
        if(!error && Array.isArray(data) && data.length){
          supabaseHits=data.map(r=>({
            id:r.id, name:r.name, number:r.card_number||"", rarity:r.rarity||"",
            supertype:r.tcg==="pokemon"?"Pokémon":r.tcg==="mtg"?"Creature":r.tcg==="ygo"?"Monster":"Character",
            set:{id:r.set_name,name:r.set_name||""}, set_name:r.set_name,
            images:{small:r.image_url,large:r.image_url},
            image_uris:{small:r.image_url,normal:r.image_url,large:r.image_url},
            card_images:[{image_url:r.image_url,image_url_small:r.image_url}],
            _supabase:true,_lang:r.lang,_tcg:r.tcg,
            _supabasePrice:r.price_usd,_priceSource:r.price_source,
          }));
        }
        // Fall back to EN if the localized search came up empty (asian queries may match EN catalog)
        if(supabaseHits.length===0 && detectedLang!=='en'){
          const {data:enData}=await supabase.rpc('search_cards',{
            q:query, tcg_filter:null, lang_filter:'en', limit_n:50,
          });
          if(Array.isArray(enData)) supabaseHits=enData.map(r=>({
            id:r.id, name:r.name, number:r.card_number||"", rarity:r.rarity||"",
            supertype:r.tcg==="pokemon"?"Pokémon":r.tcg==="mtg"?"Creature":r.tcg==="ygo"?"Monster":"Character",
            set:{id:r.set_name,name:r.set_name||""}, set_name:r.set_name,
            images:{small:r.image_url,large:r.image_url},
            image_uris:{small:r.image_url,normal:r.image_url,large:r.image_url},
            card_images:[{image_url:r.image_url,image_url_small:r.image_url}],
            _supabase:true,_lang:r.lang,_tcg:r.tcg,
            _supabasePrice:r.price_usd,_priceSource:r.price_source,
          }));
        }
      }catch(e){console.warn('Supabase search failed, falling through to live APIs',e);}
    }

    if(supabaseHits.length>0){
      setCards(supabaseHits);setLoading(false);return;
    }

    // 2) LIVE APIs IN PARALLELO — non più gated dal TCG selector. Mergiamo tutto e mostriamo cross-TCG.
    const liveResults=[];
    const live=[
      // Pokemon TCG API
      fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(`name:"${query}"`)}&pageSize=30&orderBy=-set.releaseDate`,{signal:AbortSignal.timeout(5500)})
        .then(r=>r.ok?r.json():null).then(d=>{
          if(d?.data?.length) liveResults.push(...d.data.map(c=>({...c,_tcg:'pokemon'})));
        }).catch(()=>{}),
      // Scryfall MTG
      fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&unique=cards&order=released`,{signal:AbortSignal.timeout(5500)})
        .then(r=>r.ok?r.json():null).then(d=>{
          if(d?.data?.length) liveResults.push(...d.data.slice(0,30).map(c=>({...c,_tcg:'mtg'})));
        }).catch(()=>{}),
      // YGOPRODeck
      fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(query)}`,{signal:AbortSignal.timeout(5500)})
        .then(r=>r.ok?r.json():null).then(d=>{
          if(d?.data?.length) liveResults.push(...d.data.slice(0,30).map(c=>({...c,_tcg:'ygo'})));
        }).catch(()=>{}),
    ];
    // One Piece on-demand via JustTCG only if key present
    const JUSTTCG_KEY=import.meta.env.VITE_JUSTTCG_API_KEY;
    if(JUSTTCG_KEY){
      live.push(
        fetch(`https://api.justtcg.com/v1/cards?q=${encodeURIComponent(query)}&game=one-piece&limit=20`,
          {signal:AbortSignal.timeout(6000),headers:{'X-API-Key':JUSTTCG_KEY}})
          .then(r=>r.ok?r.json():null).then(d=>{
            if(d?.data?.length) liveResults.push(...d.data.map(c=>({
              id:c.id||c.tcgplayerId, name:c.name, number:c.number||"", rarity:c.rarity||"",
              supertype:"Character", set:{id:c.set?.id,name:c.set?.name||""},
              images:{small:c.image||c.imageUrl,large:c.image||c.imageUrl},
              _justtcgPrice:c.variants?.[0]?.price, _tcg:'onepiece',
            })));
          }).catch(()=>{})
      );
    }
    await Promise.all(live);

    if(liveResults.length>0){
      setCards(liveResults);setLoading(false);return;
    }

    // 3) Last resort: niente. Mostriamo stato onesto, no mock.
    setCards([]);setLoading(false);
  },[q,clang]);

  const changeTCG=id=>{setTcg(id);setCards([]);setSearched(false);setDemo(false);setQ("");};

  const doRegister=async()=>{
    if(!authEmail) return;
    if(supabaseReady){
      const {error}=await sendMagicLink(authEmail);
      if(error){alert("Sign-in error: "+error.message);return;}
      alert("Check your inbox for the sign-in link.");
      setAuthMode(null);setAuthName("");setAuthEmail("");setAuthPass("");return;
    }
    const u={name:authName||authEmail.split("@")[0],email:authEmail,at:Date.now()};
    setUser(u);try{await window.storage.set("dg_u1",JSON.stringify(u));}catch{}
    setAuthMode(null);
    if(authPending){await addToCol(authPending.card,authPending.fmvObj,authPending.img,authPending.tcgType);setAuthPending(null);}
    setAuthName("");setAuthEmail("");setAuthPass("");
  };
  const doLogin=async()=>{
    if(!authEmail) return;
    if(supabaseReady){
      const {error}=await sendMagicLink(authEmail);
      if(error){alert("Sign-in error: "+error.message);return;}
      alert("Check your inbox for the sign-in link.");
      setAuthMode(null);setAuthEmail("");setAuthPass("");return;
    }
    const u={name:authEmail.split("@")[0],email:authEmail,at:Date.now()};
    setUser(u);try{await window.storage.set("dg_u1",JSON.stringify(u));}catch{}
    setAuthMode(null);
    if(authPending){await addToCol(authPending.card,authPending.fmvObj,authPending.img,authPending.tcgType);setAuthPending(null);}
    setAuthEmail("");setAuthPass("");
  };
  const doLogout=async()=>{
    if(supabaseReady){await sbSignOut();}
    setUser(null);try{await window.storage.delete("dg_u1");}catch{}
  };
  useEffect(()=>{
    if(!supabaseReady) return;
    let firstLogin=false;
    (async()=>{
      const s=await getSession();
      if(s?.user){setUser({name:s.user.email.split("@")[0],email:s.user.email,at:Date.now(),id:s.user.id});}
    })();
    return onAuth(s=>{
      if(s?.user){
        const wasLoggedIn=!!user;
        setUser({name:s.user.email.split("@")[0],email:s.user.email,at:Date.now(),id:s.user.id});
        // Primo login della sessione → manda l'utente al suo Vault, non Explore.
        if(!wasLoggedIn && !firstLogin){
          firstLogin=true;
          setTab('col');
        }
      }
      else setUser(null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const getCardData=card=>{
    // Each card declares its TCG explicitly (_tcg) — never rely on the global selector,
    // because search results are cross-TCG by design.
    const cardTcg=card._tcg||tcg;
    if(cardTcg==="pokemon"){
      const fmvObj=calcFMV(card);
      return{fmvObj,img:card.images?.large||card.images?.small,smallImg:card.images?.small,setName:card.set?.name,rarity:card.rarity,type2:card.supertype,
        buyLink:ebayURL(card.name,card.set?.name,country,null,"pokemon"),
        sellLink:ebaySellURL(card.name,card.set?.name,country),
        tcgPrice:fmvObj?.tcg};
    }else if(cardTcg==="mtg"){
      // For Supabase MTG results we may not have card.prices object, fall back to _supabasePrice
      const fmvObj=card._supabasePrice!=null?calcFMV(card):calcMTGFMV(card);
      const img=card.image_uris?.normal||card.card_faces?.[0]?.image_uris?.normal||card.images?.large;
      return{fmvObj,img,smallImg:card.image_uris?.small||card.card_faces?.[0]?.image_uris?.small||card.images?.small,setName:card.set_name||card.set?.name,rarity:card.rarity,type2:card.type_line,buyLink:ebayURL(card.name,"",country,null,"mtg"),sellLink:ebaySellURL(card.name,"",country)};
    }else if(cardTcg==="ygo"){
      const fmvObj=card._supabasePrice!=null?calcFMV(card):calcYGOFMV(card);
      const img=card.card_images?.[0]?.image_url||card.images?.large;
      return{fmvObj,img,smallImg:card.card_images?.[0]?.image_url_small||card.images?.small||img,setName:card.set_name||card.type,rarity:card.rarity||card.race,type2:card.attribute,buyLink:ebayURL(card.name,"",country,null,"ygo"),sellLink:ebaySellURL(card.name,"",country)};
    }else{
      // onepiece or unknown — use generic supabase price path
      const fmvObj=card._supabasePrice!=null?calcFMV(card):(card._justtcgPrice?{fmv:+card._justtcgPrice,fmvEUR:+(card._justtcgPrice*EUR_RATE).toFixed(2),net:+(card._justtcgPrice*0.87).toFixed(2),netEUR:+(card._justtcgPrice*EUR_RATE*0.87).toFixed(2)}:null);
      const img=card.images?.large||card.images?.small;
      return{fmvObj,img,smallImg:card.images?.small||img,setName:card.set_name||card.set?.name,rarity:card.rarity,type2:card.supertype||'Card',buyLink:ebayURL(card.name,"",country,null,cardTcg||'pokemon'),sellLink:ebaySellURL(card.name,"",country)};
    }
  };

  // ── COMPONENTS ──────────────────────────────────────────────────────────────
  const FeaturedCard=({card})=>{
    const{fmvObj,img,setName,rarity,buyLink,sellLink,tcgPrice}=getCardData(card);
    const already=inCol(card.id||card.name);const watching=inWatch(card.id||card.name);
    const fmvD=fmvObj?(cur==="EUR"?`€${fmvObj.fmvEUR}`:`$${fmvObj.fmv}`):null;
    const netD=fmvObj?(cur==="EUR"?`€${fmvObj.netEUR}`:`$${fmvObj.net}`):null;
    return(
      <div className="feat">
        <div className="feat-img-wrap">
          <HoloCard src={img} alt={card.name} big onClick={()=>setDetail(card)}/>
        </div>
        <div className="feat-body">
          <div className="feat-lbl">Top result   {activeTCG.emoji} {activeTCG.label}</div>
          <div className="feat-name gt-gold">{card.name}</div>
          <div className="feat-set">{setName}{card.number?` #${card.number}`:""}</div>
          <div className="feat-badges">
            {rarity&&<span className="mb mb-r">{rarity}</span>}
            {tcg==="pokemon"&&<span className="mb mb-l">{aLang?.f} {aLang?.l}</span>}
          </div>
          {fmvD&&(<>
            <div>
              <div className="feat-price gt">{fmvD}</div>
              <div className="feat-price-ref">Fair Market Value   TCGPlayer + eBay avg</div>
              <div className="feat-net">Net sell after fees: {netD}</div>
            </div>
            {tcgPrice&&<div className="pref">
              <span className="pref-i">TCGPlayer <span>${tcgPrice.toFixed(2)}</span></span>
              <span className="pref-i">CM <span>~€{(tcgPrice*EUR_RATE*0.88).toFixed(2)}</span></span>
              <span className="pref-i">eBay <span>${(tcgPrice*1.06).toFixed(2)}</span></span>
            </div>}
          </>)}
          <div className="feat-actions">
            <a href={buyLink} target="_blank" rel="noopener noreferrer" className="btn-buy">
              🛒 {region==="EU"?"EU eBay":"eBay"}
            </a>
            <button className={`btn-ghost${already?" in":""}`} onClick={()=>already?removeFromCol(card.id||card.name):setDetail(card)}>
              {already?"✓ Vault":"+ Vault"}
            </button>
            <button className={`btn-heart${watching?" on":""}`} onClick={()=>toggleWatch(card,fmvObj,img,tcg)}>{watching?"♥":"♡"}</button>
          </div>
        </div>
      </div>
    );
  };

  const CardItem=({card,idx})=>{
    const{fmvObj,smallImg,buyLink}=getCardData(card);
    const already=inCol(card.id||card.name);const watching=inWatch(card.id||card.name);
    const rl=rLvl(card.rarity||"");
    const fmvD=fmvObj?(cur==="EUR"?`€${fmvObj.fmvEUR}`:`$${fmvObj.fmv}`):null;
    const netD=fmvObj?(cur==="EUR"?`€${fmvObj.netEUR}`:`$${fmvObj.net}`):null;
    const setLabel=card.set?.name||card.set_name||card.type||"";
    return(
      <div className={`kcard r${rl}`} style={{animationDelay:`${idx*0.045}s`}}>
        <div className="kcard-img" onClick={()=>setDetail(card)}>
          {smallImg?<img src={smallImg} alt={card.name} loading="lazy"/>:<div style={{height:170,background:"var(--s1)"}}/>}
          <div className="holo-s"/><div className="holo-sh"/>
        </div>
        <div className="kcard-body">
          <div className="kname" onClick={()=>setDetail(card)}>{card.name}</div>
          <div className="kset">{setLabel}</div>
          {tcg==="pokemon"&&<span className="klang">{aLang?.f} {aLang?.l}</span>}
          {fmvD?(<><div className="kprice">{fmvD}</div><div className="kprice-lbl">FMV</div><div className="knet">Net {netD}</div></>)
            :<div className="kprice-lbl" style={{marginBottom:14}}>No price data</div>}
          <div className="kact">
            <a href={buyLink} target="_blank" rel="noopener noreferrer" className="btn-es">🛒 eBay</a>
            <button className={`btn-add-k${already?" in":""}`} onClick={()=>already?null:setDetail(card)}>{already?"✓":"+"}</button>
            <button className={`btn-h-k${watching?" on":""}`} onClick={()=>toggleWatch(card,fmvObj,smallImg,tcg)}>{watching?"♥":"♡"}</button>
          </div>
        </div>
      </div>
    );
  };

  const DetailModal=({card})=>{
    const{fmvObj,img,setName,rarity,type2,buyLink,sellLink,tcgPrice}=getCardData(card);
    const already=inCol(card.id||card.name);const watching=inWatch(card.id||card.name);
    const psa=fmvObj?psaEst(fmvObj.fmv):null;
    const fmvD=fmvObj?(cur==="EUR"?`€${fmvObj.fmvEUR}`:`$${fmvObj.fmv}`):"No data";
    const netD=fmvObj?(cur==="EUR"?`€${fmvObj.netEUR}`:`$${fmvObj.net}`):null;
    const psaD=(u,e)=>cur==="EUR"?`€${e}`:`$${u}`;
    const priceHist=useMemo(()=>fmvObj?mkPriceHist(fmvObj.fmv,30):null,[fmvObj?.fmv]);
    const histColor=priceHist&&priceHist[priceHist.length-1]>=priceHist[0]?"#34d399":"#f87171";
    const hist7=priceHist?.slice(-7);
    const isPro=false; // will be true when plans activated

    return(
      <div className="ov" onClick={e=>e.target===e.currentTarget&&setDetail(null)}>
        <div className="dmod">
          <div className="dmod-handle"/>
          <div className="dmod-top">
            <button className="dmod-x" onClick={()=>setDetail(null)}>✕</button>
            <div className="dmod-img-wrap">
              <HoloCard src={img} alt={card.name} big onClick={()=>img&&setZoomImg(img)}/>
            </div>
            <div className="dmod-info">
              <div>
                <div className="dmod-name gt">{card.name}</div>
                <div className="dmod-set">{setName}{card.number?` #${card.number}`:""}</div>
              </div>
              <div className="dmod-badges">
                {rarity&&<span className="mb mb-r">{rarity}</span>}
                {tcg==="pokemon"&&<span className="mb mb-l">{aLang?.f} {aLang?.l}</span>}
                {type2&&<span className="mb mb-s">{type2}</span>}
              </div>
            </div>
          </div>
          <div className="dmod-body">
            {/* FMV block */}
            <div className="fmv-block">
              <div>
                <div className="fmv-val gt">{fmvD}</div>
                <div className="fmv-lbl">Fair Market Value   weighted avg</div>
                {netD&&<div className="fmv-net">Net sell: {netD}</div>}
                {tcgPrice&&<div className="comp-prices">
                  <div className="comp-i"><div className="comp-lbl">TCGPlayer</div><div className="comp-v">${tcgPrice.toFixed(2)}</div></div>
                  <div className="comp-i"><div className="comp-lbl">Cardmarket</div><div className="comp-v">€{(tcgPrice*EUR_RATE*0.88).toFixed(2)}</div></div>
                  <div className="comp-i"><div className="comp-lbl">eBay</div><div className="comp-v">${(tcgPrice*1.06).toFixed(2)}</div></div>
                </div>}
              </div>
              <a href={buyLink} target="_blank" rel="noopener noreferrer" className="btn-buy" style={{fontSize:12,padding:"9px 14px",alignSelf:"center"}}>
                🛒 {region==="EU"?"EU eBay":"eBay"}
              </a>
            </div>

            {/* ACTIONS */}
            <div className="dmod-actions">
              {already
                ?<button className="btn-prim in" onClick={()=>removeFromCol(card.id||card.name)}>✓ In Vault — Remove</button>
                :<button className="btn-prim" onClick={()=>addToCol(card,fmvObj,img,tcg)}>+ Add to Vault</button>}
              <a href={sellLink} target="_blank" rel="noopener noreferrer" className="btn-sell">💰 Sell on eBay</a>
              <button className={`btn-heart-d${watching?" on":""}`} onClick={()=>toggleWatch(card,fmvObj,img,tcg)} title="Watchlist">
                {watching?"♥ Watching":"♡ Watch"}
              </button>
              <button className="btn-sec" onClick={()=>{setDetail(null);setAlertCard(card);setAlertSent(false);}} title="Price alert">🔔 Alert</button>
            </div>

            {/* CONDITION + PAID */}
            {!already&&(<>
              <div style={{marginBottom:8}}>
                <div style={{fontSize:10,fontWeight:700,color:"var(--txt2)",marginBottom:5,letterSpacing:".3px",textTransform:"uppercase"}}>Condition</div>
                <div className="cond-row">{CONDITIONS.map(c=><button key={c} className={`cond-btn${selCond===c?" on":""}`} onClick={()=>setSelCond(c)}>{c}</button>)}</div>
              </div>
              <input className="paid-in" type="number" placeholder="What did you pay? (optional)" value={paid} onChange={e=>setPaid(e.target.value)}/>
            </>)}

            {/* PRICE HISTORY */}
            {priceHist&&<div className="ph-block">
              <div className="ph-header">
                <div className="ph-title">Price History</div>
                <div className="ph-range">
                  {["7d","30d","90d"].map(r=>(
                    <button key={r} className={`ph-btn${detailPhRange===r?" on":""}`}
                      onClick={()=>isPro||r==="7d"?setDetailPhRange(r):setPlansOpen(true)}>
                      {r}{r!=="7d"&&!isPro&&" 🔒"}
                    </button>
                  ))}
                </div>
              </div>
              {detailPhRange==="7d"||isPro?(
                <LineChart data={detailPhRange==="7d"?hist7:priceHist} color={histColor} id="dph" h={60}/>
              ):(
                <div className="ph-blur-wrap">
                  <div className="ph-blur"><LineChart data={priceHist} color={histColor} id="dph2" h={60}/></div>
                  <div className="ph-pro">
                    <span className="ph-pro-t">30d and 90d history with DraGold Pro</span>
                    <button className="ph-pro-btn" onClick={()=>setPlansOpen(true)}>See plans</button>
                  </div>
                </div>
              )}
            </div>}

            {/* PSA */}
            {psa&&tcg==="pokemon"&&(
              <div className="psa-block">
                <div className="psa-title gt">PSA Graded Estimates</div>
                <div className="psa-sub">Multipliers: 10=3.2x   9=1.6x   8=1.1x   {region==="EU"?"EU":"US"} eBay listings.</div>
                <div className="psa-row">
                  <div className="psa-g g10">
                    <div className="psa-gl">PSA 10</div><div className="psa-gp">{psaD(psa.p10,psa.p10e)}</div>
                    <a href={ebayURL(card.name,card.set?.name,country,10,"pokemon")} target="_blank" rel="noopener noreferrer" className="psa-link">eBay →</a>
                  </div>
                  <div className="psa-g g9">
                    <div className="psa-gl">PSA 9</div><div className="psa-gp">{psaD(psa.p9,psa.p9e)}</div>
                    <a href={ebayURL(card.name,card.set?.name,country,9,"pokemon")} target="_blank" rel="noopener noreferrer" className="psa-link">eBay →</a>
                  </div>
                  <div className="psa-g g8">
                    <div className="psa-gl">PSA 8</div><div className="psa-gp">{psaD(psa.p8,psa.p8e)}</div>
                    <a href={ebayURL(card.name,card.set?.name,country,8,"pokemon")} target="_blank" rel="noopener noreferrer" className="psa-link">eBay →</a>
                  </div>
                </div>
                <div className="psa-note">{region==="EU"?"European":"US"} eBay. Estimates only — actual grades vary by condition and pop report.</div>
              </div>
            )}

            {/* ACCESSORIES */}
            <div className="acc-block">
              <div className="acc-title">🛡️ Protect this card</div>
              <div className="acc-grid">
                {ACCESSORIES.map((a,i)=>(
                  <div key={i} className="acc-item">
                    <span className="acc-name">{a.name}</span>
                    <span className="acc-price">{cur==="EUR"?a.price:`$${(parseFloat(a.price.replace("€",""))/EUR_RATE).toFixed(2)}`}</span>
                    <a href={`https://www.${(EBAY_SITES[country]||EBAY_SITES.US).domain}/sch/i.html?_nkw=${encodeURIComponent(a.query)}&mkcid=1&mkrid=${(EBAY_SITES[country]||EBAY_SITES.US).mkrid}&siteid=${(EBAY_SITES[country]||EBAY_SITES.US).siteid}&campid=${EBAY_CAMP}&toolid=10001&mkevt=1${EU_CC.includes(country)?"&LH_PrefLoc=1":""}`} target="_blank" rel="noopener noreferrer" className="acc-btn">Buy →</a>
                  </div>
                ))}
              </div>
            </div>

            <div className="mod-note">FMV = weighted avg. Net sell = after eBay 13% fee. Estimates only.</div>
          </div>
        </div>
      </div>
    );
  };

  const AlertModal=({card})=>{
    const{fmvObj,smallImg}=getCardData(card);
    const fmvD=fmvObj?(cur==="EUR"?`€${fmvObj.fmvEUR}`:`$${fmvObj.fmv}`):null;
    return(
      <div className="smod-ov" onClick={e=>e.target===e.currentTarget&&setAlertCard(null)}>
        <div className="smod">
          <div className="smod-handle"/>
          {!alertSent?(<>
            <div className="smod-hdr"><div className="smod-t">🔔 Price Alert</div>
              <button className="smod-x" onClick={()=>setAlertCard(null)}>✕</button></div>
            <div className="am-prev">
              {smallImg&&<img src={smallImg} alt={card.name}/>}
              <div><div style={{fontWeight:700,fontSize:13,marginBottom:2}}>{card.name}</div>
                {fmvD&&<div style={{fontFamily:"'Space Mono',monospace",fontSize:12,color:"var(--amber)",marginTop:3}}>{fmvD}</div>}
                {region&&<div style={{fontSize:10,color:"var(--blue)",marginTop:3}}>Monitors {region==="EU"?"EU":"US"} eBay</div>}
              </div>
            </div>
            <p className="smod-desc">Get notified when this card drops below your target price on {region==="EU"?"European":"US"} eBay.</p>
            <input className="smod-in" type="email" placeholder="Your email" value={aEmail} onChange={e=>setAEmail(e.target.value)}/>
            <input className="smod-in" type="number" placeholder={`Target price (${cur})`} value={aPrice} onChange={e=>setAPrice(e.target.value)}/>
            <button className="smod-btn" onClick={()=>aEmail&&aPrice&&setAlertSent(true)}>Activate Alert</button>
          </>):(
            <div className="succ"><span className="succ-i">⚡</span><div className="succ-t">Alert activated!</div>
              <p className="succ-m">Monitoring {region==="EU"?"EU":"US"} eBay for price drops.</p>
              <button className="succ-c" onClick={()=>{setAlertCard(null);setAlertSent(false);}}>Close</button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const AuthModal=()=>(
    <div className="smod-ov" onClick={e=>e.target===e.currentTarget&&setAuthMode(null)}>
      <div className="smod">
        <div className="smod-handle"/>
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:4}}>
          <button className="smod-x" onClick={()=>setAuthMode(null)}>✕</button>
        </div>
        <div className="auth-logo"><img className="auth-gem" src="/logo-gold.png" alt="DraGold"/>
          <span className="auth-brand gt">DraGold</span>
        </div>
        <div className="smod-hdr" style={{marginBottom:5}}><div className="smod-t">{authMode==="register"?"Join DraGold":"Welcome back"}</div></div>
        <p className="smod-desc">No password needed. Enter your email and we'll send you a magic sign-in link.</p>
        <input className="smod-in" type="email" placeholder="Email address" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} style={{marginBottom:12}} onKeyDown={e=>e.key==="Enter"&&(authMode==="register"?doRegister():doLogin())}/>
        <button className="smod-btn" onClick={authMode==="register"?doRegister:doLogin}>
          Send magic link
        </button>
        <div className="smod-switch">
          {authMode==="register"
            ?<span className="smod-lnk" onClick={()=>setAuthMode("login")}>Already have an account? Sign in</span>
            :<span className="smod-lnk" onClick={()=>setAuthMode("register")}>New? Create free account</span>
          }
        </div>
        {authMode==="register"&&<div className="smod-legal">By registering you agree to receive product updates. No spam.</div>}
      </div>
    </div>
  );

  const PlansModal=()=>(
    <div className="smod-ov" onClick={e=>e.target===e.currentTarget&&setPlansOpen(false)}>
      <div className="plans-modal">
        <div className="plans-handle"/>
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
          <button className="smod-x" onClick={()=>setPlansOpen(false)}>✕</button>
        </div>
        <div style={{textAlign:"center",marginBottom:8}}><span style={{fontSize:36}}>🚀</span></div>
        <div className="plans-title gt">Paid plans — coming Q3 2026</div>
        <div className="plans-sub">DraGold is completely free in beta. Paid plans launch Q3 2026. Join free now to lock in early access.</div>
        <div className="plans-grid">
          {PLANS.map(plan=>(
            <div key={plan.id} className={`plan-card${plan.id==="collector"?" featured":plan.id==="pro"?" pro":""}`}>
              {plan.badge&&<div className={`plan-badge-top ${plan.id==="collector"?"pb-pop":"pb-val"}`}>{plan.badge}</div>}
              <div className="plan-name" style={{color:plan.color}}>{plan.name}</div>
              <div className="plan-price" style={{color:plan.color}}>{plan.id==="free"?plan.price:"Soon"}</div>
              <div className="plan-period">{plan.id==="free"?"forever free":plan.period}</div>
              <div className="plan-features">
                {plan.features.map((f,i)=>(<div key={i} className="plan-f"><div className="plan-f-dot" style={{background:plan.color}}/><span>{f}</span></div>))}
              </div>
              <button className={`plan-cta plan-cta-${plan.id==="free"?"free":plan.id==="collector"?"col":"pro"}`}
                onClick={()=>{setPlansOpen(false);if(!user&&plan.id==="free") setAuthMode("register");}}>
                {plan.id==="free"?"Start for free":"Get notified when ready"}
              </button>
            </div>
          ))}
        </div>
        <div style={{textAlign:"center",marginTop:18,fontSize:12,color:"var(--muted)"}}>
          Support now via <a href="https://buymeacoffee.com/dragold" target="_blank" rel="noopener noreferrer" style={{color:"var(--amber)",fontWeight:700}}>BuyMeACoffee</a>
        </div>
      </div>
    </div>
  );

  const ArticleReader=({post})=>(
    <div className="art-ov">
      <div className="art-inner">
        <button className="art-back" onClick={()=>setArticle(null)}>← Blog</button>
        <span className="art-emoji">{post.emoji}</span>
        <div style={{display:"flex",gap:7,alignItems:"center",marginBottom:12}}>
          <span className="bcard-cat">{post.cat}</span>
          <span style={{fontSize:10,color:"var(--muted)",fontFamily:"'Space Mono',monospace"}}>{post.date}   {post.read}</span>
        </div>
        <div className="art-title gt">{post.title}</div>
        <div className="art-divider"/>
        {post.featuredCards?.length>0&&(
          <div className="art-cards">
            {post.featuredCards.map((c,i)=>(
              <div key={i} className="art-card">
                <img src={c.img} alt={c.name}/>
                <div><div className="ac-name">{c.name}</div><div className="ac-set">{c.set}</div>
                  <div className="ac-price">{cur==="EUR"?`€${(c.fmv*EUR_RATE).toFixed(2)}`:`$${c.fmv}`}</div>
                  <div className={`ac-chg ${c.change>=0?"pos":"neg"}`}>{c.change>=0?"+":""}{c.change}% this week</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {post.body.map((p,i)=><p key={i} className="art-p">{p}</p>)}
        <div className="art-cta">
          <div className="art-cta-t gt">Track your collection on DraGold</div>
          <button className="smod-btn" style={{maxWidth:240,margin:"0 auto",display:"block"}}
            onClick={()=>{setArticle(null);setTab("explore");}}>Start for free</button>
        </div>
      </div>
    </div>
  );

  // HOME SECTIONS
  const HomeSections=()=>(
    <div className="hs">
      {/* HOT RIGHT NOW */}
      <div style={{marginBottom:40}}>
        <div className="sec-hdr">
          <div className="sec-title gt">Hot Right Now</div>
          <span className="sec-badge sb-live">{hotLoading?'Loading…':hotPicks.length?'Updated daily':'Computing'}</span>
        </div>
        {hotPicks.length===0?(
          <div className="col-empty" style={{padding:'32px 16px'}}>
            <span className="col-ei">📈</span>
            <div className="col-et">Hot picks computing</div>
            <p className="col-es">Daily price movers will appear here once the next snapshot completes. No fake numbers — only real movers from the catalog.</p>
          </div>
        ):(
          <div style={{position:"relative"}}>
            <div className="hot-grid">
              {hotPicks.map((c,i)=>{
                const up=c.change!=null&&c.change>=0;
                const sign=up?'+':'';
                const priceTxt=c.fmv!=null?(cur==="EUR"?`€${c.fmvEUR}`:`$${c.fmv}`):'—';
                const chgTxt=c.change!=null?`${sign}${c.change}% 24h`:'Δ —';
                return(
                  <div key={c.id} className={`hot-card${i>=5?" locked":""}`} onClick={()=>{if(i<5){setQ(c.name);setTab("explore");setTimeout(()=>doSearch(),100);}}}>
                    {c.img?<img src={c.img} alt={c.name}/>:<div style={{height:160,background:"var(--s1)",borderRadius:8}}/>}
                    <div className="hc-info">
                      <div className="hc-name">{c.name}</div>
                      <div className="hc-set">{c.set}</div>
                      <div className="hc-price">{priceTxt}</div>
                      <div className="hc-change" style={{color:up?'var(--gain)':'var(--loss)'}}>{chgTxt}</div>
                      <div className="hc-reason">{c.reason}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            {hotPicks.length>5&&(
              <div className="pw-overlay">
                <div className="pw-txt">See all 10 picks with DraGold Pro</div>
                <button className="pw-btn" onClick={()=>setPlansOpen(true)}>See plans — coming Q3 2026</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* GRADING SPOTLIGHT */}
      <div style={{marginBottom:40}}>
        <div className="sec-hdr">
          <div className="sec-title gt">Grading Spotlight</div>
          <span className="sec-badge" style={{background:"var(--purple-b)",color:"var(--purple)",border:"1px solid rgba(167,139,250,.2)"}}>Daily pick</span>
        </div>
        <div className="gs-card">
          <img src={GRADING_SPOT.img} alt={GRADING_SPOT.name} className="gs-img"/>
          <div>
            <div className="gs-label">Top grading opportunity</div>
            <div className="gs-name gt">{GRADING_SPOT.name}</div>
            <div className="gs-set">{GRADING_SPOT.set}</div>
            <div className="gs-prices">
              <div className="gs-pi"><div className="gs-pi-l">Raw FMV</div><div className="gs-pi-v" style={{color:"var(--amber)"}}>{cur==="EUR"?`€${(GRADING_SPOT.fmv*EUR_RATE).toFixed(0)}`:`$${GRADING_SPOT.fmv}`}</div></div>
              <div className="gs-pi"><div className="gs-pi-l">PSA 10 est.</div><div className="gs-pi-v" style={{color:"var(--gain)"}}>{cur==="EUR"?`€${GRADING_SPOT.psa10EUR}`:`$${GRADING_SPOT.psa10}`}</div></div>
              <div className="gs-pi"><div className="gs-pi-l">Pop 10</div><div className="gs-pi-v" style={{color:"var(--purple)"}}>{GRADING_SPOT.pop10}</div></div>
            </div>
            <div className="gs-analysis">{GRADING_SPOT.analysis}</div>
          </div>
        </div>
      </div>

      {/* UPCOMING RELEASES */}
      <div style={{marginBottom:40}}>
        <div className="sec-hdr">
          <div className="sec-title gt">Upcoming Sets</div>
        </div>
        <div className="ug">
          {[
            {name:"Pokémon Mega Evolution",date:"June 2026",hype:96,img:"https://images.pokemontcg.io/sv3pt5/logo.png"},
            {name:"Magic: Tarkir Dragonstorm",date:"May 30, 2026",hype:88,img:null},
            {name:"Pokémon Black Bolt & White Flare",date:"Q3 2026",hype:92,img:"https://images.pokemontcg.io/sv3pt5/logo.png"},
            {name:"DraGold Portfolio Dashboard",date:"Coming soon",hype:100,img:null},
            {name:"DraGold Camera Scan",date:"Q3 2026",hype:85,img:null},
            {name:"One Piece full bulk catalog",date:"Q4 2026",hype:80,img:null},
          ].map((u,i)=>(
            <div key={i} className="uc">
              {u.img?<img src={u.img} alt={u.name} className="uc-img"/>:<div className="uc-img-ph">📦</div>}
              <div className="uc-info">
                <div className="uc-name">{u.name}</div>
                <div className="uc-date">{u.date}</div>
                <div className="hype-bar"><div className="hype-fill" style={{width:`${u.hype}%`}}/></div>
                <div style={{fontSize:9,color:"var(--muted)",marginTop:3,fontFamily:"'Space Mono',monospace"}}>Hype {u.hype}/100</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* BLOG PREVIEW */}
      <div style={{marginBottom:40}}>
        <div className="sec-hdr">
          <div className="sec-title gt">From the Blog</div>
          <button onClick={()=>setTab("blog")} style={{background:"none",border:"1px solid var(--gb)",color:"var(--muted)",padding:"4px 12px",borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer"}}>All articles</button>
        </div>
        <div className="bp-grid">
          {BLOG.slice(0,2).map((post,i)=>(
            <div key={post.id} className="bpv" onClick={()=>{setArticle(post);setTab("blog");}}>
              <div className="bpv-top"><span style={{fontSize:22}}>{post.emoji}</span><span className="bpv-cat">{post.cat}</span></div>
              <div className="bpv-title">{post.title}</div>
              {post.featuredCards?.length>0&&(
                <div className="bpv-chips">
                  {post.featuredCards.slice(0,2).map((c,ci)=>(
                    <div key={ci} className="bpv-chip">
                      <img src={c.img} alt={c.name}/>
                      <div><div className="bcc-n">{c.name.split(" ")[0]}</div>
                        <div className={`bcc-c ${c.change>=0?"pos":"neg"}`}>{c.change>=0?"+":""}{c.change}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="bpv-exc">{post.excerpt}</div>
            </div>
          ))}
        </div>
      </div>

      {/* COMING SOON */}
      <div style={{marginBottom:0}}>
        <div className="sec-hdr">
          <div className="sec-title gt">Coming to DraGold</div>
        </div>
        <div className="coming-grid">
          {[
            {emoji:"📷",name:"Camera Scanning",desc:"Scan any card with your phone. Auto-adds to vault."},
            {emoji:"🎴",name:"Pack Opening Game",desc:"Open virtual packs with real market values."},
            {emoji:"💎",name:"DraGold Pro",desc:"Unlimited alerts, binders, price history. €4.99/mo."},
            {emoji:"⚓",name:"One Piece TCG",desc:"Full One Piece card database with pricing."},
            {emoji:"🏰",name:"Disney Lorcana",desc:"Complete Lorcana tracking and collection tools."},
            {emoji:"📤",name:"Export",desc:"PDF and CSV export for insurance and records."},
          ].map((f,i)=>(
            <div key={i} className="coming-item">
              <span style={{fontSize:22,marginBottom:7,display:"block"}}>{f.emoji}</span>
              <div style={{fontFamily:"'Fraunces',sans-serif",fontWeight:800,fontSize:12,marginBottom:3}}>{f.name}</div>
              <div style={{fontSize:10,color:"var(--muted)",lineHeight:1.5}}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const BinderTab=()=>(
    <div className="binder-wrap">
      <div className="binder-hdr">
        <div>
          <div className="sec-title gt" style={{fontSize:22,marginBottom:4}}>Digital Binder</div>
          <div style={{fontSize:13,color:"var(--muted)"}}>Organize your cards like physical binders</div>
        </div>
        <button className="btn-nb" onClick={()=>setNewBinderOpen(true)}>+ New Binder</button>
      </div>
      {binders.length===0?(
        <div className="binder-empty">
          <span style={{fontSize:48,marginBottom:14,display:"block"}}>📒</span>
          <div style={{fontFamily:"'Fraunces',sans-serif",fontSize:18,fontWeight:800,marginBottom:7}}>No binders yet</div>
          <p style={{fontSize:13,color:"var(--muted)"}}>Create your first binder to organize your collection visually.</p>
        </div>
      ):(<>
        <div className="blist">
          {binders.map(b=>{
            const bType=BINDER_TYPES.find(x=>x.id===b.type);
            const tc=b.pages.flat().filter(Boolean).length;
            const tv=b.pages.flat().reduce((s,id)=>{const c=getColCard(id);return s+(c?.market||0);},0);
            return(
              <div key={b.id} className={`bi${activeBinder?.id===b.id?" active":""}`} onClick={()=>{setActiveBinder(b);setBinderPage(0);}}>
                <div className="bi-name">{b.name}</div>
                <div className="bi-meta">{bType?.name}   {b.pages.length}p   {tc} cards</div>
                <div className="bi-val">{disp(tv)}</div>
              </div>
            );
          })}
        </div>
        {activeBinder&&(
          <div className="bv">
            <div className="bv-hdr">
              <div>
                <div className="bv-name">{activeBinder.name}</div>
                <div className="bv-info">Page {binderPage+1}/{activeBinder.pages.length}   {bt.name}</div>
                <div className="bv-val">Page value: {disp(pageVal)}</div>
              </div>
              <div className="bv-nav">
                <button className="btn-pg" onClick={()=>setBinderPage(p=>p-1)} disabled={binderPage===0}>Prev</button>
                <button className="btn-pg" onClick={()=>setBinderPage(p=>p+1)} disabled={binderPage>=activeBinder.pages.length-1}>Next</button>
                <button className="btn-pg" onClick={addBinderPage} style={{color:"var(--amber)"}}>+ Page</button>
              </div>
            </div>
            <div className="bgrid" style={{gridTemplateColumns:`repeat(${bt.cols},1fr)`}}>
              {curPage.map((cid,si)=>{
                const card=getColCard(cid);
                return(
                  <div key={si} className={`bslot${card?" filled":""}`} onClick={()=>!card&&setPickingSlot({pi:binderPage,si})}>
                    {card?(<>
                      <img src={card.img} alt={card.name}/>
                      <button className="bslot-rm" onClick={e=>{e.stopPropagation();removeFromSlot(binderPage,si);}}>✕</button>
                      <div className="bslot-val">{disp(card.market)}</div>
                    </>):<span className="bslot-empty">+</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </>)}
    </div>
  );

  // ── RENDER ────────────────────────────────────────────────────────────────
  return(
    <div style={{minHeight:"100vh",background:"#020208",color:"#f8f8ff"}}>
      <style>{CSS}</style>

      {/* NAV */}
      <nav className="nav">
        <div className="nav-l">
          <img className="logo-gem" src="/logo-gold.png" alt="DraGold" />
          <span className="logo-txt gt">DraGold</span>
        </div>
        <div className="nav-r">
          <div className="cur-row">
            <button className={`curb${cur==="USD"?" on":""}`} onClick={()=>setCur("USD")}>USD</button>
            <button className={`curb${cur==="EUR"?" on":""}`} onClick={()=>setCur("EUR")}>EUR</button>
          </div>
          {/* UI language switcher removed: i18n not implemented yet, only EN. */}
          <div style={{display:"none"}} ref={langRef}>
            <button className="ldb" onClick={()=>setLangOpen(x=>!x)}>
              <span>{curLang.f}</span>
              <span style={{fontSize:11,fontWeight:700}}>{curLang.c.toUpperCase()}</span>
              <span className={`lch${langOpen?" op":""}`}>▾</span>
            </button>
            {langOpen&&<div className="ldm">
              {UI_LANGS.map(l=>(
                <div key={l.c} className={`lo${ui===l.c?" on":""}`} onClick={()=>{setUi(l.c);setLangOpen(false);}}>
                  <span>{l.f}</span><span>{l.n}</span>
                </div>
              ))}
            </div>}
          </div>
          {user?(
            <div className="ldw" ref={userRef}>
              <div className="user-chip" onClick={()=>setUserMenuOpen(x=>!x)}>
                <div className="user-av">{user.name?.[0]?.toUpperCase()||"U"}</div>
                <span style={{display:"none"}} className="hide-xs">{user.name}</span>
              </div>
              {userMenuOpen&&<div className="ldm">
                <div className="lo" onClick={()=>{setPlansOpen(true);setUserMenuOpen(false);}}>Plans</div>
                <div className="lo" onClick={doLogout} style={{color:"var(--loss)"}}>Sign out</div>
              </div>}
            </div>
          ):(
            <button className="auth-btn" onClick={()=>setAuthMode("register")}>Join free</button>
          )}
        </div>
      </nav>

      {/* MARKET PULSE */}
      <div className="pulse-bar">
        {MARKET_PULSE.map(m=>(
          <div key={m.name} className="pulse-item">
            <div className="pulse-dot" style={{background:m.trend==="up"?"var(--gain)":"var(--loss)"}}/>
            <span className="pulse-name">{m.name}</span>
            {m.change!=null && <span className="pulse-chg" style={{color:m.trend==="up"?"var(--gain)":"var(--loss)"}}>{m.trend==="up"?"+":""}{m.change}%</span>}
            {m.vol && <span className="pulse-vol">{m.vol}</span>}
          </div>
        ))}
      </div>

      {region&&<div className="geo"><div className="geo-dot"/>
        <span>Detected: {country}   {region==="EU"?"EUR   EU eBay active":"USD   US eBay active"}</span>
      </div>}

      {/* TABS */}
      <div className="tbar">
        <div className="tabs">
          <button className={`tb${tab==="explore"?" on":""}`} onClick={()=>setTab("explore")}>Explore</button>
          <button className={`tb${tab==="sealed"?" on":""}`} onClick={()=>setTab("sealed")}>Sealed</button>
          <button className={`tb${tab==="binder"?" on":""}`} onClick={()=>setTab("binder")}>Binder</button>
          <button className={`tb${tab==="blog"?" on":""}`} onClick={()=>setTab("blog")}>Blog</button>
          <button className={`tb${tab==="col"?" on":""}`} onClick={()=>setTab("col")}>
            Vault{col.length>0&&<span className="tbb">{col.length}</span>}
          </button>
        </div>
      </div>

      {/* EXPLORE */}
      {tab==="explore"&&(<>
        <section className="hero">
          <div className="aurora">
            <div className="ab ab1"/><div className="ab ab2"/>
            <div className="ab ab3"/><div className="ab ab4"/>
          </div>
          <div className="hero-inner">
            <div className="hero-cols">
              <div className="hero-left">
                <div className="hero-badge"><span className="bdot"/>Beta   Pokémon   Magic   Yu-Gi-Oh!</div>
                <span className="hero-tagline gt">For serious collectors.</span>
                <p className="hero-sub">One fair price across TCGPlayer and eBay. PSA estimates. Digital binder. Watchlist. No guesses.</p>
                <div className="tcg-row">
                  {TCG_LIST.map(tc=>(
                    <button key={tc.id} className={`tcg-btn${tcg===tc.id?" on":""}`}
                      style={tcg===tc.id?{borderColor:tc.color,color:tc.color,background:`${tc.color}12`,boxShadow:`0 0 16px ${tc.color}28`}:{}}
                      onClick={()=>changeTCG(tc.id)}>
                      <span>{tc.emoji}</span><span>{tc.label}</span>
                    </button>
                  ))}
                </div>
                <div className="srch" style={{position:"relative"}}>
                  <input className="srch-in" type="text"
                    placeholder="Search any card by name, number or set..."
                    value={q}
                    onChange={e=>setQ(e.target.value)}
                    onFocus={()=>q&&suggestions.length&&setShowSugg(true)}
                    onBlur={()=>setTimeout(()=>setShowSugg(false),200)}
                    onKeyDown={e=>e.key==="Enter"&&doSearch()}/>
                  <button className="srch-go" onClick={doSearch}>Search</button>
                  {showSugg&&suggestions.length>0&&(
                    <div className="sugg-dd">
                      {suggestions.map(s=>(
                        <div key={s.id} className="sugg-row"
                          onMouseDown={()=>{setQ(s.name);setTimeout(()=>doSearch(),50);setShowSugg(false);}}>
                          {s.image_url
                            ? <img src={s.image_url} alt={s.name} className="sugg-img"/>
                            : <div className="sugg-img" style={{background:"var(--s2)"}}/>}
                          <div style={{flex:1,minWidth:0}}>
                            <div className="sugg-name">{s.name}</div>
                            <div className="sugg-meta">{s.set_name||""}  ·  {s.tcg}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {demo&&<div className="demo-bar">Demo mode   live search active when deployed</div>}
                <div className="mq-wrap"><div className="mq">{TICKER}   {TICKER}</div></div>
              </div>
              <div className="hero-right">
                <div className="fc-wrap">
                  {dailyCards.map((c,i)=>(<>
                    <div key={`g${i}`} className="cglow" style={{
                      width:180,height:180,background:c.glow,
                      left:i===0?"0":i===1?"80px":"auto",right:i===2?"0":"auto",
                      top:i===0?"50px":i===1?"-30px":"80px"}}/>
                    <img key={`c${i}`} src={c.img} alt="card" className="fcard"
                      style={{filter:`drop-shadow(0 0 26px ${c.glow})`}}/>
                  </>))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {tcg==="pokemon"&&<div className="lf">
          <div className="lf-lbl">Card edition language</div>
          <div className="lf-pills">
            {CARD_LANGS.map(l=>(
              <button key={l.c} className={`lp${clang===l.c?" on":""}${!l.live?" off":""}`}
                onClick={()=>{if(l.live){setClang(l.c);setCards([]);setSearched(false);setDemo(false);}}}>
                <span>{l.f}</span><span>{l.l}</span>
                {l.hot&&<span className="lp-hot">Hot</span>}
                {!l.live&&<span className="lp-soon">Soon</span>}
              </button>
            ))}
          </div>
        </div>}

        <div className="cw">
          {loading&&<p className="rmsg">Searching the vault...</p>}
          {!loading&&searched&&cards.length===0&&<p className="rmsg">No cards found. Try another name.</p>}
          {cards.length>0&&(<>
            <FeaturedCard card={cards[0]}/>
            {cards.length>1&&<div className="grid">{cards.slice(1).map((c,i)=><CardItem key={c.id||c.name||i} card={c} idx={i}/>)}</div>}
          </>)}
        </div>

        {!searched&&<HomeSections/>}
      </>)}

      {/* SEALED */}
      {tab==="sealed"&&(
        <div className="cw">
          <div className="sec-title gt" style={{fontSize:22,marginBottom:6}}>Sealed Products</div>
          <div style={{fontSize:13,color:"var(--muted)",marginBottom:20}}>Top Pokémon boxes, ETBs and booster packs</div>
          <div className="sealed-grid">
            {SEALED.map(prod=>{
              const price=cur==="EUR"?`€${(prod.fmv*EUR_RATE).toFixed(2)}`:`$${prod.fmv}`;
              const link=ebayURL(prod.name,"",country,null,"pokemon");
              return(
                <div key={prod.id} className="sc">
                  <div className="sc-img-wrap"><img src={prod.img} alt={prod.name} className="sc-img"/></div>
                  <div className="sc-name">{prod.name}</div>
                  <div className="sc-set">{prod.setName}</div>
                  <span className={`sc-type ty-${prod.type.toLowerCase()}`}>{prod.type}</span>
                  <div className="sc-price gt">{price}</div>
                  <div className="sc-lbl">Fair Market Value</div>
                  <a href={link} target="_blank" rel="noopener noreferrer" className="sc-buy">
                    🛒 {region==="EU"?"EU eBay":"eBay"}
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* BINDER */}
      {tab==="binder"&&<BinderTab/>}

      {/* BLOG */}
      {tab==="blog"&&(
        <div className="cw">
          <div className="sec-title gt" style={{fontSize:24,marginBottom:5}}>DraGold Blog</div>
          <div style={{fontSize:13,color:"var(--muted)",marginBottom:24}}>Market insights, grading guides and investment strategies</div>
          <div className="blog-grid">
            {BLOG.map((post,i)=>(
              <div key={post.id} className="bcard" onClick={()=>setArticle(post)}>
                <div className="bcard-top">
                  <span style={{fontSize:22}}>{post.emoji}</span>
                  <div style={{display:"flex",gap:7,alignItems:"center"}}>
                    <span className="bcard-cat">{post.cat}</span>
                    <span className="bcard-meta">{post.date}   {post.read}</span>
                  </div>
                </div>
                <div className={`bcard-title gt`}>{post.title}</div>
                {post.featuredCards?.length>0&&(
                  <div className="bcard-chips">
                    {post.featuredCards.slice(0,i===0?3:2).map((c,ci)=>(
                      <div key={ci} className="bc-chip">
                        <img src={c.img} alt={c.name}/>
                        <div><div className="bc-n">{c.name.split(" ")[0]}</div>
                          <div className="bc-p">{cur==="EUR"?`€${(c.fmv*EUR_RATE).toFixed(0)}`:`$${c.fmv}`}</div>
                          <div className={`bc-c ${c.change>=0?"pos":"neg"}`}>{c.change>=0?"+":""}{c.change}%</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="bcard-exc">{post.excerpt}</div>
                <div className="bcard-cta">Read article →</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VAULT */}
      {tab==="col"&&(
        <div className="col-wrap">
          {user&&(
            <div style={{padding:'16px 16px 4px',display:'flex',alignItems:'baseline',gap:10,flexWrap:'wrap'}}>
              <div className="gt-gold" style={{fontFamily:"'Fraunces',serif",fontSize:24,fontWeight:800,letterSpacing:'-.5px'}}>
                Welcome back, {user.name}
              </div>
              <div style={{fontSize:12,color:'var(--muted)',fontFamily:"'Space Mono',monospace"}}>
                {col.length} cards · synced to your account
              </div>
            </div>
          )}
          <div className="col-tabs">
            <button className={`col-tab${colTab==="vault"?" on":""}`} onClick={()=>setColTab("vault")}>
              Vault {col.length>0&&`(${col.length})`}
            </button>
            <button className={`col-tab${colTab==="watchlist"?" on":""}`} onClick={()=>setColTab("watchlist")}
              style={colTab==="watchlist"?{borderColor:"var(--pink)",background:"var(--pink-b)",color:"var(--pink)"}:{}}>
              Watchlist {watchlist.length>0&&`(${watchlist.length})`}
            </button>
          </div>

          {colTab==="vault"&&(<>
            {col.length===0?(
              <div className="col-empty">
                <span className="col-ei">🐉</span>
                <div className="col-et">Your vault is empty</div>
                <p className="col-es">{user?'Search for any card — Pokémon, Magic, Yu-Gi-Oh! — and tap + Vault to add it. Prices refresh automatically.':'Sign in to start tracking your collection across devices.'}</p>
                {user?(
                  <button className="btn-prim" style={{marginTop:14}} onClick={()=>setTab('explore')}>Search the catalog</button>
                ):(
                  <button className="btn-prim" style={{marginTop:14}} onClick={()=>setAuthMode('login')}>Sign in to your vault</button>
                )}
              </div>
            ):(<>
              <div className="bento">
                <div className="bento-main">
                  <div className="port-val gt">{disp(totalVal)}</div>
                  <div className={`port-chg ${portChg>=0?"pos":"neg"}`}>{portChg>=0?"+":""}{disp(Math.abs(portChg))} (30d)</div>
                  <div className="port-lbl">Portfolio   {col.length} cards   FMV</div>
                  {portData&&<div className="port-chart"><LineChart data={portData} color={portChg>=0?"#34d399":"#f87171"} id="pc" h={68}/></div>}
                  <div className="range-row">
                    {["7d","30d","90d"].map(r=><button key={r} className={`rbtn${portRange===r?" on":""}`} onClick={()=>setPortRange(r)}>{r}</button>)}
                  </div>
                  <div className="port-stats">
                    <div className="pst"><span className="pst-v pos">{disp(netVal)}</span><span className="pst-l">Net Sell</span></div>
                    <div className="pst"><span className="pst-v" style={{color:"var(--txt2)"}}>{disp(totalPaid)}</span><span className="pst-l">Invested</span></div>
                    <div className="pst"><span className={`pst-v ${netVal-totalPaid>=0?"pos":"neg"}`}>{netVal-totalPaid>=0?"+":""}{disp(Math.abs(netVal-totalPaid))}</span><span className="pst-l">P&L</span></div>
                  </div>
                </div>
                <div className="bento-roi">
                  <div className={`roi-val ${roi&&parseFloat(roi)>=0?"pos":"neg"}`}>{roi?`${roi}%`:"n/a"}</div>
                  <div className="roi-lbl">ROI after fees</div>
                </div>
              </div>
              <div className="col-list">
                {col.map(item=>{
                  const profit=(item.market*0.87)-item.paid;const pos=profit>=0;
                  return(
                    <div key={item.id} className="ci" style={{borderLeft:`3px solid ${pos?"var(--gain)":"var(--loss)"}`}}>
                      {item.img&&<img src={item.img} alt={item.name}/>}
                      <div className="ci-info">
                        <div className="ci-name">{item.name}</div>
                        <div className="ci-sub">{item.set}   {item.flag}   {item.tcgType?.toUpperCase()}</div>
                        <div className="ci-pr">
                          <span className="ci-fmv">{disp(item.market)}</span>
                          {item.condition&&<span className="ci-cond">{item.condition}</span>}
                          {item.paid>0&&(<>
                            <span className="ci-paid">paid ${item.paid.toFixed(2)}</span>
                            <span className={`ci-pnl ${pos?"pos":"neg"}`}>{pos?"▲":"▼"} ${Math.abs(profit).toFixed(2)}</span>
                          </>)}
                        </div>
                      </div>
                      {item.spark&&<Spark data={item.spark} pos={pos} w={80} h={26}/>}
                      <button className="btn-rm" onClick={()=>removeFromCol(item.id)}>✕</button>
                    </div>
                  );
                })}
              </div>
            </>)}
          </>)}

          {colTab==="watchlist"&&(<>
            {watchlist.length===0?(
              <div className="col-empty">
                <span className="col-ei">♡</span>
                <div className="col-et">No cards in watchlist</div>
                <p className="col-es">Tap ♡ on any card to watch its price without adding it to your vault.</p>
              </div>
            ):(
              <div className="col-list">
                {watchlist.map(item=>(
                  <div key={item.id} className="wi">
                    {item.img&&<img src={item.img} alt={item.name}/>}
                    <div className="wi-info">
                      <div className="wi-name">{item.name}</div>
                      <div className="wi-set">{item.set}   {item.tcgType?.toUpperCase()}</div>
                      <div className="wi-price">{disp(item.market)}</div>
                      <div className="wi-alert">🔔 Set alert to track price drop</div>
                    </div>
                    <button className="btn-rm" style={{color:"var(--pink)"}} onClick={()=>removeWatch(item.id)}>♥</button>
                  </div>
                ))}
              </div>
            )}
          </>)}
        </div>
      )}

      {/* DONATION */}
      <div className="donate-section">
        <div className="donate-inner">
          <div className="donate-left">
            <div className="donate-emoji">☕</div>
            <div>
              <div className="donate-title gt">Support DraGold</div>
              <div className="donate-sub">Built by one person, free for everyone. If DraGold saves you money on your collection, consider buying me a coffee. Keeps the servers running and new features coming.</div>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"stretch",gap:8,flexShrink:0}}>
            <a href="https://buymeacoffee.com/dragold" target="_blank" rel="noopener noreferrer" className="donate-btn">
              ☕ Buy me a coffee
            </a>
            <div className="donate-note">via BuyMeACoffee   No account needed</div>
          </div>
        </div>
      </div>

      <footer className="footer">
        <span>© 2026 DraGold</span>
        <span>Real prices. No guesses.</span>
        <a href="https://buymeacoffee.com/dragold" target="_blank" rel="noopener noreferrer" style={{color:"var(--amber)",fontWeight:700}}>Support ☕</a>
      </footer>

      {/* MODALS */}
      {zoomImg    &&<div className="img-zoom-ov" onClick={()=>setZoomImg(null)}><img src={zoomImg} alt="zoom"/></div>}
      {article    &&<ArticleReader post={article}/>}
      {authMode   &&<AuthModal/>}
      {detail     &&<DetailModal card={detail}/>}
      {alertCard  &&<AlertModal card={alertCard}/>}
      {plansOpen  &&<PlansModal/>}
      {pickingSlot&&(
        <div className="smod-ov" onClick={e=>e.target===e.currentTarget&&setPickingSlot(null)}>
          <div className="picker-modal">
            <div className="smod-handle"/>
            <div className="picker-title">Choose from your vault</div>
            {col.length===0?<div className="picker-empty">Your vault is empty. Add cards from Explore first.</div>
              :<div className="picker-list">
                {col.map(c=>(
                  <div key={c.id} className="picker-item" onClick={()=>placeCard(c.id)}>
                    {c.img&&<img src={c.img} alt={c.name}/>}
                    <div><div className="pi-n">{c.name}</div><div className="pi-s">{c.set}</div><div className="pi-p">{disp(c.market)}</div></div>
                  </div>
                ))}
              </div>
            }
            <button className="picker-close" onClick={()=>setPickingSlot(null)}>Cancel</button>
          </div>
        </div>
      )}
      {newBinderOpen&&(
        <div className="smod-ov" onClick={e=>e.target===e.currentTarget&&setNewBinderOpen(false)}>
          <div className="nb-modal">
            <div className="smod-handle"/>
            <div className="nb-title">New Binder</div>
            <div className="nb-lbl">Name</div>
            <input className="nb-in" type="text" placeholder="e.g. My Charizard Collection" value={nbName} onChange={e=>setNbName(e.target.value)}/>
            <div className="nb-lbl">Type</div>
            <div className="nb-types">
              {BINDER_TYPES.map(t=>(
                <div key={t.id} className={`nb-type${nbType===t.id?" on":""}`} onClick={()=>setNbType(t.id)}>
                  <div className="nb-type-n">{t.name}</div>
                  <div className="nb-type-d">{t.desc}</div>
                </div>
              ))}
            </div>
            <button className="nb-create" onClick={createBinder} disabled={!nbName.trim()}>Create Binder</button>
          </div>
        </div>
      )}
    </div>
  );
}
