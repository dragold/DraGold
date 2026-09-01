// A tiny mutable bridge between DOM scroll and the R3F render loop. The scroll
// listener (useAtlasScrollProgress) writes here; the WebGL scene reads it in
// useFrame. No React state → no re-renders on scroll.
export const atlasScroll = {
  progress: 0, // 0 → 1 over the whole .atlas-stage
  velocity: 0, // recent scroll delta, smoothed — feeds foil intensity
  pointer: { x: 0, y: 0 }, // -1 → 1, viewport-relative
  active: false, // is the WebGL layer mounted
};
