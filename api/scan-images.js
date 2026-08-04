// api/scan-images.js
// READ-ONLY image scan endpoint for Task 3 (full breakage scan).
// Does NOT write to cards, card_image_cache, or Storage. No side effects.
//
// GET  ?mode=list&tcg=pokemon&lang=en&cursor=0&limit=1000
//   -> paginated card rows: { ok, rows:[{id,tcg,lang,name,set_name,source,image_url}], nextCursor }
//
// POST { imageUrl }
//   -> HEAD (GET fallback) probe only, no body persisted: { ok, status, method, ms, contentType, contentLength }
//
// Auth: header x-internal-key must match env IMAGE_CACHE_KEY (same secret as cache-image.js).

import { createClient } from "@supabase/supabase-js";

const FETCH_TIMEOUT_MS = 10000;

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

const ALLOWED_ORIGINS = new Set(["https://dragold.org", "https://www.dragold.org"]);
const ALLOWED_TCG = new Set(["pokemon", "onepiece"]);
const ALLOWED_LANG = new Set(["en", "ja"]);
const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function getSupabaseAdmin() {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) {
          throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
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

async function probe(imageUrl) {
    const t0 = Date.now();
    try {
          let r = await fetch(imageUrl, {
                  method: "HEAD",
                  signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
                  headers: { "User-Agent": UA, Accept: "image/*" },
          });
          let method = "HEAD";
          if (!r.ok) {
                  // Several sources mishandle HEAD (405/501) or lie about status; confirm with GET.
            method = "GET";
                  r = await fetch(imageUrl, {
                            method: "GET",
                            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
                            headers: { "User-Agent": UA, Accept: "image/*" },
                  });
                  if (r.body && typeof r.body.cancel === "function") {
                            try {
                                        await r.body.cancel();
                            } catch (_) {}
                  }
          }
          return {
                  ok: r.ok,
                  status: r.status,
                  method,
                  ms: Date.now() - t0,
                  contentType: r.headers.get("content-type"),
                  contentLength: r.headers.get("content-length"),
          };
    } catch (err) {
          return {
                  ok: false,
                  status: 0,
                  method: "HEAD",
                  ms: Date.now() - t0,
                  error: String(err.message || err),
          };
    }
}

export default async function handler(req, res) {
    const reqOrigin = req.headers.origin;
    const corsOrigin = ALLOWED_ORIGINS.has(reqOrigin) ? reqOrigin : "https://dragold.org";
    res.setHeader("Access-Control-Allow-Origin", corsOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-internal-key");

  if (req.method === "OPTIONS") {
        return res.status(200).end();
  }

  const expectedKey = process.env.IMAGE_CACHE_KEY;
    const providedKey = req.headers["x-internal-key"];
    if (!expectedKey) {
          return res.status(500).json({ ok: false, error: "Server misconfigured: IMAGE_CACHE_KEY not set" });
    }
    if (!providedKey || providedKey !== expectedKey) {
          return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

  if (req.method === "GET") {
        const { mode, tcg, lang } = req.query;
        if (mode !== "list") {
                return res.status(400).json({ ok: false, error: "Unknown or missing mode" });
        }
        if (!ALLOWED_TCG.has(tcg) || !ALLOWED_LANG.has(lang)) {
                return res.status(400).json({ ok: false, error: "tcg/lang not allowed for this scan" });
        }
        const limit = Math.min(parseInt(req.query.limit, 10) || 1000, 2000);
        const cursor = parseInt(req.query.cursor, 10) || 0;

      let supabase;
        try {
                supabase = getSupabaseAdmin();
        } catch (e) {
                return res.status(500).json({ ok: false, error: e.message });
        }

      const { data, error } = await supabase
          .from("cards")
          .select("id, tcg, lang, name, set_name, source, image_url")
          .eq("tcg", tcg)
          .eq("lang", lang)
          .order("id")
          .range(cursor, cursor + limit - 1);

      if (error) {
              return res.status(500).json({ ok: false, error: error.message });
      }

      return res.status(200).json({
              ok: true,
              rows: data,
              count: data.length,
              nextCursor: data.length === limit ? cursor + limit : null,
      });
  }

  if (req.method === "POST") {
        const { imageUrl } = req.body || {};
        if (!imageUrl) {
                return res.status(400).json({ ok: false, error: "imageUrl is required" });
        }
        if (!isAllowedHost(imageUrl)) {
                return res.status(403).json({ ok: false, error: `Source host not allow-listed: ${imageUrl}` });
        }
        const result = await probe(imageUrl);
        return res.status(200).json(result);
  }

  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
