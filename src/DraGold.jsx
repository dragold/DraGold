import { useState, useEffect, useCallback } from "react";
import {
  supabase, supabaseReady,
  sendMagicLink, getSession, onAuth, signOut as sbSignOut,
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
const EBAY_CATS = { pokemon:"183454", mtg:"183448", ygo:"183468", op:"183454" };
export function ebayURL(name, setName="", country="US", tcg="pokemon", cardNumber="") {
  const site = EBAY_SITES[country] || EBAY_SITES.US;
  const loc = EU_CC.includes(country) ? "&LH_PrefLoc=1" : "";
  const suffix = tcg==="mtg" ? "magic the gathering card"
    : tcg==="ygo" ? "yugioh card"
    : tcg==="op" ? "one piece card game" : "pokemon card";
  const q = `${name} ${cardNumber||""} ${setName||""} ${suffix}`.replace(/\s+/g," ").trim();
  const cat = EBAY_CATS[tcg] ? `&_sacat=${EBAY_CATS[tcg]}` : "";
  return `https://www.${site.domain}/sch/i.html?_nkw=${encodeURIComponent(q)}&_sop=12&LH_BIN=1${cat}&mkcid=1&mkrid=${site.mkrid}&siteid=${site.siteid}&campid=${EBAY_CAMP}&toolid=10001&mkevt=1${loc}`;
}

/* ─── Cataloghi di riferimento (UI) ─── */
const TCG_LIST = [
  { id:"pokemon", label:"Pokémon",   short:"PKM", color:"#f87171" },
  { id:"op",      label:"One Piece", short:"OP",  color:"#f97316" },
  { id:"mtg",     label:"Magic",     short:"MTG", color:"#60a5fa" },
  { id:"ygo",     label:"Yu-Gi-Oh!", short:"YGO", color:"#fbbf24" },
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
  { id:"blog",      label:"Blog",      icon:"doc",     desc:"Guide, analisi di mercato, novità." },
  { id:"community", label:"Community", icon:"users",   desc:"Condividi e confronta le tue carte." },
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
    if (error) { setStatus("error"); setMsg(error.message || "Invio non riuscito, riprova."); }
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
            <h3>Controlla la tua email</h3>
            <p>Abbiamo inviato un link di accesso a <b>{email}</b>. Aprilo da questo dispositivo per entrare.</p>
            <button className="btn btn-ghost" onClick={onClose}>Ho capito</button>
          </div>
        ) : (
          <form onSubmit={submit} className="auth-form">
            <h3>Accedi o registrati</h3>
            <p className="auth-p">Nessuna password. Ti mandiamo un link magico via email.</p>
            <input
              type="email" inputMode="email" autoComplete="email" required
              placeholder="tu@email.com" value={email}
              onChange={e=>setEmail(e.target.value)} className="input"
            />
            {status==="error" && <div className="auth-err">{msg}</div>}
            <button type="submit" className="btn btn-primary btn-block" disabled={status==="sending"}>
              {status==="sending" ? "Invio…" : "Invia link di accesso"}
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
                        <Icon name="logout" size={16}/> Esci
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={()=>setAuthOpen(true)}>Accedi</button>
            )}
          </div>
        </div>
      </header>

      {/* ░░ MAIN ░░ */}
      <main className="main">
        {tab==="markets" && (
          <MarketsView
            tcgFilter={tcgFilter} setTcgFilter={setTcgFilter}
            langFilter={langFilter} setLangFilter={setLangFilter}
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
            <span className="sec-h-t">In arrivo</span>
            <span className="sec-h-line" />
          </div>
          <div className="up-grid">
            {UPCOMING.map(u => (
              <div key={u.id} className="up-card" aria-disabled="true">
                <div className="up-top">
                  <span className="up-ic"><Icon name={u.icon} size={18}/></span>
                  <span className="badge-soon">Presto</span>
                </div>
                <div className="up-label">{u.label}</div>
                <div className="up-desc">{u.desc}</div>
              </div>
            ))}
          </div>
        </section>

        <footer className="foot">
          <span className="font-syne foot-logo">DraGold</span>
          <span className="foot-sub">Fair Market Value per collezionisti TCG seri.</span>
          <div className="foot-links">
            <a href="mailto:hello@dragold.org">Contatti</a>
            <span>·</span>
            <a href="https://buymeacoffee.com/dragold" target="_blank" rel="noreferrer">Offrici un caffè</a>
          </div>
        </footer>
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

/* ════════════════════════════════════════════════════════════════════════
   MARKETS — ricerca (placeholder shell) + hot picks + watchlist
   ════════════════════════════════════════════════════════════════════════ */
function MarketsView({ tcgFilter, setTcgFilter, langFilter, setLangFilter }) {
  const [q, setQ] = useState("");

  const onSubmit = (e) => {
    e.preventDefault();
    /* TASK 3: qui partirà la ricerca su `cards`. Per ora shell. */
  };

  return (
    <section className="view">
      <div className="hero">
        <h1 className="hero-t">Cerca una carta.<br/>Vedi il suo valore reale.</h1>
        <p className="hero-s">Un prezzo equo su Pokémon, One Piece, Magic e Yu-Gi-Oh!. Tracciala come un asset.</p>
      </div>

      <form className="search" onSubmit={onSubmit}>
        <span className="search-ic"><Icon name="search" size={20}/></span>
        <input
          className="search-in"
          placeholder="Cerca una carta… (es. Charizard, Monkey D Luffy)"
          value={q} onChange={e=>setQ(e.target.value)}
          enterKeyHint="search" autoComplete="off"
        />
        <button type="submit" className="search-go">Cerca</button>
      </form>

      <div className="filters">
        <div className="chip-row">
          <button className={`chip ${!tcgFilter?"on":""}`} onClick={()=>setTcgFilter(null)}>Tutti</button>
          {TCG_LIST.map(t => (
            <button key={t.id} className={`chip ${tcgFilter===t.id?"on":""}`}
              onClick={()=>setTcgFilter(tcgFilter===t.id?null:t.id)}
              style={tcgFilter===t.id?{borderColor:t.color,color:t.color}:{}}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="chip-row">
          <button className={`chip sm ${!langFilter?"on":""}`} onClick={()=>setLangFilter(null)}>Tutte</button>
          {CARD_LANGS.map(l => (
            <button key={l.c} className={`chip sm ${langFilter===l.c?"on":""}`}
              onClick={()=>setLangFilter(langFilter===l.c?null:l.c)}>
              {l.flag} {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stato vuoto / hot picks placeholder (logica in TASK 3) */}
      <div className="sec-h">
        <span className="sec-h-t"><Icon name="spark" size={14}/> Hot picks</span>
        <span className="sec-h-line" />
      </div>
      <div className="skel-grid" aria-hidden="true">
        {Array.from({length:6}).map((_,i)=>(
          <div key={i} className="skel-card">
            <div className="skel-img" />
            <div className="skel-line w70" />
            <div className="skel-line w40" />
          </div>
        ))}
      </div>
      <p className="hint-center">Le carte più cercate appariranno qui a breve. Inizia cercando una carta.</p>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   PORTFOLIO
   ════════════════════════════════════════════════════════════════════════ */
function PortfolioView({ isAuthed, onLogin, onExplore }) {
  return (
    <section className="view">
      <div className="view-h">
        <h2 className="view-t">Portfolio</h2>
      </div>
      {!isAuthed ? (
        <Empty icon="wallet"
          title="Accedi per salvare il tuo portfolio"
          sub="Aggiungi le carte che possiedi e segui valore e P&L nel tempo."
          cta="Accedi" onCta={onLogin} />
      ) : (
        <Empty icon="wallet"
          title="Il tuo portfolio è vuoto"
          sub="Cerca una carta e aggiungila per seguirne valore e guadagno."
          cta="Cerca una carta" onCta={onExplore} />
      )}
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   ALERTS
   ════════════════════════════════════════════════════════════════════════ */
function AlertsView({ isAuthed, onLogin, onExplore }) {
  return (
    <section className="view">
      <div className="view-h">
        <h2 className="view-t">Alerts</h2>
      </div>
      {!isAuthed ? (
        <Empty icon="bell"
          title="Accedi per creare alert"
          sub="Ricevi un'email quando una carta supera o scende sotto la tua soglia."
          cta="Accedi" onCta={onLogin} />
      ) : (
        <Empty icon="bell"
          title="Nessun alert"
          sub="Crea il tuo primo alert da una carta: scegli soglia e direzione."
          cta="Cerca una carta" onCta={onExplore} />
      )}
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   CSS — dark fintech (Trade Republic), mobile-first
   ════════════════════════════════════════════════════════════════════════ */
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

/* ── header ── */
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

/* ── main ── */
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

/* ── bottom tab (mobile) ── */
.tabbar{position:fixed;bottom:0;left:0;right:0;z-index:40;display:flex;background:rgba(11,11,24,.92);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border-top:1px solid var(--border);padding-bottom:env(safe-area-inset-bottom);}
.tab-i{flex:1;height:var(--tabh);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:var(--dim);font-size:11px;font-weight:600;transition:.15s;}
.tab-i.on{color:var(--gold);}

/* ── modal ── */
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

/* ── desktop ── */
@media(min-width:760px){
  :root{--tabh:0px;}
  .topnav{display:flex;}
  .tabbar{display:none;}
  .main{padding:26px var(--p) 60px;}
  .skel-grid{grid-template-columns:repeat(4,1fr);}
  .up-grid{grid-template-columns:repeat(3,1fr);}
  .modal-backdrop{align-items:center;padding:20px;}
  .modal{border-radius:22px;}
}
`;
