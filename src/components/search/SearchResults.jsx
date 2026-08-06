import { Icon } from "../shared/Icon.jsx";
import { ebaySearchURL } from "../../DraGold.jsx";
import { SearchResultItem } from "./SearchResultItem.jsx";

export function SearchResults({ loading, results, priceMap, error, term, country, cur, eurRate, onRetry, onOpen, setsMap }) {
  if (loading) return (
    <div className="card-grid">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="skel-card">
          <div className="skel-img" /><div className="skel-line w70" /><div className="skel-line w40" />
        </div>
      ))}
    </div>
  );
  if (error) return (
    <div className="search-error">
      <span style={{ flexShrink: 0 }}><Icon name="close" size={16} /></span>
      <span>Search failed, please try.</span>
      <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={onRetry}>Retry</button>
    </div>
  );
  if (!results.length) return (
    <div className="zero-state">
      <div className="zero-title">No results for "{term}"</div>
      <div className="zero-sub">Try fewer words or the card number.</div>
      <a className="btn btn-ghost"
        href={ebaySearchURL(term, country)}
        target="_blank" rel="noreferrer">
        Search "{term}" on eBay
      </a>
    </div>
  );
  return (
    <div className="card-grid">
      {results.map(card => (
        <SearchResultItem key={card.id} card={card} priceInfo={priceMap[card.id] || null}
          country={country} cur={cur} eurRate={eurRate} onOpen={onOpen} setsMap={setsMap} />
      ))}
    </div>
  );
}
