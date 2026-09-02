import { useEffect, useState } from "react";

// Stessi breakpoint di .card-grid in src/styles.css (2/3/4/5 colonne) — la
// virtualizzazione deve sapere quante card ci sono per riga per calcolare
// l'altezza totale, quindi replica qui la stessa soglia invece di indovinarla.
const BREAKPOINTS = [
  { minWidth: 1400, columns: 5 },
  { minWidth: 1024, columns: 4 },
  { minWidth: 640, columns: 3 },
  { minWidth: 0, columns: 2 },
];

function columnsForWidth(w) {
  return BREAKPOINTS.find((b) => w >= b.minWidth).columns;
}

export function useCardGridColumns() {
  const [columns, setColumns] = useState(() =>
    typeof window === "undefined" ? 2 : columnsForWidth(window.innerWidth)
  );
  useEffect(() => {
    const onResize = () => setColumns(columnsForWidth(window.innerWidth));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return columns;
}
