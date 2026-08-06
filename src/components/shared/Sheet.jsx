import { Icon } from "./Icon.jsx";

export function Sheet({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal-x" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
        <h3 className="sheet-title">{title}</h3>
        {children}
      </div>
    </div>
  );
}
