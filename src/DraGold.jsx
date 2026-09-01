import { useState, useEffect, useCallback, useRef } from "react";
import { flushSync } from "react-dom";
import {
  supabase,
  addToCollection, listCollection, removeFromCollection,
  createAlert, listAlerts, deleteAlert, addToWatchlist,
  getCardById,
} from "./supabase.js";
import { useAuth } from "./lib/auth.js";
import { getSavedSearch, setSavedSearch, clearSavedSearch, loadSetsMap } from "./lib/state.js";
import { Icon } from "./components/shared/Icon.jsx";
import { Onboarding, ONBOARD_KEY } from "./components/shared/Onboarding.jsx";
import { pickCardImage, getSetInfo } from "./components/shared/cardImage.js";
import { SearchResults } from "./components/search/SearchResults.jsx";
import { HotPicksSection } from "./components/search/HotPicksSection.jsx";
import { SearchView } from "./components/search/SearchView.jsx";
import { norm, rankSearchResults } from "./lib/search.js";
import { LANG_ALIASES, RARITY_TOKENS, JP_NAME_ALIASES } from "./lib/searchData.js";
import { AlertModal } from "./components/shared/AlertModal.jsx";
import { AssetView } from "./components/asset/AssetView.jsx";
import { PortfolioView } from "./pages/portfolio/PortfolioView.jsx";
import { AlertsView } from "./pages/alerts/AlertsView.jsx";
import { SetsView } from "./pages/sets/SetsView.jsx";
import { SetDetailPage } from "./pages/set/SetDetailPage.jsx";
import { ComingSoon } from "./components/shared/ComingSoon.jsx";
import { SiteHeader } from "./components/shell/SiteHeader.jsx";
import { SiteFooter } from "./components/shell/SiteFooter.jsx";
import { Preloader } from "./components/shell/Preloader.jsx";
import { CommandSearch } from "./components/shell/CommandSearch.jsx";
import { HomePage } from "./pages/home/HomePage.jsx";
import { useHomeData } from "./pages/home/useHomeData.js";

/* ════════════════════════════════════════════════════════════════════════
   DraGold — SHELL (TASK 2)
   Trade Republic / Collectr, ma gli asset sono carte TCG.
   Solo lo scheletro: nav, auth, valuta, stati vuoti. Niente logica
   ricerca/prezzo (TASK 3+). Logica legacy in DraGold.legacy.jsx.
   ════════════════════════════════════════════════════════════════════════ */

/* ─── CONFIG eBay (riusata dal legacy, serve già per le CTA oneste) ───
   Market/Purchase Discovery MVP (2026-08-25): spostata in lib/ebayLinks.js
   così anche CardPage.jsx (bundle pubblico leggero, non importa questo file)
   può riusare la stessa costruzione URL/affiliate invece di duplicarla —
   nessun cambio di comportamento qui, solo un re-export. */
export { ebayURL, ebaySearchURL, ebayItemURL } from "./lib/ebayLinks.js";

/* ─── Cataloghi di riferimento (UI) ─── */
export const TCG_LIST = [
  { id:"pokemon",   label:"Pokémon",   short:"PKM", color:"#f87171", logo:"/logos/pkm.png" },
  { id:"onepiece",  label:"One Piece", short:"OP",  color:"#f97316", logo:"/logos/op.png" },
  { id:"mtg",       label:"Magic",     short:"MTG", color:"#60a5fa", logo:"/logos/mtg.png" },
  { id:"ygo",       label:"Yu-Gi-Oh!", short:"YGO", color:"#fbbf24", logo:"/logos/ygo.png" },
];
export const CARD_LANGS = [
  { c:"en", flag:"🇺🇸", label:"EN", live:true },
  { c:"ja", flag:"🇯🇵", label:"JA", live:true },
  { c:"it", flag:"🇮🇹", label:"IT", live:true }, { c:"de", flag:"🇩🇪", label:"DE", live:true }, { c:"fr", flag:"🇫🇷", label:"FR", live:true }, { c:"es", flag:"🇪🇸", label:"ES", live:true }, { c:"pt", flag:"🇵🇹", label:"PT", live:true }, { c:"id", flag:"🇮🇩", label:"ID", live:true }, { c:"ko", flag:"🇰🇷", label:"KO", live:true }, { c:"de", flag:"🇩🇪", label:"DE", live:true }, { c:"fr", flag:"🇫🇷", label:"FR", live:true }, { c:"es", flag:"🇪🇸", label:"ES", live:true }, { c:"pt", flag:"🇵🇹", label:"PT", live:true }, { c:"id", flag:"🇮🇩", label:"ID", live:true }, { c:"ko", flag:"🇰🇷", label:"KO", live:true },
];

