# Secrets and Sensitive Configuration — DraGold Community Core

**This document contains no real secrets.** It explains *where* secrets live and *how* to manage them. Never put actual credential values in this file or anywhere in the repository.

---

## Where secrets live

| Secret | Where configured | Accessed by |
|---|---|---|
| `SUPABASE_URL` | `.env.local` (dev), GitHub Actions secrets (CI) | Frontend, Edge Functions, scripts |
| `SUPABASE_ANON_KEY` | `.env.local` (dev) | Frontend (client-side only) |
| `SUPABASE_SERVICE_KEY` | `.env.local` (dev), GitHub Actions secrets, Supabase Edge Function secrets | Edge Functions, server-side scripts |
| `SUPABASE_ACCESS_TOKEN` | GitHub Actions secrets | `deploy-edge-functions.yml` workflow |
| `TCG_LOOKUP_API_KEY` | Supabase Edge Function secrets, `.env.local` (dev) | `supabase/functions/sync-sets/index.ts` |
| `IMAGE_CACHE_KEY` | `.env.local` (dev) | `api/cache-image.js`, `api/scan-images.js` |
| `SCRYDEX_API_KEY`, `SCRYDEX_TEAM_ID` | GitHub Actions secrets | `image-audit.yml` (optional) |
| `POKEMONTCG_API_KEY`, `POKEMONPRICETRACKER_API_KEY` | GitHub Actions secrets | `image-audit.yml` (optional) |

---

## Golden rules

1. **Never commit secrets.** `.env` and `.env.local` are in `.gitignore`. If you add a new file that contains secrets, add it to `.gitignore` before committing.
2. **Never hardcode secrets in code.** Always use `Deno.env.get()` (Edge Functions), `process.env` (Node.js scripts), or `import.meta.env` (Vite client-side).
3. **Never paste secrets into issues, PRs, chat, or log output.** If you need to share debugging info, redact the actual values.
4. **Rotate secrets that are exposed.** If a secret ends up in the repo (even briefly), revoke/rotate it at the provider immediately and consider Git history remediation.

---

## Setting up for local development

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
2. Fill in your own values.
3. **Do not commit `.env.local`.**

For Supabase Edge Functions, set secrets in the Supabase dashboard (Project Settings → Edge Functions → Secrets) or pass them when serving locally:
```bash
supabase functions serve sync-sets --env-file .env.local
```

---

## Setting up GitHub Actions secrets

1. Go to GitHub → Repository → Settings → Secrets and variables → Actions
2. Add the required secrets:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `SUPABASE_ACCESS_TOKEN`
   - `IMAGE_CACHE_KEY`
   - `SCRYDEX_API_KEY` (if using Scrydex)
   - `SCRYDEX_TEAM_ID` (if using Scrydex)
   - `POKEMONTCG_API_KEY`, `POKEMONPRICETRACKER_API_KEY` (if using those image sources)
3. Optionally, add a repository variable `SUPABASE_PROJECT_REF` to avoid hardcoding the project reference in workflows.

---

## Historical note: TCG_LOOKUP_API_KEY exposure

In commit `fccd130` ("feat: add sync-sets Edge Function"), the `sync-sets` Edge Function included a hardcoded fallback API key:
```
const TCG_KEY = Deno.env.get('TCG_LOOKUP_API_KEY') || 'tcg_...)
```

This was **removed** in a subsequent fix. The function now requires `TCG_LOOKUP_API_KEY` to be explicitly configured and will refuse to start without it. The key value from that commit has been revoked/rotaed at the provider.

The old commit remains in Git history. This is by design — history rewriting on a public repository has consequences (broken clones, affected forks, lost contributor attribution) and is only done when the security risk justifies the disruption. If you're concerned about this specific exposure, see [SECURITY.md](SECURITY.md) for the policy on reported vulnerabilities.

---

## If you discover an exposed secret

1. **Don't disclose it publicly.** Open a private security advisory or email the maintainer. See [SECURITY.md](SECURITY.md).
2. **Revoke/rotate immediately** at the service provider.
3. **Remove from the current file** (if still in the working tree).
4. **Evaluate Git history remediation** — see [SECURITY.md](SECURITY.md) for the policy.
5. **Add to `.gitignore`** if the file wasn't already excluded.

---

*This is a living document. If you find gaps in our secrets management, open an issue or PR.*
