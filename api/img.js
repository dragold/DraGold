// api/img.js — read-only image proxy for the WebGL layer.
//
// WebGL textures require a CORS-enabled source; most card-image CDNs
// (images.pokemontcg.io, tcgdex) send no Access-Control-Allow-Origin, so a
// cross-origin <img> renders fine but cannot be uploaded to a GL texture.
// This streams an allow-listed image back through DraGold's own origin with
// permissive CORS + long cache headers. No storage, no processing.
//
// Hardened: strict host allow-list (not an open proxy / SSRF vector), GET only,
// hard size + timeout caps, only image/* content types pass through.

const ALLOWED_HOSTS = new Set([
  "images.pokemontcg.io",
  "assets.tcgdex.net",
  "tcgdex.net",
  "den-cards.pokellector.com",
  "pimwkmwrduqkaydyvxqz.supabase.co", // our own storage (already CORS-ok, but harmless)
]);

const MAX_BYTES = 6 * 1024 * 1024;
const TIMEOUT_MS = 8000;

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "GET only" });
    return;
  }

  const raw = (req.query.u || req.query.url || "").toString();
  let target;
  try {
    target = new URL(raw);
  } catch {
    res.status(400).json({ error: "bad url" });
    return;
  }
  if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) {
    res.status(403).json({ error: "host not allowed" });
    return;
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const upstream = await fetch(target.toString(), {
      signal: ac.signal,
      headers: { Accept: "image/avif,image/webp,image/png,image/*" },
    });
    if (!upstream.ok) {
      res.status(502).json({ error: `upstream ${upstream.status}` });
      return;
    }
    const type = upstream.headers.get("content-type") || "";
    if (!type.startsWith("image/")) {
      res.status(415).json({ error: "not an image" });
      return;
    }
    const len = Number(upstream.headers.get("content-length") || 0);
    if (len && len > MAX_BYTES) {
      res.status(413).json({ error: "too large" });
      return;
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) {
      res.status(413).json({ error: "too large" });
      return;
    }

    res.setHeader("Content-Type", type);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800, immutable");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.status(200).send(buf);
  } catch (err) {
    res.status(504).json({ error: err.name === "AbortError" ? "timeout" : "fetch failed" });
  } finally {
    clearTimeout(timer);
  }
}
