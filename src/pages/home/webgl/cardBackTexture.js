import * as THREE from "three";

// A DraGold card back, generated on a canvas (no asset to ship). Dark ground,
// a fine guilloché of gold rings, the wordmark, and the tagline — the layer
// the delamination reveals behind the artwork.
let _tex = null;

export function cardBackTexture() {
  if (_tex) return _tex;

  const W = 512;
  const H = Math.round(W / 0.716);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");

  // ground
  const g = ctx.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, H * 0.62);
  g.addColorStop(0, "#101218");
  g.addColorStop(1, "#06070a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // guilloché — interfering ring families
  ctx.save();
  ctx.translate(W / 2, H / 2);
  for (let fam = 0; fam < 3; fam++) {
    const cx = Math.cos((fam / 3) * Math.PI * 2) * 26;
    const cy = Math.sin((fam / 3) * Math.PI * 2) * 26;
    for (let i = 6; i < 62; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, i * 5.2, 0, Math.PI * 2);
      ctx.strokeStyle = i % 2 ? "rgba(231,183,95,0.05)" : "rgba(126,139,196,0.035)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  ctx.restore();

  // inner hairline frame
  ctx.strokeStyle = "rgba(231,183,95,0.30)";
  ctx.lineWidth = 2;
  roundRect(ctx, 26, 26, W - 52, H - 52, 14);
  ctx.stroke();

  // the mark
  ctx.fillStyle = "#e7b75f";
  ctx.font = `700 ${Math.round(W * 0.34)}px Georgia, "Times New Roman", serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(231,183,95,0.5)";
  ctx.shadowBlur = 28;
  ctx.fillText("D", W / 2, H / 2 - 6);
  ctx.shadowBlur = 0;

  // wordmark + tagline
  ctx.fillStyle = "#EDEEF2";
  ctx.font = `700 ${Math.round(W * 0.075)}px Georgia, serif`;
  ctx.fillText("DRAGOLD", W / 2, H * 0.74);

  ctx.fillStyle = "rgba(155,161,173,0.85)";
  ctx.font = `700 ${Math.round(W * 0.032)}px "Courier New", monospace`;
  ctx.fillText("T H E   T C G   K N O W L E D G E   G R A P H", W / 2, H * 0.80);

  _tex = new THREE.CanvasTexture(c);
  _tex.colorSpace = THREE.SRGBColorSpace;
  _tex.anisotropy = 8;
  return _tex;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
