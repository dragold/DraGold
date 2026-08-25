// DraGold — Academy MVP content (Task 4).
// Static, versioned in the repo like every other reference dataset (TCG_LIST,
// CARD_LANGS in DraGold.jsx) — there's no CMS/DB for lesson *content* itself,
// only per-user completion state lives in Supabase (see academy_progress
// migration + listAcademyProgress/markLessonComplete in supabase.js).
// Kept separate from the page components (AcademyPage/AcademyLessonPage) so
// content and presentation stay decoupled, per CLAUDE.md §5.
//
// One lesson per topic for this first pass (5 topics -> 5 lessons), each
// lesson split into short sections (h3/p/ul) covering its sub-points — real,
// but deliberately not card/set-specific (no invented data), per the task
// brief. Links (FASE 5) only point at stable, real DraGold URLs that exist
// today (home "/", the Pokémon hub "/pokemon") — no per-card/per-set link
// invented, since those need real slugs this content has no reason to know.

export const ACADEMY_CATEGORIES = [
  { id: "tcg-basics",         label: "TCG Basics",          icon: "doc" },
  { id: "card-anatomy",       label: "Card Anatomy",        icon: "card" },
  { id: "rarity-variants",    label: "Rarity & Variants",   icon: "trophy" },
  { id: "pokemon-en-jp",      label: "Pokémon EN vs JP",    icon: "grid" },
  { id: "collection-basics",  label: "Collection Basics",   icon: "wallet" },
];

export function getCategory(id) {
  return ACADEMY_CATEGORIES.find(c => c.id === id) || null;
}

