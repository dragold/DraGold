import { useTilt } from "../../lib/useTilt.js";
import { pickCardImage } from "../../components/shared/cardImage.js";
import "./home.css";

// The object the whole home descends through. Layered planes (art / frame /
// holo) so a later phase can delaminate them; for now a tiltable card with
// real depth — the only object on the page with a shadow. `layer` is a data
// attribute the Phase 3 scroll timeline will read.
export function CardSpecimen({ card, layer = "rest", caption }) {
  const { plateRef, onPointerMove, onPointerLeave } = useTilt({ max: 7 });
  const src = card ? pickCardImage(card) : null;

  return (
    <figure className="specimen" data-layer={layer}>
      <div
        className="specimen-plate"
        ref={plateRef}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      >
        {src ? (
          <>
            <img
              className="specimen-art"
              src={src}
              alt={card?.name ? `${card.name} — card artwork` : ""}
              draggable="false"
            />
            <span className="specimen-frame" aria-hidden="true" />
            <span className="specimen-holo" aria-hidden="true" />
          </>
        ) : (
          <span className="specimen-ph" aria-hidden="true" />
        )}
      </div>
      <span className="specimen-shadow" aria-hidden="true" />
      {caption && <figcaption className="specimen-caption">{caption}</figcaption>}
    </figure>
  );
}
