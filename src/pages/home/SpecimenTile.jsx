import { CardObject } from "../../components/shared/CardObject.jsx";
import { pickCardImage } from "../../components/shared/cardImage.js";
import "./home.css";

// A quiet card tile for the Atlas rails — art, name, number. No price, no
// eBay button, no set logo: on the home the card is the protagonist and
// chrome recedes (that's what the utility SearchResultItem is for elsewhere).
export function SpecimenTile({ card, relation = false, owned = false, onOpen }) {
  const src = pickCardImage(card) || card?.image_url;
  return (
    <button
      className={`sp-tile${relation ? " is-relation" : ""}`}
      onClick={() => onOpen?.(card)}
    >
      <span className="sp-tile-art">
        <CardObject
          card={card}
          src={src}
          alt=""
          variant="grid"
          owned={owned}
          fallback={<span className="sp-tile-ph" aria-hidden="true">{(card?.name || "?").slice(0, 1)}</span>}
        />
      </span>
      <span className="sp-tile-name">{card?.name}</span>
      <span className="sp-tile-meta">
        {[card?.lang && card.lang.toUpperCase(), card?.card_number].filter(Boolean).join(" · ")}
      </span>
    </button>
  );
}
