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

// Block 4 - SEO Foundation (18/08/2026): MAX_URLS era condiviso tra TUTTI i
// TCG in un'unica risposta, interrogati in ordine pokemon->onepiece->mtg->ygo.
// Verificato su Supabase: pokemon da solo ha 43.215 righe con slug -> MTG
// (27.475 righe) e YGO (13.857 righe) restavano SEMPRE fuori dalla sitemap,
// quindi mai sottoposti a Google. Fix: split per-TCG via ?tcg=, ogni sitemap
// resta sotto il limite di spec (50.000 URL) per il proprio TCG, e
// sitemap.xml (l'indice) elenca una entry per ciascun TCG invece di una sola
// combinata. Nessuna nuova libreria, nessun nuovo sistema di generazione.
const MAX_URLS_PER_TCG = 49000;
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

  const requestedTcg = (req.query && req.query.tcg) || "";
  const tcgsToFetch = TCG_ORDER.includes(requestedTcg) ? [requestedTcg] : TCG_ORDER;
  // Nessun ?tcg= valido: mantiene il comportamento storico (combinato) come
  // fallback di sicurezza, ma con lo stesso cap per-TCG applicato ad ognuno
  // invece di un budget unico condiviso — cosi' anche la risposta legacy
  // /api/sitemap-cards senza query param non esclude piu' silenziosamente
  // interi TCG.

const rows = [];
  for (const tcg of tcgsToFetch) {
    const { data, error } = await supabase
    .from("canonical_cards")
    .select("slug, updated_at")
    .eq("tcg", tcg)
    .not("slug", "is", null)
    .order("updated_at", { ascending: false })
    .limit(MAX_URLS_PER_TCG);
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
