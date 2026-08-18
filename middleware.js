// DraGold — Edge Middleware: dynamic rendering for /carta/:slug and /set/:slug
// (SEO Foundation, cont. — Block 5 extends this to Set Pages instead of
// duplicating the bot-gating system: same matcher family, same helpers).
//
// PROBLEMA: sia /carta/:slug che /set/:slug sono puramente client-side (vercel.json
// fa rewrite di tutto a index.html, nessuna SSR). index.html serve solo meta generici
// della homepage finche' il bundle JS non gira e la relativa pagina (CardPage.jsx /
// SetPage.jsx) inietta i meta reali nel <head>. Googlebot esegue JS quindi arriva
// comunque al contenuto vero, ma con ritardo (coda di rendering separata) e con
// rischio reale su tutto cio' che NON esegue JS: molti social unfurler
// (facebookexternalhit, Twitterbot, LinkedInBot, Discordbot, ecc.), motori
// secondari, tool SEO. Per loro oggi ogni /carta/:slug o /set/:slug condivide gli
// stessi meta della homepage.
//
// FIX MINIMO (dynamic rendering, tecnica riconosciuta da Google per le SPA,
// non e' cloaking finche' il contenuto servito ai bot rispecchia quello che
// un utente vede dopo il render JS — qui e' letteralmente lo stesso dato):
// solo per User-Agent noti come crawler/bot, questo middleware intercetta
// /carta/:slug e /set/:slug PRIMA del rewrite SPA e restituisce HTML gia' pronto
// con title/description/canonical/OG/Twitter/JSON-LD/link interni reali, senza
// aspettare l'esecuzione JS. Per tutti gli altri utenti (umani) il middleware
// non fa nulla: nessun costo di latenza aggiuntivo, nessuna nuova query per
// il traffico reale, la SPA esistente resta invariata.
//
// Nessuna nuova libreria: fetch nativo verso l'API REST di Supabase (stesse
// env var gia' in uso in api/sitemap-cards.js). Nessun framework nuovo.

// Block 6 - TCG Hub SEO Foundation: stesso middleware esteso alle 4 URL esatte
// /pokemon, /onepiece, /mtg, /ygo — terzo riuso dello stesso sistema (matcher,
// bot-detection, helper), nessun secondo middleware creato.
// Blocco "Illustrator Pages": quarto riuso dello stesso sistema, /illustrator/:slug.
export const config = {
  matcher: ['/carta/:slug', '/set/:slug', '/illustrator/:slug', '/pokemon', '/onepiece', '/mtg', '/ygo'],
};

const BOT_UA = /googlebot|bingbot|yandexbot|duckduckbot|baiduspider|slurp|facebookexternalhit|twitterbot|linkedinbot|discordbot|telegrambot|whatsapp|slackbot|redditbot|pinterest|applebot|semrushbot|ahrefsbot|mj12bot|dotbot|petalbot|bytespider|w3c_validator/i;

const TCG_LABELS = { pokemon: 'Pokémon', mtg: 'Magic: The Gathering', ygo: 'Yu-Gi-Oh!', onepiece: 'One Piece' };
const TCGS = Object.keys(TCG_LABELS);
// Stessa descrizione statica di src/lib/tcgConfig.js — duplicata qui per lo
// stesso motivo gia' documentato per la risoluzione set (bundle Edge separato).
const TCG_DESCRIPTIONS = {
  pokemon: 'Pokémon Trading Card Game — every set from the original Base Set to the latest release, with real market prices and rarities.',
  onepiece: 'One Piece Card Game — every set, every card, with real market prices tracked in real time.',
  mtg: 'Magic: The Gathering — decades of sets, from vintage to the latest release, with real market prices.',
  ygo: 'Yu-Gi-Oh! Trading Card Game — every set, every card, with real market prices in one place.',
};

function escapeHtml(s) {
  return String(s ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

function formatPrice(value, currency) {
  if (value == null) return null;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(value);
  } catch {
    return `${value} ${currency || ''}`;
  }
}

async function supaRest(path, env) {
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) return null;
  return res.json();
}

