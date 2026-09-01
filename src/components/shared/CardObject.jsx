import { useState } from "react";
import { pickCardImage } from "./cardImage.js";
import { useTilt } from "../../lib/useTilt.js";

// Holographic card treatment (poke-holo technique via useTilt.js): the plate
// rotates toward the pointer, a moving foil (.card-object-shine, per-rarity)
// and a radial glare (.card-object-sheen) track the cursor, strongest at the
// edges. Two variants: `grid` (subtler, tiles/rails) and `hero` (full, Card
// Detail). Every card on the site renders through here.
const VARIANT_TILT = {
  grid: { max: 5 },
  hero: { max: 9 },
};

// rarity string → holo profile (drives the .card-object[data-holo] gradient)
function holoProfile(rarity = "") {
  const r = String(rarity).toLowerCase();
  if (/gold|metal|secret|rainbow|hyper/.test(r)) return "gold";
  if (/special illustration|cosmos|galaxy|amazing|shiny|radiant/.test(r)) return "cosmos";
  if (/holo|illustration rare|\bex\b|\bgx\b|\bv\b|vmax|vstar|full art|alt|ultra|prism|star/.test(r))
    return "holo";
  return "flat";
}

export function CardObject({ card, src, alt, variant = "grid", owned = false, fallback = null }) {
  const [imgFailed, setImgFailed] = useState(false);
  const resolvedSrc = src ?? pickCardImage(card);
  const { plateRef, onPointerMove, onPointerLeave } = useTilt(
    VARIANT_TILT[variant] || VARIANT_TILT.grid
  );

  if (!resolvedSrc || imgFailed) return fallback;

  const holo = holoProfile(card?.rarity);

  return (
    <div
      className={`card-object card-object-${variant}${owned ? " card-object-owned" : ""}`}
      data-holo={holo}
    >
      <div
        ref={plateRef}
        className="card-object-plate"
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      >
        <img src={resolvedSrc} alt={alt} onError={() => setImgFailed(true)} />
        <span className="card-object-shine" aria-hidden="true" />
        <span className="card-object-sheen" aria-hidden="true" />
        {owned && <span className="card-object-foil" aria-hidden="true" />}
      </div>
    </div>
  );
}
