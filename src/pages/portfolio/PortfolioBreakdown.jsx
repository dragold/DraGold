// DraGold — Portfolio Core (Fase 3)
// Breakdown del valore tracciato per TCG / Set / Lingua.

import { useState } from 'react';

const TABS = [
  { key: 'tcg', label: 'By TCG' },
  { key: 'set', label: 'By Set' },
  { key: 'lang', label: 'By Language' },
];

function labelTcg(id) {
  return ({ pokemon: 'Pokémon', onepiece: 'One Piece', mtg: 'Magic', ygo: 'Yu-Gi-Oh!' })[id] || id;
}

export function PortfolioBreakdown({ byTcg = [], bySet = [], byLang = [], fmtEur }) {
  const [tab, setTab] = useState('tcg');
  const rows = tab === 'tcg'
    ? byTcg.map((r) => ({ name: labelTcg(r.tcg), ...r }))
    : tab === 'set'
      ? bySet.map((r) => ({ name: r.set, ...r }))
      : byLang.map((r) => ({ name: r.lang, ...r }));

  if (!rows.length) return null;
  const shown = tab === 'set' ? rows.slice(0, 12) : rows;
  const more = tab === 'set' ? rows.length - shown.length : 0;

  return (
    <div className="pf-section">
      <div className="pf-section-h"><span className="pf-section-t">Breakdown</span>
        <div className="pf-bd-tabs">
          {TABS.map((t) => (
            <button key={t.key} type="button"
              className={`pf-bd-tab ${tab === t.key ? 'on' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>
      </div>
      <div className="pf-bd-list">
        {shown.map((r) => (
          <div key={r.name} className="pf-bd-row">
            <span className="pf-bd-name">{r.name}</span>
            <span className="pf-bd-bar"><span className="pf-bd-fill" style={{ width: `${Math.max(2, r.pct)}%` }} /></span>
            <span className="pf-bd-pct">{r.pct.toFixed(0)}%</span>
            <span className="pf-bd-val">{fmtEur(r.valueEur)}</span>
            <span className="pf-bd-count">{r.count}</span>
          </div>
        ))}
        {more > 0 && <div className="pf-bd-more">…and {more} more set{more === 1 ? '' : 's'}</div>}
      </div>
    </div>
  );
}

export default PortfolioBreakdown;
