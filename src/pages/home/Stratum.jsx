import { useReveal } from "../../lib/useReveal.js";
import { pickCardImage } from "../../components/shared/cardImage.js";
import "./home.css";

// A layer of the descent. The mono edge-label sits on the spine (a continuous
// hairline running down the left of every stratum) and names the relationship
// this layer represents. The featured card rides along as a small chip on the
// right of the edge row — the static stand-in for the delamination the scroll
// timeline will do in a later phase ("you are still inside this card").
export function Stratum({ edgeLabel, depth, voice, children, index = 0, id, card }) {
  const r = useReveal({ index });
  const chipSrc = card ? pickCardImage(card) : null;
  return (
    <section className="stratum" id={id}>
      <div className="stratum-in">
        {edgeLabel && (
          <p className="stratum-edge">
            {depth != null && <span className="stratum-depth">{depth}</span>}
            <span className="stratum-edge-t">{edgeLabel}</span>
            {chipSrc && (
              <img className="stratum-chip" src={chipSrc} alt="" aria-hidden="true" draggable="false" />
            )}
          </p>
        )}
        <div ref={r.ref} className={`stratum-body ${r.className}`} style={r.style}>
          {voice && <p className="stratum-voice font-syne">{voice}</p>}
          {children}
        </div>
      </div>
    </section>
  );
}
