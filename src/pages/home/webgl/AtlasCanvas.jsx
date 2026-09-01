import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { AtlasScene } from "./AtlasScene.jsx";
import { atlasScroll } from "./atlasScroll.js";
import { TIER_CONFIG } from "./gpuTier.js";
import "./atlas-canvas.css";

// Fixed, full-viewport canvas behind the DOM Atlas. pointer-events:none so the
// page stays fully interactive. Pauses its render loop when the tab is hidden.
export default function AtlasCanvas({ tier, src, rarity }) {
  const config = TIER_CONFIG[tier] || TIER_CONFIG[1];
  const [frameloop, setFrameloop] = useState("always");

  useEffect(() => {
    atlasScroll.active = true;
    const onVis = () => setFrameloop(document.hidden ? "never" : "always");
    document.addEventListener("visibilitychange", onVis);
    return () => {
      atlasScroll.active = false;
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <div className="atlas-canvas" aria-hidden="true">
      <Canvas
        frameloop={frameloop}
        dpr={config.dpr}
        gl={{ antialias: true, powerPreference: "high-performance", alpha: false }}
        camera={{ position: [1.15, 0, 6.4], fov: 38, near: 0.1, far: 60 }}
      >
        <AtlasScene src={src} rarity={rarity} config={config} />
      </Canvas>
    </div>
  );
}
