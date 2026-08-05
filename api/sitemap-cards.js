// api/sitemap-cards.js
// Public, read-only dynamic sitemap for /carta/{slug} pages.
// Priority order matches product priority: Pokemon first, then One Piece, MTG, YGO.
// No auth required: this must be reachable by search engine crawlers.

import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

const MAX_URLS = 45000;
const TCG_ORDER = ["pokemon", "onepiece", "mtg", "ygo"];

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (e) {
    return res.status(500).send("Server misconfigured");
  }

const rows = [];
  for (const tcg of TCG_ORDER) {
    if (rows.length >= MAX_URLS) break;
    const remaining = MAX_URLS - rows.length;
    const { data, error } = await supabase
    .from("canonical_cards")
    .select("slug, updated_at")
    .eq("tcg", tcg)
    .not("slug", "is", null)
    .order("updated_at", { ascending: false })
    .limit(remaining);
    if (!error && data) rows.push(...data);
  }

const urlEntries = rows
  .filter((r) => r.slug)
  .map((r) => {
    const lastmod = r.updated_at ? new Date(r.updated_at).toISOString().slice(0, 10) : "";
    return `<url><loc>https://dragold.org/carta/${escapeXml(r.slug)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}<changefreq>weekly</changefreq></url>`;
  })
  .join("");

const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urlEntries}</urlset>`;

res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
  return res.status(200).send(xml);
}
