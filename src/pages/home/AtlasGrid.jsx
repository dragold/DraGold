import "./home.css";

// 12-column grid, 1320px measure, single column below 768.
export function AtlasGrid({ children, className = "" }) {
  return <div className={`atlas-grid ${className}`.trim()}>{children}</div>;
}
