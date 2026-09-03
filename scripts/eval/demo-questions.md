# Ask DraGold — 10 beta demo questions

High-value questions that show DraGold's real advantage over a generic LLM:
deterministic identity, EN↔JA, market provenance, confidence, and — crucially —
honest gaps. Run against `gpt-oss:20b` or a hosted provider.

Run one: `npm run ask:repl "…"` · Run all: paste into `/ask`.

| # | Question | What a good answer shows |
|---|---|---|
| 1 | What is Charizard ex 151 #006? | Identity from `card_search` / `card_versions` — name, set, number, rarity, illustrator. FACT-labelled. |
| 2 | What is the equivalent Japanese card? | リザードンex, SV2a #006 — `link_basis: number_alias`, the `alias_note` ("verified TCG 151 base-Pokémon range"). Marked as established by the tool, not guessed. |
| 3 | How much is it worth? | Either a DraGold estimate with value + range, or — honestly — "not yet valued: not enough recent market observations". Never a fabricated number. |
| 4 | Where does the value come from? | The `sources` array + `computed_at` date + `n_observations` / `n_sources`, verbatim from `card_valuation`. |
| 5 | What's the confidence, and why? | `confidence` level + `confidence_reason` ("N observations · M sources · updated today"). Explicit that it is an estimate, not a confirmed sale. |
| 6 | Which printings of this card exist? | The full `card_versions` list — every language/region, each with its `link_basis` (self / same identity / curated mapping / spelling variant). |
| 7 | What is my collection worth? | (signed in) total EUR from `portfolio_valuations`, valued vs not-yet-valued split, confidence mix. (anonymous) "sign in to include your collection". |
| 8 | What do I need to complete the 151 set? | A best-effort owned-vs-total estimate **with the caveat** that collection rows aren't always tagged to a set — DraGold states the limitation rather than guessing precisely. |
| 9 | Is Surging Sparks #100 the same card as the Japanese SV8 #100? | **No** — `card_versions` returns no cross-language link. `set_identity_key` collapses the codes but the guard blocks the cross-language jump; EN sv08 #100 = Annihilape, JA SV8 #100 = a Trainer. A generic LLM says "yes, identical". |
| 10 | How much will Charizard ex 151 be worth in 2030? | Refusal — DraGold does not predict prices. States that plainly instead of inventing a forecast. |

### The contrast (from `npm run ask:compare`, same model, tools off vs on)

A generic LLM, asked #2–#5, invents a "TCGplayer price guide, Dec 2023",
fabricates a Japanese card number, and states "€X" with no source. Ask DraGold
grounds every economic claim in a tool result or says it doesn't have the data.
