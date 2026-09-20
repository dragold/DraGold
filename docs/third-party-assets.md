# Third-Party Assets — DraGold Community Core

This document covers the third-party assets included in or referenced by the DraGold repository: logos, fonts, and data sources. It clarifies what's included, what the licensing situation is, and what fork maintainers need to know.

**This is not legal advice.** When in doubt, consult a qualified attorney.

---

## Set identification logos

The `public/logos/` directory contains PNG icons used to identify trading card games within the DraGold UI:

| File | Represents | Trademark owner |
|---|---|---|
| `pkm.png` | Pokémon TCG | The Pokémon Company International |
| `op.png` | One Piece Card Game | Bandai Namco |
| `mtg.png` | Magic: The Gathering | Wizards of the Coast (Hasbro) |
| `ygo.png` | Yu-Gi-Oh! TCG | Konami |

### How they're used

These logos appear as small set identification icons in the DraGold interface (set cards, TCG game pages, collection views). They are used to help users quickly identify which game a set belongs to.

### License status

**These logos are trademarks, not open-source assets.** They are not licensed to DraGold under any open-source or free-use license. Their inclusion in this repository is for the purpose of identifying the respective TCG within the DraGold application.

### For the official DraGold project

The official DraGold project uses these logos as set identification icons within its application. This is a common pattern in TCG tracker apps. However, trademark law varies by jurisdiction, and the legality of this use should be evaluated by the project owner.

### For forks and derivative projects

**If you fork DraGold, you should evaluate whether to keep, replace, or remove these logos.**

Consider:

- Your use case — are you using them the same way (set identification within a TCG app)?
- Your jurisdiction — trademark fair use / nominative use doctrines vary
- The trademark owner's policies — some owners are more permissive than others
- Your risk tolerance — trademark claims can be costly even when unfounded

**Recommendations for forks:**

1. **Replace with your own icons** — create original set identification icons for your project
2. **Use text labels only** — "Pokémon", "One Piece", "Magic", "Yu-Gi-Oh!" as text without the official logos
3. **Remove them entirely** — if you're unsure, removing the logos is the safest option

The code references to these logos are in:
- `src/DraGold.jsx` (game configuration)
- `src/lib/tcgConfig.js` (TCG metadata)
- `src/pages/tcg/TcgPage.jsx` (TCG page rendering)

Removing the logos without breaking the UI requires updating these references to either point to alternative assets or use text-only rendering.

---

## Font assets

The `public/fonts/` directory contains web font files used by the DraGold UI:

| Font | Files | Likely license | Source |
|---|---|---|---|
| Fraunces | `fraunces.woff2`, `fraunce-ext.woff2`, `fraunces-italic.woff2`, `fraunces-italic-ext.woff2` | SIL Open Font License (OFL) | [fontfry.com](https://fraunces.fontfry.com) / GitHub |
| Plus Jakarta Sans | `jakarta.woff2`, `jakarta-ext.woff2` | SIL Open Font License (OFL) | Google Fonts |
| Space Mono | `space-mono-400.woff2`, `space-mono-400-ext.woff2`, `space-mono-700.woff2`, `space-mono-700-ext.woff2` | SIL Open Font License (OFL) | Google Fonts |

### License status

These fonts are believed to be licensed under the **SIL Open Font License (OFL)**, which permits:
- Redistribution in source and binary forms
- Use in commercial and non-commercial projects
- Embedding in web pages (via `@font-face`)

**However**, the specific font files in this repository have not been individually verified against the original license terms. The OFL is the most likely license, but you should verify before redistributing.

### For forks

If you redistribute this repository, you should:

1. Verify the OFL license for each font file
2. Include the appropriate OFL license text and attribution
3. Or replace the fonts with ones you have confirmed the right to distribute

If you're unsure, using system fonts or Google Fonts via CDN eliminates the redistribution question entirely.

---

## Data sources

See [docs/data-sources.md](docs/data-sources.md) for a detailed list of data sources, their characteristics, and notes for fork maintainers.

Key points:

- **Card data** is not in this repository — it lives in the Supabase database
- **Images** are fetched on-demand from third-party sources — you need your own API access
- **Prices** come from third-party sources — you need your own API access
- **Logos and fonts** are the only visual assets included in the repository

---

## Summary for contributors

When contributing to DraGold:

- **Do not add new third-party logos** without understanding the trademark implications
- **Do not add new fonts** without confirming the license allows redistribution
- **Do not add new data sources** without understanding their terms of service
- **If you're building a fork**, plan your own asset strategy early

---

*This document is part of the DraGold Community Core. See [README](README.md) for the project overview and [LICENSE](LICENSE) for the license terms.*
