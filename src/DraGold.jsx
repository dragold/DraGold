import { useState, useEffect, useCallback, useRef } from "react";
import {
  supabase, supabaseReady,
  sendMagicLink, getSession, onAuth, signOut as sbSignOut,
  addToCollection, listCollection, removeFromCollection,
  createAlert, listAlerts, deleteAlert, addToWatchlist,
} from "./supabase.js";
import { getSavedSearch, setSavedSearch, clearSavedSearch, loadSetsMap } from "./lib/state.js";
import { Icon } from "./components/shared/Icon.jsx";
import { Onboarding, ONBOARD_KEY } from "./components/shared/Onboarding.jsx";
import { pickCardImage, getSetInfo } from "./components/shared/cardImage.js";
import { SearchResults } from "./components/search/SearchResults.jsx";
import { HotPicksSection } from "./components/search/HotPicksSection.jsx";
import { norm, rankSearchResults } from "./lib/search.js";
import { LANG_ALIASES, RARITY_TOKENS, JP_NAME_ALIASES } from "./lib/searchData.js";

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
// Affiliate URL per ricerca raw (senza suffisso TCG) — usato nel fallback "no results"
export function ebaySearchURL(query, country="IT") {
  const site = EBAY_SITES[country] || EBAY_SITES.IT;
  const loc = EU_CC.includes(country) ? "&LH_PrefLoc=1" : "";
  return `https://www.${site.domain}/sch/i.html?_nkw=${encodeURIComponent(query)}&_sop=12&LH_BIN=1&mkcid=1&mkrid=${site.mkrid}&siteid=${site.siteid}&campid=${EBAY_CAMP}&toolid=10001&mkevt=1${loc}`;
}
// Aggiunge params EPN a un URL listing eBay già formato (es. da Browse API)
function ebayItemURL(url, country="IT") {
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

/* ─── Cataloghi di riferimento (UI) ─── */
const TCG_LIST = [
  { id:"pokemon",   label:"Pokémon",   short:"PKM", color:"#f87171", logo:"/logos/pkm.png" },
  { id:"onepiece",  label:"One Piece", short:"OP",  color:"#f97316", logo:"/logos/op.png" },
  { id:"mtg",       label:"Magic",     short:"MTG", color:"#60a5fa", logo:"/logos/mtg.png" },
  { id:"ygo",       label:"Yu-Gi-Oh!", short:"YGO", color:"#fbbf24", logo:"/logos/ygo.png" },
];
const CARD_LANGS = [
  { c:"en", flag:"🇺🇸", label:"EN", live:true },
  { c:"ja", flag:"🇯🇵", label:"JA", live:true },
  { c:"it", flag:"🇮🇹", label:"IT", live:true }, { c:"de", flag:"🇩🇪", label:"DE", live:true }, { c:"fr", flag:"🇫🇷", label:"FR", live:true }, { c:"es", flag:"🇪🇸", label:"ES", live:true }, { c:"pt", flag:"🇵🇹", label:"PT", live:true }, { c:"id", flag:"🇮🇩", label:"ID", live:true }, { c:"ko", flag:"🇰🇷", label:"KO", live:true }, { c:"de", flag:"🇩🇪", label:"DE", live:true }, { c:"fr", flag:"🇫🇷", label:"FR", live:true }, { c:"es", flag:"🇪🇸", label:"ES", live:true }, { c:"pt", flag:"🇵🇹", label:"PT", live:true }, { c:"id", flag:"🇮🇩", label:"ID", live:true }, { c:"ko", flag:"🇰🇷", label:"KO", live:true },
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
        <div className="modal-logo"><img src="/logo192.png" alt="DraGold" style={{width:64,height:64,borderRadius:14,display:"block",margin:"0 auto 10px"}}/><span className="font-syne">DraGold</span></div>
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
  const [setsMap, setSetsMap] = useState(null);  // Map<tcg:code, setInfo>

  /* ── carica sets (loghi) ── */
  useEffect(() => { loadSetsMap().then(setSetsMap).catch(() => {}); }, []);

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
            {/* ░░ HEADER ░░ */}
      <header className="hdr">
        <div className="hdr-in">
          <button className="brand" onClick={()=>{ setAsset(null); setTab("markets"); }}>
            <img src="/logo192.png" alt="DraGold" style={{height:30,width:30,borderRadius:7,flexShrink:0}}/>
            <span className="logo-txt font-syne">DraGold</span>
          </button>

          {/* nav desktop */}
          <nav className="topnav">
            {TABS.map(t => (
              <button key={t.id}
                className={`topnav-i ${tab===t.id?"on":""}`}
                onClick={()=>{ setAsset(null); setTab(t.id); }}>
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
            country={country} cur={cur} eurRate={eurRate} setsMap={setsMap}
          />
        ) : (
        <>
        {tab==="markets" && (
          <MarketsView
            country={country} cur={cur} eurRate={eurRate}
            onOpenAsset={openAsset} setsMap={setsMap}
          />
        )}
        {tab==="portfolio" && (
          <PortfolioView isAuthed={isAuthed} onLogin={()=>setAuthOpen(true)} onExplore={()=>setTab("markets")} cur={cur} eurRate={eurRate} />
        )}
        {tab==="alerts" && (
          <AlertsView isAuthed={isAuthed} onLogin={()=>setAuthOpen(true)} onExplore={()=>setTab("markets")}
            cur={cur} eurRate={eurRate} country={country} />
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
          <img src="/logo192.png" alt="DraGold" style={{width:40,height:40,borderRadius:10,marginBottom:6}}/>
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
          <button key={t.id} className={`tab-i ${tab===t.id?"on":""}`} onClick={()=>{ setAsset(null); setTab(t.id); }}>
            <Icon name={t.icon} size={22} stroke={tab===t.id?2.4:2} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      <AuthModal open={authOpen} onClose={()=>setAuthOpen(false)} />
    </div>
  );
}
function MarketsView({ country, cur, eurRate, onOpenAsset, setsMap }) {
  const [q, setQ] = useState(() => getSavedSearch()?.q || "");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(() => getSavedSearch()?.results || []);
  const [priceMap, setPriceMap] = useState(() => getSavedSearch()?.priceMap || {});
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(() => getSavedSearch()?.searched || false);
  const [searchTerm, setSearchTerm] = useState(() => getSavedSearch()?.searchTerm || ""); const [visibleCount, setVisibleCount] = useState(() => getSavedSearch()?.visibleCount || 40);
  const [showOnboard, setShowOnboard] = useState(() => {
    try { return !localStorage.getItem(ONBOARD_KEY); } catch { return false; }
  });
  const dismissOnboard = () => {
    try { localStorage.setItem(ONBOARD_KEY, '1'); } catch {}
    setShowOnboard(false);
  };

  const runSearch = useCallback(async (query) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setLoading(true); setError(null); setSearched(true); setSearchTerm(trimmed); setVisibleCount(40);
    try {
      if (!supabaseReady) throw new Error("Backend non configurato.");
      const normQ = norm(trimmed);
      const hasSpaces = trimmed.includes(' ');
      // Normalizza query: rimuove punteggiatura, splitta in token significativi (≥2 char)
      const words = trimmed.toLowerCase().replace(/[^a-z0-9 ]/gi, ' ')
        .trim().split(/\s+/).filter(w => w.length >= 2);

      let dbQuery = supabase
        .from('cards')
        .select('id,name,name_en,set_name,card_number,image_url,lang,tcg,rarity,card_image_cache(cached_url,status)');

      // Separa lang-token (es. "jp","ja","en") dai content-token (es. "charizard","op05").
      // I lang-token NON entrano nell'AND della query DB: le carte JP hanno nome giapponese,
      // quindi name.ilike.*jp* non matcha mai. Vengono risolti e usati nell'expand sotto.
      const LANG_CODES_SET = new Set(['en','ja','it','es','pt','id','ko','fr','de']);
      const langFilterCodes = []; // codici lingua risolti (es. "ja")
      const contentTokens = [];
      for (const w of words) {
        const alias = LANG_ALIASES[w];
        if (alias) { langFilterCodes.push(alias); }
        else if (LANG_CODES_SET.has(w)) { langFilterCodes.push(w); }
        else { contentTokens.push(w); }
      }

      // Limit più alto per ricerche con filtro lingua: serve raccogliere tutti i card_number
      // del set (es. OP05 ha 119 carte) prima dell'expand. Per ricerche normali 80 basta.
      dbQuery = dbQuery.limit(400);

      if (words.length > 0) {
        // Query DB con solo content-token; se tutti lang (raro), usa words originali
        const tokensForQuery = contentTokens.length > 0 ? contentTokens : words;
        for (const w of tokensForQuery) {
          const sw = w.replace(/[*%()]/g, '');
          if (!sw) continue;
          // Token con cifre o trattino → codice set/carta (es. sv03, OP05-119) → cerca ovunque
          // Token solo lettere (es. pikachu, charizard) → cerca SOLO in name
          const swIsCode = /\d/.test(sw) || sw.includes('-'); const jpA = JP_NAME_ALIASES[sw] || [];
          const orParts = [`name.ilike.*${sw}*`, `name_en.ilike.*${sw}*`, ...jpA.map(a => `name.ilike.*${a}*`)];
          if (swIsCode) {
            orParts.push(`card_number.ilike.*${sw}*`, `set_name.ilike.*${sw}*`);
          }
          if (RARITY_TOKENS.has(sw)) orParts.push(`rarity.ilike.*${sw}*`);
          // Se il token è un alias/codice lang (solo quando è anche content, es. "en" da solo)
          const la = LANG_ALIASES[sw];
          if (la) orParts.push(`lang.eq.${la}`);
          else if (LANG_CODES_SET.has(sw)) orParts.push(`lang.eq.${sw}`);
          dbQuery = dbQuery.or(orParts.join(','));
        }
      } else {
        const sw = trimmed.replace(/[*%()]/g, '');
        const swIsCode = /\d/.test(sw) || sw.includes('-'); const jpA = JP_NAME_ALIASES[sw] || [];
        dbQuery = dbQuery.or(
          `name.ilike.*${sw}*,name_en.ilike.*${sw}*${jpA.map(a => `,name.ilike.*${a}*`).join('')}${swIsCode ? `,card_number.ilike.*${sw}*,set_name.ilike.*${sw}*` : ''}${sw.length >= 4 && RARITY_TOKENS.has(sw) ? `,rarity.ilike.*${sw}*` : ''}`
        );
      }

      const { data, error: dbErr } = await dbQuery;
      if (dbErr) throw dbErr;

      let nameMatches = data || [];

      // Client-side filter: rimuove falsi positivi da set_name/card_number
      // Per query name-like (solo lettere, es. "pikachu"): richiede match su name
      // Per query codice (es. "sv03", "OP05"): controlla name + card_number
      if (!hasSpaces && normQ.length >= 3) {
        const qIsCode = /\d/.test(normQ) || normQ.includes('-'); const qJpA = JP_NAME_ALIASES[normQ] || [];
        nameMatches = nameMatches.filter(c =>
          norm(c.name || '').includes(normQ) || norm(c.name_en || '').includes(normQ) ||
          (qIsCode && norm(c.card_number || '').includes(normQ)) || (qJpA.length > 0 && qJpA.some(a => (c.name || '').includes(a)))
        );
      }

      let cards = nameMatches;
      if (langFilterCodes.length > 0 && nameMatches.length > 0) {
        // Expand per lingua: cerca versioni nella lingua richiesta usando gli stessi card_number.
        // Necessario perché le carte JP hanno nome giapponese nel DB (non matcha "charizard").
        const byTcg = {};
        for (const c of nameMatches) {
          if (!c.card_number) continue;
          if (!byTcg[c.tcg]) byTcg[c.tcg] = new Set();
          byTcg[c.tcg].add(c.card_number);
        }
        const allLangCards = [];
        for (const [tcgKey, numSet] of Object.entries(byTcg)) {
          const nums = [...numSet];
          if (!nums.length || nums.length > 400) continue;
          // Usa solo card_number con prefisso set (es. "sv3-125", "OP05-119").
          // I numeri bare (es. "006") causano collisioni cross-set nel DB:
          // Base Set Charizard e Jungle Beedrill condividono entrambi "006".
          const safeNums = nums.filter(n => /^[a-zA-Z].*-\d|^[a-zA-Z]{2,}\d{2,}/.test(n));
          if (!safeNums.length) continue;
          let lq = supabase
            .from('cards')
            .select('id,name,name_en,set_name,card_number,image_url,lang,tcg,rarity,card_image_cache(cached_url,status)')
            .eq('tcg', tcgKey)
            .in('card_number', safeNums);
          if (langFilterCodes.length === 1) lq = lq.eq('lang', langFilterCodes[0]);
          else lq = lq.in('lang', langFilterCodes);
          const { data: expanded } = await lq.limit(300);
          for (const c of (expanded || [])) allLangCards.push(c);
        }
        allLangCards.sort((a, b) => {
          const n = (a.card_number || '').localeCompare(b.card_number || '');
          return n !== 0 ? n : (a.name || '').localeCompare(b.name || '');
        });
        cards = allLangCards;
      } else {
        // Multi-language expand: trova versioni linguistiche delle stesse carte.
        // Attiva SOLO per query che sembrano set-code/card-number (es. "OP05", "sv03-006").
        // Per query generiche come "charizard", l'expand causa falsi positivi perché
        // card_number "006" in set diversi appartiene a pokemon completamente diversi.
        const looksLikeCardNum = words.some(w =>
          /^[a-z]{1,5}\d{2,}/i.test(w) || (w.includes('-') && w.length >= 5)
        );
        if (looksLikeCardNum && nameMatches.length > 0) {
          // Raggruppa i card_number per TCG (evita collisioni cross-TCG)
          const byTcg = {};
          for (const c of nameMatches) {
            if (!c.card_number) continue;
            if (!byTcg[c.tcg]) byTcg[c.tcg] = new Set();
            byTcg[c.tcg].add(c.card_number);
          }
          const knownIds = new Set(nameMatches.map(c => c.id));
          const allCards = [...nameMatches];
          for (const [tcgKey, numSet] of Object.entries(byTcg)) {
            const nums = [...numSet];
            if (!nums.length || nums.length > 400) continue;
            const { data: expanded } = await supabase
              .from('cards')
              .select('id,name,name_en,set_name,card_number,image_url,lang,tcg,card_image_cache(cached_url,status)')
              .eq('tcg', tcgKey)
              .in('card_number', nums)
              .limit(400);
            for (const c of (expanded || [])) {
              if (!knownIds.has(c.id)) { knownIds.add(c.id); allCards.push(c); }
            }
          }
          allCards.sort((a, b) => {
            const n = (a.card_number || '').localeCompare(b.card_number || '');
            return n !== 0 ? n : (a.lang || '').localeCompare(b.lang || '');
          });
          cards = allCards;
        }
      }

      cards = rankSearchResults(cards, trimmed); setResults(cards);
      setLoading(false); // mostra le carte subito, prezzi in background

      // Prezzi in background: max 100 IDs per evitare URL troppo lunghi (414/timeout)
      if (cards.length > 0) {
        try {
          const priceIds = cards.slice(0, 100).map(c => c.id);
          const { data: priceRows } = await supabase
            .from('card_prices')
            .select('card_id,price_market,source,captured_at')
            .in('card_id', priceIds)
            .order('captured_at', { ascending: false })
            .limit(priceIds.length * 3);
          const pm = {};
          for (const p of (priceRows || [])) { if (!pm[p.card_id]) pm[p.card_id] = p; }
          setPriceMap(pm);
        } catch (_) { /* ignora errori fetch prezzi */ }
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

  // Salva lo stato di ricerca prima di aprire il dettaglio carta, così il back restaura i risultati
  const handleOpenAsset = useCallback((card) => {
    setSavedSearch({ q, results, priceMap, searched, searchTerm, visibleCount });
    onOpenAsset(card);
  }, [q, results, priceMap, searched, searchTerm, visibleCount, onOpenAsset]);

  useEffect(() => { const onScroll = () => { if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 300) { setVisibleCount(v => Math.min(v + 40, results.length)); } }; window.addEventListener('scroll', onScroll); return () => window.removeEventListener('scroll', onScroll); }, [results.length]); const onSubmit = (e) => { e.preventDefault(); runSearch(q); };
  const clearSearch = () => { clearSavedSearch(); setSearched(false); setResults([]); setPriceMap({}); setError(null); setVisibleCount(40); };

  return (
    <section className="view">
      {showOnboard && <Onboarding onDismiss={dismissOnboard} />}
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

      {searched ? (
        <SearchResults
          loading={loading} results={results.slice(0, visibleCount)} priceMap={priceMap}
          error={error} term={searchTerm}
          country={country} cur={cur} eurRate={eurRate}
          onRetry={() => runSearch(searchTerm)}
          onOpen={handleOpenAsset} setsMap={setsMap}
        />
      ) : (
        <HotPicksSection country={country} cur={cur} eurRate={eurRate} onOpen={handleOpenAsset} />
      )}
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   PORTFOLIO (TASK 5)
   ════════════════════════════════════════════════════════════════════════ */

/* ─── PortfolioRow — separato per rispettare la regola degli hooks ─── */
function PortfolioRow({ pos, priceInfo, cur, eurRate, fmt, isConfirm, onConfirm, onCancelConfirm, onRemove, onTrack, trackBusy, trackDone, removeBusy }) {
  const [imgFailed, setImgFailed] = useState(false);
  const imgUrl = pickCardImage(pos) || null;
  const initials = (pos.card_name || "")
    .replace(/[^a-zA-Z ]/g, "").trim()
    .split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase() || "?";
  const tcgInfo = TCG_LIST.find(t => t.id === pos.tcg);

  const capturedAt = priceInfo?.captured_at ? new Date(priceInfo.captured_at) : null;
  const ageMs = capturedAt ? (Date.now() - capturedAt.getTime()) : null;
  const freshClass = ageMs == null ? null : ageMs < 24*3600*1000 ? "ok" : ageMs < 14*24*3600*1000 ? "warn" : "stale";
  const freshLabel = ageMs == null ? null : ageMs < 3600*1000 ? `${Math.max(1, Math.round(ageMs/60000))}m ago` : ageMs < 24*3600*1000 ? `${Math.round(ageMs/3600000)}h ago` : `${Math.round(ageMs/86400000)}d ago`;

  const currentUSD = priceInfo?.price_market ?? null;
  const paidRaw    = pos.purchase_price;
  const fmvCur     = pos.fmv_currency || cur;
  // purchase_price is stored in the currency the user had active (fmv_currency)
  const paidUSD    = paidRaw != null
    ? (fmvCur === "EUR" ? paidRaw / eurRate : Number(paidRaw))
    : null;
  const rowPnlUSD  = (currentUSD != null && paidUSD != null) ? currentUSD - paidUSD : null;
  const rowPnlPos  = rowPnlUSD != null ? rowPnlUSD >= 0 : null;

  const paidDisplay = paidRaw != null
    ? (fmvCur === "EUR" ? `€${Number(paidRaw).toFixed(2)}` : `$${Number(paidRaw).toFixed(2)}`)
    : "—";

  return (
    <div className="pf-row">
      {/* Thumbnail */}
      <div className="pf-img">
        {imgUrl && !imgFailed ? (
          <img src={imgUrl} alt={pos.card_name} loading="lazy" onError={() => setImgFailed(true)} />
        ) : (
          <div className="card-img-ph" style={{ width:"100%", height:"100%" }}>
            {tcgInfo && <span className="card-img-ph-tcg" style={{ color:tcgInfo.color, fontSize:8 }}>{tcgInfo.short}</span>}
            <span className="card-img-ph-init" style={{ fontSize:13 }}>{initials}</span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="pf-body">
        <div className="pf-name">{pos.card_name || "—"}</div>
        <div className="pf-meta">
          {pos.condition && <span className="pf-cond">{pos.condition}</span>}
          {pos.set_name  && <span className="pf-set">{pos.set_name}</span>}
          {pos.lang && <span className="pf-lang">{String(pos.lang).toUpperCase()}</span>}
          {freshLabel && <span className={`pf-fresh ${freshClass}`}>{freshLabel}</span>}
        </div>
        <div className="pf-prices">
          <div className="pf-price-col">
            <span className="pf-price-lbl">Paid</span>
            <span className="pf-price-val">{paidDisplay}</span>
          </div>
          <div className="pf-price-col">
            <span className="pf-price-lbl">Now</span>
            <span className="pf-price-val">{currentUSD != null ? fmt(currentUSD) : "—"}</span>
          </div>
          <div className="pf-price-col">
            <span className="pf-price-lbl">P&amp;L</span>
            <span className={`pf-price-val${rowPnlPos === true ? " gain" : rowPnlPos === false ? " loss" : ""}`}>
              {rowPnlUSD != null ? `${rowPnlPos ? "+" : ""}${fmt(rowPnlUSD)}` : "—"}
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="pf-actions">
        {currentUSD == null && (
          <button className="btn btn-ghost btn-sm pf-track-btn"
            disabled={trackBusy || trackDone} onClick={onTrack}>
            {trackDone ? "✓" : trackBusy ? "…" : "Track"}
          </button>
        )}
        {!isConfirm ? (
          <button className="pf-remove-btn" onClick={onConfirm} aria-label="Remove position">
            <Icon name="close" size={14} />
          </button>
        ) : (
          <div className="pf-confirm">
            <span className="pf-confirm-txt">Remove?</span>
            <button className="btn btn-ghost btn-sm" onClick={onCancelConfirm}>Cancel</button>
            <button className="btn btn-sm pf-confirm-yes" disabled={removeBusy} onClick={onRemove}>
              {removeBusy ? "…" : "Yes"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* --- PORTFOLIO VIEW --- */
function PortfolioView({ isAuthed, onLogin, onExplore, cur, eurRate }) {
  const [positions, setPositions]   = useState([]);
  const [priceMap, setPriceMap]     = useState({});
  const [pfPoints, setPfPoints]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [confirmId, setConfirmId]   = useState(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [watchBusy, setWatchBusy]   = useState({});   // { rowId: true }
  const [watched, setWatched]       = useState({});    // { rowId: true }
  const [toast, setToast]           = useState("");

  const flash = useCallback((m) => { setToast(m); setTimeout(() => setToast(""), 2800); }, []);

  const fmt = useCallback((usd) => {
    if (usd == null || isNaN(usd)) return "—";
    return cur === "EUR" ? `€${(usd * eurRate).toFixed(2)}` : `$${Number(usd).toFixed(2)}`;
  }, [cur, eurRate]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await listCollection();
      const ids0 = [...new Set(data.map(p => p.card_api_id).filter(Boolean))];
      let dataWithLang = data;
      if (ids0.length) {
        const { data: langRows } = await supabase
          .from("cards")
          .select("id,lang")
          .in("id", ids0);
        const lm = {};
        for (const r of (langRows || [])) lm[r.id] = r.lang;
          const { data: cacheRows } = await supabase
                    .from("card_image_cache")
                    .select("card_id,cached_url,status")
                    .in("card_id", ids0)
                    .eq("status", "ready");
                  const cm = {};
                  for (const r of (cacheRows || [])) { if (!cm[r.card_id]) cm[r.card_id] = []; cm[r.card_id].push(r); }
                  dataWithLang = data.map(p => ({ ...p, lang: lm[p.card_api_id] || null, card_image_cache: cm[p.card_api_id] || [] }));
      }
      setPositions(dataWithLang);
      if (data.length > 0) {
        const ids = ids0;
        if (ids.length) {
          const { data: priceRows } = await supabase
            .from("card_prices")
            .select("card_id,price_market,captured_at")
            .in("card_id", ids)
            .order("captured_at", { ascending: false })
            .limit(ids.length * 4);
          const pm = {};
          for (const p of (priceRows || [])) { if (!pm[p.card_id]) pm[p.card_id] = p; }
          setPriceMap(pm);

          const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
          const { data: histRows } = await supabase
            .from("card_prices")
            .select("card_id,price_market,captured_at")
            .in("card_id", ids)
            .gte("captured_at", since90)
            .is("timeframe", null)
            .order("captured_at", { ascending: true })
            .limit(ids.length * 120);
          setPfPoints(computePortfolioHistory(histRows || [], ids));
        }
      } else {
        setPriceMap({});
        setPfPoints([]);
      }
    } catch (e) {
      setError(e.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthed) { setLoading(false); return; }
    load();
  }, [isAuthed, load]);

  const doRemove = useCallback(async (id) => {
    setRemoveBusy(true);
    await removeFromCollection(id);
    setPositions(ps => ps.filter(p => p.id !== id));
    setConfirmId(null);
    setRemoveBusy(false);
    flash("Removed from portfolio");
  }, [flash]);

  const doTrack = useCallback(async (pos) => {
    setWatchBusy(b => ({ ...b, [pos.id]: true }));
    const res = await addToWatchlist({
      tcg: pos.tcg,
      cardApiId: pos.card_api_id,
      cardName: pos.card_name,
      setName: pos.set_name || "",
      imageUrl: pos.image_url || null,
    });
    setWatchBusy(b => ({ ...b, [pos.id]: false }));
    if (res?.error) { flash("Could not track."); return; }
    setWatched(w => ({ ...w, [pos.id]: true }));
    flash("Tracking — we'll price it on the next refresh");
  }, [flash]);

  /* ── not authenticated ── */
  if (!isAuthed) return (
    <section className="view">
      <div className="view-h"><h2 className="view-t">Portfolio</h2></div>
      <Empty icon="wallet"
        title="Sign in to save your portfolio"
        sub="Add the cards you own and track their value and P&L over time."
        cta="Sign in" onCta={onLogin} />
    </section>
  );

  /* ── loading ── */
  if (loading) return (
    <section className="view">
      <div className="view-h"><h2 className="view-t">Portfolio</h2></div>
      <div className="pf-header-skel">
        <div className="skel-line" style={{ height:30, width:"52%", marginBottom:10 }} />
        <div className="skel-line" style={{ height:16, width:"32%" }} />
      </div>
      {[0,1,2].map(i => (
        <div key={i} className="pf-row">
          <div style={{ width:44, height:62, borderRadius:8, flexShrink:0,
            background:"linear-gradient(100deg,var(--surface-2) 30%,var(--surface-3) 50%,var(--surface-2) 70%)",
            backgroundSize:"200% 100%", animation:"sh 1.4s linear infinite" }} />
          <div style={{ flex:1, display:"flex", flexDirection:"column", gap:7 }}>
            <div className="skel-line" style={{ width:"60%" }} />
            <div className="skel-line" style={{ width:"35%" }} />
          </div>
        </div>
      ))}
    </section>
  );

  /* ── error ── */
  if (error) return (
    <section className="view">
      <div className="view-h"><h2 className="view-t">Portfolio</h2></div>
      <div className="search-error">
        <Icon name="close" size={16} />
        <span>Could not load portfolio.</span>
        <button className="btn btn-ghost btn-sm" style={{ marginLeft:"auto" }} onClick={load}>Retry</button>
      </div>
    </section>
  );

  /* ── empty ── */
  if (!positions.length) return (
    <section className="view">
      <div className="view-h"><h2 className="view-t">Portfolio</h2></div>
      <Empty icon="wallet"
        title="Your portfolio is empty"
        sub="Search a card and add it to track its value and gain."
        cta="Find a card" onCta={onExplore} />
    </section>
  );

  /* ── compute totals (only priced positions contribute) ── */
  let totalValueUSD = 0, totalPaidUSD = 0, unpricedCount = 0, noPaidCount = 0;
  for (const pos of positions) {
    const priceRow  = priceMap[pos.card_api_id];
    const currentUSD = priceRow?.price_market ?? null;
    const paidRaw    = pos.purchase_price;
    const fmvCur     = pos.fmv_currency || cur;
    const paidUSD    = paidRaw != null
      ? (fmvCur === "EUR" ? paidRaw / eurRate : Number(paidRaw))
      : null;
    if (currentUSD != null) {
      totalValueUSD += currentUSD;
      if (paidUSD != null) totalPaidUSD += paidUSD;
    } else {
      unpricedCount++;
    }
    if (paidUSD == null) noPaidCount++;
  }
  const pnlUSD  = totalValueUSD - totalPaidUSD;
  const pnlPct  = totalPaidUSD > 0 ? (pnlUSD / totalPaidUSD) * 100 : null;
  const pnlPos  = pnlUSD >= 0;

  return (
    <section className="view">
      <div className="view-h"><h2 className="view-t">Portfolio</h2></div>

      {/* ── HEADER ── */}
      <div className="pf-header">
        <div className="pf-header-top">
          <span className="pf-label">Total Value</span>
          {unpricedCount > 0 && (
            <span className="pf-unpriced">{unpricedCount} unpriced</span>
          )}
        </div>
        <div className="pf-total">{fmt(totalValueUSD)}</div>
        {totalPaidUSD > 0 && (
          <div className={`pf-pnl ${pnlPos ? "gain" : "loss"}`}>
            <span>{pnlPos ? "+" : ""}{fmt(pnlUSD)}</span>
            {pnlPct != null && (
              <span className="pf-pnl-pct">{pnlPos ? "+" : ""}{pnlPct.toFixed(2)}%</span>
            )}
            <span className="pf-pnl-vs">vs paid</span>
          </div>
        )}
        <div className="pf-count">
          {positions.length - unpricedCount} of {positions.length} position{positions.length !== 1 ? "s" : ""} priced
        </div>
        {noPaidCount > 0 && (
          <div className="pf-nopaid">{noPaidCount} of {positions.length} without a purchase price — P&L not shown for these</div>
        )}
        {pfPoints.length >= 2 && (
          <PortfolioChart points={pfPoints} fmt={fmt} />
        )}
      </div>

      {/* ── LIST ── */}
      <div className="pf-list">
        {positions.map(pos => (
          <PortfolioRow
            key={pos.id}
            pos={pos}
            priceInfo={priceMap[pos.card_api_id] || null}
            cur={cur}
            eurRate={eurRate}
            fmt={fmt}
            isConfirm={confirmId === pos.id}
            onConfirm={() => setConfirmId(pos.id)}
            onCancelConfirm={() => setConfirmId(null)}
            onRemove={() => doRemove(pos.id)}
            onTrack={() => doTrack(pos)}
            trackBusy={!!watchBusy[pos.id]}
            trackDone={!!watched[pos.id]}
            removeBusy={removeBusy && confirmId === pos.id}
          />
        ))}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </section>
  );
}

/* --- ALERTS --- */
/* ════════════════════════════════════════════════════════════════════════
   ALERTS — lista, crea, elimina, toggle attivo (TASK 6)
   ════════════════════════════════════════════════════════════════════════ */

/* ─── AlertSearchResultItem — riga risultato ricerca inline ─── */
function AlertSearchResultItem({ card, onSelect }) {
  const [imgFailed, setImgFailed] = useState(false);
  const imgUrl = pickCardImage(card) || null;
  const tcgInfo = TCG_LIST.find(t => t.id === card.tcg);
  const langInfo = CARD_LANGS.find(l => l.c === card.lang);
  return (
    <button className="al-search-row" onClick={() => onSelect(card)}>
      <div className="al-search-img">
        {imgUrl && !imgFailed ? (
          <img src={imgUrl} alt={card.name} loading="lazy" onError={() => setImgFailed(true)} />
        ) : (
          <div className="card-img-ph" style={{ width: '100%', height: '100%' }}>
            {tcgInfo && <span className="card-img-ph-tcg" style={{ color: tcgInfo.color }}>{tcgInfo.short}</span>}
          </div>
        )}
      </div>
      <div className="al-search-body">
        <div className="al-search-name">{card.name}</div>
        <div className="al-search-meta">
          {card.set_name && <span>{card.set_name}</span>}
          {card.card_number && <span>#{card.card_number}</span>}
          {langInfo && <span>{langInfo.flag}</span>}
          {tcgInfo && <span style={{ color: tcgInfo.color, fontFamily: 'Space Mono, monospace', fontSize: 10 }}>{tcgInfo.short}</span>}
        </div>
      </div>
      <span style={{ color: 'var(--dim)', flexShrink: 0, display: 'flex' }}><Icon name="chevron" size={16} /></span>
    </button>
  );
}

/* ─── AlertCardSearch — ricerca inline per scegliere la carta ─── */
function AlertCardSearch({ onSelect, onClose }) {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const doSearch = useCallback(async (query) => {
    const trimmed = query.trim();
    if (!trimmed) { setResults([]); setError(null); return; }
    setLoading(true); setError(null);
    try {
      if (!supabaseReady) throw new Error('Backend not configured');
      const words = trimmed.toLowerCase().replace(/[^a-z0-9 ]/gi, ' ')
        .trim().split(/\s+/).filter(w => w.length >= 2);
      let dbQ = supabase.from('cards')
        .select('id,name,name_en,set_name,card_number,image_url,lang,tcg,card_image_cache(cached_url,status)')
        .limit(15);
      if (words.length > 0) {
        for (const w of words) {
          const sw = w.replace(/[*%()]/g, '');
          if (!sw) continue;
          const langAlias = LANG_ALIASES[sw];
          const knownLangCode = ['en','ja','it','es','pt','id','ko','fr','de'].includes(sw);
          const orParts = [
            `name.ilike.*${sw}*`,
            `card_number.ilike.*${sw}*`,
            `set_name.ilike.*${sw}*`,
          ];
          if (RARITY_TOKENS.has(sw)) orParts.push(`rarity.ilike.*${sw}*`);
          if (langAlias) orParts.push(`lang.eq.${langAlias}`);
          else if (knownLangCode) orParts.push(`lang.eq.${sw}`);
          dbQ = dbQ.or(orParts.join(','));
        }
      } else {
        const sw = trimmed.replace(/[*%()]/g, '');
        dbQ = dbQ.or(
          `name.ilike.*${sw}*,card_number.ilike.*${sw}*,set_name.ilike.*${sw}*${sw.length >= 4 ? `,rarity.ilike.*${sw}*` : ''}`
        );
      }
      const { data, error: err } = await dbQ;
      if (err) throw err;
      setResults(data || []);
    } catch {
      setError('Search failed. Retry.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const t = setTimeout(() => doSearch(q), 350);
    return () => clearTimeout(t);
  }, [q, doSearch]);

  return (
    <div className="al-search-box">
      <div className="search" style={{ margin: 0 }}>
        <span className="search-ic"><Icon name="search" size={18} /></span>
        <input ref={inputRef} className="search-in"
          placeholder="Search a card to set alert…"
          value={q} onChange={e => setQ(e.target.value)} />
        <button className="search-clear" onClick={onClose} aria-label="Cancel"><Icon name="close" size={16} /></button>
      </div>
      {loading && <div className="al-search-hint">Searching…</div>}
      {error && <div className="al-search-hint al-search-err">{error}</div>}
      {!loading && !error && q.trim() && results.length === 0 && (
        <div className="al-search-hint">No results for "{q.trim()}".</div>
      )}
      {results.length > 0 && (
        <div className="al-search-results">
          {results.map(card => (
            <AlertSearchResultItem key={card.id} card={card} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── AlertRow — singola riga nella lista alert ─── */
function AlertRow({ alert: al, toggling, isDeleting, deleteBusy, onToggle, onDeleteStart, onDeleteCancel, onDeleteConfirm, cur, eurRate }) {
  const fmtPrice = (usd) => {
    if (usd == null) return '—';
    return cur === 'EUR' ? `€${(usd * eurRate).toFixed(2)}` : `$${Number(usd).toFixed(2)}`;
  };
  const isActive = al.is_active;
  const triggeredAt = al.triggered_at
    ? new Date(al.triggered_at).toLocaleDateString()
    : null;

  return (
    <div className={`al-row${!isActive ? ' al-row-off' : ''}`}>
      <div className="al-body">
        <div className="al-name">{al.card_name || '—'}</div>
        <div className="al-meta">
          <span className={`al-dir${al.direction === 'above' ? ' al-above' : ' al-below'}`}>
            {al.direction === 'above' ? '↑ Above' : '↓ Below'} {fmtPrice(al.threshold_price)}
          </span>
          <span className={`al-status${isActive ? ' al-active' : ' al-triggered'}`}>
            {isActive ? 'Active' : (triggeredAt ? `Triggered ${triggeredAt}` : 'Inactive')}
          </span>
        </div>
      </div>
      <div className="al-actions">
        {isDeleting ? (
          <div className="pf-confirm">
            <span className="pf-confirm-txt">Delete?</span>
            <button className="btn btn-ghost btn-sm" style={{ padding: '6px 10px', fontSize: 12 }} onClick={onDeleteCancel}>Cancel</button>
            <button className="pf-confirm-yes" onClick={onDeleteConfirm} disabled={deleteBusy}>
              {deleteBusy ? '…' : 'Delete'}
            </button>
          </div>
        ) : (
          <>
            <button
              className={`al-toggle${isActive ? ' on' : ''}`}
              onClick={onToggle}
              disabled={toggling}
              aria-label={isActive ? 'Deactivate alert' : 'Activate alert'}
              title={isActive ? 'Deactivate' : 'Activate'}>
              <span className="al-toggle-knob" />
            </button>
            <button className="pf-remove-btn" onClick={onDeleteStart} aria-label="Delete alert">
              <Icon name="close" size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── AlertsView ─── */
function AlertsView({ isAuthed, onLogin, onExplore, cur, eurRate, country }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null);
  const [toast, setToast] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [toggling, setToggling] = useState(null);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2600); };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const data = await listAlerts();
    setAlerts(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAuthed) load();
    else setLoading(false);
  }, [isAuthed, load]);

  const toggle = async (al) => {
    if (toggling) return;
    setToggling(al.id);
    await supabase.from('alerts').update({ is_active: !al.is_active }).eq('id', al.id);
    setAlerts(prev => prev.map(a => a.id === al.id ? { ...a, is_active: !a.is_active } : a));
    setToggling(null);
  };

  const remove = async (id) => {
    setDeleteBusy(true);
    await deleteAlert(id);
    setAlerts(prev => prev.filter(a => a.id !== id));
    setDeletingId(null);
    setDeleteBusy(false);
    flash('Alert deleted');
  };

  if (!isAuthed) return (
    <section className="view">
      <div className="view-h"><h2 className="view-t">Alerts</h2></div>
      <Empty icon="bell"
        title="Sign in to create alerts"
        sub="Get an email when a card exceeds or drops below your price threshold."
        cta="Sign in" onCta={onLogin} />
    </section>
  );

  return (
    <section className="view">
      <div className="view-h al-view-h">
        <h2 className="view-t">Alerts</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setShowSearch(s => !s)}>
          <Icon name="bell" size={15} /> New alert
        </button>
      </div>

      {showSearch && (
        <AlertCardSearch
          onSelect={card => { setSelectedCard(card); setShowSearch(false); }}
          onClose={() => setShowSearch(false)}
        />
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skel-card" style={{ height: 70, borderRadius: 14 }} />
          ))}
        </div>
      ) : error ? (
        <div className="search-error">
          <span>{error}</span>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={load}>Retry</button>
        </div>
      ) : alerts.length === 0 ? (
        <Empty icon="bell"
          title="No alerts yet"
          sub="Create your first alert — set a threshold and get notified when the price crosses it."
          cta="New alert" onCta={() => setShowSearch(true)} />
      ) : (
        <div className="al-list">
          {alerts.map(al => (
            <AlertRow key={al.id} alert={al}
              toggling={toggling === al.id}
              isDeleting={deletingId === al.id}
              deleteBusy={deleteBusy && deletingId === al.id}
              onToggle={() => toggle(al)}
              onDeleteStart={() => setDeletingId(al.id)}
              onDeleteCancel={() => setDeletingId(null)}
              onDeleteConfirm={() => remove(al.id)}
              cur={cur} eurRate={eurRate}
            />
          ))}
        </div>
      )}

      {selectedCard && (
        <AlertModal
          card={selectedCard} cur={cur} country={country} fmvUSD={null} eurRate={eurRate}
          onClose={() => setSelectedCard(null)}
          onDone={m => { setSelectedCard(null); flash(m); load(); }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   ASSET — dettaglio carta (TASK 4)
   ════════════════════════════════════════════════════════════════════════ */
const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"];

// market code accettato da /api/ebay-search; fallback US
const EBAY_MARKETS = ["US","GB","DE","IT","FR","ES","CA"];

// card_api_id === cards.id (forma completa "<tcg>:<source>:<number>:<lang>",
// es. "onepiece:optcg:OP05-119:en"). refresh-prices e check-alerts usano card_api_id
// direttamente come card_prices.card_id, quindi NON va spogliato del prefisso.
function toApiId(card) {
  return card?.id || "";
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

/* ─── Price History Chart SVG (no deps) ─── */
function PriceChart({ snaps, priceStr }) {
  const byDay = {};
  for (const s of snaps) {
    const day = s.captured_at.slice(0, 10);
    if (!byDay[day]) byDay[day] = { sum: 0, n: 0 };
    byDay[day].sum += s.price_market;
    byDay[day].n++;
  }
  const points = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, { sum, n }]) => ({
      value: sum / n,
      label: new Date(day + 'T12:00:00Z').toLocaleDateString('en', { month: 'short', day: 'numeric' }),
    }));
  if (points.length < 2) return null;
  const vals = points.map(p => p.value);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const range = (maxV - minV) || (minV * 0.02) || 1;
  const gain = vals[vals.length - 1] >= vals[0];
  const col = gain ? 'var(--gain)' : 'var(--loss)';
  const W = 360, H = 120, PT = 12, PB = 28, PL = 52, PR = 12;
  const iW = W - PL - PR, iH = H - PT - PB;
  const toX = i => PL + (points.length === 1 ? iW / 2 : (i / (points.length - 1)) * iW);
  const toY = v => PT + (1 - (v - minV) / range) * iH;
  const linePath = points.map((p, i) => (i ? 'L' : 'M') + toX(i).toFixed(1) + ',' + toY(p.value).toFixed(1)).join(' ');
  const areaPath = linePath + ' L' + toX(points.length - 1).toFixed(1) + ',' + (PT + iH).toFixed(1) + ' L' + toX(0).toFixed(1) + ',' + (PT + iH).toFixed(1) + ' Z';
  const yTicks = [minV, (minV + maxV) / 2, maxV];
  const xLabelIdxs = points.length <= 5 ? points.map((_, i) => i) : [0, Math.floor(points.length / 2), points.length - 1];
  return (
    <div className="price-chart-wrap">
      <div className="sec-h"><span className="sec-h-t">Price history</span><span className="sec-h-line" /></div>
      <svg viewBox={"0 0 " + W + " " + H} style={{ width: "100%", height: "auto", display: "block" }}>
        <defs><linearGradient id="chartfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity="0.18" />
          <stop offset="100%" stopColor={col} stopOpacity="0" />
        </linearGradient></defs>
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={PL} y1={toY(v).toFixed(1)} x2={PL + iW} y2={toY(v).toFixed(1)} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            <text x={PL - 5} y={toY(v) + 4} textAnchor="end" fill="rgba(255,255,255,0.38)" fontSize="9" fontFamily="Space Mono,monospace">{priceStr(v)}</text>
          </g>
        ))}
        <path d={areaPath} fill="url(#chartfill)" />
        <path d={linePath} fill="none" stroke={col} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={toX(0)} cy={toY(vals[0])} r="2.5" fill={col} />
        <circle cx={toX(points.length - 1)} cy={toY(vals[vals.length - 1])} r="3.5" fill={col} stroke="var(--bg)" strokeWidth="1.5" />
        {xLabelIdxs.map(i => (
          <text key={i} x={toX(i)} y={H - 6} textAnchor="middle" fill="rgba(255,255,255,0.38)" fontSize="9" fontFamily="Space Mono,monospace">{points[i].label}</text>
        ))}
      </svg>
    </div>
  );
}


/* ─── Portfolio Value Chart SVG ─── */
function PortfolioChart({ points, fmt }) {
  if (!points || points.length < 2) return null;
  const vals = points.map(p => p.value);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const range = (maxV - minV) || (minV * 0.02) || 1;
  const gain = vals[vals.length - 1] >= vals[0];
  const col = gain ? 'var(--gain)' : 'var(--loss)';
  const W = 360, H = 100, PT = 8, PB = 24, PL = 56, PR = 8;
  const iW = W - PL - PR, iH = H - PT - PB;
  const toX = i => PL + (points.length === 1 ? iW / 2 : (i / (points.length - 1)) * iW);
  const toY = v => PT + (1 - (v - minV) / range) * iH;
  const linePath = points.map((p, i) => (i ? 'L' : 'M') + toX(i).toFixed(1) + ',' + toY(p.value).toFixed(1)).join(' ');
  const areaPath = linePath + ' L' + toX(points.length-1).toFixed(1) + ',' + (PT+iH).toFixed(1) + ' L' + toX(0).toFixed(1) + ',' + (PT+iH).toFixed(1) + ' Z';
  const xLabelIdxs = points.length <= 4 ? points.map((_, i) => i) : [0, Math.floor(points.length / 2), points.length - 1];
  return (
    <div className="pf-chart-wrap">
      <svg viewBox={"0 0 " + W + " " + H} style={{ width: "100%", height: "auto", display: "block" }}>
        <defs><linearGradient id="pfchartfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity="0.15" />
          <stop offset="100%" stopColor={col} stopOpacity="0" />
        </linearGradient></defs>
        {[minV, maxV].map((v, i) => (
          <g key={i}>
            <line x1={PL} y1={toY(v).toFixed(1)} x2={PL + iW} y2={toY(v).toFixed(1)} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            <text x={PL - 5} y={toY(v) + 4} textAnchor="end" fill="rgba(255,255,255,0.35)" fontSize="9" fontFamily="Space Mono,monospace">{fmt(v)}</text>
          </g>
        ))}
        <path d={areaPath} fill="url(#pfchartfill)" />
        <path d={linePath} fill="none" stroke={col} strokeWidth="1.8" strokeLinejoin="round" />
        <circle cx={toX(0)} cy={toY(vals[0])} r="2" fill={col} />
        <circle cx={toX(points.length-1)} cy={toY(vals[vals.length-1])} r="3.5" fill={col} stroke="var(--bg)" strokeWidth="1.5" />
        {xLabelIdxs.map(i => (
          <text key={i} x={toX(i)} y={H - 6} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="9" fontFamily="Space Mono,monospace">{points[i].label}</text>
        ))}
      </svg>
    </div>
  );
}

/* ─── Compute daily portfolio value from price snapshots ─── */
function computePortfolioHistory(rows, cardIds) {
  if (!rows.length || !cardIds.length) return [];
  const byCard = {};
  for (const r of rows) {
    if (!byCard[r.card_id]) byCard[r.card_id] = [];
    byCard[r.card_id].push({ price: r.price_market, ts: new Date(r.captured_at).getTime() });
  }
  const days = [...new Set(rows.map(r => r.captured_at.slice(0, 10)))].sort();
  if (days.length < 2) return [];
  return days.map(day => {
    const dayEnd = new Date(day + 'T23:59:59Z').getTime();
    let total = 0, priced = 0;
    for (const id of cardIds) {
      const snaps = byCard[id] || [];
      const snap = [...snaps].reverse().find(s => s.ts <= dayEnd);
      if (snap) { total += snap.price; priced++; }
    }
    if (priced === 0) return null;
    return { label: new Date(day + 'T12:00:00Z').toLocaleDateString('en', { month: 'short', day: 'numeric' }), value: total };
  }).filter(Boolean);
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
    const targetEur = cur === "EUR" ? t : t * eurRate;
    const thresholdUSD = cur === "EUR" ? t / eurRate : t;
    const res = await createAlert({
      tcg: card.tcg, cardId: toApiId(card), cardName: card.name,
      language: card.lang || "en", threshold: thresholdUSD, targetEur, direction: dir,
      currency: "USD", country,
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
        <label className="field-lbl">Threshold ({cur === "EUR" ? "€" : "$"})</label>
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
function AssetView({ card, onBack, isAuthed, onLogin, country, cur, eurRate, setsMap }) {
  const [snaps, setSnaps] = useState([]);       // [{price_market, source, captured_at}] asc
  const [loadingPrice, setLoadingPrice] = useState(true);
  const [priceErr, setPriceErr] = useState(false);
  const [ebayItems, setEbayItems] = useState([]);
  const [imgFailed, setImgFailed] = useState(false);
  const [modal, setModal] = useState(null);     // 'portfolio' | 'alert' | null
  const [watching, setWatching] = useState(false);
  const [watchBusy, setWatchBusy] = useState(false);
  const [toast, setToast] = useState("");
  // eBay sold timeframes (Finding API) — {'7d': {avg, median, count, currency}, ...}
  const [soldData, setSoldData] = useState({});
  // User plan tier: 'free' | 'collector' | 'pro'
  const [userTier, setUserTier] = useState('free');

  const tcgInfo = TCG_LIST.find(t => t.id === card.tcg);
  const langInfo = CARD_LANGS.find(l => l.c === card.lang);
  const setInfo = getSetInfo(card, setsMap);
  const imgUrl = pickCardImage(card) || card.imgUrl || card.img || null;
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

  // Numero carta "distintivo" = filtrabile in modo affidabile su eBay (es. OP12-079,
  // 006/165, swsh1-1). Un numero corto puro come "5" o "199" matcha qualunque titolo
  // ("DP5", "...199...") → falsi positivi: in quel caso NON mostriamo eBay Live. (Fix #3)
  const numNorm = cardNum.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const numDistinctive = !!cardNum && (
    /[a-z]/i.test(cardNum) || /[-/]/.test(cardNum) || numNorm.length >= 5
  );

  /* eBay live: solo listing col numero carta (distintivo) nel titolo, max 5 (Fix #3) */
  const loadEbay = useCallback(async () => {
    if (!numDistinctive) { setEbayItems([]); return; }
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
      const matches = (d.items || [])
        .filter(it => (it.title || "").replace(/[^a-z0-9]/gi, "").toLowerCase().includes(numNorm))
        .slice(0, 5);
      setEbayItems(matches);
    } catch {
      setEbayItems([]);
    }
  }, [card.id, cardNum, numNorm, numDistinctive, country]);

  /* eBay sold timeframes: fetch latest row per timeframe from card_prices (source=ebay_finding) */
  const loadSoldData = useCallback(async () => {
    if (!supabaseReady) return;
    try {
      const { data } = await supabase
        .from("card_prices")
        .select("price_market,price_median,timeframe,currency,captured_at,raw_response")
        .eq("card_id", card.id)
        .eq("source", "ebay_finding")
        .not("timeframe", "is", null)
        .order("captured_at", { ascending: false })
        .limit(30);
      // Keep only the newest row per timeframe; extract count from raw_response
      const byTf = {};
      for (const row of (data || [])) {
        if (!byTf[row.timeframe]) {
          byTf[row.timeframe] = { ...row, count: row.raw_response?.count ?? null };
        }
      }
      setSoldData(byTf);
    } catch { /* best-effort */ }
  }, [card.id]);

  /* Load user tier from profiles when authenticated */
  useEffect(() => {
    if (!isAuthed || !supabaseReady) return;
    supabase.from("profiles").select("tier").single().then(({ data }) => {
      if (data?.tier) setUserTier(data.tier.toLowerCase());
    });
  }, [isAuthed]);

  useEffect(() => { loadPrice(); loadEbay(); loadSoldData(); }, [loadPrice, loadEbay, loadSoldData]);

  /* Price formatting for sold rows (may be EUR from EBAY-IT or USD from EBAY-US) */
  const fmtSold = (val, currency) => {
    if (val == null) return "—";
    if (currency === 'EUR') {
      return cur === 'EUR' ? `€${val.toFixed(2)}` : `$${(val / eurRate).toFixed(2)}`;
    }
    return priceStr(val); // USD → priceStr handles EUR conversion
  };

  /* Tier gate: Collector and Pro see 7d + 90d data */
  const isPaid = isAuthed && (userTier === 'collector' || userTier === 'pro');

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
          {setInfo?.logo_url && <img src={setInfo.logo_url} alt={card.set_name || ''} className="set-logo-img" onError={e=>{e.currentTarget.style.display='none';}} />}
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

      {/* PRICE HISTORY CHART */}
      {snaps.length >= 3 && (
        <PriceChart snaps={snaps} priceStr={priceStr} />
      )}

      {/* eBay SOLD TIMEFRAMES — dati da Finding API (7d/30d/90d) */}
      {(soldData['7d'] || soldData['30d'] || soldData['90d']) && (
        <div className="sold-section">
          <div className="sec-h">
            <span className="sec-h-t">eBay sold · avg price</span>
            <span className="sec-h-line" />
          </div>
          <div className="sold-table">
            {/* Header */}
            <div className="sold-hdr">
              <span>Window</span><span>Avg</span><span>Median</span><span>Sales</span>
            </div>
            {/* 7d — Collector/Pro only */}
            {isPaid ? (
              soldData['7d'] ? (
                <div className="sold-row">
                  <span className="sold-label">7 days</span>
                  <span className="sold-avg">{fmtSold(soldData['7d'].price_market, soldData['7d'].currency)}</span>
                  <span className="sold-med">{fmtSold(soldData['7d'].price_median, soldData['7d'].currency)}</span>
                  <span className="sold-n">{soldData['7d'].count ?? '—'}</span>
                </div>
              ) : (
                <div className="sold-row sold-empty">
                  <span className="sold-label">7 days</span>
                  <span className="sold-avg muted">—</span>
                  <span className="sold-med muted">—</span>
                  <span className="sold-n muted">0</span>
                </div>
              )
            ) : (
              <div className="sold-row sold-locked" onClick={() => !isAuthed && onLogin?.()}>
                <span className="sold-label">7 days</span>
                <span className="sold-gate">🔒 Collector+</span>
              </div>
            )}
            {/* 30d — free for everyone */}
            {soldData['30d'] && (
              <div className="sold-row sold-featured">
                <span className="sold-label">30 days</span>
                <span className="sold-avg">{fmtSold(soldData['30d'].price_market, soldData['30d'].currency)}</span>
                <span className="sold-med">{fmtSold(soldData['30d'].price_median, soldData['30d'].currency)}</span>
                <span className="sold-n">{soldData['30d'].count ?? '—'}</span>
              </div>
            )}
            {/* 90d — Collector/Pro only */}
            {isPaid ? (
              soldData['90d'] ? (
                <div className="sold-row">
                  <span className="sold-label">90 days</span>
                  <span className="sold-avg">{fmtSold(soldData['90d'].price_market, soldData['90d'].currency)}</span>
                  <span className="sold-med">{fmtSold(soldData['90d'].price_median, soldData['90d'].currency)}</span>
                  <span className="sold-n">{soldData['90d'].count ?? '—'}</span>
                </div>
              ) : (
                <div className="sold-row sold-empty">
                  <span className="sold-label">90 days</span>
                  <span className="sold-avg muted">—</span>
                  <span className="sold-med muted">—</span>
                  <span className="sold-n muted">0</span>
                </div>
              )
            ) : (
              <div className="sold-row sold-locked" onClick={() => !isAuthed && onLogin?.()}>
                <span className="sold-label">90 days</span>
                <span className="sold-gate">🔒 Collector+</span>
              </div>
            )}
          </div>
          {!isPaid && (
            <div className="sold-upgrade">
              Upgrade to Collector for 7-day &amp; 90-day sold data
            </div>
          )}
        </div>
      )}

      {/* eBAY LIVE — nascosta se zero match */}
      {ebayItems.length > 0 && (
        <div className="ebay-live">
          <div className="sec-h">
            <span className="sec-h-t">eBay live · {cardNum}</span>
            <span className="sec-h-line" />
          </div>
          <div className="ebay-list">
            {ebayItems.map((it, i) => (
              <a key={i} className="ebay-row" href={ebayItemURL(it.url, country)} target="_blank" rel="noreferrer">
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
