// api/delete-account.js
// GDPR account deletion (Auth/Profile/Username feature).
//
// Verifies the caller's Supabase access token server-side (the anon/
// authenticated client role cannot delete an auth.users row nor call the
// Admin API — that requires the service role key, which never reaches the
// browser), removes the user's avatar file(s) from the "avatars" Storage
// bucket, then deletes the auth.users row via supabase.auth.admin.deleteUser.
//
// public.profiles and every user-owned row (collection, alerts, watchlist,
// binders, posts, comments, likes, followers, academy_progress,
// card_submissions) cascade-delete automatically via their existing
// "ON DELETE CASCADE" FK into profiles/auth.users — see
// supabase/migrations/20260826150000_google_oauth_profile_management.sql
// section 8. No manual per-table cleanup needed here.
//
// POST /api/delete-account
//   Headers: Authorization: Bearer <supabase access_token>
//   Response: { ok: true } | { error: string }
import { createClient } from "@supabase/supabase-js";

// Same fallback chain api/cache-image.js uses for the service-role client,
// plus SUPABASE_SERVICE_KEY (the name actually present in this project's
// .env.local for local dev).
function getAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const admin = getAdminClient();
  if (!admin) return res.status(500).json({ error: "Backend not configured" });

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) return res.status(401).json({ error: "Missing authorization token" });

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (userErr || !user) return res.status(401).json({ error: "Invalid or expired session" });

  // Best-effort: remove the user's avatar file(s) before the account row
  // disappears. Not fatal if this fails — an orphaned file under a uuid
  // that no longer maps to any account carries no meaningful risk, and we
  // don't want a Storage hiccup to block the deletion the user asked for.
  try {
    const { data: files } = await admin.storage.from("avatars").list(user.id);
    if (files?.length) {
      await admin.storage.from("avatars").remove(files.map((f) => `${user.id}/${f.name}`));
    }
  } catch (e) {
    console.error("[delete-account] avatar cleanup failed", e);
  }

  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) {
    console.error("[delete-account]", delErr);
    return res.status(500).json({ error: "Failed to delete account. Please try again." });
  }

  return res.status(200).json({ ok: true });
}
