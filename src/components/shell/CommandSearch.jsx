import { useEffect, useRef, useState, useCallback } from "react";
import { Icon } from "../shared/Icon.jsx";
import { searchCards, groupByCanonical } from "../../lib/search.js";
import "./shell.css";

// The universal way in. Wraps lib/search.js (searchCards + groupByCanonical) —
// no second search engine. Focus-trapped role=dialog; ⌘K / click opens it,
// Esc closes. Results grouped: sets first (fewer, higher-level), then cards.
export function CommandSearch({ open, onClose, onPickCard, onPickSet, onSeeAll }) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const inputRef = useRef(null);
  const dialogRef = useRef(null);
  const debounceRef = useRef(null);
  const reqRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => inputRef.current?.focus(), 20);
    return () => {
      document.body.style.overflow = prevOverflow;
      clearTimeout(t);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQ("");
      setRows([]);
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab") {
        const f = dialogRef.current?.querySelectorAll(
          'input,button,a[href],[tabindex]:not([tabindex="-1"])'
        );
        if (!f || !f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const run = useCallback((term) => {
    const t = term.trim();
    if (t.length < 2) {
      setRows([]);
      setLoading(false);
      return;
    }
    const req = ++reqRef.current;
    setLoading(true);
    searchCards(t)
      .then((res) => {
        if (req === reqRef.current) setRows(res || []);
      })
      .catch(() => {
        if (req === reqRef.current) setRows([]);
      })
      .finally(() => {
        if (req === reqRef.current) setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => run(q), 180);
    return () => clearTimeout(debounceRef.current);
  }, [q, run]);

  if (!open) return null;

  const cardHits = groupByCanonical(rows).slice(0, 8);
  const setHits = [];
  const seen = new Set();
  for (const c of rows) {
    if (!c.set_name) continue;
    const key = `${c.tcg}:${c.set_id || c.set_name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    setHits.push(c);
    if (setHits.length >= 4) break;
  }

  const term = q.trim();

  return (
    <div
      className="cmd-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="cmd-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Search DraGold"
        ref={dialogRef}
      >
        <div className="cmd-inputrow">
          <Icon name="search" size={20} />
          <input
            ref={inputRef}
            className="cmd-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && q.trim().length >= 2 && onSeeAll) {
                e.preventDefault();
                onSeeAll(q.trim());
              }
            }}
            placeholder="Search a card, set or illustrator…"
            aria-label="Search"
            autoComplete="off"
            enterKeyHint="search"
          />
          <button className="cmd-close" onClick={onClose} aria-label="Close search">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="cmd-results" aria-live="polite">
          {term.length < 2 ? (
            <p className="cmd-empty">
              Type at least two characters — a card name, a set, an illustrator.
            </p>
          ) : loading ? (
            <p className="cmd-empty">Searching…</p>
          ) : cardHits.length === 0 ? (
            <p className="cmd-empty">No matches for “{term}”.</p>
          ) : (
            <>
              {setHits.length > 0 && (
                <section className="cmd-group">
                  <h2 className="cmd-group-h">Sets</h2>
                  {setHits.map((c) => (
                    <button
                      key={`${c.tcg}:${c.set_id || c.set_name}`}
                      className="cmd-hit"
                      onClick={() =>
                        onPickSet({
                          tcg: c.tcg,
                          set_id: c.set_id,
                          lang: c.lang || "en",
                          set_name: c.set_name,
                        })
                      }
                    >
                      <span className="cmd-hit-kind">SET</span>
                      <span className="cmd-hit-name">{c.set_name}</span>
                      <span className="cmd-hit-meta">{(c.tcg || "").toUpperCase()}</span>
                    </button>
                  ))}
                </section>
              )}
              <section className="cmd-group">
                <h2 className="cmd-group-h">Cards</h2>
                {cardHits.map((c) => (
                  <button key={c.id} className="cmd-hit" onClick={() => onPickCard(c)}>
                    <span className="cmd-hit-kind">CARD</span>
                    <span className="cmd-hit-name">{c.name}</span>
                    <span className="cmd-hit-meta">
                      {[c.set_name, c.card_number].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                ))}
              </section>
              {onSeeAll && (
                <button className="cmd-seeall" onClick={() => onSeeAll(term)}>
                  See all results for “{term}” <kbd>↵</kbd>
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