export const ACADEMY_LESSONS = [
  {
    slug: "tcg-basics",
    category: "tcg-basics",
    title: "TCG Basics",
    summary: "What a trading card game is, and the four words you'll see everywhere on DraGold: card, set, release, variant.",
    minutes: 3,
    body: [
      { type: "h3", text: "What is a TCG?" },
      { type: "p", text: "A trading card game (TCG) is played with individually collectible cards, each with its own rules, artwork and value. Pokémon, One Piece, Magic: The Gathering and Yu-Gi-Oh! are the four TCGs DraGold tracks. Cards are sold in packs, boxes and singles, and what's available changes over time as new sets release and older ones go out of print." },
      { type: "h3", text: "Card, Set, Release & Variant" },
      { type: "p", text: "Four terms you'll run into constantly:" },
      { type: "ul", items: [
        "Card — a single printed card, identified by its name and card number.",
        "Set — a themed group of cards released together (a Pokémon expansion, a One Piece booster, and so on).",
        "Release / language — the same card can be printed in different languages and regions (EN, JA, and others) as separate releases.",
        "Variant — a different print of the same card within a set (holo vs non-holo, or a special parallel).",
      ] },
      { type: "p", text: "DraGold's catalog is built around this hierarchy — TCG → Set → Card → Variant/Language — so once these four words click, the rest of the app makes a lot more sense." },
    ],
    links: [{ label: "Browse the catalog", href: "/" }],
  },
  {
    slug: "card-anatomy",
    category: "card-anatomy",
    title: "Card Anatomy",
    summary: "How to read a card: card number, rarity, set, language and variant — the facts every Card Detail page shows.",
    minutes: 3,
    body: [
      { type: "h3", text: "How to Read a Card" },
      { type: "p", text: "Every card on DraGold carries the same handful of facts, shown together on its Card Detail page. Learning to read them means you can tell two similar-looking cards apart at a glance." },
      { type: "h3", text: "Card Number" },
      { type: "p", text: "The card's position within its set, usually printed in a corner (e.g. 25/102). It's the fastest way to confirm you're looking at the exact same print someone else is describing." },
      { type: "h3", text: "Rarity" },
      { type: "p", text: "A label set by the publisher (Common, Rare, Secret Rare...) that roughly signals how scarce a card is within its set — the next lesson covers the full ladder." },
      { type: "h3", text: "Set" },
      { type: "p", text: "The expansion or booster the card was released in, shown with its name and — on DraGold — its release date and logo." },
      { type: "h3", text: "Language" },
      { type: "p", text: "The same card is often printed in multiple languages (EN, JA and more). DraGold tracks each language printing as its own entry, so you can tell an English card from its Japanese counterpart." },
      { type: "h3", text: "Variant" },
      { type: "p", text: "A different physical print of the same card and number — holo, reverse holo, or a special parallel treatment. Card Detail lists the other variants and languages available for a card so you can compare them side by side." },
    ],
    links: [],
  },
  {
    slug: "rarity-variants",
    category: "rarity-variants",
    title: "Rarity & Variants",
    summary: "Common, Uncommon, Rare and beyond — plus what a parallel/variant print actually is.",
    minutes: 3,
    body: [
      { type: "h3", text: "Common, Uncommon, Rare — and Beyond" },
      { type: "p", text: "Most TCGs use a rarity ladder to signal how often a card turns up in packs: Common, Uncommon and Rare are usually the baseline, with higher tiers (Rare Holo, Ultra Rare, Secret Rare and other publisher-specific labels) layered on top for chase cards. Exact names and tiers differ from game to game, and sometimes from set to set." },
      { type: "h3", text: "Parallel & Variant Prints" },
      { type: "p", text: "On top of rarity, many cards get extra print variants: a holographic finish, a reverse holo, or a special parallel exclusive to a promo or a particular edition. Two cards can share the same name, number and set and still be different variants worth tracking separately." },
      { type: "h3", text: "Normal Print vs Variant" },
      { type: "p", text: "A \"normal\" print is the standard, non-special version of a card. A variant is anything printed differently from that baseline — different foiling, a different border, a different art treatment. DraGold treats each as its own catalog entry, with its own price history." },
    ],
    links: [{ label: "Open the Pokémon hub", href: "/pokemon" }],
  },
  {
    slug: "pokemon-en-jp",
    category: "pokemon-en-jp",
    title: "Pokémon EN vs JP",
    summary: "Why English and Japanese Pokémon cards aren't always the 'same' card — naming, timing and variant differences.",
    minutes: 3,
    body: [
      { type: "h3", text: "Different Naming" },
      { type: "p", text: "Japanese and English Pokémon releases don't always share the same card or set names — a set can carry a different Japanese title than its English counterpart, and card text is naturally translated rather than copied. DraGold links both languages to the same underlying card wherever that mapping is known." },
      { type: "h3", text: "Set & Release Timing" },
      { type: "p", text: "Japan usually gets a set before its English release — sometimes by several months. That means a card can be trackable on DraGold in Japanese long before an English print exists, and the two releases can end up with meaningfully different print runs and scarcity." },
      { type: "h3", text: "Language & Variant Differences" },
      { type: "p", text: "Beyond naming, EN and JP prints of what looks like \"the same\" card can differ in rarity labeling, foil pattern, or which variants exist at all — a promo variant available in Japan may never get an English equivalent, and vice versa. Always check the language pill on Card Detail before assuming two listings are the same print." },
    ],
    links: [{ label: "Open the Pokémon hub", href: "/pokemon" }],
  },
  {
    slug: "collection-basics",
    category: "collection-basics",
    title: "Collection Basics",
    summary: "How to start a collection on DraGold, what quantity means, and why set completion matters.",
    minutes: 2,
    body: [
      { type: "h3", text: "Building Your Collection" },
      { type: "p", text: "Adding a card to your DraGold collection is one click from Card Detail — \"Add to Portfolio\". It's the same action whether it's the first copy of a card or your fifth; it's how you start tracking anything you own." },
      { type: "h3", text: "Quantity" },
      { type: "p", text: "DraGold tracks how many copies of each card you own as a single number — quantity — rather than one row per copy. Clicking \"Add to Portfolio\" again on a card you already own increments it; removing a copy decrements it, and the position disappears once quantity reaches zero." },
      { type: "h3", text: "Set Completion" },
      { type: "p", text: "Because your collection is linked to real sets, DraGold can tell you how much of a set you actually own — useful if you're working toward finishing a specific expansion rather than just tracking value." },
    ],
    links: [{ label: "Open your Collection", href: "/" }],
  },
];

export function getLesson(slug) {
  return ACADEMY_LESSONS.find(l => l.slug === slug) || null;
}

// Adjacent lessons for the prev/next nav on the lesson page — linear order,
// same as ACADEMY_LESSONS (deliberately matches the numbered list in the
// task brief: TCG Basics -> Card Anatomy -> Rarity & Variants -> Pokémon EN
// vs JP -> Collection Basics).
export function getAdjacentLessons(slug) {
  const i = ACADEMY_LESSONS.findIndex(l => l.slug === slug);
  if (i === -1) return { prev: null, next: null };
  return {
    prev: i > 0 ? ACADEMY_LESSONS[i - 1] : null,
    next: i < ACADEMY_LESSONS.length - 1 ? ACADEMY_LESSONS[i + 1] : null,
  };
}
