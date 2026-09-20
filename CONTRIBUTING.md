# Contributing to DraGold

Thank you for your interest in contributing to DraGold! This document explains how to set up your development environment, our contribution process, and what we're looking for.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [What We're Looking For](#what-were-looking-for)
- [Pull Request Process](#pull-request-process)
- [Coding Conventions](#coding-conventions)
- [Reporting Issues](#reporting-issues)
- [Suggesting Features](#suggesting-features)
- [Areas Not Open for Community Modification](#areas-not-open-for-community-modification)
- [License](#license)

---

## Getting Started

### Prerequisites

- **Node.js** 18+ (we use ES modules — `package.json` has `"type": "module"`)
- **npm** or equivalent (we use `package-lock.json`)
- **Supabase account** (for local database and Edge Functions development)
- **Vercel account** (optional — for API route deployment)

### Clone and install

```bash
git clone https://github.com/dragold/DraGold.git
cd DraGold
npm install
```

### Environment setup

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

Then edit `.env.local` with your Supabase credentials and API keys.
**Never commit `.env.local`** — it's in `.gitignore` for a reason.

### Start the development server

```bash
npm run dev
```

This starts the Vite dev server. Open the URL shown in the terminal (typically `http://localhost:5173`).

### Supabase local development

For full-stack development (database, Edge Functions, migrations):

1. Install the [Supabase CLI](https://supabase.com/docs/guides/local-development)
2. Run `supabase start` to spin up a local stack
3. Apply migrations with `supabase migration up`
4. Edge Functions can be invoked locally with `supabase functions serve <name>`

See [supabase/BACKEND_SETUP.md](supabase/BACKEND_SETUP.md) for detailed backend setup instructions.

### Running tests

```bash
# Frontend/lib tests
npm test

# Script tests
npm run test:scripts
```

---

## Development Workflow

We follow a standard fork-and-branch workflow:

```
1. Fork the repository on GitHub (click "Fork" button)
2. Clone your fork locally
3. Create a feature branch from main
4. Make your changes
5. Test locally
6. Commit with clear messages
7. Push to your fork
8. Open a Pull Request on dragold/DraGold
```

### Branch naming

Use descriptive branch names:

- `feat/description` — new feature
- `fix/description` — bug fix
- `docs/description` — documentation
- `refactor/description` — code restructuring without behavior change
- `chore/description` — maintenance tasks

Examples: `feat/card-search-filters`, `fix/price-display-rounding`, `docs/add-setup-guide`

---

## What We're Looking For

DraGold is a focused product. We're most interested in contributions that:

- **Fix bugs** — especially in the collection view, search, or sync functions
- **Improve the set-focused experience** — owned/missing display, EN/JA variants, prices
- **Add test coverage** — for existing functionality
- **Improve documentation** — setup guides, architecture docs, code comments
- **Hardening** — error handling, edge cases, performance

### Not in scope for this repository

Some features are part of the official DraGold product but not the Community Core:

- Academy / quiz / learning layer
- AI Q&A (Ask DraGold)
- Social features
- Character/illustrator/series pages
- Full image cache pipeline (the Core has on-demand cache; a complete offline cache is a product feature)

If you're unsure whether your idea fits, open an issue first and we'll discuss.

---

## Pull Request Process

### Before you open a PR

- [ ] Your branch is up to date with `main` (rebase if needed)
- [ ] You've tested locally (`npm run dev` + relevant test commands)
- [ ] You've checked for console errors and broken UI
- [ ] Your commit messages are clear
- [ ] You've read the [LICENSE](LICENSE) and agree to contribute under it

### Opening the PR

1. Go to the DraGold repository on GitHub
2. Click "Pull Requests" → "New Pull Request"
3. Select your fork and branch
4. Fill in the PR template (it will appear automatically)
5. Include:
   - What changed and why
   - How you tested it
   - Screenshots if there's a UI change
   - Link to any related issue

### Review process

- The maintainer will review your PR and may request changes
- CI checks must pass (tests, build)
- PRs are merged by the maintainer only — direct pushes to `main` are not allowed
- We aim to respond to PRs within a reasonable time, but can't guarantee SLA

### After merge

- Your PR is merged and your branch can be deleted
- You're listed as a contributor — thank you!

---

## Coding Conventions

### Language

- **Frontend**: JavaScript (JSX), no TypeScript in the UI layer currently
- **Edge Functions**: TypeScript (Deno runtime)
- **Scripts**: JavaScript (ES modules)
- **API routes**: JavaScript

### Code style

- Use consistent formatting — the existing codebase uses a particular style; match it
- Prefer clarity over cleverness
- Comment non-obvious logic, especially around data transformation and API interaction
- Use existing utility functions rather than re-implementing

### Git commit messages

We use conventional-ish commit messages:

```
feat: add card search by collector number
fix: handle missing EN card name in set view
docs: update setup instructions for Supabase CLI
refactor: extract price formatting to shared util
chore: update dependency versions
```

For more complex changes, add a body:

```
feat: add card search by collector number

Search now accepts a collector number like "046" and matches it
against the card_number field. Works for Pokémon, One Piece, MTG, and YGO.

Closes #42
```

### File structure

- Keep new components in `src/components/` or `src/pages/` as appropriate
- Shared utilities go in `src/lib/`
- New Edge Functions go in `supabase/functions/<name>/index.ts`
- New scripts go in `scripts/`

---

## Reporting Issues

### Bug reports

Use the [bug report issue template](.github/ISSUE_TEMPLATE/bug_report.md). Include:

- What you expected to happen
- What actually happened
- Steps to reproduce
- Your environment (browser, OS, Supabase project if relevant)
- Screenshots or error messages if available

### Crash reports

For Edge Function or API crashes, include:
- The function name
- The full error message
- Any relevant request parameters (but **never** include secrets or API keys)

---

## Suggesting Features

Use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.md). Include:

- The problem you're trying to solve
- Why it matters for TCG collectors
- How you envision it working
- Any alternatives you've considered

We discuss features in issues before implementation. This helps align contributions with the product direction and avoids wasted effort.

---

## Areas Not Open for Community Modification

Without explicit maintainer approval, please **do not** modify:

- **Database schema** — migrations are carefully sequenced; unilateral changes can break the schema evolution. Discuss schema changes in an issue first.
- **Supabase RLS policies** — these control data security. Changes require careful review.
- **Brand assets** — the DraGold logo, name, and visual identity are not open for modification. Forks should use their own branding.
- **Third-party logos in `public/logos/`** — these are included for set identification within DraGold. Forks should evaluate their own use of third-party trademarks.
- **Deployment configuration** — Vercel and Supabase project references in CI workflows are specific to the official project. Forks need their own configuration.

### Edge Functions and secrets

Edge Functions access external APIs and Supabase. They require environment secrets to work. **Never hardcode secrets** — always use `Deno.env.get()` or GitHub Actions secrets. If you add a new external API integration, make sure it's configured via environment variables.

---

## License

By contributing to DraGold, you agree that your contributions are licensed under the same **BSD 3-Clause License** as the project. See [LICENSE](LICENSE).

Your contribution must be your own original work, or you must have the right to license it under BSD 3-Clause. Do not submit code you don't have the right to contribute.

---

*Questions? Open an issue and we'll help you get oriented.*
