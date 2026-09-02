// DraGold — Portfolio Core (Fase 3)
// Le carte non ancora valutate, raggruppate per motivo. Copy costruttivo,
// nessun rosso: non è un errore, è copertura che si espande.

import { groupUnvalued } from '../../lib/portfolio/unavailableReason.js';
import { pickCardImage } from '../../components/shared/cardImage.js';

function Thumb({ pos }) {
  const url = pos ? pickCardImage(pos) : null;
  return (
    <div className="pf-uv-thumb">
      {url ? <img src={url} alt="" loading="lazy" /> : <span className="pf-uv-thumb-ph">?</span>}
    </div>
  );
}

export function UnvaluedSection({ unvalued = [], positionsByCardId = {}, anchorRef }) {
  const groups = groupUnvalued(unvalued);
  if (!groups.length) return null;
  const total = groups.reduce((s, g) => s + g.cardIds.length, 0);

  return (
    <div className="pf-section pf-uv" ref={anchorRef}>
      <div className="pf-section-h"><span className="pf-section-t">Not yet valued ({total})</span></div>
      {groups.map((g) => (
        <div key={g.reason} className="pf-uv-group">
          <div className="pf-uv-group-h">
            <span className="pf-uv-group-t">{g.title} · {g.cardIds.length}</span>
            <span className="pf-uv-group-x">{g.text}</span>
          </div>
          <div className="pf-uv-thumbs">
            {g.cardIds.slice(0, 8).map((id) => <Thumb key={id} pos={positionsByCardId[id]} />)}
            {g.cardIds.length > 8 && <div className="pf-uv-more">+{g.cardIds.length - 8}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

export default UnvaluedSection;
