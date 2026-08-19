/* --- Icone SVG inline (no librerie) --- */
export function Icon({ name, size=20, stroke=2 }) {
  const p = { width:size, height:size, viewBox:"0 0 24 24", fill:"none",
    stroke:"currentColor", strokeWidth:stroke, strokeLinecap:"round", strokeLinejoin:"round" };
  switch (name) {
    case "search": return <svg {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>;
    case "wallet": return <svg {...p}><path d="M3 7h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12"/><path d="M16 13h.01"/></svg>;
    case "bell": return <svg {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 21a2 2 0 0 0 3.4 0"/></svg>;
    case "grid": return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
    case "doc": return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h6"/></svg>;
    case "users": return <svg {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>;
    case "card": return <svg {...p}><rect x="4" y="2.5" width="16" height="19" rx="2"/><path d="M8 7h8M8 11h5"/></svg>;
    case "chevron": return <svg {...p}><path d="M9 18l6-6-6-6"/></svg>;
    case "close": return <svg {...p}><path d="M18 6 6 18M6 6l12 12"/></svg>;
    case "logout": return <svg {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>;
    case "mail": return <svg {...p}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/></svg>;
    case "spark": return <svg {...p}><path d="M3 17l5-6 4 4 6-8 3 4"/></svg>;
    case "list": return <svg {...p}><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></svg>;
    case "trend-up": return <svg {...p}><path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/></svg>;
    case "trophy": return <svg {...p}><path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 5H4a3 3 0 0 0 3 5M17 5h3a3 3 0 0 1-3 5"/></svg>;
    default: return null;
  }
}
