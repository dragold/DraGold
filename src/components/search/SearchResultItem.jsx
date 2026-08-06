import { useState } from "react";
import { TCG_LIST, CARD_LANGS, ebayURL } from "../../DraGold.jsx";
import { getSetInfo, pickCardImage } from "../shared/cardImage.js";

export function SearchResultItem({ card, priceInfo, country = "IT", cur = "EUR", eurRate = 0.92, onOpen, setsMap }) {
  const [imgFailed, setImgFailed] = useState(false);
  const imgUrl = pickCardImage(card) || card.imgUrl || card.img || null;
  const cardName = card.name || "—";
  const tcgInfo = TCG_LIST.find(t => t.id === card.tcg);
  const langInfo = CARD_LANGS.find(l => l.c === card.lang);
  const setInfo = getSetInfo(card, setsMap);
  const priceUSD = priceInfo?.price_market ?? card.avgPrice ?? null;
  const priceStr = priceUSD != null
    ? cur === "EUR" ? `€${(priceUSD * eurRate).toFixed(2)}` : `$${Number(priceUSD).toFixed(2)}`
    : null;
  const initials = cardName.replace(/[^a-zA-Z ]/g, '').trim()
    .split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';

  return (
    <div className="card-item" onClick={() => onOpen?.(card)}
      role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen?.(card); } }}>
      <div className="card-item-img">
        {imgUrl && !imgFailed ? (
          <img src={imgUrl} alt={cardName} loading="lazy" onError={() => setImgFailed(true)} />
        ) : (
          <div className="card-img-ph">
            {tcgInfo && <span className="card-img-ph-tcg" style={{ color: tcgInfo.color }}>{tcgInfo.short}</span>}
            <span className="card-img-ph-init">{initials}</span>
          </div>
        )}
      </div>
      <div className="card-item-body">
        <div className="card-item-name" title={cardName}>{cardName}</div>
        <div className="card-item-meta">
          {setInfo?.symbol_url && <img src={setInfo.symbol_url} alt="" className="card-item-sym" onError={e=>{e.currentTarget.style.display='none';}} />}
          {card.set_name && <span className="card-item-set">{card.set_name}</span>}
          {card.card_number && <span className="card-item-num">#{card.card_number}</span>}
          {langInfo && <span className="card-item-lang">{langInfo.flag}</span>}
        </div>
        <div className="card-item-footer">
          {priceStr
            ? <span className="price-tag">{priceStr}</span>
            : (
              <a className="btn-ebay"
                href={ebayURL(cardName, card.set_name || '', country, card.tcg || 'pokemon', card.card_number || '')}
                target="_blank" rel="noreferrer"
                onClick={e => e.stopPropagation()}>
                View on eBay ↗
              </a>
            )
          }
        </div>
      </div>
    </div>
  );
}
