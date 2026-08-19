// api/sitemap-illustrators.js
// Public, read-only dynamic sitemap for /illustrator/{slug} pages (blocco
// "Illustrator Pages"). Stesso principio architetturale di api/sitemap-sets.js:
// niente file statico, stesso client/env.
//
// Differenza deliberata rispetto a sitemap-sets.js: NON partizionato per ?tcg=.
// L'Illustrator e' un'entita' globale (vedi src/lib/illustratorSlug.js — nessun
// prefisso tcg nello slug) e oggi cards.illustrator e' popolato solo per
// tcg='pokemon' con 418 valori distinti (verificato su Supabase) — ben sotto il
// limite standard di 50.000 URL per sitemap, quindi un partizionamento aggiuntivo
// non e' necessario ora. Se in futuro la copertura crescesse su altri TCG restando
// sotto quel limite, questo endpoint continua a funzionare senza modifiche.
//
// Fonte dati: cards.illustrator (colonna indicizzata, cards_illustrator_idx) — si
// legge SOLO questa colonna, non l'intera riga, e solo le righe con illustrator
// valorizzato (~33.6k su 201k totali oggi), non uno scan di tutte le cards.

import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

const SCAN_CAP = 40000; // stesso principio del cap gia' usato in setPageData.js/sitemap-sets.js
const SCAN_PAGE_SIZE = 1000;

// Stessa regola di normalizzazione di src/lib/illustratorSlug.js — duplicata qui
// perche' questa e' una funzione serverless indipendente (stesso principio gia'
// applicato a middleware.js per il caso Set, nessuna nuova convenzione).
function slugifyIllustrator(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// BUG FIX: stessa identica root cause gia' corretta in
// src/pages/illustrator/illustratorPageData.js e in middleware.js
// (handleIllustratorBot) — un singolo fetch con limit=40000 e nessun ORDER BY
// esplicito non copre l'intera colonna cards.illustrator: il server tronca a un
// massimo di righe per singola richiesta e, senza ORDER BY, Postgres restituisce le
// righe nell'ordine fisico dello scan, fortemente raggruppato per illustrator
// (verificato su Supabase: le prime 1000 righe non ordinate contengono 851 righe di
// "5ban Graphics" e quasi nient'altro). Risultato: questa sitemap elencava solo gli
// illustrator "clusterizzati" all'inizio della tabella, non tutti i 418 reali. Fix
// minimo identico agli altri due file: paginare con range/offset avanzando
// dell'esatto numero di righe restituite, fino a pagina vuota o al cap.
async function fetchAllIllustratorValues(supabase) {
  const seen = new Set();
  let offset = 0;
  while (offset < SCAN_CAP) {
    const { data, error } = await supabase
      .from("cards")
      .select("illustrator")
      .not("illustrator", "is", null)
      .neq("illustrator", "")
      .range(offset, offset + SCAN_PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || !data.length) break;
    for (const row of data) if (row.illustrator) seen.add(row.illustrator);
    offset += data.length;
    if (data.length < SCAN_PAGE_SIZE) break;
  }
  return seen;
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

  let rawIllustrators;
  try {
    rawIllustrators = await fetchAllIllustratorValues(supabase);
  } catch (e) {
    return res.status(500).send("Query failed");
  }

  // Un illustratore reale puo' avere piu' varianti di formattazione che collassano
  // sullo stesso slug (stessa filosofia di illustratorPageData.js): qui basta
  // includere lo slug una sola volta, la risoluzione del nome canonico avviene
  // lato pagina/middleware al momento della richiesta.
  const slugs = new Set();
  for (const illustrator of rawIllustrators) {
    const slug = slugifyIllustrator(illustrator);
    if (slug) slugs.add(slug);
  }

  const urlEntries = [...slugs]
    .sort()
    .map((slug) => `<url><loc>https://dragold.org/illustrator/${escapeXml(slug)}</loc><changefreq>weekly</changefreq></url>`)
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urlEntries}</urlset>`;

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
  return res.status(200).send(xml);
}
