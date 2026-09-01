import { forwardRef, useImperativeHandle, useRef } from "react";
import { useTilt } from "../../lib/useTilt.js";
import { pickCardImage } from "../../components/shared/cardImage.js";
import "./home.css";

// The object the whole home descends through. Real depth: art / frame / holo /
// back as separate 3D planes on a preserve-3d plate, so the scroll timeline
// can delaminate them. Pointer tilt when idle (useTilt). Exposes its layer
// nodes via ref so useAtlasChoreography can drive them.
export const CardSpecimen = forwardRef(function CardSpecimen(
  { card, caption },
  ref
) {
  const { plateRef, onPointerMove, onPointerLeave } = useTilt({ max: 8 });
  const rootRef = useRef(null);
  const artRef = useRef(null);
  const frameRef = useRef(null);
  const holoRef = useRef(null);
  const backRef = useRef(null);
  const src = card ? pickCardImage(card) : null;

  useImperativeHandle(ref, () => ({
    root: rootRef.current,
    plate: plateRef.current,
    art: artRef.current,
    frame: frameRef.current,
    holo: holoRef.current,
    back: backRef.current,
  }));

  return (
    <figure className="specimen" ref={rootRef}>
      <div
        className="specimen-plate"
        ref={plateRef}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      >
        <span className="specimen-layer is-back" ref={backRef} aria-hidden="true" />
        {src ? (
          <img
            className="specimen-layer is-art"
            ref={artRef}
            src={src}
            alt={card?.name ? `${card.name} — card artwork` : ""}
            draggable="false"
          />
        ) : (
          <span className="specimen-layer is-art specimen-ph" ref={artRef} aria-hidden="true" />
        )}
        <span className="specimen-layer is-frame" ref={frameRef} aria-hidden="true" />
        <span className="specimen-layer is-holo" ref={holoRef} aria-hidden="true" />
      </div>
      <span className="specimen-shadow" aria-hidden="true" />
      {caption && <figcaption className="specimen-caption">{caption}</figcaption>}
    </figure>
  );
});
