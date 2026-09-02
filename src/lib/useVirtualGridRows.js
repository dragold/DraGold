import { useLayoutEffect, useRef } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";

// Meccanica di windowing condivisa da ogni griglia/lista virtualizzata
// dell'app (VirtualCardGrid per la ricerca, Portfolio grid/compact) — monta
// solo le righe vicine al viewport, usando lo scroll della finestra (nessun
// contenitore con scroll interno in queste viste). `columns` puo' essere 1
// per una lista a colonna singola: si riduce a un normale row-virtualizer.
export function useVirtualGridRows({ itemCount, columns, estimateRowSize = 330 }) {
  const containerRef = useRef(null);
  const parentOffsetRef = useRef(0);

  useLayoutEffect(() => {
    parentOffsetRef.current = containerRef.current?.offsetTop ?? 0;
  });

  const rowCount = Math.ceil(itemCount / Math.max(1, columns));
  const virtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => estimateRowSize,
    overscan: 3,
    scrollMargin: parentOffsetRef.current,
  });

  return { containerRef, virtualizer };
}
