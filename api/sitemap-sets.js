// api/sitemap-sets.js
// Public, read-only dynamic sitemap for /set/{slug} pages (Block 5 — SEO
// Foundation for Sets). Stesso principio architetturale di api/sitemap-cards.js:
// niente file statico, split per-TCG via ?tcg=, stesso client/env, stesso cap.
//
// Fonte dati: canonical_cards (stessa tabella gia' usata per il sitemap carte,
// gia' cotenente tcg+set_id+updated_at) invece di scansionare `cards` per intero
// (201k righe vs 88k di canonical_cards) — un set e' distinto per (tcg, set_id
// normalizzato), quindi si deduplica lato funzione senza bisogno di GROUP BY
// via PostgREST (non disponibile senza RPC dedicata, evitata per non introdurre
// nuovi oggetti DB).

import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

const TCG_ORDER = ["pokemon", "onepiece", "mtg", "ygo"];
const MAX_ROWS_PER_TCG = 50000; // canonical_cards ha 88k righe totali su 4 TCG: ampio margine

// Fix (Block 6, scoperto verificando la sorgente dati per i TCG Hub):
// canonical_cards.set_id e' NULL al 100% per tcg='onepiece' (2642/2642 righe,
// verificato su Supabase) — bug latente di Block 5 mai emerso prima perche' non
// testato TCG per TCG. Risultato: questo endpoint restituiva 0 URL per One Piece.
// Fallback mirato SOLO per i TCG dove canonical_cards non basta: `cards` ha
// set_id sempre popolato (stessa fonte gia' usata con successo in
// setPageData.js/middleware.js per risolvere i singoli Set Page), qui limitato
// alla sola colonna set_id e al singolo tcg coinvolto — non tutte le 201k righe.

// Stessa regola di normalizzazione di src/lib/setSlug.js — duplicata qui perche'
// questa e' una funzione serverless indipendente (stesso principio gia' applicato
// a middleware.js, nessuna nuova convenzione).
function slugifySetId(setId) {
  return String(setId || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

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

  const sets = new Map(); // key: `${tcg}:${slugId}` -> { tcg, slugId, updatedAt }
  for (const tcg of tcgsToFetch) {
    const { data, error } = await supabase
      .from("canonical_cards")
      .select("set_id, updated_at")
      .eq("tcg", tcg)
      .not("set_id", "is", null)
      .limit(MAX_ROWS_PER_TCG);
    if (!error && data) {
      for (const row of data) {
        const slugId = slugifySetId(row.set_id);
        if (!slugId) continue;
        const key = `${tcg}:${slugId}`;
        const existing = sets.get(key);
        if (!existing || (row.updated_at && row.updated_at > existing.updatedAt)) {
          sets.set(key, { tcg, slugId, updatedAt: row.updated_at || existing?.updatedAt || null });
        }
      }
    }

    // Fallback: se canonical_cards non ha prodotto nessun set per questo tcg
    // (set_id NULL, caso noto one-piece) usa `cards.set_id` solo per questo tcg.
    const hasAny = [...sets.keys()].some((k) => k.startsWith(`${tcg}:`));
    if (!hasAny) {
      const { data: cardRows, error: cardErr } = await supabase
        .from("cards")
        .select("set_id")
        .eq("tcg", tcg)
        .not("set_id", "is", null)
        .limit(MAX_ROWS_PER_TCG);
      if (!cardErr && cardRows) {
        for (const row of cardRows) {
          const slugId = slugifySetId(row.set_id);
          if (!slugId) continue;
          const key = `${tcg}:${slugId}`;
          if (!sets.has(key)) sets.set(key, { tcg, slugId, updatedAt: null });
        }
      }
    }
  }

  const urlEntries = [...sets.values()]
    .map((s) => {
      const lastmod = s.updatedAt ? new Date(s.updatedAt).toISOString().slice(0, 10) : "";
      return `<url><loc>https://dragold.org/set/${escapeXml(`${s.tcg}-${s.slugId}`)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}<changefreq>weekly</changefreq></url>`;
    })
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urlEntries}</urlset>`;

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
  return res.status(200).send(xml);
}
