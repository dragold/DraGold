import { SearchResultItem } from "./SearchResultItem.jsx";
import { useCardGridColumns } from "../../lib/useCardGridColumns.js";
import { useVirtualGridRows } from "../../lib/useVirtualGridRows.js";
import { RevealCell } from "../shared/RevealCell.jsx";

// Virtualizzazione a righe della card-grid: monta nel DOM solo le righe
// vicine al viewport invece di tutti i risultati (rilevante su liste da
// centinaia/migliaia di carte — Portfolio, ricerca ampia).
export function VirtualCardGrid({ results, priceMap, country, cur, eurRate, onOpen, setsMap, discoveryMode, identifyMode }) {
  const columns = useCardGridColumns();
  // Stima di partenza (una riga di card ~3/4 aspect-ratio + nome/prezzo +
  // gap) — measureElement sotto corregge l'altezza reale riga per riga,
  // quindi non serve che sia esatta.
  const { containerRef, virtualizer } = useVirtualGridRows({ itemCount: results.length, columns, estimateRowSize: 330 });

  return (
    <div
      ref={containerRef}
      className="card-grid card-grid-virtual"
      style={{ position: "relative", display: "block", height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((row) => {
        const start = row.index * columns;
        const rowCards = results.slice(start, start + columns);
        return (
          <div
            key={row.key}
            ref={virtualizer.measureElement}
            data-index={row.index}
            style={{
              position: "absolute", top: 0, left: 0, width: "100%",
              display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 12,
              transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)`,
            }}
          >
            {rowCards.map((card, i) => (
              <RevealCell key={card.id} index={i}>
                <SearchResultItem card={card} priceInfo={priceMap[card.id] || null}
                  country={country} cur={cur} eurRate={eurRate} onOpen={onOpen} setsMap={setsMap}
                  discoveryMode={discoveryMode} identifyMode={identifyMode} />
              </RevealCell>
            ))}
          </div>
        );
      })}
    </div>
  );
}
