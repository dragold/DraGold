// DraGold — Portfolio Core (Fase 3)
// Insight brevi e descrittive (mai consigli). Vuoto -> non renderizza.

import { Icon } from '../../components/shared/Icon.jsx';

const ICON = {
  concentration: 'trend-up', top1: 'trophy', top_set: 'grid',
  single_tcg: 'card', mover: 'trend-up', unvalued: 'doc',
};

export function CollectionIntelligence({ insights = [] }) {
  if (!insights.length) return null;
  return (
    <div className="pf-section">
      <div className="pf-section-h"><span className="pf-section-t"><Icon name="spark" size={14} />Collection Intelligence</span></div>
      <ul className="pf-ci-list">
        {insights.slice(0, 5).map((i, idx) => (
          <li key={idx} className="pf-ci-row">
            <Icon name={ICON[i.kind] || 'info'} size={14} />
            <span>{i.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default CollectionIntelligence;
