import { useState } from "react";
import { pickCardImage } from "./cardImage.js";
import { useTilt } from "../../lib/useTilt.js";

// Card treatment from the DraGold Visual North Star: pointer-tracked tilt +
// sheen on a "plate" child (frame/shadow stay put, only the plate rotates),
// plus an optional foil-scan for owned cards. Two variants: `grid` (subtler,
// used in tiles/rails) and `hero` (full tilt, used in Card Detail).
const VARIANT_TILT = {
  grid: { max: 4 },
  hero: { max: 7 },
};

export function CardObject({ card, src, alt, variant = "grid", owned = false, fallback = null }) {
  const [imgFailed, setImgFailed] = useState(false);
  const resolvedSrc = src ?? pickCardImage(card);
  const { plateRef, onPointerMove, onPointerLeave } = useTilt(VARIANT_TILT[variant] || VARIANT_TILT.grid);

  if (!resolvedSrc || imgFailed) return fallback;

  return (
    <div className={`card-object card-object-${variant}${owned ? " card-object-owned" : ""}`}>
      <div
        ref={plateRef}
        className="card-object-plate"
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      >
        <img src={resolvedSrc} alt={alt} onError={() => setImgFailed(true)} />
        <span className="card-object-sheen" aria-hidden="true" />
        {owned && <span className="card-object-foil" aria-hidden="true" />}
      </div>
    </div>
  );
}
