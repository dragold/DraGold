import { useEffect, useRef, useState } from "react";
import { Icon } from "../shared/Icon.jsx";
import "./shell.css";

const NAV = [
  { dest: "explore", label: "Explore" },
  { dest: "academy", label: "Academy" },
  { dest: "collection", label: "Collection" },
];

// Magnetic hover — ≤5px pull toward the cursor. Ref-mutation only, no state,
// off the render path. Disabled on coarse pointers / reduced-motion (guarded
// by the caller — these handlers are simply not attached).
function magnetize(e) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
  const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
  el.style.transform = `translate(${dx * 5}px, ${dy * 4}px)`;
}
function demagnetize(e) {
  e.currentTarget.style.transform = "";
}

export function SiteHeader({
  authReady,
  isAuthed,
  displayName,
  avatarInitial,
  menuOpen,
  onToggleMenu,
  onSignOut,
  cur,
  onSetCur,
  onOpenSearch,
  onNav,
  onHome,
}) {
  const [condensed, setCondensed] = useState(false);
  const reduce = useRef(
    typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
  const coarse = useRef(
    typeof window !== "undefined" &&
      window.matchMedia?.("(pointer: coarse)").matches
  );
  const magnetic = !reduce.current && !coarse.current;

  useEffect(() => {
    const onScroll = () => setCondensed(window.scrollY > 320);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpenSearch]);

  return (
    <header className={`site-header${condensed ? " is-condensed" : ""}`}>
      <div className="shell-wrap site-header-in">
        <button className="site-wordmark" onClick={onHome} aria-label="DraGold — home">
                  <img src="/logo192.png" alt="DraGold" width="26" height="26" />
          <span className="font-syne">DraGold</span>
        </button>

        <nav className="site-nav" aria-label="Primary">
          {NAV.map((n) => (
            <button
              key={n.dest}
              className="site-nav-i"
              onClick={() => onNav(n.dest)}
              onPointerMove={magnetic ? magnetize : undefined}
              onPointerLeave={magnetic ? demagnetize : undefined}
            >
              {n.label}
            </button>
          ))}
        </nav>

        <button
          className="site-search-trigger"
          onClick={onOpenSearch}
          aria-label="Search cards, sets and illustrators"
        >
          <Icon name="search" size={16} />
          <span className="site-search-hint">Search</span>
          <kbd>⌘K</kbd>
        </button>

        <div className="site-header-right">
          <div className="cur-sel" role="group" aria-label="Currency">
            {["EUR", "USD"].map((c) => (
              <button key={c} className={`cur-b ${cur === c ? "on" : ""}`} onClick={() => onSetCur(c)}>
                {c}
              </button>
            ))}
          </div>

          {!authReady ? (
            <div className="auth-skel" />
          ) : isAuthed ? (
            <div className="usermenu">
              <button
                className="avatar"
                onClick={onToggleMenu}
                aria-label="Account"
                aria-expanded={menuOpen}
              >
                {avatarInitial}
              </button>
              {menuOpen && (
                <>
                  <div className="menu-scrim" onClick={onToggleMenu} />
                  <div className="menu">
                    <div className="menu-email">{displayName}</div>
                    <a className="menu-i" href="/account">
                      <Icon name="card" size={16} /> Account
                    </a>
                    <button className="menu-i" onClick={() => onNav("collection")}>
                      <Icon name="wallet" size={16} /> Collection
                    </button>
                    <button className="menu-i" onClick={() => onNav("alerts")}>
                      <Icon name="bell" size={16} /> Alerts
                    </button>
                    <button className="menu-i" onClick={onSignOut}>
                      <Icon name="logout" size={16} /> Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="site-auth-cta">
                <a className="btn btn-ghost btn-sm" href="/login">Sign in</a>
                <a className="btn btn-primary btn-sm" href="/register">Create account</a>
              </div>
              <a className="site-auth-compact" href="/login">Sign in</a>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
