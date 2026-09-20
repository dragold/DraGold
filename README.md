# DraGold — TCG Collection Intelligence

**DraGold** helps serious TCG collectors understand what they own, what they're missing, and what it's worth — across Pokémon, One Piece, Magic, Yu-Gi-Oh! and more.

- **Set-focused collection view**: see owned vs missing cards per set, with EN/JA variants and market prices
- **Bulk add / CSV import**: quickly build your collection
- **On-demand image cache**: cards render fast without a massive upfront download
- **EN/JA variant clarity**: know which cards have both language versions
- **Market valuation**: real prices from multiple sources, with confidence signals

## Repository structure

```
DraGold/
├── src/                    # React + Vite frontend (the app you see)
├── supabase/               # Supabase schema, migrations, Edge Functions
│   ├── functions/          # Serverless functions (sync, price lookup, cache)
│   ├── migrations/         # Database schema evolution
│   └── schema.sql          # Current database schema
├── api/                    # Vercel API routes (market data, image cache)
├── scripts/                # Node.js sync/import/audit scripts
├── public/                 # Static assets (favicon, OG image, robots.txt)
├── docs/                   # Architecture, plans, contributor docs
├── .github/                # GitHub Actions workflows + issue/PR templates
└── package.json            # Node deps + scripts
```

## What this repository contains

This repository contains the **DraGold Community Core** — the open-source codebase that powers the DraGold application.

### Included

- Frontend application code (React, Vite)
- Database schema and migrations (Supabase/PostgreSQL)
- Edge Functions for data synchronization
- Vercel API routes
- GitHub Actions CI/CD workflows
- Development scripts

### Not included

- **Card data**: the actual TCG catalog lives in the Supabase database, not in this repo
- **User data**: collections, accounts, preferences — all in Supabase under RLS
- **Image cache**: card images are fetched on-demand and cached in Supabase Storage
- **Environment secrets**: see [SECURITY.md](SECURITY.md) and `.env.example`

## License

DraGold Community Core is released under the **BSD 3-Clause License**. See [LICENSE](LICENSE).

### Brand and trademark

**DraGold**, the DraGold logo, and `dragold.org` are trademarks of DraGold (Ermal). This license grants you the right to use, modify, and distribute the *code*. It does **not** grant you the right to use the DraGold name, logo, or brand to endorse or market your own project. If you fork this codebase, your project should have its own name and identity.

### Third-party assets

This repository includes card game logos (Pokémon, One Piece, Magic: The Gathering, Yu-Gi-Oh!) solely as set identification icons within the DraGold application. These are trademarks of their respective owners. If you redistribute or fork this codebase, you are responsible for ensuring your use of third-party trademarks complies with applicable law and the owners' policies.

Font files in `public/fonts/` are sourced from open-source font projects and are subject to their respective licenses (typically the SIL Open Font License). See the font files' source repositories for details.

## What can you do with this code?

Under the BSD 3-Clause License, you may:

- **Use** the code for any purpose (personal, educational, commercial)
- **Modify** the code
- **Distribute** copies of the original or modified code
- **Fork** the repository and build your own TCG tool

You must:

- Include the copyright notice and license text in any distribution
- Not use the DraGold name or logo to endorse your derivative without permission

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for how to get started.

## Community vs. Official DraGold

This repository is the **Community Core**. The **official DraGold product** — including the live website, official mobile apps, proprietary services, and commercial offerings — is maintained separately by the DraGold founder.

A fork of this codebase is **not** the official DraGold. If you build something on top of this code, that's your project — and we'd love to hear about it, but it's not affiliated with DraGold unless explicitly stated by the DraGold maintainer.

## Data sources

DraGold pulls catalog and price data from multiple sources. Each source has its own terms of service. The application is designed to respect rate limits and terms of use. If you use this codebase, you are responsible for complying with the terms of any data sources you connect to.

See [docs/data-sources.md](docs/data-sources.md) for a list of known sources and their general characteristics.

---

*Built by [Ermal](https://github.com/dragold). DraGold — fair market value for serious TCG collectors.*
