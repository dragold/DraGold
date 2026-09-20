# DraGold — Local Setup Guide

This guide walks you through setting up DraGold locally for development and testing.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Supabase Setup](#supabase-setup)
- [Running the Dev Server](#running-the-dev-server)
- [Running Tests](#running-tests)
- [Edge Functions](#edge-functions)
- [Sync Scripts](#sync-scripts)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node.js | 18+ | Runtime for the frontend, scripts, and API routes |
| npm | bundled with Node | Package management |
| Git | any recent version | Clone the repository |
| Supabase CLI | latest | Local database + Edge Functions development |
| A Supabase account | — | Project to connect to |

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/dragold/DraGold.git
cd DraGold

# 2. Install dependencies
npm install

# 3. Set up environment
cp .env.example .env.local
# Edit .env.local with your values (see Environment Variables below)

# 4. Start the dev server
npm run dev
```

Open the URL shown in the terminal (typically `http://localhost:5173`). The app should load.

---

## Environment Variables

DraGold uses different variables for different parts of the system. The `.env.example` file lists all of them with descriptions. Here's a summary:

### Required for the frontend (client-side)

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous/auth key (client-side) |

These are prefixed with `VITE_` so Vite exposes them to the client bundle.

### Required for server-side code (Edge Functions, scripts, API routes)

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (full DB access — keep secret) |
| `TCG_LOOKUP_API_KEY` | TCG Price Lookup API key (for set synchronization) |
| `IMAGE_CACHE_KEY` | Authentication key for the image cache API (if self-hosting) |

### Optional

Some features use additional API keys (eBay, image sources). See `.env.example` for the full list.

### Creating `.env.local`

```bash
cp .env.example .env.local
```

Then open `.env.local` in your editor and fill in the values. **Never commit `.env.local`.** It's in `.gitignore`.

---

## Supabase Setup

DraGold uses Supabase (PostgreSQL + Auth + Storage + Edge Functions).

### Option A: Use an existing Supabase project

1. Create a project at [supabase.com](https://supabase.com)
2. Copy the project URL and keys from Settings → API
3. Set them in `.env.local`

### Option B: Local development with Supabase CLI

1. Install the Supabase CLI: `npm install -g supabase` or follow the [official install guide](https://supabase.com/docs/guides/local-development)
2. Run `supabase init` in the project root (if not already done)
3. Run `supabase start` to launch a local Supabase stack
4. Apply migrations: `supabase migration up`
5. Set your `.env.local` to point to the local instance (check `supabase status` for the local URL)

The `supabase/` directory contains:
- `schema.sql` — the full database schema
- `migrations/` — incremental schema changes
- `functions/` — Edge Functions

---

## Running the Dev Server

```bash
npm run dev
```

This starts Vite's development server with hot module replacement. Changes to React components, pages, and styles should reflect immediately in the browser.

### What you should see

- The DraGold home page loads
- If Supabase is configured correctly, authentication flows work
- If set/card data is present in your Supabase project, the collection view works

---

## Running Tests

```bash
# Run all tests matching src/**/*.test.js
npm test

# Run script tests
npm run test:scripts
```

The test framework is Node's built-in test runner (`node --test`).

---

## Edge Functions

Edge Functions are Deno-based serverless functions that run on Supabase.

### List available functions

```bash
supabase functions list
```

### Serve a function locally

```bash
supabase functions serve sync-sets
```

This runs the function locally for development. The function needs the environment variables from `.env.local` (Supabase CLI reads `.env` by default — you may need to set them explicitly).

### Deploy a function

```bash
supabase functions deploy sync-sets
```

---

## Sync Scripts

DraGold includes Node.js scripts for data synchronization. These run against your Supabase project and require the service role key.

### Available scripts

| Script | What it does |
|---|---|
| `catalog:sync` | Synchronize TCG set catalog from sources |
| `sync:onepiece` | Sync One Piece card data |
| `sync:set-catalog` | Sync set catalog from TCG Price Lookup |
| `catalog:freshness` | Check and report catalog freshness |
| `compute:valuations` | Compute market valuations for cards |

### Running a script

```bash
npm run catalog:sync
```

Scripts read environment variables from `.env.local`. Make sure it's configured.

---

## Troubleshooting

### "VITE_SUPABASE_URL is not defined"

Your `.env.local` is missing or incomplete. Check that you copied `.env.example` and filled in all required values.

### "DOM error" or blank page on load

Check the browser console for errors. Common causes:
- Supabase connection issue (wrong URL or key)
- Missing RLS policies in your Supabase project
- CORS issues (try a fresh browser session)

### Edge Function fails with "TCG_LOOKUP_API_KEY non configurato"

The `sync-sets` function now requires `TCG_LOOKUP_API_KEY` to be set explicitly. Configure it in your Supabase project's Edge Function secrets, or as an environment variable when serving locally.

### "Cannot find module" errors

Make sure you ran `npm install`. If you switched Node versions, try deleting `node_modules` and reinstalling.

### Database errors

If you're using a local Supabase instance, make sure migrations have been applied. Run `supabase migration up` to apply any pending migrations.

---

## What's next

- Read [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow
- Read [SECURITY.md](SECURITY.md) for security practices
- Explore the `src/` directory to understand the codebase structure
- Check the [README](README.md) for an overview of the project