/* ─── Tabs primarie (nav desktop + tabbar mobile) ───
   Portfolio e Alerts non sono più destinazioni primarie (pivot DraGold verso
   catalogo/discovery/collection, PRODUCT_SPEC.md 2026-08-06): restano raggiungibili
   dal menu account (vedi PRIMARY_TABS + ACCOUNT_LINKS più sotto), non eliminate. */
const PRIMARY_TABS = [
  { id:"search", label:"Search", icon:"search" },
  { id:"explore", label:"Explore", icon:"grid" },
];
const ACCOUNT_LINKS = [
  { id:"portfolio", label:"Portfolio", icon:"wallet" },
  { id:"alerts",    label:"Alerts",    icon:"bell" },
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

/* ─── Empty state riusabile — esportato: riusato da PortfolioView/AlertsView estratti ─── */
export function Empty({ icon, title, sub, cta, onCta }) {
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
   APP
   ════════════════════════════════════════════════════════════════════════ */
export default function DraGold() {
  // Auth/Profile/Username feature — central state from lib/auth.js
  // (AuthProvider, mounted in main.jsx) instead of a local getSession/onAuth
  // subscription. "Sign in"/"Create account" now navigate to /login /register
  // (standalone pages) rather than opening an in-page magic-link modal.
  const { session, status: authStatus, profile, signOut: authSignOut } = useAuth();
  const authReady = authStatus !== "loading";
  const [menuOpen, setMenuOpen] = useState(false);

  // Atlas redesign — shell orchestration. searchOpen drives the CommandSearch
  // overlay; homeView switches the search tab between the Atlas home and the
  // existing SearchView results list.
  const [searchOpen, setSearchOpen] = useState(false);
  const [homeView, setHomeView] = useState("atlas"); // "atlas" | "results"
  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  const [tab, setTab]   = useState("search");
  const [asset, setAsset] = useState(null);      // carta aperta (Asset page) o null
  const [viewSet, setViewSet] = useState(null);  // {tcg,set_id,lang,set_name} aperto da Card Detail, o null
  const [cur, setCur]   = useState("EUR");       // EUR | USD
  const [country, setCountry] = useState("IT");
  const [eurRate, setEurRate] = useState(0.92);  // 1 USD = X EUR
  const [setsMap, setSetsMap] = useState(null);  // Map<tcg:code, setInfo>

  /* ── carica sets (loghi) ── */
  useEffect(() => { loadSetsMap().then(setSetsMap).catch(() => {}); }, []);

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
  const displayName = profile?.username || profile?.display_name || (userEmail ? userEmail.split("@")[0] : "");
  const avatarInitial = (displayName || userEmail || "U").slice(0,1).toUpperCase();

  // Atlas home data — one read-only query composition, shared by HomePage and
  // the footer's real world counts.
  const home = useHomeData({ isAuthed });

  const signOut = useCallback(async () => {
    await authSignOut();
    setMenuOpen(false);
  }, [authSignOut]);

  const requireAuth = useCallback((fn) => {
    if (isAuthed) fn?.();
    else window.location.href = "/login";
  }, [isAuthed]);

  // "Card turn" — native View Transitions API (feature-detected, zero deps).
  // The DOM mutation must happen synchronously inside the transition callback
  // for the browser to capture correct before/after snapshots, hence flushSync;
  // on unsupported browsers this just runs the update directly, same as before.
  //
  // Alpha Core P1.2 fix (Preview E2E): 2-3 rapid clicks on Home hot-pick cards
  // reproducibly froze the page — a semi-transparent overlay stayed on top of
  // everything and NOTHING was clickable until a full reload. Root cause:
  // each click called startViewTransition() again before the PREVIOUS
  // transition had finished. The spec allows overlapping calls (the older
  // one is supposed to be "skipped"), but Chrome's own view-transition
  // pseudo-element tree (::view-transition, with pointer-events covering the
  // whole viewport while active) does not always tear down cleanly when a
  // transition is superseded rather than explicitly skipped — the stray
  // pseudo-element is what was visually dimming the page AND eating clicks.
  // activeTransitionRef tracks the in-flight transition and calls its own
  // skipTransition() before starting a new one, so the browser always closes
  // the previous transition's overlay through the API's own intended exit
  // path instead of leaving it to be silently superseded.
  const activeTransitionRef = useRef(null);
  const withViewTransition = useCallback((update) => {
    if (typeof document.startViewTransition === "function" &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
        !document.hidden) {
      if (activeTransitionRef.current) {
        try { activeTransitionRef.current.skipTransition(); } catch { /* already done */ }
        activeTransitionRef.current = null;
      }
      // The spec aborts a transition (rejecting .ready/.finished) if the
      // document loses visibility mid-flight (tab-switch, alt-tab) — the
      // state change itself already happened via flushSync regardless, so
      // this is purely cosmetic; swallow it instead of an unhandled
      // rejection in the console.
      const vt = document.startViewTransition(() => flushSync(update));
      activeTransitionRef.current = vt;
      const clearIfCurrent = () => { if (activeTransitionRef.current === vt) activeTransitionRef.current = null; };
      vt.finished?.then(clearIfCurrent, clearIfCurrent);
    } else {
      update();
    }
  }, []);

  // ── Deep-link temporaneo /card/{id} (TASK: Block 1 — user journey MVP) ──
  // NON è l'url SEO canonico (quello resta /carta/{slug}, vedi CardPage.jsx):
  // qui serve solo a rendere condivisibile/back-navigabile la vista interattiva
  // (AssetView) aperta dentro la SPA, usando cards.id (sempre presente) invece
  // dello slug canonico (copertura oggi parziale, vedi canonical_cards). Nessuna
  // nuova libreria: solo History API nativa. Nessun canonical tag/JSON-LD qui.
  const clearAssetUrl = useCallback(() => {
    if (window.location.pathname.startsWith("/card/")) {
      window.history.pushState({}, "", "/");
    }
  }, []);

  const openAsset = useCallback((card) => {
    withViewTransition(() => setAsset(card));
    window.scrollTo({ top: 0, behavior: "auto" });
    if (card?.id) {
      const path = `/card/${encodeURIComponent(card.id)}`;
      if (window.location.pathname !== path) window.history.pushState({ dgAssetId: card.id }, "", path);
    }
  }, [withViewTransition]);
  const closeAsset = useCallback(() => {
    withViewTransition(() => setAsset(null));
    clearAssetUrl();
  }, [withViewTransition, clearAssetUrl]);

  const openSet = useCallback((ref) => {
    withViewTransition(() => { setViewSet(ref); setAsset(null); });
    window.scrollTo({ top: 0, behavior: "auto" });
    clearAssetUrl();
  }, [withViewTransition, clearAssetUrl]);
  const closeSet = useCallback(() => withViewTransition(() => setViewSet(null)), [withViewTransition]);

  // Load iniziale: se l'utente arriva direttamente su /card/{id} (link condiviso,
  // refresh), risolve la carta e apre AssetView dentro la shell normale (header/nav
  // inclusi — a differenza di /carta/{slug} che è una pagina standalone separata).
  // Se l'id non esiste più, torna silenziosamente alla home (nessun errore bloccante).
  useEffect(() => {
    const m = window.location.pathname.match(/^\/card\/([^/]+)\/?$/);
    if (!m) return;
    const id = decodeURIComponent(m[1]);
    getCardById(id).then((card) => {
      if (card) setAsset(card);
      else window.history.replaceState({}, "", "/");
    }).catch(() => window.history.replaceState({}, "", "/"));
  }, []);

  // Back/forward: riflette l'url corrente nello stato React senza fare push
  // (evita loop con openAsset/closeAsset sopra).
  useEffect(() => {
    const onPopState = () => {
      const m = window.location.pathname.match(/^\/card\/([^/]+)\/?$/);
      if (m) {
        const id = decodeURIComponent(m[1]);
        setAsset((cur) => {
          if (cur?.id === id) return cur;
          getCardById(id).then((card) => { if (card) withViewTransition(() => setAsset(card)); });
          return cur;
        });
      } else {
        withViewTransition(() => setAsset(null));
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [withViewTransition]);

  // Naviga a un tab primario/account chiudendo asset e set aperti — centralizza
  // i punti che prima facevano setAsset(null)/setViewSet(null)/setTab(...) a mano,
  // così l'url /card/{id} viene sempre ripulito insieme allo stato (Block 1).
  const goTab = useCallback((id) => {
    setAsset(null); setViewSet(null); setTab(id);
    clearAssetUrl();
  }, [clearAssetUrl]);

  /* ── formattatore valuta (i prezzi DB sono in USD) ── */
  const fmt = useCallback((usd) => {
    if (usd == null || isNaN(usd)) return "—";
    return cur === "EUR" ? `€${(usd*eurRate).toFixed(2)}` : `$${Number(usd).toFixed(2)}`;
  }, [cur, eurRate]);

  return (
    <div className="app">
      <Preloader />
      <CommandSearch
        open={searchOpen}
        onClose={closeSearch}
        onPickCard={(card)=>{ closeSearch(); openAsset(card); }}
        onPickSet={(ref)=>{ closeSearch(); openSet(ref); }}
        onSeeAll={(q)=>{ setSavedSearch({ q, searched: false }); setHomeView("results"); goTab("search"); closeSearch(); }}
      />
      {/* ░░ HEADER ░░ — Atlas shell (src/components/shell/SiteHeader.jsx) */}
      <SiteHeader
        authReady={authReady}
        isAuthed={isAuthed}
        displayName={displayName || userEmail}
        avatarInitial={avatarInitial}
        menuOpen={menuOpen}
        onToggleMenu={()=>setMenuOpen(o=>!o)}
        onSignOut={signOut}
        cur={cur}
        onSetCur={setCur}
        onOpenSearch={openSearch}
        onNav={(dest)=>{
          setMenuOpen(false);
          if (dest==="academy") { window.location.href="/academy"; return; }
          if (dest==="collection") { goTab("portfolio"); return; }
          if (dest==="alerts") { goTab("alerts"); return; }
          goTab("explore");
        }}
        onHome={()=>{ setHomeView("atlas"); goTab("search"); }}
      />

      {/* ░░ MAIN ░░ */}
      {asset ? (
        <main className="main">
          <AssetView
            card={asset} onBack={closeAsset}
            isAuthed={isAuthed} onLogin={()=>{ window.location.href="/login"; }}
            country={country} cur={cur} eurRate={eurRate} setsMap={setsMap}
            onOpenCard={openAsset} onOpenSet={openSet}
          />
        </main>
      ) : viewSet ? (
        <main className="main">
          <SetDetailPage
            setRef={viewSet} setsMap={setsMap}
            country={country} cur={cur} eurRate={eurRate}
            onOpen={openAsset} onBack={closeSet}
            isAuthed={isAuthed}
          />
        </main>
      ) : tab==="search" && homeView==="atlas" ? (
        <main className="main-wide">
          <HomePage
            home={home}
            onOpenSearch={openSearch}
            onOpenCard={openAsset}
            onOpenSet={openSet}
            onNavCollection={()=>goTab("portfolio")}
          />
        </main>
      ) : (
        <main className="main">
          {tab==="search" && homeView==="results" && (
            <SearchView
              country={country} cur={cur} eurRate={eurRate}
              onOpenAsset={openAsset} setsMap={setsMap} onOpenSet={openSet}
              initialSearchState={getSavedSearch()}
              onSearchStateChange={setSavedSearch}
              onSearchStateClear={()=>{ clearSavedSearch(); setHomeView("atlas"); }}
              onOpenExplore={()=>goTab("explore")}
              isAuthed={isAuthed}
            />
          )}
          {tab==="explore" && (
            <SetsView setsMap={setsMap} onOpenSet={openSet} />
          )}
          {tab==="portfolio" && (
            <PortfolioView isAuthed={isAuthed} onLogin={()=>{ window.location.href="/login"; }} onExplore={()=>goTab("search")} cur={cur} eurRate={eurRate} onOpenCard={openAsset} />
          )}
          {tab==="alerts" && (
            <AlertsView isAuthed={isAuthed} onLogin={()=>{ window.location.href="/login"; }} onExplore={()=>goTab("search")}
              cur={cur} eurRate={eurRate} country={country} />
          )}
        </main>
      )}

      {/* Stratum 7 / shared footer — the atlas index */}
      {!asset && !viewSet && (
        <SiteFooter
          worldCounts={home.worldCounts}
          onNavCollection={()=>goTab("portfolio")}
        />
      )}

      {/* ░░ BOTTOM TAB (mobile) ░░ */}
      <nav className="tabbar">
        {PRIMARY_TABS.map(t => (
          <button key={t.id} className={`tab-i ${tab===t.id?"on":""}`} onClick={()=>goTab(t.id)}>
            <Icon name={t.icon} size={22} stroke={tab===t.id?2.4:2} />
            <span>{t.label}</span>
          </button>
        ))}
        <a className="tab-i" href="/academy">
          <Icon name="spark" size={22} stroke={2} />
          <span>Academy</span>
        </a>
      </nav>

    </div>
  );
}


/* Portfolio (Portfolio 2.0, Aug 2026) e Alerts e i loro sotto-componenti
   sono stati estratti in src/pages/portfolio/PortfolioView.jsx e
   src/pages/alerts/AlertsView.jsx (CLAUDE.md §5, modularizzazione). */

/* ════════════════════════════════════════════════════════════════════════
   ASSET — dettaglio carta (TASK 4)
   ════════════════════════════════════════════════════════════════════════ */
export const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"];

// market code accettato da /api/ebay-search; fallback US.
// Alpha Core P0.2 fix: esportata perche' AssetView.jsx (estratto in un file
// proprio) la referenzia senza importarla - ReferenceError silenziosamente
// catturato dal try/catch di loadEbay(), quindi eBay Live non partiva mai
// (nessuna richiesta di rete, nessun errore visibile). CardPage.jsx non e'
// toccato dal bug perche' non usa questa costante (market fisso a 'US').
export const EBAY_MARKETS = ["US","GB","DE","IT","FR","ES","CA"];
