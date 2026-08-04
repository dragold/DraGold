// api/cache-image.js
// Generic image cache proxy: fetches an external card image server-side,
// converts it to WebP, uploads it to Supabase Storage, and records the
// result in card_image_cache. Works for any TCG/source, not just One Piece.
//
// SECURITY (hardened 2026-08-04):
// - Requires header "x-internal-key" matching env IMAGE_CACHE_KEY. This is
//   an internal endpoint meant to be called by trusted batch scripts, not
//   by public/browser clients.
// - imageUrl must resolve to a hostname on ALLOWED_SOURCE_HOSTS. Prevents
//   using this endpoint as an open SSRF/arbitrary-download proxy.
// - Explicit fetch timeout (FETCH_TIMEOUT_MS) so a slow/hanging source
//   can't burn the whole function timeout.
// - Content-Length (when present) is checked before buffering the body,
//   in addition to the existing post-conversion size cap.
//
// POST body: { cardId, source, imageUrl, language, variant }
//   cardId   - required, matches cards.id
//   source   - required, e.g. "onepiece-cardgame.com", "optcgapi.com"
//   imageUrl - required, the original external image URL (host must be allow-listed)
//   language - optional, e.g. "JA", "EN" (normalized to "any" if omitted)
//   variant  - optional, default "default" (e.g. "alt", "promo")
//
// Response: { ok, status, cached_url, original_url, format, width, height, bytes, error }

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const BUCKET = "card-images";
const MAX_WIDTH = 480;
const TARGET_QUALITY = 80;
const RETRY_QUALITY = 65;
const SIZE_CAP_BYTES = 300 * 1024;

// Hard cap on the *raw* download before conversion, to bound memory/time
// even if a source lies about content-length or omits it.
const MAX_RAW_DOWNLOAD_BYTES = 8 * 1024 * 1024; // 8 MB
const FETCH_TIMEOUT_MS = 15000;

// Only these hostnames may be fetched. Add new sources here deliberately;
// never accept an arbitrary imageUrl.
const ALLOWED_SOURCE_HOSTS = new Set([
    "assets.tcgdex.net",
    "images.pokemontcg.io",
    "images.scrydex.com",
    "optcgapi.com",
    "onepiece-cardgame.com",
    "en.onepiece-cardgame.com",
    "www.onepiece-cardgame.com",
    "jp.onepiece-cardgame.com",
  ]);

// Origins allowed to call this endpoint via browser CORS. Server-to-server
// batch calls (Node scripts) aren't subject to CORS at all, this only
// matters for hypothetical browser callers.
const ALLOWED_ORIGIN = "https://dragold.org";

function getSupabaseAdmin() {
    const url =
          process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key =
          process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) {
          throw new Error(
                  "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars"
                );
    }
    return createClient(url, key, { auth: { persistSession: false } });
}

function isAllowedHost(imageUrl) {
    try {
          const { hostname } = new URL(imageUrl);
          return ALLOWED_SOURCE_HOSTS.has(hostname);
    } catch {
          return false;
    }
}

async function fetchImageBuffer(imageUrl) {
    const res = await fetch(imageUrl, {
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          headers: {
                  // A plain browser-like UA; deliberately no Referer header, since the
            // hotlink protection observed on some providers triggers off the
            // dragold.org Referer, not a missing one.
            "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
                  Accept: "image/*",
          },
    });
    if (!res.ok) {
          throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
    }
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
          throw new Error(`Not an image response (content-type: ${contentType || "unknown"})`);
    }
    const contentLength = Number(res.headers.get("content-length") || 0);
    if (contentLength && contentLength > MAX_RAW_DOWNLOAD_BYTES) {
          throw new Error(
                  `Source image too large (${contentLength} bytes > ${MAX_RAW_DOWNLOAD_BYTES} cap)`
                );
    }
    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_RAW_DOWNLOAD_BYTES) {
          throw new Error(
                  `Source image too large (${arrayBuffer.byteLength} bytes > ${MAX_RAW_DOWNLOAD_BYTES} cap)`
                );
    }
    return Buffer.from(arrayBuffer);
}

