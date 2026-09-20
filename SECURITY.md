# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in DraGold, please report it responsibly. We take security seriously and will work with you to address the issue.

### How to report

**Do not open a public GitHub issue for security vulnerabilities.** Public disclosure before a fix is available puts users at risk.

Instead, email the maintainer directly at **[redacted — see below]**.

If you prefer, you can also open a **private** security advisory on GitHub (Settings → Security → Advisories → New draft security advisory).

### What to include

- Description of the vulnerability
- Steps to reproduce (if possible)
- Impact assessment (what an attacker could do)
- Any remediation you've identified
- Your contact information for follow-up

### What to expect

- We will acknowledge your report within a reasonable time
- We will work with you to understand and address the issue
- We will keep you informed of progress
- We will coordinate disclosure once a fix is available

### What we ask

- Give us a reasonable amount of time to fix the issue before public disclosure
- Do not exploit the vulnerability beyond what's necessary to demonstrate it
- Do not access or modify user data beyond what's necessary for the report
- Do not demand payment — we appreciate responsible disclosure without a bounty requirement (though we don't rule out a future bounty program)

---

## Security Measures in This Repository

### Secrets management

**DraGold does not store secrets in the repository.** All sensitive credentials are configured through:

- **Environment variables** (`.env.local` — gitignored)
- **Supabase secrets** (set in the Supabase dashboard, accessed via `Deno.env.get()` in Edge Functions)
- **GitHub Actions secrets** (set in repository Settings → Secrets and variables → Actions)

If you find a hardcoded secret in this repository, that is a security issue — report it following the process above.

### Historical secret exposure

At one point, a TCG Price Lookup API key was present in the code as a hardcoded fallback in `supabase/functions/sync-sets/index.ts`. This was **removed** and replaced with a required environment variable configuration. The key was revoked/rotaed. The old commit remains in Git history (see [SECURITY.md](SECURITY.md) for the history policy). If you clone this repository, the fix is already in place — the function will refuse to start without `TCG_LOOKUP_API_KEY` configured.

### Environment variables required

To run DraGold locally, you need:

| Variable | Purpose | Where to get it |
|---|---|---|
| `SUPABASE_URL` | Supabase project URL | Supabase dashboard |
| `SUPABASE_ANON_KEY` | Client-side Supabase auth | Supabase dashboard |
| `SUPABASE_SERVICE_KEY` | Server-side Supabase access (Edge Functions, scripts) | Supabase dashboard, service role key |
| `TCG_LOOKUP_API_KEY` | TCG Price Lookup API (set sync) | TCG Price Lookup service |
| `IMAGE_CACHE_KEY` | Image cache authentication (if self-hosting) | Your own secret |

See `.env.example` for the full list with descriptions.

### What not to do

- **Never commit `.env.local` or any file containing real secrets**
- **Never paste secrets into issue reports, PR descriptions, or chat**
- **Never share your Supabase service role key** — it has full database access
- **Never deploy with default or example credentials**

---

## Git History and Exposed Secrets

This repository uses Git. If a secret is ever committed, even accidentally, it remains in the Git history even after being removed from the current file.

If you discover that a secret has been exposed in this repository's history:

1. Report it following the vulnerability reporting process above
2. The secret should be **revoked/rotaed immediately** at the service provider
3. We will evaluate whether Git history rewriting is appropriate

**Note**: Rewriting Git history on a public repository has consequences (broken clones, affected forks, contributor history). We will only do it when the security risk outweighs the disruption.

---

## Third-Party Dependencies

DraGold uses several open-source libraries. We track direct dependencies in `package.json`. Security vulnerabilities in dependencies should be reported to the respective maintainers, but we're happy to help coordinate if the issue affects DraGold specifically.

---

## Security Contacts

- **Maintainers**: see the README for the project maintainer
- **GitHub Security Advisories**: available on the repository for coordinated disclosure

---

*This policy is a living document. Suggestions for improvement are welcome via pull request.*
