import { useState, useEffect, useCallback } from "react";
import {
  supabase, supabaseReady,
  sendMagicLink, getSession, onAuth, signOut as sbSignOut,
  addToCollection, createAlert, addToWatchlist,
} from "./supabase.js";

/* ════════════════════════════════════════════════════════════════════════
   DraGold — SHELL (TASK 2)
   Trade Republic / Collectr, ma gli asset sono carte TCG.
   Solo lo scheletro: nav, auth, valuta, stati vuoti. Niente logica
   ricerca/prezzo (TASK 3+). Logica legacy in DraGold.legacy.jsx.
   ════════════════════════════════════════════════════════════════════════ */

/* ─── CONFIG eBay (riusata dal legacy, serve già per le CTA oneste) ─── */
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

/* ─── Cataloghi di riferimento (UI) ─── */
const TCG_LIST = [
  { id:"pokemon",   label:"Pokémon",   short:"PKM", color:"#f87171", logo:"https://upload.wikimedia.org/wikipedia/commons/thumb/9/98/International_Pok%C3%A9mon_logo.svg/200px-International_Pok%C3%A9mon_logo.svg.png" },
  { id:"onepiece",  label:"One Piece", short:"OP",  color:"#f97316", logo:"https://upload.wikimedia.org/wikipedia/en/thumb/9/90/One_Piece_logo.svg/200px-One_Piece_logo.svg.png" },
  { id:"mtg",       label:"Magic",     short:"MTG", color:"#60a5fa", logo:"https://upload.wikimedia.org/wikipedia/en/thumb/a/a9/MagicTheGatheringHorizontalLogo.svg/200px-MagicTheGatheringHorizontalLogo.svg.png" },
  { id:"ygo",       label:"Yu-Gi-Oh!", short:"YGO", color:"#fbbf24", logo:"https://upload.wikimedia.org/wikipedia/en/thumb/7/7c/Yu-Gi-Oh%21_Logo.svg/200px-Yu-Gi-Oh%21_Logo.svg.png" },
];
const CARD_LANGS = [
  { c:"en", flag:"🇺🇸", label:"EN", live:true },
  { c:"ja", flag:"🇯🇵", label:"JA", live:true },
  { c:"it", flag:"🇮🇹", label:"IT", live:true },
];

/* ─── Tabs core ─── */
const TABS = [
  { id:"markets",   label:"Markets",   icon:"search" },
  { id:"portfolio", label:"Portfolio", icon:"wallet" },
  { id:"alerts",    label:"Alerts",    icon:"bell" },
];
const UPCOMING = [
  { id:"binder",    label:"Binder",    icon:"grid",    desc:"Sfoglia la collezione in binder virtuali." },
  { id:"blog",      label:"Blog",      icon:"doc",     desc:"Guides, market analysis, news." },
  { id:"community", label:"Community", icon:"users",   desc:"Share and compare your cards." },
];