async function toWebp(buffer, quality) {
    const img = sharp(buffer, { failOn: "none" });
    const meta = await img.metadata();
    const resizeWidth =
          meta.width && meta.width > MAX_WIDTH ? MAX_WIDTH : undefined; // never upscale

  const pipeline = resizeWidth
      ? img.resize({ width: resizeWidth, withoutEnlargement: true })
        : img;

  const output = await pipeline.webp({ quality }).toBuffer({ resolveWithObject: true });
    return output; // { data, info: { width, height, size, format } }
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-internal-key");

  if (req.method === "OPTIONS") {
        return res.status(200).end();
  }
    if (req.method !== "POST") {
          return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

  // ---- Auth: internal-only endpoint ----
  const expectedKey = process.env.IMAGE_CACHE_KEY;
    const providedKey = req.headers["x-internal-key"];
    if (!expectedKey) {
          // Fail closed: if the secret isn't configured, refuse to run rather
      // than silently accepting unauthenticated calls.
      return res.status(500).json({ ok: false, error: "Server misconfigured: IMAGE_CACHE_KEY not set" });
    }
    if (!providedKey || providedKey !== expectedKey) {
          return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

  const { cardId, source, imageUrl, language = null, variant = "default" } =
        req.body || {};

  if (!cardId || !source || !imageUrl) {
        return res
          .status(400)
          .json({ ok: false, error: "cardId, source and imageUrl are required" });
  }

  if (!isAllowedHost(imageUrl)) {
        return res.status(403).json({
                ok: false,
                error: `Source host not allow-listed for imageUrl: ${imageUrl}`,
        });
  }

  let supabase;
    try {
          supabase = getSupabaseAdmin();
    } catch (e) {
          return res.status(500).json({ ok: false, error: e.message });
    }

  // language is normalized to "any" so it can never be NULL in the DB row
  // (a NULL would break the (card_id,source,language,variant) unique
  // constraint used for the upsert, since Postgres treats each NULL as
  // distinct). This mirrors the Storage path normalization below.
  const normalizedLanguage = language || "any";

  const baseRow = {
        card_id: cardId,
        source,
        language: normalizedLanguage,
        variant,
        original_url: imageUrl,
  };

  try {
        const rawBuffer = await fetchImageBuffer(imageUrl);

      let { data, info } = await toWebp(rawBuffer, TARGET_QUALITY);
        if (info.size > SIZE_CAP_BYTES) {
                ({ data, info } = await toWebp(rawBuffer, RETRY_QUALITY));
        }

      const safeVariant = variant.replace(/[^a-zA-Z0-9_-]/g, "_");
        const safeLang = normalizedLanguage.replace(/[^a-zA-Z0-9_-]/g, "_");
        const safeSource = source.replace(/[^a-zA-Z0-9_.-]/g, "_");
        const path = `${safeSource}/${cardId}-${safeLang}-${safeVariant}.webp`;

      const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(path, data, {
                    contentType: "image/webp",
                    upsert: true,
                    cacheControl: "31536000",
          });

      if (uploadError) {
              throw new Error(`Storage upload failed: ${uploadError.message}`);
      }

      const { data: publicUrlData } = supabase.storage
          .from(BUCKET)
          .getPublicUrl(path);
        const cachedUrl = publicUrlData?.publicUrl;

      const row = {
              ...baseRow,
              cached_url: cachedUrl,
              format: "webp",
              width: info.width,
              height: info.height,
              bytes: info.size,
              status: "ready",
              error_message: null,
              cached_at: new Date().toISOString(),
      };

      const { error: upsertError } = await supabase
          .from("card_image_cache")
          .upsert(row, { onConflict: "card_id,source,language,variant" });

      if (upsertError) {
              throw new Error(`DB upsert failed: ${upsertError.message}`);
      }

      return res.status(200).json({
              ok: true,
              status: "ready",
              cached_url: cachedUrl,
              original_url: imageUrl,
              format: "webp",
              width: info.width,
              height: info.height,
              bytes: info.size,
      });
  } catch (err) {
        // Record the failure but always keep original_url as fallback.
      try {
              await supabase.from("card_image_cache").upsert(
                {
                            ...baseRow,
                            status: "error",
                            error_message: String(err.message || err),
                            cached_at: new Date().toISOString(),
                },
                { onConflict: "card_id,source,language,variant" }
                      );
      } catch (_) {
              // best-effort; don't mask the original error
      }

      return res.status(502).json({
              ok: false,
              status: "error",
              original_url: imageUrl,
              error: String(err.message || err),
      });
  }
}
