// GDPR Art. 20 — Right to data portability ("Scarica i miei dati").
// Auth/Profile/Privacy feature. Deliberately a NEW standalone module rather
// than an addition to src/supabase.js: another in-progress session is
// actively editing that file for the profile-management work (username/
// avatar/delete), so this keeps the export feature's surface area isolated
// to avoid a collision. Imports the already-initialized `supabase` client
// (read-only import, no changes to supabase.js itself).
//
// Everything here reads through the SAME anon-key client used everywhere
// else in the app — no service role, no server round-trip needed. RLS
//("own row only" policies, see supabase/migrations/20260823120000_*.sql
// and 20260826150000_*.sql) already restricts every one of these tables to
// the signed-in user's own rows, so a plain `select *` is exactly the
// portability export Art. 20 requires: nothing more, nothing less.
import { supabase } from "../supabase.js";

// Every table with a user_id (or id, for profiles) FK into auth.users,
// verified live via information_schema on 2026-08-26. Tables confirmed
// empty for all users today (posts/comments/likes — dormant Community
// feature) are still included: RLS makes them free/safe to query and a
// user who has rows there in the future gets them automatically.
const USER_TABLES = [
  { table: "collection", label: "collection" },
  { table: "watchlist", label: "watchlist" },
  { table: "alerts", label: "alerts" },
  { table: "academy_progress", label: "academy_progress" },
  { table: "card_submissions", label: "card_submissions" },
  { table: "binders", label: "binders" },
  { table: "posts", label: "posts" },
  { table: "comments", label: "comments" },
  { table: "likes", label: "likes" },
  { table: "ebay_clicks", label: "ebay_clicks" },
];

function download(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick — some browsers need the click to fully
  // dispatch before the object URL is safe to release.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// Builds and triggers the download of a single JSON file with every piece
// of data DraGold holds about the signed-in user. Returns { error } on
// failure so callers can show a message; never throws.
export async function exportUserData() {
  if (!supabase) return { error: { message: "Backend not configured" } };

  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (userErr || !user) return { error: { message: "Not signed in" } };

  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    const tableResults = await Promise.all(
      USER_TABLES.map(async ({ table }) => {
        const { data, error } = await supabase.from(table).select("*").eq("user_id", user.id);
        return [table, error ? [] : data || []];
      })
    );

    const bundle = {
      export_generated_at: new Date().toISOString(),
      note:
        "This file contains all personal data DraGold holds about your account, " +
        "provided under GDPR Article 20 (right to data portability).",
      account: {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at,
        providers: (user.identities || []).map((i) => i.provider),
      },
      profile: profile || null,
      ...Object.fromEntries(tableResults),
    };

    download(`dragold-my-data-${user.id.slice(0, 8)}.json`, bundle);
    return { data: true };
  } catch (e) {
    console.error("[gdprExport]", e);
    return { error: { message: "Could not generate your export. Please try again." } };
  }
}
