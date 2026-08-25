import { Icon } from "../shared/Icon.jsx";
import { ebaySearchURL } from "../../DraGold.jsx";
import { SearchResultItem } from "./SearchResultItem.jsx";

export function SearchResults({ loading, results, priceMap, error, term, country, cur, eurRate, onRetry, onOpen, setsMap, hasMore = false, totalCount = null, discoveryMode = false }) {
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
  if (!results.length) return discoveryMode ? (
    // Data Completeness / UX Holes (2026-08-25): this same component renders
    // Set Detail's card grid (SetsView -> SetDetailPage, discoveryMode=true,
    // term=setName) — a real set can genuinely have zero cards indexed yet
    // (e.g. a set_logos row without matching cards rows, or a language edge
    // case). The search-tuned copy below ("No results for 'x'", "try fewer
    // words", eBay-search-by-term, "missing card?" mailto) is actively
    // misleading here: the user didn't type a query, they clicked a set tile,
    // and none of those actions fix a catalog gap. Honest, set-specific
    // empty state instead — no invented reason, no CTA that doesn't apply
    // (the page's own Back button above already covers "what can I do next").
    <div className="zero-state">
      <div className="zero-title">No cards indexed yet for {term}</div>
      <div className="zero-sub">This set is in our catalog, but we don't have its cards yet.</div>
    </div>
  ) : (
    <div className="zero-state">
      <div className="zero-title">No results for "{term}"</div>
      <div className="zero-sub">Try fewer words or the card number.</div>
      <a className="btn btn-ghost"
        href={ebaySearchURL(term, country)}
        target="_blank" rel="noreferrer">
        Search "{term}" on eBay
      </a>
      {/* Missing card: never a dead end. No new table/backend for this yet — a
          mailto with the query prefilled is the minimum that (a) doesn't block
          the user's own task and (b) gives the DraGold catalog pipeline a real
          signal to enrich later. See PRODUCT_SPEC.md §1: Core Data Layer is
          still being built out; a report queue is a natural next step once
          this signal proves out, not before. */}
      <a className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}
        href={`mailto:hello@dragold.org?subject=${encodeURIComponent(`Missing card: ${term}`)}&body=${encodeURIComponent(`I searched for "${term}" and couldn't find it on DraGold.\n\nCard name / set / language:\n`)}`}>
        Can't find your card? Tell us →
      </a>
    </div>
  );
  return (
    <>
      <div className="card-grid">
        {results.map(card => (
          <SearchResultItem key={card.id} card={card} priceInfo={priceMap[card.id] || null}
            country={country} cur={cur} eurRate={eurRate} onOpen={onOpen} setsMap={setsMap}
            discoveryMode={discoveryMode} />
        ))}
      </div>
      {!hasMore && (
        <p className="hint-center">
          {totalCount != null ? `${totalCount} result${totalCount !== 1 ? "s" : ""} — end of list` : "End of list"}
        </p>
      )}
    </>
  );
}
