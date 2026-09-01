import { useDragScroll } from "../../lib/useDragScroll.js";
import "./home.css";

// A horizontal rail of cards/markers. Native scroll + desktop drag; edge fade;
// aria-label names the relationship it represents (a11y + honesty rule:
// "every rail states which relationship it represents, in words").
export function DoorRail({ label, children }) {
  const drag = useDragScroll();
  return (
    <div
      className="door-rail"
      role="group"
      aria-label={label}
      ref={drag.ref}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerLeave={drag.onPointerLeave}
      onClickCapture={drag.onClickCapture}
    >
      {children}
    </div>
  );
}
