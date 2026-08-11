// DraGold — Alerts (estratto da DraGold.jsx, CLAUDE.md §5 modularizzazione).
// Logica invariata: stessa UI, stessi dati, stesse chiamate. Solo spostamento di file.
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase, supabaseReady, listAlerts, deleteAlert } from "../../supabase.js";
import { Icon } from "../../components/shared/Icon.jsx";
import { pickCardImage } from "../../components/shared/cardImage.js";
import { AlertModal } from "../../components/shared/AlertModal.jsx";
import { LANG_ALIASES, RARITY_TOKENS } from "../../lib/searchData.js";
import { TCG_LIST, CARD_LANGS, Empty } from "../../DraGold.jsx";

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
export function AlertsView({ isAuthed, onLogin, onExplore, cur, eurRate, country }) {
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
