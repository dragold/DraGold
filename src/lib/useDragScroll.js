// Desktop trackpad/mouse drag-to-scroll for horizontal rails. Native on
// touch already (the browser handles it) — this only adds the missing
// desktop affordance, so rails don't feel like they need a visible
// scrollbar to be usable with a mouse. No-ops on touch/coarse pointers.
import { useRef, useCallback } from "react";

export function useDragScroll() {
  const ref = useRef(null);
  const state = useRef({ down: false, moved: false, startX: 0, startScroll: 0 });

  const onPointerDown = useCallback((e) => {
    const el = ref.current;
    if (!el || e.pointerType === "touch") return;
    state.current = { down: true, moved: false, startX: e.clientX, startScroll: el.scrollLeft };
    el.setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e) => {
    const el = ref.current;
    const s = state.current;
    if (!el || !s.down) return;
    const dx = e.clientX - s.startX;
    if (Math.abs(dx) > 3) s.moved = true;
    el.scrollLeft = s.startScroll - dx;
  }, []);

  const endDrag = useCallback(() => { state.current.down = false; }, []);

  // Suppress the click that follows a drag (so dragging a rail doesn't
  // also open the card/set under the cursor on release).
  const onClickCapture = useCallback((e) => {
    if (state.current.moved) { e.preventDefault(); e.stopPropagation(); state.current.moved = false; }
  }, []);

  return { ref, onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerLeave: endDrag, onClickCapture };
}