/* ─── Icone SVG inline (no librerie) ─── */
function Icon({ name, size=20, stroke=2 }) {
  const p = { width:size, height:size, viewBox:"0 0 24 24", fill:"none",
    stroke:"currentColor", strokeWidth:stroke, strokeLinecap:"round", strokeLinejoin:"round" };
  switch (name) {
    case "search": return <svg {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>;
    case "wallet": return <svg {...p}><path d="M3 7h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12"/><path d="M16 13h.01"/></svg>;
    case "bell": return <svg {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 21a2 2 0 0 0 3.4 0"/></svg>;
    case "grid": return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
    case "doc": return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h6"/></svg>;
    case "users": return <svg {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>;
    case "card": return <svg {...p}><rect x="4" y="2.5" width="16" height="19" rx="2"/><path d="M8 7h8M8 11h5"/></svg>;
    case "chevron": return <svg {...p}><path d="M9 18l6-6-6-6"/></svg>;
    case "close": return <svg {...p}><path d="M18 6 6 18M6 6l12 12"/></svg>;
    case "logout": return <svg {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>;
    case "mail": return <svg {...p}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/></svg>;
    case "spark": return <svg {...p}><path d="M3 17l5-6 4 4 6-8 3 4"/></svg>;
    default: return null;
  }
}

/* ─── Placeholder immagine carta (Fix #4) — mai immagine rotta ─── */
function CardThumb({ name="", size=44 }) {
  const initials = name.replace(/[^a-zA-Z ]/g,"").trim().split(/\s+/).slice(0,2).map(w=>w[0]||"").join("").toUpperCase() || "?";
  return (
    <div className="card-thumb" style={{ width:size, height:size*1.4 }}>
      <span>{initials}</span>
    </div>
  );
}

/* ─── Empty state riusabile ─── */
function Empty({ icon, title, sub, cta, onCta }) {
  return (
    <div className="empty">
      <div className="empty-ic"><Icon name={icon} size={26} /></div>
      <div className="empty-title">{title}</div>
      {sub && <div className="empty-sub">{sub}</div>}
      {cta && <button className="btn btn-primary" onClick={onCta}>{cta}</button>}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   AUTH MODAL — magic link
   ════════════════════════════════════════════════════════════════════════ */
function AuthModal({ open, onClose }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [msg, setMsg] = useState("");

  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim() || status==="sending") return;
    if (!supabaseReady) { setStatus("error"); setMsg("Backend non configurato."); return; }
    setStatus("sending"); setMsg("");
    const { error } = await sendMagicLink(email.trim());
    if (error) { setStatus("error"); setMsg(error.message || "Send failed, please try again."); }
    else { setStatus("sent"); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <button className="modal-x" onClick={onClose} aria-label="Chiudi"><Icon name="close" size={18}/></button>
        <div className="modal-logo font-syne">DraGold</div>
        {status==="sent" ? (
          <div className="auth-sent">
            <div className="auth-sent-ic"><Icon name="mail" size={28}/></div>
            <h3>Check your email</h3>
            <p>We sent a magic link to <b>{email}</b>. Open it on this device to sign in.</p>
            <button className="btn btn-ghost" onClick={onClose}>Got it</button>
          </div>
        ) : (
          <form onSubmit={submit} className="auth-form">
            <h3>Sign in or create account</h3>
            <p className="auth-p">No password needed. We'll send you a magic link by email.</p>
            <input
              type="email" inputMode="email" autoComplete="email" required
              placeholder="your@email.com" value={email}
              onChange={e=>setEmail(e.target.value)} className="input"
            />
            {status==="error" && <div className="auth-err">{msg}</div>}
            <button type="submit" className="btn btn-primary btn-block" disabled={status==="sending"}>
              {status==="sending" ? "Sending…" : "Send magic link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   APP
   ════════════════════════════════════════════════════════════════════════ */
export default function DraGold() {
  const [session, setSession]   = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const [tab, setTab]   = useState("markets");
  const [asset, setAsset] = useState(null);      // carta aperta (Asset page) o null
  const [cur, setCur]   = useState("EUR");       // EUR | USD
  const [country, setCountry] = useState("IT");
  const [eurRate, setEurRate] = useState(0.92);  // 1 USD = X EUR

  const [tcgFilter, setTcgFilter]   = useState(null); // null = tutti
  const [langFilter, setLangFilter] = useState(null);

  /* ── sessione globale ── */
  useEffect(() => {
    let off = () => {};
    (async () => {
      const s = await getSession();
      setSession(s);
      setAuthReady(true);
      off = onAuth((s2) => { setSession(s2); if (s2) setAuthOpen(false); });
    })();
    return () => off();
  }, []);

  /* ── geo + tasso di cambio (default valuta) ── */
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(4000) });
        const d = await r.json();
        if (d?.country_code) {
          setCountry(d.country_code);
          if (["US","CA","AU","GB"].includes(d.country_code)) setCur("USD");
        }
      } catch {}
      try {
        const fx = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(3000) });
        const j = await fx.json();
        const rate = j?.rates?.EUR;
        if (typeof rate === "number" && rate >= 0.8 && rate <= 1.1) setEurRate(rate);
      } catch {}
    })();
  }, []);

  const isAuthed = !!session;
  const userEmail = session?.user?.email || "";

  const signOut = useCallback(async () => {
    await sbSignOut();
    setSession(null);
    setMenuOpen(false);
  }, []);

  const requireAuth = useCallback((fn) => {
    if (isAuthed) fn?.();
    else setAuthOpen(true);
  }, [isAuthed]);

  const openAsset = useCallback((card) => {
    setAsset(card);
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);
  const closeAsset = useCallback(() => setAsset(null), []);

  /* ── formattatore valuta (i prezzi DB sono in USD) ── */
  const fmt = useCallback((usd) => {
    if (usd == null || isNaN(usd)) return "—";
    return cur === "EUR" ? `€${(usd*eurRate).toFixed(2)}` : `$${Number(usd).toFixed(2)}`;
  }, [cur, eurRate]);

  return (
    <div className="app">
      <style>{CSS}</style>

      {/* ░░ HEADER ░░ */}
      <header className="hdr">
        <div className="hdr-in">
          <button className="brand" onClick={()=>setTab("markets")}>
            <span className="brand-dot" />
            <span className="logo-txt font-syne">DraGold</span>
          </button>

          {/* nav desktop */}
          <nav className="topnav">
            {TABS.map(t => (
              <button key={t.id}
                className={`topnav-i ${tab===t.id?"on":""}`}
                onClick={()=>setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>

          <div className="hdr-right">
            <div className="cur-sel" role="group" aria-label="Valuta">
              {["EUR","USD"].map(c => (
                <button key={c} className={`cur-b ${cur===c?"on":""}`} onClick={()=>setCur(c)}>{c}</button>
              ))}
            </div>

            {!authReady ? (
              <div className="auth-skel" />
            ) : isAuthed ? (
              <div className="usermenu">
                <button className="avatar" onClick={()=>setMenuOpen(o=>!o)} aria-label="Account">
                  {userEmail.slice(0,1).toUpperCase() || "U"}
                </button>
                {menuOpen && (
                  <>
                    <div className="menu-scrim" onClick={()=>setMenuOpen(false)} />
                    <div className="menu">
                      <div className="menu-email">{userEmail}</div>
                      <button className="menu-i" onClick={signOut}>
                        <Icon name="logout" size={16}/> Sign out
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={()=>setAuthOpen(true)}>Sign in</button>
            )}
          </div>
        </div>
      </header>

      {/* ░░ MAIN ░░ */}
      <main className="main">
        {asset ? (
          <AssetView
            card={asset} onBack={closeAsset}
            isAuthed={isAuthed} onLogin={()=>setAuthOpen(true)}
            country={country} cur={cur} eurRate={eurRate}
          />
        ) : (
        <>
        {tab==="markets" && (
          <MarketsView
            tcgFilter={tcgFilter} setTcgFilter={setTcgFilter}
            langFilter={langFilter} setLangFilter={setLangFilter}
            country={country} cur={cur} eurRate={eurRate}
            onOpenAsset={openAsset}
          />
        )}
        {tab==="portfolio" && (
          <PortfolioView isAuthed={isAuthed} onLogin={()=>setAuthOpen(true)} onExplore={()=>setTab("markets")} />
        )}
        {tab==="alerts" && (
          <AlertsView isAuthed={isAuthed} onLogin={()=>setAuthOpen(true)} onExplore={()=>setTab("markets")} />
        )}

        {/* Upcoming — solo badge, zero logica */}
        <section className="upcoming">
          <div className="sec-h">
            <span className="sec-h-t">Coming soon</span>
            <span className="sec-h-line" />
          </div>
          <div className="up-grid">
            {UPCOMING.map(u => (
              <div key={u.id} className="up-card" aria-disabled="true">
                <div className="up-top">
                  <span className="up-ic"><Icon name={u.icon} size={18}/></span>
                  <span className="badge-soon">Soon</span>
                </div>
                <div className="up-label">{u.label}</div>
                <div className="up-desc">{u.desc}</div>
              </div>
            ))}
          </div>
        </section>

        <footer className="foot">
          <span className="font-syne foot-logo">DraGold</span>
          <span className="foot-sub">Fair Market Value for serious TCG collectors.</span>
          <div className="foot-links">
            <a href="mailto:hello@dragold.org">Contact</a>
            <span>·</span>
            <a href="https://buymeacoffee.com/dragold" target="_blank" rel="noreferrer">Buy us a coffee</a>
          </div>
        </footer>
        </>
        )}
      </main>

      {/* ░░ BOTTOM TAB (mobile) ░░ */}
      <nav className="tabbar">
        {TABS.map(t => (
          <button key={t.id} className={`tab-i ${tab===t.id?"on":""}`} onClick={()=>setTab(t.id)}>
            <Icon name={t.icon} size={22} stroke={tab===t.id?2.4:2} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      <AuthModal open={authOpen} onClose={()=>setAuthOpen(false)} />
    </div>
  );
}

/* ─── norm: normalizza per confronto punteggiatura (Fix #1) ─── */
function norm(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/* ─── CardItem — componente riusabile: Markets + Hot picks + Portfolio ─── */
function CardItem({ card, priceInfo, country = "IT", cur = "EUR", eurRate = 0.92, onOpen }) {
  const [imgFailed, setImgFailed] = useState(false);
  const imgUrl = card.image_url || card.imgUrl || card.img || null;
  const cardName = card.name || "—";
  const tcgInfo = TCG_LIST.find(t => t.id === card.tcg);
  const langInfo = CARD_LANGS.find(l => l.c === card.lang);
  const priceUSD = priceInfo?.price_market ?? card.avgPrice ?? null;
  const priceStr = priceUSD != null
    ? cur === "EUR" ? `€${(priceUSD * eurRate).toFixed(2)}` : `$${Number(priceUSD).toFixed(2)}`
    : null;
  const initials = cardName.replace(/[^a-zA-Z ]/g, '').trim()
    .split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';

  return (
    <div className="card-item" onClick={() => onOpen?.(card)}
      role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen?.(card); } }}>
      <div className="card-item-img">
        {imgUrl && !imgFailed ? (
          <img src={imgUrl} alt={cardName} loading="lazy" onError={() => setImgFailed(true)} />
        ) : (
          <div className="card-img-ph">
            {tcgInfo && <span className="card-img-ph-tcg" style={{ color: tcgInfo.color }}>{tcgInfo.short}</span>}
            <span className="card-img-ph-init">{initials}</span>
          </div>
        )}
      </div>
      <div className="card-item-body">
        <div className="card-item-name" title={cardName}>{cardName}</div>
        <div className="card-item-meta">
          {card.set_name && <span className="card-item-set">{card.set_name}</span>}
          {card.card_number && <span className="card-item-num">#{card.card_number}</span>}
          {langInfo && <span className="card-item-lang">{langInfo.flag}</span>}
        </div>
        <div className="card-item-footer">
          {priceStr
            ? <span className="price-tag">{priceStr}</span>
            : (
              <a className="btn-ebay"
                href={ebayURL(cardName, card.set_name || '', country, card.tcg || 'pokemon', card.card_number || '')}
                target="_blank" rel="noreferrer"
                onClick={e => e.stopPropagation()}>
                View on eBay ↗
              </a>
            )
          }
        </div>
      </div>
    </div>
  );
}

/* ─── SearchResults — stati: loading / error / vuoto / risultati ─── */
function SearchResults({ loading, results, priceMap, error, term, country, cur, eurRate, onRetry, onOpen }) {
  if (loading) return (
    <div className="card-grid">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="skel-card">
          <div className="skel-img" /><div className="skel-line w70" /><div className="skel-line w40" />
        </div>
      ))}
    </div>
  );
  if (error) return (
    <div className="search-error">
      <span style={{ flexShrink: 0 }}><Icon name="close" size={16} /></span>
      <span>Search failed, please try.</span>
      <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={onRetry}>Retry</button>
    </div>
  );
  if (!results.length) return (
    <div className="zero-state">
      <div className="zero-title">No results for "{term}"</div>
      <div className="zero-sub">Try fewer words or the card number.</div>
      <a className="btn btn-ghost"
        href={`https://www.ebay.it/sch/i.html?_nkw=${encodeURIComponent(term)}`}
        target="_blank" rel="noreferrer">
        Search "{term}" on eBay
      </a>
    </div>
  );
  return (
    <div className="card-grid">
      {results.map(card => (
        <CardItem key={card.id} card={card} priceInfo={priceMap[card.id] || null}
          country={country} cur={cur} eurRate={eurRate} onOpen={onOpen} />
      ))}
    </div>
  );
}

/* ─── HotPicksSection — logica legacy, card UI riusabile ─── */
function HotPicksSection({ country = "IT", cur = "EUR", eurRate = 0.92, onOpen }) {
  const POOL = [
    {id:"hp14",name:"Charizard ex Prismatic Evolutions",query:"Charizard ex Prismatic Evolutions 006/131 pokemon card",tcg:"pokemon",img:"https://images.pokemontcg.io/sv8pt5/6.png"},
    {id:"hp15",name:"Pikachu ex Prismatic Evolutions",query:"Pikachu ex Prismatic Evolutions 031/131 pokemon card",tcg:"pokemon",img:"https://images.pokemontcg.io/sv8pt5/31.png"},
    {id:"hp16",name:"Umbreon ex Prismatic Evolutions",query:"Umbreon ex Prismatic Evolutions 060/131 pokemon card",tcg:"pokemon",img:"https://images.pokemontcg.io/sv8pt5/60.png"},
    {id:"hp17",name:"Eevee ex Prismatic Evolutions SIR",query:"Eevee ex 167/131 Prismatic Evolutions special illustration rare pokemon card",tcg:"pokemon",img:"https://images.pokemontcg.io/sv8pt5/167.png"},
    {id:"hp18",name:"Pikachu ex Surging Sparks SAR",query:"Pikachu ex 238/191 Surging Sparks special art rare pokemon card",tcg:"pokemon",img:"https://images.pokemontcg.io/sv8/238.png"},
    {id:"hp19",name:"Raging Bolt ex Temporal Forces SIR",query:"Raging Bolt ex 208/162 Temporal Forces special illustration rare pokemon card",tcg:"pokemon",img:"https://images.pokemontcg.io/sv5/208.png"},
    {id:"hp1",name:"Charizard ex SV151",query:"Charizard ex 199/165 sv151 pokemon card english",tcg:"pokemon",img:"https://images.pokemontcg.io/sv3pt5/199.png"},
    {id:"hp2",name:"Pikachu ex 151",query:"Pikachu ex 086/078 pokemon sv151 card english",tcg:"pokemon",img:"https://images.pokemontcg.io/sv3pt5/86.png"},
    {id:"hp3",name:"Mewtwo ex 151 Full Art",query:"Mewtwo ex 205/165 pokemon sv151 full art card",tcg:"pokemon",img:"https://images.pokemontcg.io/sv3pt5/205.png"},
    {id:"hp12",name:"Gardevoir ex SV Base",query:"Gardevoir ex 086/091 scarlet violet base set pokemon english",tcg:"pokemon",img:"https://images.pokemontcg.io/sv1/86.png"},
    {id:"hp4",name:"Umbreon VMAX Alt Art",query:"Umbreon VMAX alternate art 215/203 evolving skies pokemon",tcg:"pokemon",img:"https://images.pokemontcg.io/swsh7/215.png"},
    {id:"hp5",name:"Rayquaza VMAX Alt Art",query:"Rayquaza VMAX alternate art 218/203 evolving skies pokemon",tcg:"pokemon",img:"https://images.pokemontcg.io/swsh7/218.png"},
    {id:"hp6",name:"Giratina VSTAR Lost Origin",query:"Giratina VSTAR 131/196 lost origin pokemon card english",tcg:"pokemon",img:"https://images.pokemontcg.io/swsh11/131.png"},
    {id:"hp7",name:"Lugia V Alt Art Silver Tempest",query:"Lugia V alternate art 186/195 silver tempest pokemon",tcg:"pokemon",img:"https://images.pokemontcg.io/swsh12/186.png"},
    {id:"op1",name:"Monkey D. Luffy SEC OP-01",query:"Monkey D Luffy secret rare OP-01-120 one piece card game",tcg:"onepiece",img:null},
    {id:"op2",name:"Yamato SEC OP-01",query:"Yamato secret rare OP-01 one piece card game english",tcg:"onepiece",img:null},
    {id:"op3",name:"Portgas D. Ace SEC OP-02",query:"Portgas D Ace secret rare OP-02 one piece card game",tcg:"onepiece",img:null},
    {id:"op4",name:"Roronoa Zoro Parallel OP-02",query:"Roronoa Zoro parallel rare OP-02 one piece card game",tcg:"onepiece",img:null},
    {id:"op5",name:"Marco SEC OP-03",query:"Marco secret rare OP-03 one piece card game",tcg:"onepiece",img:null},
    {id:"op6",name:"Trafalgar Law SEC OP-04",query:"Trafalgar Law secret rare OP-04 one piece card game",tcg:"onepiece",img:null},
  ];

  const getDailyPicks = () => {
    const day = Math.floor(Date.now() / 86400000);
    const poke = POOL.filter(c => c.tcg === "pokemon");
    const op   = POOL.filter(c => c.tcg === "onepiece");
    const ps = day % poke.length, os = day % op.length;
    const out = [];
    for (let i = 0; i < 9; i++) out.push(poke[(ps + i) % poke.length]);
    for (let i = 0; i < 3; i++) out.push(op[(os + i) % op.length]);
    return out;
  };

  const [picks, setPicks] = useState([]);
  const [loadingPicks, setLoadingPicks] = useState(true);
  const ctr = (country || 'it').toLowerCase();
  const CACHE_KEY = 'dg_hotpicks_v3';
  const CACHE_TTL = 30 * 60 * 1000;

  useEffect(() => {
    if (!supabaseReady) { setLoadingPicks(false); return; }
    let cancelled = false;
    try {
      const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || '{}');
      if (c.ts && Date.now() - c.ts < CACHE_TTL && c.data?.length) {
        setPicks(c.data); setLoadingPicks(false); return;
      }
    } catch {}
    (async () => {
      try {
        const daily = getDailyPicks();
        const settled = await Promise.allSettled(daily.map(async card => {
          const { data, error } = await supabase.functions.invoke('fetch-ebay-sold', {
            body: { query: card.query, country: ctr, limit: 5 }
          });
          if (error || !data?.items?.length) return null;
          const items = data.items;
          const avg = data.avgPrice ?? data.avg ?? (items.reduce((s, x) => s + (x.price || 0), 0) / items.length);
          if (!avg || avg > 200) return null;
          const imgUrl = card.img || (items[0]?.image ?? items[0]?.imageUrl ?? null);
          return { ...card, avgPrice: avg, soldCount: items.length, image_url: imgUrl };
        }));
        if (!cancelled) {
          const valid = settled.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
          setPicks(valid);
          try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: valid })); } catch {}
        }
      } catch {}
      finally { if (!cancelled) setLoadingPicks(false); }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctr]);

  return (
    <>
      <div className="sec-h">
        <span className="sec-h-t"><Icon name="spark" size={14} /> Hot picks</span>
        <span className="sec-h-line" />
      </div>
      {loadingPicks ? (
        <div className="card-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skel-card">
              <div className="skel-img" /><div className="skel-line w70" /><div className="skel-line w40" />
            </div>
          ))}
        </div>
      ) : picks.length > 0 ? (
        <div className="card-grid">
          {picks.map(card => (
            <CardItem key={card.id} card={card} priceInfo={null}
              country={country} cur={cur} eurRate={eurRate} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <p className="hint-center">Live data unavailable. Start by searching a card above.</p>
      )}
    </>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   MARKETS — ricerca + hot picks
   ════════════════════════════════════════════════════════════════════════ */
function MarketsView({ tcgFilter, setTcgFilter, langFilter, setLangFilter, country, cur, eurRate, onOpenAsset }) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [priceMap, setPriceMap] = useState({});
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const runSearch = useCallback(async (query, tcg, lang) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setLoading(true); setError(null); setSearched(true); setSearchTerm(trimmed);
    try {
      if (!supabaseReady) throw new Error("Backend non configurato.");
      const normQ = norm(trimmed);
      const hasSpaces = trimmed.includes(' ');
      // Normalizza query: rimuove punteggiatura, splitta in token significativi (≥2 char)
      const words = trimmed.toLowerCase().replace(/[^a-z0-9 ]/gi, ' ')
        .trim().split(/\s+/).filter(w => w.length >= 2);

      let dbQuery = supabase
        .from('cards')
        .select('id,name,set_name,card_number,image_url,lang,tcg')
        .limit(80);
      if (tcg)  dbQuery = dbQuery.eq('tcg', tcg);
      if (lang) dbQuery = dbQuery.eq('lang', lang);

      if (words.length > 0) {
        // AND tra token: ogni parola deve comparire in nome/numero/set
        for (const w of words) {
          const sw = w.replace(/[*%()]/g, '');
          if (sw) dbQuery = dbQuery.or(`name.ilike.*${sw}*,card_number.ilike.*${sw}*,set_name.ilike.*${sw}*`);
        }
      } else {
        const sw = trimmed.replace(/[*%()]/g, '');
        dbQuery = dbQuery.ilike('name', `*${sw}*`);
      }

      const { data, error: dbErr } = await dbQuery;
      if (dbErr) throw dbErr;

      let cards = data || [];

      // Client-side normalization (Fix #1): gestisce "monkeydluffy" → "Monkey.D.Luffy"
      // Solo per query senza spazi (caso raro), le query con spazi sono già gestite da ilike
      if (!hasSpaces && normQ.length >= 3) {
        cards = cards.filter(c =>
          norm((c.name || '') + (c.set_name || '') + (c.card_number || '')).includes(normQ)
        );
      }

      setResults(cards);

      // Prezzi: ultimo snapshot da card_prices per ogni carta trovata
      if (cards.length > 0) {
        const ids = cards.map(c => c.id);
        const { data: priceRows } = await supabase
          .from('card_prices')
          .select('card_id,price_market,source,captured_at')
          .in('card_id', ids)
          .order('captured_at', { ascending: false })
          .limit(ids.length * 3);
        const pm = {};
        for (const p of (priceRows || [])) { if (!pm[p.card_id]) pm[p.card_id] = p; }
        setPriceMap(pm);
      } else {
        setPriceMap({});
      }
    } catch (e) {
      setError(e.message || "Unknown error.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-run se filtri cambiano con ricerca attiva
  useEffect(() => {
    if (searched && searchTerm) runSearch(searchTerm, tcgFilter, langFilter);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tcgFilter, langFilter]);

  const onSubmit = (e) => { e.preventDefault(); runSearch(q, tcgFilter, langFilter); };
  const clearSearch = () => { setSearched(false); setResults([]); setPriceMap({}); setError(null); };

  return (
    <section className="view">
      <div className="hero">
        <h1 className="hero-t">Find a card.<br/>See its real market value.</h1>
        <p className="hero-s">Fair market price on Pokémon, One Piece, Magic and Yu-Gi-Oh!. Track it like an asset.</p>
      </div>

      {/* Fix #2: form submit = invio da tastiera */}
      <form className="search" onSubmit={onSubmit}>
        <span className="search-ic"><Icon name="search" size={20}/></span>
        <input
          className="search-in"
          placeholder="Search a card… (e.g. Charizard, Monkey D Luffy)"
          value={q} onChange={e => setQ(e.target.value)}
          enterKeyHint="search" autoComplete="off"
        />
        {searched && (
          <button type="button" className="search-clear" onClick={clearSearch} aria-label="Clear search">
            <Icon name="close" size={15}/>
          </button>
        )}
        <button type="submit" className="search-go">Search</button>
      </form>

      <div className="filters">
        <div className="chip-row">
          <button className={`chip ${!tcgFilter?"on":""}`} onClick={()=>setTcgFilter(null)}>All</button>
          {TCG_LIST.map(t => (
            <button key={t.id} className={`chip tcg-chip ${tcgFilter===t.id?"on":""}`}
              onClick={()=>setTcgFilter(tcgFilter===t.id?null:t.id)}
              style={tcgFilter===t.id?{borderColor:t.color,color:t.color}:{}}>
              {t.logo && <img src={t.logo} alt={t.label} className="tcg-chip-logo" onError={e=>{e.currentTarget.style.display='none';}} />}
              <span className="tcg-chip-label">{t.short}</span>
            </button>
          ))}
        </div>
        <div className="chip-row">
          <button className={`chip sm ${!langFilter?"on":""}`} onClick={()=>setLangFilter(null)}>All</button>
          {CARD_LANGS.map(l => (
            <button key={l.c} className={`chip sm ${langFilter===l.c?"on":""}`}
              onClick={()=>setLangFilter(langFilter===l.c?null:l.c)}>
              {l.flag} {l.label}
            </button>
          ))}
        </div>
      </div>

      {searched ? (
        <SearchResults
          loading={loading} results={results} priceMap={priceMap}
          error={error} term={searchTerm}
          country={country} cur={cur} eurRate={eurRate}
          onRetry={() => runSearch(searchTerm, tcgFilter, langFilter)}
          onOpen={onOpenAsset}
        />
      ) : (
        <HotPicksSection country={country} cur={cur} eurRate={eurRate} onOpen={onOpenAsset} />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------------
/* --- PORTFOLIO --- */
function PortfolioView({ isAuthed, onLogin, onExplore }) {
  return (
    <section className="view">
      <div className="view-h">
        <h2 className="view-t">Portfolio</h2>
      </div>
      {!isAuthed ? (
        <Empty icon="wallet"
          title="Sign in to save your portfolio"
          sub="Add the cards you own and track their value and P&L over time."
          cta="Sign in" onCta={onLogin} />
      ) : (
        <Empty icon="wallet"
          title="Your portfolio is empty"
          sub="Search a card and add it to track its value and gain."
          cta="Find a card" onCta={onExplore} />
      )}
    </section>
  );
}

/* --- ALERTS --- */
function AlertsView({ isAuthed, onLogin, onExplore }) {
  return (
    <section className="view">
      <div className="view-h">
        <h2 className="view-t">Alerts</h2>
      </div>
      {!isAuthed ? (
        <Empty icon="bell"
          title="Sign in to create alerts"
          sub="Get an email when a card exceeds or drops below your price threshold."
          cta="Sign in" onCta={onLogin} />
      ) : (
        <Empty icon="bell"
          title="No alerts yet"
          sub="Create your first alert from any card: set a threshold and direction."
          cta="Find a card" onCta={onExplore} />
      )}
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   ASSET — dettaglio carta (TASK 4)
   ════════════════════════════════════════════════════════════════════════ */
const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"];

// market code accettato da /api/ebay-search; fallback US
const EBAY_MARKETS = ["US","GB","DE","IT","FR","ES","CA"];

// card_api_id = cards.id senza il prefisso "<tcg>:" → refresh-prices ricostruisce
// `${tcg}:${card_api_id}` === card_prices.card_id (= cards.id).
function toApiId(card) {
  const id = card?.id || "";
  const tcg = card?.tcg || "";
  return tcg && id.startsWith(tcg + ":") ? id.slice(tcg.length + 1) : id;
}

/* ─── Sparkline SVG (no librerie) — solo se ≥ 2 punti ─── */
function Sparkline({ values, gain }) {
  const W = 300, H = 64, pad = 4;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (W - pad * 2);
    const y = H - pad - ((v - min) / span) * (H - pad * 2);
    return [x, y];
  });
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${d} L${pts[pts.length - 1][0].toFixed(1)} ${H} L${pts[0][0].toFixed(1)} ${H} Z`;
  const col = gain ? "var(--gain)" : "var(--loss)";
  return (
    <svg className="spark-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="sparkfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity="0.22" />
          <stop offset="100%" stopColor={col} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#sparkfill)" stroke="none" />
      <path d={d} fill="none" stroke={col} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ─── Modal generico (riusa stili .modal) ─── */
function Sheet({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal-x" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
        <h3 className="sheet-title">{title}</h3>
        {children}
      </div>
    </div>
  );
}

/* ─── Modal: Aggiungi a Portfolio ─── */
function PortfolioModal({ card, cur, onClose, onDone }) {
  const [paid, setPaid] = useState("");
  const [cond, setCond] = useState("NM");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr("");
    const paidNum = parseFloat(paid);
    const res = await addToCollection({
      card_api_id: toApiId(card),
      tcg: card.tcg,
      card_name: card.name,
      set_name: card.set_name || "",
      card_number: card.card_number || null,
      image_url: card.image_url || null,
      language: card.lang || "en",
      condition: cond,
      purchase_price: isNaN(paidNum) ? null : paidNum,
      fmv_currency: cur,
    });
    setBusy(false);
    if (res?.error) { setErr(typeof res.error === "string" ? res.error : res.error.message || "Could not add."); return; }
    onDone?.("Added to portfolio");
  };

  return (
    <Sheet title="Add to portfolio" onClose={onClose}>
      <form onSubmit={submit} className="sheet-form">
        <label className="field-lbl">Price paid ({cur})</label>
        <input className="input" type="number" inputMode="decimal" step="0.01" min="0"
          placeholder="0.00" value={paid} onChange={e => setPaid(e.target.value)} autoFocus />
        <label className="field-lbl">Condition</label>
        <div className="cond-row">
          {CONDITIONS.map(c => (
            <button type="button" key={c}
              className={`cond-b ${cond === c ? "on" : ""}`}
              onClick={() => setCond(c)}>{c}</button>
          ))}
        </div>
        {err && <div className="auth-err">{err}</div>}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? "Adding…" : "Add to portfolio"}
        </button>
      </form>
    </Sheet>
  );
}

/* ─── Modal: Crea Alert ─── */
function AlertModal({ card, cur, country, fmvUSD, eurRate, onClose, onDone }) {
  const [dir, setDir] = useState("above");
  const [threshold, setThreshold] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const t = parseFloat(threshold);
    if (isNaN(t) || t <= 0) { setErr("Enter a valid threshold."); return; }
    setBusy(true); setErr("");
    const res = await createAlert({
      tcg: card.tcg, cardId: toApiId(card), cardName: card.name,
      language: card.lang || "en", threshold: t, direction: dir,
      currency: cur, country,
    });
    setBusy(false);
    if (res?.error) { setErr(typeof res.error === "string" ? res.error : res.error.message || "Could not create alert."); return; }
    onDone?.("Alert created");
  };

  const hintFmv = fmvUSD != null
    ? (cur === "EUR" ? `€${(fmvUSD * eurRate).toFixed(2)}` : `$${Number(fmvUSD).toFixed(2)}`)
    : null;

  return (
    <Sheet title="Create alert" onClose={onClose}>
      <form onSubmit={submit} className="sheet-form">
        <p className="auth-p">Get an email when the price crosses your threshold.{hintFmv && <> Current FMV: <b>{hintFmv}</b>.</>}</p>
        <label className="field-lbl">Trigger when price goes</label>
        <div className="seg">
          <button type="button" className={`seg-b ${dir === "above" ? "on" : ""}`} onClick={() => setDir("above")}>Above ↑</button>
          <button type="button" className={`seg-b ${dir === "below" ? "on" : ""}`} onClick={() => setDir("below")}>Below ↓</button>
        </div>
        <label className="field-lbl">Threshold ({cur})</label>
        <input className="input" type="number" inputMode="decimal" step="0.01" min="0"
          placeholder="0.00" value={threshold} onChange={e => setThreshold(e.target.value)} autoFocus />
        {err && <div className="auth-err">{err}</div>}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? "Creating…" : "Create alert"}
        </button>
      </form>
    </Sheet>
  );
}

/* ─── ASSET VIEW ─── */
function AssetView({ card, onBack, isAuthed, onLogin, country, cur, eurRate }) {
  const [snaps, setSnaps] = useState([]);       // [{price_market, source, captured_at}] asc
  const [loadingPrice, setLoadingPrice] = useState(true);
  const [priceErr, setPriceErr] = useState(false);
  const [ebayItems, setEbayItems] = useState([]);
  const [imgFailed, setImgFailed] = useState(false);
  const [modal, setModal] = useState(null);     // 'portfolio' | 'alert' | null
  const [watching, setWatching] = useState(false);
  const [watchBusy, setWatchBusy] = useState(false);
  const [toast, setToast] = useState("");

  const tcgInfo = TCG_LIST.find(t => t.id === card.tcg);
  const langInfo = CARD_LANGS.find(l => l.c === card.lang);
  const imgUrl = card.image_url || card.imgUrl || card.img || null;
  const cardNum = card.card_number || "";

  const latest = snaps.length ? snaps[snaps.length - 1] : null;
  const fmvUSD = latest?.price_market ?? null;
  const priceStr = (usd) => usd == null ? "—"
    : cur === "EUR" ? `€${(usd * eurRate).toFixed(2)}` : `$${Number(usd).toFixed(2)}`;

  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2600); };

  /* prezzi: tutti gli snapshot per card.id, ordine cronologico */
  const loadPrice = useCallback(async () => {
    setLoadingPrice(true); setPriceErr(false);
    try {
      if (!supabaseReady) throw new Error("no backend");
      const { data, error } = await supabase
        .from("card_prices")
        .select("price_market,source,captured_at")
        .eq("card_id", card.id)
        .order("captured_at", { ascending: true })
        .limit(60);
      if (error) throw error;
      setSnaps((data || []).filter(r => r.price_market != null));
    } catch {
      setPriceErr(true); setSnaps([]);
    } finally {
      setLoadingPrice(false);
    }
  }, [card.id]);

  /* eBay live: solo listing col numero carta nel titolo, max 5 (Fix #3) */
  const loadEbay = useCallback(async () => {
    if (!cardNum) { setEbayItems([]); return; }
    try {
      const market = EBAY_MARKETS.includes(country) ? country : "US";
      const suffix = card.tcg === "mtg" ? "magic the gathering"
        : card.tcg === "ygo" ? "yugioh"
        : card.tcg === "onepiece" ? "one piece card" : "pokemon card";
      const q = `${card.name} ${cardNum} ${suffix}`.replace(/\s+/g, " ").trim();
      const r = await fetch(`/api/ebay-search?q=${encodeURIComponent(q)}&market=${market}&limit=20`, {
        signal: AbortSignal.timeout(8000),
      }).catch(() => null);
      if (!r || !r.ok) { setEbayItems([]); return; }
      const d = await r.json();
      const numNorm = cardNum.replace(/\s+/g, "").toLowerCase();
      const matches = (d.items || [])
        .filter(it => (it.title || "").replace(/\s+/g, "").toLowerCase().includes(numNorm))
        .slice(0, 5);
      setEbayItems(matches);
    } catch {
      setEbayItems([]);
    }
  }, [card.id, cardNum, country]);

  useEffect(() => { loadPrice(); loadEbay(); }, [loadPrice, loadEbay]);

  const track = async () => {
    if (!isAuthed) { onLogin?.(); return; }
    if (watchBusy || watching) return;
    setWatchBusy(true);
    const res = await addToWatchlist({
      tcg: card.tcg, cardApiId: toApiId(card), cardName: card.name,
      setName: card.set_name || "", imageUrl: imgUrl,
    });
    setWatchBusy(false);
    if (res?.error) { flash(typeof res.error === "string" ? res.error : "Could not track."); return; }
    setWatching(true);
    flash("Tracking — we'll price it on the next refresh");
  };

  const gateAuth = (m) => { if (!isAuthed) { onLogin?.(); } else { setModal(m); } };

  const ebayHref = ebayURL(card.name, card.set_name || "", country, card.tcg || "pokemon", cardNum);

  return (
    <section className="view asset">
      <button className="back-btn" onClick={onBack}>
        <span style={{ transform: "rotate(180deg)", display: "flex" }}><Icon name="chevron" size={18} /></span>
        Back
      </button>

      <div className="asset-head">
        <div className="asset-img">
          {imgUrl && !imgFailed ? (
            <img src={imgUrl} alt={card.name} onError={() => setImgFailed(true)} />
          ) : (
            <div className="card-img-ph">
              {tcgInfo && <span className="card-img-ph-tcg" style={{ color: tcgInfo.color }}>{tcgInfo.short}</span>}
              <span className="card-img-ph-init">{(card.name || "?").replace(/[^a-zA-Z ]/g, "").trim().split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase() || "?"}</span>
            </div>
          )}
        </div>
        <div className="asset-info">
          {tcgInfo && <span className="asset-tcg" style={{ color: tcgInfo.color }}>{tcgInfo.label}</span>}
          <h1 className="asset-name">{card.name}</h1>
          <div className="asset-meta">
            {card.set_name && <span>{card.set_name}</span>}
            {cardNum && <span className="asset-num">#{cardNum}</span>}
            {langInfo && <span>{langInfo.flag} {langInfo.label}</span>}
          </div>

          {/* PREZZO */}
          {loadingPrice ? (
            <div className="price-skel" />
          ) : priceErr ? (
            <div className="search-error" style={{ margin: "14px 0" }}>
              <span>Couldn't load the price.</span>
              <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={loadPrice}>Retry</button>
            </div>
          ) : fmvUSD != null ? (
            <div className="fmv-block">
              <div className="fmv-row">
                <span className="fmv-val">{priceStr(fmvUSD)}</span>
                <span className="fmv-tag">FMV</span>
              </div>
              <div className="fmv-sub">{latest.source || "market"} · updated {new Date(latest.captured_at).toLocaleDateString()}</div>
              {snaps.length >= 2 && (
                <div className="spark-wrap">
                  <Sparkline
                    values={snaps.map(s => s.price_market)}
                    gain={snaps[snaps.length - 1].price_market >= snaps[0].price_market}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="noprice-block">
              <div className="noprice-txt">No market price yet for this card.</div>
              <a className="btn btn-primary btn-block" href={ebayHref} target="_blank" rel="noreferrer">
                See price on eBay ↗
              </a>
              <button className="btn btn-ghost btn-block" onClick={track} disabled={watchBusy || watching}>
                {watching ? "Tracking ✓" : watchBusy ? "…" : "Track this card"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* AZIONI */}
      <div className="asset-actions">
        <button className="btn btn-primary" onClick={() => gateAuth("portfolio")}>
          <Icon name="wallet" size={18} /> Add to portfolio
        </button>
        <button className="btn btn-ghost" onClick={() => gateAuth("alert")}>
          <Icon name="bell" size={18} /> Create alert
        </button>
      </div>

      {/* eBAY LIVE — nascosta se zero match */}
      {ebayItems.length > 0 && (
        <div className="ebay-live">
          <div className="sec-h">
            <span className="sec-h-t">eBay live · {cardNum}</span>
            <span className="sec-h-line" />
          </div>
          <div className="ebay-list">
            {ebayItems.map((it, i) => (
              <a key={i} className="ebay-row" href={it.url} target="_blank" rel="noreferrer">
                <div className="ebay-thumb">
                  {it.thumb ? <img src={it.thumb} alt="" loading="lazy" /> : <Icon name="card" size={18} />}
                </div>
                <div className="ebay-body">
                  <div className="ebay-title">{it.title}</div>
                  {it.condition && <div className="ebay-cond">{it.condition}</div>}
                </div>
                <div className="ebay-price">
                  {it.currency === "EUR" ? "€" : it.currency === "GBP" ? "£" : "$"}{Number(it.price).toFixed(2)}
                </div>
              </a>
            ))}
          </div>
          <a className="ebay-all" href={ebayHref} target="_blank" rel="noreferrer">See all on eBay ↗</a>
        </div>
      )}

      {modal === "portfolio" && (
        <PortfolioModal card={card} cur={cur} onClose={() => setModal(null)}
          onDone={(m) => { setModal(null); flash(m); }} />
      )}
      {modal === "alert" && (
        <AlertModal card={card} cur={cur} country={country} fmvUSD={fmvUSD} eurRate={eurRate}
          onClose={() => setModal(null)} onDone={(m) => { setModal(null); flash(m); }} />
      )}

      {toast && <div className="toast">{toast}</div>}
    </section>
  );
}

/* --- CSS --- */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700;9..144,800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap');

:root{
  --bg:#020208; --surface:#0b0b18; --surface-2:#111127; --surface-3:#181830;
  --gold:#fbbf24; --gold-deep:#d97706;
  --gain:#34d399; --loss:#f87171;
  --text:#f5f5f7; --muted:#9ca3af; --dim:#5a5a72;
  --border:rgba(255,255,255,.08); --border-2:rgba(255,255,255,.14);
  --glass:rgba(255,255,255,.04);
  --p:16px; --maxw:980px; --tabh:64px;
}
*{box-sizing:border-box;margin:0;padding:0;}
html,body{background:var(--bg);color:var(--text);font-family:'Plus Jakarta Sans',system-ui,sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden;}
a{color:inherit;text-decoration:none;}
button{font-family:inherit;cursor:pointer;border:none;background:none;color:inherit;}
input{font-family:inherit;font-size:16px;}
.font-syne{font-family:'Fraunces',Georgia,serif;font-weight:800;letter-spacing:-.01em;}
.font-mono{font-family:'Space Mono',monospace;}

.app{min-height:100vh;min-height:100svh;display:flex;flex-direction:column;}

/* header */
.hdr{position:sticky;top:0;z-index:40;background:rgba(2,2,8,.82);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-bottom:1px solid var(--border);}
.hdr-in{max-width:var(--maxw);margin:0 auto;height:58px;display:flex;align-items:center;gap:14px;padding:0 var(--p);}
.brand{display:flex;align-items:center;gap:9px;}
.brand-dot{width:10px;height:10px;border-radius:50%;background:linear-gradient(135deg,var(--gold),var(--gold-deep));box-shadow:0 0 14px rgba(251,191,36,.6);}
.logo-txt{font-size:20px;}
.topnav{display:none;gap:4px;margin-left:18px;}
.topnav-i{padding:8px 14px;border-radius:9px;font-size:14px;font-weight:600;color:var(--muted);transition:.15s;}
.topnav-i:hover{color:var(--text);}
.topnav-i.on{color:var(--text);background:var(--surface-2);}
.hdr-right{margin-left:auto;display:flex;align-items:center;gap:10px;}
.cur-sel{display:flex;background:var(--surface-2);border:1px solid var(--border);border-radius:9px;padding:2px;}
.cur-b{padding:5px 9px;border-radius:7px;font-size:12px;font-weight:700;color:var(--muted);font-family:'Space Mono',monospace;transition:.15s;}
.cur-b.on{background:var(--gold);color:#1a1200;}
.auth-skel{width:74px;height:34px;border-radius:9px;background:var(--surface-2);}

/* avatar/menu */
.usermenu{position:relative;}
.avatar{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,var(--gold),var(--gold-deep));color:#1a1200;font-weight:800;font-size:15px;display:flex;align-items:center;justify-content:center;}
.menu-scrim{position:fixed;inset:0;z-index:45;}
.menu{position:absolute;right:0;top:44px;z-index:46;background:var(--surface-2);border:1px solid var(--border-2);border-radius:12px;min-width:200px;padding:6px;box-shadow:0 18px 50px rgba(0,0,0,.6);}
.menu-email{padding:9px 10px;font-size:12px;color:var(--muted);border-bottom:1px solid var(--border);margin-bottom:4px;word-break:break-all;}
.menu-i{display:flex;align-items:center;gap:9px;width:100%;padding:10px;border-radius:8px;font-size:14px;font-weight:600;color:var(--text);}
.menu-i:hover{background:var(--surface-3);}

/* main */
.main{flex:1;width:100%;max-width:var(--maxw);margin:0 auto;padding:18px var(--p) calc(var(--tabh) + 28px);}
.view{margin-bottom:30px;}
.view-h{margin:4px 0 16px;}
.view-t{font-size:24px;font-weight:800;letter-spacing:-.02em;}

/* hero */
.hero{padding:18px 0 6px;}
.hero-t{font-family:'Fraunces',serif;font-weight:800;font-size:clamp(28px,7vw,46px);line-height:1.05;letter-spacing:-.02em;}
.hero-s{margin-top:12px;color:var(--muted);font-size:15px;max-width:520px;line-height:1.5;}

/* search */
.search{display:flex;align-items:center;gap:8px;margin:20px 0 14px;background:var(--surface-2);border:1px solid var(--border-2);border-radius:14px;padding:6px 6px 6px 14px;transition:.15s;}
.search:focus-within{border-color:var(--gold);box-shadow:0 0 0 3px rgba(251,191,36,.12);}
.search-ic{color:var(--muted);display:flex;flex-shrink:0;}
.search-in{flex:1;background:none;border:none;outline:none;color:var(--text);padding:10px 4px;min-width:0;}
.search-in::placeholder{color:var(--dim);}
.search-go{background:var(--gold);color:#1a1200;font-weight:700;font-size:14px;padding:10px 16px;border-radius:10px;flex-shrink:0;}

/* filters */
.filters{display:flex;flex-direction:column;gap:9px;margin-bottom:22px;}
.chip-row{display:flex;gap:8px;flex-wrap:wrap;}
.chip{padding:7px 13px;border-radius:100px;font-size:13px;font-weight:600;color:var(--muted);background:var(--surface-2);border:1px solid var(--border);transition:.15s;}
.chip.sm{font-size:12px;padding:6px 11px;}
.chip:hover{color:var(--text);}
.chip.on{color:var(--text);background:var(--surface-3);border-color:var(--border-2);}
.tcg-chip{display:flex;align-items:center;gap:6px;}
.tcg-chip-logo{height:15px;width:auto;object-fit:contain;filter:brightness(0) invert(1);opacity:.85;}
.tcg-chip.on .tcg-chip-logo{filter:none;opacity:1;}
.tcg-chip-label{font-family:'Space Mono',monospace;font-size:12px;font-weight:700;letter-spacing:.04em;}

/* section heading */
.sec-h{display:flex;align-items:center;gap:12px;margin:24px 0 14px;}
.sec-h-t{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);font-family:'Space Mono',monospace;}
.sec-h-line{flex:1;height:1px;background:var(--border);}

/* skeleton grid */
.skel-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;}
.skel-card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:12px;}
.skel-img{aspect-ratio:3/4;border-radius:10px;background:linear-gradient(100deg,var(--surface-2) 30%,var(--surface-3) 50%,var(--surface-2) 70%);background-size:200% 100%;animation:sh 1.4s linear infinite;margin-bottom:10px;}
.skel-line{height:10px;border-radius:6px;background:var(--surface-2);margin-top:7px;}
.skel-line.w70{width:70%;} .skel-line.w40{width:40%;}
@keyframes sh{0%{background-position:200% 0;}100%{background-position:-200% 0;}}
.hint-center{text-align:center;color:var(--dim);font-size:13px;margin-top:18px;}

/* card thumb placeholder */
.card-thumb{border-radius:8px;background:linear-gradient(150deg,var(--surface-3),var(--surface));border:1px solid var(--border);display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.card-thumb span{font-family:'Space Mono',monospace;font-weight:700;color:var(--dim);font-size:13px;}

/* empty */
.empty{text-align:center;padding:48px 18px;border:1px dashed var(--border-2);border-radius:18px;background:var(--glass);}
.empty-ic{width:56px;height:56px;border-radius:16px;background:var(--surface-2);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;color:var(--gold);}
.empty-title{font-size:17px;font-weight:700;margin-bottom:7px;}
.empty-sub{color:var(--muted);font-size:14px;max-width:340px;margin:0 auto 18px;line-height:1.5;}

/* buttons */
.btn{border-radius:11px;font-weight:700;font-size:14px;padding:11px 18px;transition:.15s;display:inline-flex;align-items:center;justify-content:center;gap:8px;}
.btn-sm{padding:8px 14px;font-size:13px;border-radius:9px;}
.btn-primary{background:var(--gold);color:#1a1200;}
.btn-primary:hover{filter:brightness(1.06);}
.btn-primary:disabled{opacity:.6;cursor:default;}
.btn-ghost{background:var(--surface-2);color:var(--text);border:1px solid var(--border-2);}
.btn-block{width:100%;}

/* upcoming */
.upcoming{margin-top:14px;}
.up-grid{display:grid;grid-template-columns:1fr;gap:12px;}
.up-card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:16px;opacity:.72;cursor:default;}
.up-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;}
.up-ic{width:38px;height:38px;border-radius:11px;background:var(--surface-2);display:flex;align-items:center;justify-content:center;color:var(--muted);}
.badge-soon{font-size:10px;font-weight:700;font-family:'Space Mono',monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--gold);background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.25);padding:3px 8px;border-radius:100px;}
.up-label{font-size:16px;font-weight:700;margin-bottom:4px;}
.up-desc{font-size:13px;color:var(--muted);line-height:1.45;}

/* footer */
.foot{margin-top:34px;padding-top:22px;border-top:1px solid var(--border);text-align:center;}
.foot-logo{font-size:18px;display:block;margin-bottom:6px;}
.foot-sub{font-size:13px;color:var(--muted);}
.foot-links{margin-top:12px;display:flex;gap:8px;justify-content:center;font-size:13px;color:var(--dim);}
.foot-links a:hover{color:var(--text);}

/* bottom tab (mobile) */
.tabbar{position:fixed;bottom:0;left:0;right:0;z-index:40;display:flex;background:rgba(11,11,24,.92);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border-top:1px solid var(--border);padding-bottom:env(safe-area-inset-bottom);}
.tab-i{flex:1;height:var(--tabh);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:var(--dim);font-size:11px;font-weight:600;transition:.15s;}
.tab-i.on{color:var(--gold);}

/* modal */
.modal-backdrop{position:fixed;inset:0;z-index:60;background:rgba(2,2,8,.7);backdrop-filter:blur(6px);display:flex;align-items:flex-end;justify-content:center;padding:0;}
.modal{position:relative;width:100%;max-width:430px;background:var(--surface);border:1px solid var(--border-2);border-radius:22px 22px 0 0;padding:28px 22px calc(26px + env(safe-area-inset-bottom));box-shadow:0 -20px 60px rgba(0,0,0,.6);}
.modal-x{position:absolute;top:16px;right:16px;color:var(--muted);width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;}
.modal-x:hover{background:var(--surface-2);color:var(--text);}
.modal-logo{font-size:22px;margin-bottom:18px;}
.auth-form h3,.auth-sent h3{font-size:20px;font-weight:800;letter-spacing:-.01em;margin-bottom:6px;}
.auth-p{color:var(--muted);font-size:14px;margin-bottom:16px;line-height:1.45;}
.input{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:11px;padding:13px 14px;color:var(--text);outline:none;margin-bottom:12px;transition:.15s;}
.input:focus{border-color:var(--gold);box-shadow:0 0 0 3px rgba(251,191,36,.12);}
.auth-err{background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.3);color:var(--loss);font-size:13px;padding:9px 12px;border-radius:9px;margin-bottom:12px;}
.auth-sent{text-align:center;}
.auth-sent-ic{width:60px;height:60px;border-radius:16px;background:rgba(52,211,153,.1);color:var(--gain);display:flex;align-items:center;justify-content:center;margin:4px auto 14px;}
.auth-sent p{color:var(--muted);font-size:14px;line-height:1.5;margin:8px 0 18px;}
.auth-sent b{color:var(--text);}

/* card grid + card item */
.card-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:8px;}
.card-item{background:var(--surface);border:1px solid var(--border);border-radius:14px;overflow:hidden;transition:.15s;cursor:pointer;}
.card-item:hover{border-color:var(--border-2);background:var(--surface-2);}
.card-item:focus-visible{outline:2px solid var(--gold);outline-offset:2px;}
.card-item-img{aspect-ratio:3/4;width:100%;overflow:hidden;background:var(--surface-2);}
.card-item-img img{width:100%;height:100%;object-fit:contain;}
.card-img-ph{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:linear-gradient(150deg,var(--surface-3),var(--surface-2));padding:12px;}
.card-img-ph-tcg{font-family:'Space Mono',monospace;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;opacity:.7;}
.card-img-ph-init{font-family:'Space Mono',monospace;font-size:22px;font-weight:700;color:var(--dim);}
.card-item-body{padding:10px 10px 12px;}
.card-item-name{font-size:12px;font-weight:700;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-bottom:6px;}
.card-item-meta{display:flex;flex-wrap:wrap;gap:3px;align-items:center;margin-bottom:8px;}
.card-item-set{font-size:10px;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100px;}
.card-item-num{font-size:10px;font-family:'Space Mono',monospace;color:var(--muted);}
.card-item-lang{font-size:12px;}
.price-tag{font-family:'Space Mono',monospace;font-size:13px;font-weight:700;color:var(--gain);}
.btn-ebay{font-size:10px;font-weight:700;color:var(--gold);text-decoration:none;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.2);padding:4px 8px;border-radius:7px;display:inline-block;white-space:nowrap;}
.btn-ebay:hover{background:rgba(251,191,36,.16);}
/* search states */
.search-clear{color:var(--dim);display:flex;padding:5px;border-radius:6px;flex-shrink:0;}
.search-clear:hover{color:var(--text);background:var(--surface-3);}
.search-error{display:flex;align-items:center;gap:10px;background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.22);color:var(--loss);border-radius:12px;padding:13px 15px;margin:10px 0;font-size:14px;}
.zero-state{text-align:center;padding:36px 16px;border:1px dashed var(--border-2);border-radius:16px;background:var(--glass);}
.zero-title{font-size:16px;font-weight:700;margin-bottom:6px;}
.zero-sub{font-size:13px;color:var(--muted);margin-bottom:16px;}

/* asset page */
.asset{margin-bottom:30px;}
.back-btn{display:inline-flex;align-items:center;gap:4px;color:var(--muted);font-size:14px;font-weight:600;padding:8px 4px;margin-bottom:10px;}
.back-btn:hover{color:var(--text);}
.asset-head{display:flex;flex-direction:column;gap:18px;}
.asset-img{width:160px;align-self:center;aspect-ratio:3/4;border-radius:14px;overflow:hidden;background:var(--surface-2);border:1px solid var(--border);}
.asset-img img{width:100%;height:100%;object-fit:contain;}
.asset-info{flex:1;min-width:0;}
.asset-tcg{font-family:'Space Mono',monospace;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;}
.asset-name{font-family:'Fraunces',serif;font-weight:800;font-size:clamp(22px,5vw,30px);line-height:1.1;letter-spacing:-.02em;margin:6px 0 10px;}
.asset-meta{display:flex;flex-wrap:wrap;gap:10px;align-items:center;color:var(--muted);font-size:13px;}
.asset-num{font-family:'Space Mono',monospace;}
.price-skel{height:78px;border-radius:14px;background:linear-gradient(100deg,var(--surface-2) 30%,var(--surface-3) 50%,var(--surface-2) 70%);background-size:200% 100%;animation:sh 1.4s linear infinite;margin-top:16px;}
.fmv-block{margin-top:16px;background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:16px;}
.fmv-row{display:flex;align-items:baseline;gap:10px;}
.fmv-val{font-family:'Space Mono',monospace;font-size:30px;font-weight:700;color:var(--text);}
.fmv-tag{font-size:10px;font-weight:700;font-family:'Space Mono',monospace;letter-spacing:.1em;color:var(--gold);background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.25);padding:3px 7px;border-radius:6px;}
.fmv-sub{margin-top:5px;font-size:12px;color:var(--dim);font-family:'Space Mono',monospace;}
.spark-wrap{margin-top:14px;}
.spark-svg{width:100%;height:64px;display:block;}
.noprice-block{margin-top:16px;background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:10px;}
.noprice-txt{font-size:14px;color:var(--muted);margin-bottom:2px;}
.asset-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:20px;}
.asset-actions .btn{width:100%;}

/* ebay live */
.ebay-live{margin-top:26px;}
.ebay-list{display:flex;flex-direction:column;gap:8px;}
.ebay-row{display:flex;align-items:center;gap:12px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:10px;transition:.15s;}
.ebay-row:hover{border-color:var(--border-2);background:var(--surface-2);}
.ebay-thumb{width:46px;height:46px;border-radius:8px;overflow:hidden;background:var(--surface-2);display:flex;align-items:center;justify-content:center;color:var(--dim);flex-shrink:0;}
.ebay-thumb img{width:100%;height:100%;object-fit:cover;}
.ebay-body{flex:1;min-width:0;}
.ebay-title{font-size:12px;font-weight:600;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.ebay-cond{font-size:10px;color:var(--dim);margin-top:3px;}
.ebay-price{font-family:'Space Mono',monospace;font-size:14px;font-weight:700;color:var(--gain);flex-shrink:0;}
.ebay-all{display:inline-block;margin-top:12px;font-size:13px;font-weight:600;color:var(--gold);}
.ebay-all:hover{filter:brightness(1.1);}

/* sheet (modal) extras */
.sheet-title{font-size:20px;font-weight:800;letter-spacing:-.01em;margin-bottom:16px;}
.sheet-form{display:flex;flex-direction:column;}
.field-lbl{font-size:12px;font-weight:600;color:var(--muted);margin-bottom:7px;}
.cond-row{display:flex;gap:7px;margin-bottom:14px;flex-wrap:wrap;}
.cond-b{flex:1;min-width:48px;padding:10px 0;border-radius:9px;font-size:13px;font-weight:700;font-family:'Space Mono',monospace;color:var(--muted);background:var(--surface-2);border:1px solid var(--border);transition:.15s;}
.cond-b.on{color:#1a1200;background:var(--gold);border-color:var(--gold);}
.seg{display:flex;gap:7px;margin-bottom:14px;}
.seg-b{flex:1;padding:11px 0;border-radius:9px;font-size:13px;font-weight:700;color:var(--muted);background:var(--surface-2);border:1px solid var(--border);transition:.15s;}
.seg-b.on{color:var(--text);background:var(--surface-3);border-color:var(--border-2);}

/* toast */
.toast{position:fixed;left:50%;bottom:calc(var(--tabh) + 18px);transform:translateX(-50%);z-index:80;background:var(--surface-3);border:1px solid var(--border-2);color:var(--text);font-size:13px;font-weight:600;padding:11px 18px;border-radius:100px;box-shadow:0 12px 40px rgba(0,0,0,.5);max-width:90vw;text-align:center;}

/* desktop */
@media(min-width:760px){
  :root{--tabh:0px;}
  .topnav{display:flex;}
  .tabbar{display:none;}
  .main{padding:26px var(--p) 60px;}
  .skel-grid{grid-template-columns:repeat(4,1fr);}
  .card-grid{grid-template-columns:repeat(4,1fr);}
  .card-item-name{font-size:13px;}
  .up-grid{grid-template-columns:repeat(3,1fr);}
  .modal-backdrop{align-items:center;padding:20px;}
  .modal{border-radius:22px;}
  .asset-head{flex-direction:row;align-items:flex-start;gap:26px;}
  .asset-img{width:220px;align-self:flex-start;}
  .asset-actions{max-width:420px;}
}
`;
