import { useReveal } from "../../lib/useReveal.js";

// Ingresso in stagger per singola cella di una griglia virtualizzata
// (VirtualCardGrid, Portfolio grid/list) — riusa useReveal.js (IntersectionObserver
// one-shot, gia' usato altrove nell'app) invece di introdurre una nuova animazione.
// Sicuro da applicare per-carta solo perche' la virtualizzazione limita i nodi
// montati a poche righe visibili per volta: prima non lo sarebbe stato (un
// IntersectionObserver per ognuna di centinaia/migliaia di carte).
export function RevealCell({ index, children }) {
  const reveal = useReveal(index);
  return <div ref={reveal.ref} className={reveal.className} style={reveal.style}>{children}</div>;
}