function notFoundHtml(kind) {
  const label = kind === 'set' ? 'Set' : kind === 'illustrator' ? 'Illustrator' : 'Card';
  const msg = kind === 'set' ? 'This set is not yet available on DraGold.'
    : kind === 'illustrator' ? 'This illustrator is not yet available on DraGold.'
    : 'This card is not yet available on DraGold.';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>${label} not found — DraGold</title>
<meta name="robots" content="noindex">
<meta name="description" content="${msg}">
</head><body>
<h1>${label} not found</h1>
<p>${msg}</p>
<p><a href="https://dragold.org/">Back to home</a></p>
</body></html>`;
}

async function handleCardBot(slug) {
  const env = typeof process !== 'undefined' ? process.env : {};

  const canonicalRows = await supaRest(
    `canonical_cards?slug=eq.${encodeURIComponent(slug)}&order=created_at.asc,id.asc&limit=1&select=*`,
    env
  );
  const canonical = canonicalRows && canonicalRows[0];
  if (!canonical) {
    return new Response(notFoundHtml('card'), { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }

  const variants = await supaRest(
    `cards?canonical_card_id=eq.${canonical.id}&select=id,tcg,name,set_id,set_name,card_number,rarity,image_url,image_url_hi,lang,illustrator`,
    env
  ) || [];
  if (!variants.length) {
    return new Response(notFoundHtml('card'), { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }

  const primary = variants.find(c => c.id === canonical.primary_image_card_id)
    || variants.find(c => c.lang === 'en')
    || variants[0];
  const enVariant = variants.find(c => c.lang === 'en');
  const langLabels = { ja: 'Japanese', en: 'English', fr: 'French', de: 'German', es: 'Spanish', it: 'Italian', pt: 'Portuguese', ko: 'Korean', zh: 'Chinese' };
  const displayName = (enVariant && enVariant.name) || `${langLabels[primary.lang] || (primary.lang || '').toUpperCase()} ${TCG_LABELS[primary.tcg] || primary.tcg} Card ${primary.card_number || ''}`.trim();
  const displaySetName = (enVariant && enVariant.set_name) || (primary.lang === 'en' ? primary.set_name : null) || primary.set_id || primary.set_name;

  const [priceRows, sameSetRows] = await Promise.all([
    supaRest(`card_prices?card_id=eq.${encodeURIComponent(primary.id)}&order=captured_at.desc&limit=1&select=price_market,currency,captured_at`, env),
    supaRest(`cards?tcg=eq.${primary.tcg}&set_id=eq.${encodeURIComponent(primary.set_id || '')}&lang=eq.${primary.lang}&id=neq.${encodeURIComponent(primary.id)}&limit=8&select=id,name,card_number,canonical_card_id`, env),
  ]);
  const currentPrice = (priceRows && priceRows[0]) || null;

  let sameSetLinks = [];
  const sameSet = sameSetRows || [];
  if (sameSet.length) {
    const ccIds = [...new Set(sameSet.map(c => c.canonical_card_id).filter(Boolean))];
    const ccRows = ccIds.length ? await supaRest(`canonical_cards?id=in.(${ccIds.join(',')})&select=id,slug`, env) : [];
    const slugMap = new Map((ccRows || []).map(r => [r.id, r.slug]));
    sameSetLinks = sameSet
      .map(c => ({ name: c.name, cardNumber: c.card_number, slug: c.canonical_card_id ? slugMap.get(c.canonical_card_id) : null }))
      .filter(c => c.slug);
  }

  const canonicalSlug = canonical.slug || slug;
  const cardUrl = `https://dragold.org/carta/${canonicalSlug}`;
  // Block 5: link reale Card -> Set (stessa regola di slug deterministico
  // usata in src/lib/setSlug.js: tcg + set_id normalizzato).
  const setSlug = primary.set_id ? `${primary.tcg}-${slugifySetId(primary.set_id)}` : null;
  const setUrl = setSlug ? `https://dragold.org/set/${setSlug}` : null;
  const imageUrl = primary.image_url_hi || primary.image_url || null;
  const priceTxt = currentPrice?.price_market != null ? ` — ${formatPrice(currentPrice.price_market, currentPrice.currency)}` : '';
  const title = `${displayName} (${displaySetName} #${primary.card_number}) — DraGold${priceTxt}`;
  const description = `${displayName} — ${displaySetName} #${primary.card_number}, rarity: ${primary.rarity || 'N/A'}. Market price, price history and best offers on DraGold.`;

  // Block 6: nodo TCG reale (/{tcg}) prima del nodo Set.
  const hubUrl = TCGS.includes(primary.tcg) ? `https://dragold.org/${primary.tcg}` : null;
  const breadcrumbItems = [
    { '@type': 'ListItem', position: 1, name: 'DraGold', item: 'https://dragold.org/' },
  ];
  if (hubUrl) breadcrumbItems.push({ '@type': 'ListItem', position: breadcrumbItems.length + 1, name: TCG_LABELS[primary.tcg] || primary.tcg, item: hubUrl });
  if (setUrl) breadcrumbItems.push({ '@type': 'ListItem', position: breadcrumbItems.length + 1, name: displaySetName, item: setUrl });
  breadcrumbItems.push({ '@type': 'ListItem', position: breadcrumbItems.length + 1, name: displayName, item: cardUrl });

  const graph = [{ '@type': 'BreadcrumbList', itemListElement: breadcrumbItems }];
  if (imageUrl) graph.push({ '@type': 'ImageObject', contentUrl: imageUrl, url: imageUrl });
  const productNode = {
    '@type': 'Product',
    name: displayName,
    image: imageUrl ? [imageUrl] : undefined,
    description: `${displayName} — ${displaySetName} #${primary.card_number}`,
    sku: primary.card_number,
    brand: { '@type': 'Brand', name: primary.tcg },
    url: cardUrl,
  };
  if (currentPrice && currentPrice.price_market != null) {
    productNode.offers = {
      '@type': 'Offer',
      priceCurrency: currentPrice.currency || 'USD',
      price: currentPrice.price_market,
      availability: 'https://schema.org/InStock',
      url: cardUrl,
    };
  }
  graph.push(productNode);
  const jsonLd = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });

  const priceLine = currentPrice?.price_market != null
    ? `<p>Market price: ${escapeHtml(formatPrice(currentPrice.price_market, currentPrice.currency))}</p>`
    : `<p>Price not yet available for this card.</p>`;

  const links = sameSetLinks.length
    ? `<ul>${sameSetLinks.map(c => `<li><a href="https://dragold.org/carta/${escapeHtml(c.slug)}">${escapeHtml(c.name)} #${escapeHtml(c.cardNumber || '')}</a></li>`).join('')}</ul>`
    : '';

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${cardUrl}">
<meta name="robots" content="index,follow">
<meta property="og:type" content="product">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${cardUrl}">
${imageUrl ? `<meta property="og:image" content="${escapeHtml(imageUrl)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
${imageUrl ? `<meta name="twitter:image" content="${escapeHtml(imageUrl)}">` : ''}
<script type="application/ld+json">${jsonLd}</script>
</head><body>
<a href="https://dragold.org/">← DraGold</a>${hubUrl ? ` · <a href="${hubUrl}">${escapeHtml(TCG_LABELS[primary.tcg] || primary.tcg)}</a>` : ''}
<h1>${escapeHtml(displayName)}</h1>
<p>${escapeHtml(displaySetName)} · #${escapeHtml(primary.card_number)} · ${escapeHtml((primary.lang || '').toUpperCase())}</p>
${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(displayName)}">` : ''}
${priceLine}
${primary.illustrator ? `<p>Illustrator: <a href="https://dragold.org/illustrator/${escapeHtml(slugifyIllustrator(primary.illustrator))}">${escapeHtml(primary.illustrator)}</a></p>` : ''}
<h2>More from ${escapeHtml(displaySetName)}${setUrl ? ` — <a href="${setUrl}">View full set</a>` : ''}</h2>
${links || '<p>No other cards from this set indexed yet.</p>'}
</body></html>`;

  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600, s-maxage=3600' } });
}

// Block 5 - Set slug resolution. Duplica intenzionalmente la stessa regola di
// src/lib/setSlug.js/setPageData.js (lo slug e' una normalizzazione lossy di
// cards.set_id: lowercase + non-alfanumerico -> "-"): middleware.js gira in un
// bundle Edge separato dal resto della SPA, stesso motivo per cui la risoluzione
// canonical della carta qui sopra e' gia' una copia mirata di cardPageData.js.
function slugifySetId(setId) {
  return String(setId || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
function parseSetSlug(slug) {
  const s = String(slug || '');
  for (const tcg of TCGS) {
    if (s.startsWith(tcg + '-')) {
      const setIdSlug = s.slice(tcg.length + 1);
      if (setIdSlug) return { tcg, setIdSlug };
    }
  }
  return null;
}
function rawSetIdCandidates(setIdSlug) {
  const dotted = setIdSlug.replace(/-/g, '.');
  return [...new Set([setIdSlug, setIdSlug.toUpperCase(), dotted, dotted.toUpperCase()])];
}

async function handleSetBot(slug) {
  const env = typeof process !== 'undefined' ? process.env : {};
  const parsed = parseSetSlug(slug);
  if (!parsed) {
    return new Response(notFoundHtml('set'), { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
  const { tcg, setIdSlug } = parsed;

  const probe = await supaRest(
    `cards?tcg=eq.${tcg}&set_id=in.(${rawSetIdCandidates(setIdSlug).map(encodeURIComponent).join(',')})&select=set_id&limit=1`,
    env
  );
  const realSetId = probe?.[0]?.set_id;
  if (!realSetId || slugifySetId(realSetId) !== setIdSlug) {
    return new Response(notFoundHtml('set'), { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }

  const FIELDS = 'id,name,card_number,image_url,image_url_hi,lang,set_name,canonical_card_id';
  let rows = await supaRest(`cards?tcg=eq.${tcg}&set_id=eq.${encodeURIComponent(realSetId)}&lang=eq.en&select=${FIELDS}&limit=400`, env) || [];
  if (!rows.length) {
    rows = await supaRest(`cards?tcg=eq.${tcg}&set_id=eq.${encodeURIComponent(realSetId)}&select=${FIELDS}&limit=400`, env) || [];
  }
  if (!rows.length) {
    return new Response(notFoundHtml('set'), { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }

  const logoRows = await supaRest(`set_logos?tcg=eq.${tcg}&set_code=eq.${encodeURIComponent(realSetId)}&select=set_name,logo_url,release_date&limit=1`, env);
  const logo = logoRows?.[0] || null;
  const setName = logo?.set_name || rows[0]?.set_name || realSetId;
  const cardCount = rows.length;
  const hasMore = cardCount >= 400;

  const ccIds = [...new Set(rows.map(c => c.canonical_card_id).filter(Boolean))];
  const ccRows = ccIds.length ? await supaRest(`canonical_cards?id=in.(${ccIds.join(',')})&select=id,slug`, env) : [];
  const slugMap = new Map((ccRows || []).map(r => [r.id, r.slug]));

  const tcgLabel = TCG_LABELS[tcg] || tcg;
  const setSlug = `${tcg}-${setIdSlug}`;
  const setUrl = `https://dragold.org/set/${setSlug}`;
  const countTxt = hasMore ? `${cardCount}+ cards` : `${cardCount} card${cardCount === 1 ? '' : 's'}`;
  const title = `${setName} (${tcgLabel}) — Set Guide & Card List — DraGold`;
  const description = `${setName} is a ${tcgLabel} set${logo?.release_date ? ` released ${logo.release_date}` : ''} with ${countTxt}. Browse every card, price and rarity on DraGold.`;

  // Block 6: nodo TCG reale (/{tcg}) prima del nodo Set — breadcrumb a 3 livelli.
  const hubUrl = `https://dragold.org/${tcg}`;
  const graph = [{
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'DraGold', item: 'https://dragold.org/' },
      { '@type': 'ListItem', position: 2, name: tcgLabel, item: hubUrl },
      { '@type': 'ListItem', position: 3, name: setName, item: setUrl },
    ],
  }];
  if (logo?.logo_url) graph.push({ '@type': 'ImageObject', contentUrl: logo.logo_url, url: logo.logo_url });
  graph.push({
    '@type': 'CollectionPage',
    name: `${setName} — ${tcgLabel}`,
    description,
    url: setUrl,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: cardCount,
      itemListElement: rows.slice(0, 60).filter(c => c.canonical_card_id && slugMap.get(c.canonical_card_id)).map((c, i) => ({
        '@type': 'ListItem', position: i + 1, name: c.name, url: `https://dragold.org/carta/${slugMap.get(c.canonical_card_id)}`,
      })),
    },
  });
  const jsonLd = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });

  const cardLinksHtml = rows.map(c => {
    const cSlug = c.canonical_card_id ? slugMap.get(c.canonical_card_id) : null;
    if (!cSlug) return '';
    return `<li><a href="https://dragold.org/carta/${escapeHtml(cSlug)}">${escapeHtml(c.name)} #${escapeHtml(c.card_number || '')}</a></li>`;
  }).filter(Boolean).join('');

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${setUrl}">
<meta name="robots" content="index,follow">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${setUrl}">
${logo?.logo_url ? `<meta property="og:image" content="${escapeHtml(logo.logo_url)}">` : ''}
<meta name="twitter:card" content="${logo?.logo_url ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
${logo?.logo_url ? `<meta name="twitter:image" content="${escapeHtml(logo.logo_url)}">` : ''}
<script type="application/ld+json">${jsonLd}</script>
</head><body>
<a href="https://dragold.org/">← DraGold</a> · <a href="${hubUrl}">${escapeHtml(tcgLabel)}</a>
<h1>${escapeHtml(setName)}</h1>
<p>${escapeHtml(tcgLabel)} · ${escapeHtml(realSetId)}${logo?.release_date ? ` · Released ${escapeHtml(logo.release_date)}` : ''} · ${escapeHtml(countTxt)}</p>
${logo?.logo_url ? `<img src="${escapeHtml(logo.logo_url)}" alt="${escapeHtml(setName)}">` : ''}
<h2>Cards in this set</h2>
<ul>${cardLinksHtml}</ul>
</body></html>`;

  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600, s-maxage=3600' } });
}

// Block 6 - TCG Hub bot rendering. Lavora sui set (canonical_cards, piu'
// leggero di cards), stesso principio gia' validato in api/sitemap-sets.js e
// src/pages/tcg/tcgPageData.js — incluso il fallback su cards.set_id per
// tcg='onepiece' (canonical_cards.set_id e' NULL al 100% per quel tcg, bug
// scoperto in questo blocco, vedi commento in api/sitemap-sets.js).
async function handleTcgBot(tcg) {
  const env = typeof process !== 'undefined' ? process.env : {};
  const label = TCG_LABELS[tcg];
  if (!label) return new Response(notFoundHtml('set'), { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });

  let ccRows = await supaRest(`canonical_cards?tcg=eq.${tcg}&set_id=not.is.null&select=set_id&limit=50000`, env) || [];
  const counts = new Map();
  for (const r of ccRows) {
    const slugId = slugifySetId(r.set_id);
    if (!slugId) continue;
    const cur = counts.get(slugId);
    if (cur) cur.count++; else counts.set(slugId, { setId: r.set_id, count: 1 });
  }
  if (!counts.size) {
    const cardRows = await supaRest(`cards?tcg=eq.${tcg}&set_id=not.is.null&select=set_id&limit=50000`, env) || [];
    for (const r of cardRows) {
      const slugId = slugifySetId(r.set_id);
      if (!slugId) continue;
      const cur = counts.get(slugId);
      if (cur) cur.count++; else counts.set(slugId, { setId: r.set_id, count: 1 });
    }
  }

  const setIds = [...counts.values()].map(v => v.setId);
  const logoRows = setIds.length ? await supaRest(`set_logos?tcg=eq.${tcg}&set_code=in.(${setIds.map(encodeURIComponent).join(',')})&select=set_code,set_name,logo_url`, env) : [];
  const logoMap = new Map((logoRows || []).map(r => [slugifySetId(r.set_code), r]));

  const sets = [...counts.entries()]
    .map(([slugId, { setId, count }]) => {
      const logo = logoMap.get(slugId);
      return { slug: `${tcg}-${slugId}`, setName: logo?.set_name || setId, logoUrl: logo?.logo_url || null, cardCount: count };
    })
    .sort((a, b) => b.cardCount - a.cardCount || a.setName.localeCompare(b.setName));

  const hubUrl = `https://dragold.org/${tcg}`;
  const description = `${TCG_DESCRIPTIONS[tcg]} ${sets.length} sets indexed.`;
  const title = `${label} — Sets, Cards & Market Prices — DraGold`;
  const firstLogo = sets.find(s => s.logoUrl)?.logoUrl || null;

  const graph = [{
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'DraGold', item: 'https://dragold.org/' },
      { '@type': 'ListItem', position: 2, name: label, item: hubUrl },
    ],
  }, {
    '@type': 'CollectionPage',
    name: `${label} — DraGold`,
    description,
    url: hubUrl,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: sets.length,
      itemListElement: sets.slice(0, 100).map((s, i) => ({ '@type': 'ListItem', position: i + 1, name: s.setName, url: `https://dragold.org/set/${s.slug}` })),
    },
  }];
  const jsonLd = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });

  const setLinksHtml = sets.map(s => `<li><a href="https://dragold.org/set/${escapeHtml(s.slug)}">${escapeHtml(s.setName)}</a> — ${s.cardCount} card${s.cardCount === 1 ? '' : 's'}</li>`).join('');

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${hubUrl}">
<meta name="robots" content="index,follow">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${hubUrl}">
${firstLogo ? `<meta property="og:image" content="${escapeHtml(firstLogo)}">` : ''}
<meta name="twitter:card" content="${firstLogo ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
${firstLogo ? `<meta name="twitter:image" content="${escapeHtml(firstLogo)}">` : ''}
<script type="application/ld+json">${jsonLd}</script>
</head><body>
<a href="https://dragold.org/">← DraGold</a>
<h1>${escapeHtml(label)}</h1>
<p>${escapeHtml(TCG_DESCRIPTIONS[tcg])}</p>
<p>${sets.length} set${sets.length === 1 ? '' : 's'} indexed</p>
<h2>Sets</h2>
<ul>${setLinksHtml}</ul>
</body></html>`;

  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600, s-maxage=3600' } });
}

// Blocco "Illustrator Pages" - stesso principio gia' validato per Set/TCG Hub:
// duplicazione locale mirata della stessa regola di src/lib/illustratorSlug.js
// (bundle Edge separato dal resto della SPA). Fonte unica: cards.illustrator
// (colonna reale indicizzata, nessuna nuova tabella). Duplicate handling
// deterministico identico a src/pages/illustrator/illustratorPageData.js: se piu'
// varianti raw collassano sullo stesso slug si aggregano e si sceglie come nome
// canonico quella con piu' carte (tie-break alfabetico).
function slugifyIllustrator(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// PostgREST richiede gli elementi di in.(...) tra virgolette quando contengono
// caratteri speciali (virgola, parentesi, virgolette) — verificato su Supabase che
// cards.illustrator li contiene davvero (es. 'K. Hoshiba, CR CG gangs', '"Big Mama"
// Tagawa, CR CG gangs'). Si costruisce la lista quotata/escaped e si URL-encoda
// l'intero valore come un solo componente di query string, cosi' le virgole/virgolette
// interne al nome non vengono confuse con i delimitatori della lista da PostgREST.
function pgInFilter(values) {
  const quoted = values.map(v => '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"').join(',');
  return encodeURIComponent(`in.(${quoted})`);
}

async function handleIllustratorBot(slug) {
  const env = typeof process !== 'undefined' ? process.env : {};

  const rawRows = await supaRest(`cards?illustrator=not.is.null&select=illustrator&limit=40000`, env) || [];
  const seen = new Set();
  for (const r of rawRows) if (r.illustrator) seen.add(r.illustrator);
  const variants = [...seen].filter(name => slugifyIllustrator(name) === slug);
  if (!variants.length) {
    return new Response(notFoundHtml('illustrator'), { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }

  let canonicalName = variants[0];
  if (variants.length > 1) {
    const countRows = await supaRest(`cards?illustrator=${pgInFilter(variants)}&select=illustrator&limit=5000`, env) || [];
    const counts = new Map();
    for (const r of countRows) counts.set(r.illustrator, (counts.get(r.illustrator) || 0) + 1);
    canonicalName = [...variants].sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0) || a.localeCompare(b))[0];
  }

  const FIELDS = 'id,tcg,name,set_id,card_number,image_url,image_url_hi,lang,canonical_card_id';
  let rows = await supaRest(`cards?illustrator=${pgInFilter(variants)}&lang=eq.en&select=${FIELDS}&limit=400`, env) || [];
  let langUsed = 'en';
  if (!rows.length) {
    rows = await supaRest(`cards?illustrator=${pgInFilter(variants)}&select=${FIELDS}&limit=400`, env) || [];
    langUsed = null;
  }
  if (!rows.length) {
    return new Response(notFoundHtml('illustrator'), { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }

  const ccIds = [...new Set(rows.map(c => c.canonical_card_id).filter(Boolean))];
  const ccRows = ccIds.length ? await supaRest(`canonical_cards?id=in.(${ccIds.join(',')})&select=id,slug`, env) : [];
  const slugMap = new Map((ccRows || []).map(r => [r.id, r.slug]));
  const linkable = rows.filter(c => c.canonical_card_id && slugMap.get(c.canonical_card_id));
  if (!linkable.length) {
    return new Response(notFoundHtml('illustrator'), { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }

  const tcgs = [...new Set(linkable.map(c => c.tcg))].sort();
  const tcgLabelsTxt = tcgs.map(t => TCG_LABELS[t] || t).join(', ');
  const cardCount = linkable.length;
  const hasMore = rows.length >= 400;
  const countTxt = hasMore ? `${cardCount}+ cards` : `${cardCount} card${cardCount === 1 ? '' : 's'}`;
  const illustratorUrl = `https://dragold.org/illustrator/${slug}`;
  const title = `${canonicalName} — Illustrator, Cards & Artwork — DraGold`;
  const description = `${canonicalName} has illustrated ${countTxt} on DraGold${tcgLabelsTxt ? ` (${tcgLabelsTxt})` : ''}. Browse the full gallery with prices and rarities.`;

  const graph = [{
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'DraGold', item: 'https://dragold.org/' },
      { '@type': 'ListItem', position: 2, name: canonicalName, item: illustratorUrl },
    ],
  }, {
    '@type': 'CollectionPage',
    name: `${canonicalName} — Illustrator — DraGold`,
    description,
    url: illustratorUrl,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: cardCount,
      itemListElement: linkable.slice(0, 60).map((c, i) => ({
        '@type': 'ListItem', position: i + 1, name: c.name, url: `https://dragold.org/carta/${slugMap.get(c.canonical_card_id)}`,
      })),
    },
  }];
  const jsonLd = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });

  const cardLinksHtml = linkable.map(c => {
    const cSlug = slugMap.get(c.canonical_card_id);
    return `<li><a href="https://dragold.org/carta/${escapeHtml(cSlug)}">${escapeHtml(c.name)} #${escapeHtml(c.card_number || '')}</a></li>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${illustratorUrl}">
<meta name="robots" content="index,follow">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${illustratorUrl}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<script type="application/ld+json">${jsonLd}</script>
</head><body>
<a href="https://dragold.org/">← DraGold</a>
<h1>${escapeHtml(canonicalName)}</h1>
<p>Illustrator${tcgLabelsTxt ? ` · ${escapeHtml(tcgLabelsTxt)}` : ''} · ${escapeHtml(countTxt)}</p>
<h2>Cards illustrated by ${escapeHtml(canonicalName)}</h2>
<ul>${cardLinksHtml}</ul>
</body></html>`;

  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600, s-maxage=3600' } });
}

export default async function middleware(request) {
  const ua = request.headers.get('user-agent') || '';
  if (!BOT_UA.test(ua)) return; // utenti reali: nessun intervento, passa alla SPA normale

  const url = new URL(request.url);
  if (url.pathname.startsWith('/carta/')) {
    const slug = decodeURIComponent(url.pathname.replace(/^\/carta\//, ''));
    if (!slug) return;
    return handleCardBot(slug);
  }
  if (url.pathname.startsWith('/set/')) {
    const slug = decodeURIComponent(url.pathname.replace(/^\/set\//, ''));
    if (!slug) return;
    return handleSetBot(slug);
  }
  if (url.pathname.startsWith('/illustrator/')) {
    const slug = decodeURIComponent(url.pathname.replace(/^\/illustrator\//, ''));
    if (!slug) return;
    return handleIllustratorBot(slug);
  }
  // Block 6: solo le 4 URL esatte sono TCG Hub validi — nessuna route dinamica.
  const tcgPath = url.pathname.replace(/^\//, '').replace(/\/$/, '');
  if (TCGS.includes(tcgPath)) {
    return handleTcgBot(tcgPath);
  }
  return;
}
