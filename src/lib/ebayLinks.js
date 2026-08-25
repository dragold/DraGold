// DraGold — eBay affiliate link builders (Market/Purchase Discovery MVP, 2026-08-25).
// Estratto verbatim da DraGold.jsx (era definito lì, "riusata dal legacy, serve
// già per le CTA oneste") in un modulo leggero e senza dipendenze React, cosí
// che anche la pagina pubblica /carta/:slug (CardPage.jsx, che evita
// deliberatamente di importare DraGold.jsx per non appesantire il suo bundle
// — vedi commento in cima a CardPage.jsx) possa riusare la STESSA logica di
// affiliate tracking (EPN: mkcid/mkrid/siteid/campid/toolid/mkevt) invece di
// duplicarla — un solo posto dove questi parametri possono disallinearsi.
// DraGold.jsx ri-esporta da qui, quindi AssetView.jsx (che importa
// ebayURL/ebayItemURL da "../../DraGold.jsx") non cambia comportamento.
const EBAY_CAMP = "5339152703";
const EU_CC = ["IT","DE","FR","ES","PT","NL","BE","AT","PL","SE","FI","DK","NO","CH","GB","GR","CZ","HU"];
const EBAY_SITES = {
  IT:{domain:"ebay.it",     mkrid:"724-53478-19255-0", siteid:"101"},
  DE:{domain:"ebay.de",     mkrid:"707-53477-19255-0", siteid:"77"},
  FR:{domain:"ebay.fr",     mkrid:"709-53476-19255-0", siteid:"71"},
  ES:{domain:"ebay.es",     mkrid:"1185-53479-19255-0",siteid:"186"},
  GB:{domain:"ebay.co.uk",  mkrid:"710-53481-19255-0", siteid:"3"},
  US:{domain:"ebay.com",    mkrid:"711-53200-19255-0", siteid:"0"},
};
const EBAY_CATS = { pokemon:"183454", mtg:"183448", ygo:"183468", onepiece:"183454" };
export function ebayURL(name, setName="", country="US", tcg="pokemon", cardNumber="") {
  const site = EBAY_SITES[country] || EBAY_SITES.US;
  const loc = EU_CC.includes(country) ? "&LH_PrefLoc=1" : "";
  const suffix = tcg==="mtg" ? "magic the gathering card"
    : tcg==="ygo" ? "yugioh card"
    : tcg==="onepiece" ? "one piece card game" : "pokemon card";
  const q = `${name} ${cardNumber||""} ${setName||""} ${suffix}`.replace(/\s+/g," ").trim();
  const cat = EBAY_CATS[tcg] ? `&_sacat=${EBAY_CATS[tcg]}` : "";
  return `https://www.${site.domain}/sch/i.html?_nkw=${encodeURIComponent(q)}&_sop=12&LH_BIN=1${cat}&mkcid=1&mkrid=${site.mkrid}&siteid=${site.siteid}&campid=${EBAY_CAMP}&toolid=10001&mkevt=1${loc}`;
}
// Affiliate URL per ricerca raw (senza suffisso TCG) — usato nel fallback "no results"
export function ebaySearchURL(query, country="IT") {
  const site = EBAY_SITES[country] || EBAY_SITES.IT;
  const loc = EU_CC.includes(country) ? "&LH_PrefLoc=1" : "";
  return `https://www.${site.domain}/sch/i.html?_nkw=${encodeURIComponent(query)}&_sop=12&LH_BIN=1&mkcid=1&mkrid=${site.mkrid}&siteid=${site.siteid}&campid=${EBAY_CAMP}&toolid=10001&mkevt=1${loc}`;
}
// Aggiunge params EPN a un URL listing eBay già formato (es. da Browse API)
export function ebayItemURL(url, country="IT") {
  try {
    const site = EBAY_SITES[country] || EBAY_SITES.IT;
    const u = new URL(url);
    u.searchParams.set('mkcid','1');
    u.searchParams.set('mkrid', site.mkrid);
    u.searchParams.set('siteid', site.siteid);
    u.searchParams.set('campid', EBAY_CAMP);
    u.searchParams.set('toolid','10001');
    u.searchParams.set('mkevt','1');
    return u.toString();
  } catch { return url; }
}
