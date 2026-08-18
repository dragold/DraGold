// DraGold — Edge Middleware: dynamic rendering for /carta/:slug (SEO Foundation, cont.)
//
// PROBLEMA: /carta/:slug e' puramente client-side (vercel.json fa rewrite di
// tutto a index.html, nessuna SSR). index.html serve solo meta generici della
// homepage finche' il bundle JS non gira e CardPage.jsx inietta i meta reali
// nel <head>. Googlebot esegue JS quindi arriva comunque al contenuto vero,
// ma con ritardo (coda di rendering separata) e con rischio reale su tutto
// cio' che NON esegue JS: molti social unfurler (facebookexternalhit,
// Twitterbot, LinkedInBot, Discordbot, ecc.), motori secondari, tool SEO.
// Per loro oggi ogni /carta/:slug condivide gli stessi meta della homepage.
//
// FIX MINIMO (dynamic rendering, tecnica riconosciuta da Google per le SPA,
// non e' cloaking finche' il contenuto servito ai bot rispecchia quello che
// un utente vede dopo il render JS — qui e' letteralmente lo stesso dato):
// solo per User-Agent noti come crawler/bot, questo middleware intercetta
// /carta/:slug PRIMA del rewrite SPA e restituisce HTML gia' pronto con
// title/description/canonical/OG/Twitter/JSON-LD/link interni reali, senza
// aspettare l'esecuzione JS. Per tutti gli altri utenti (umani) il middleware
// non fa nulla: nessun costo di latenza aggiuntivo, nessuna nuova query per
// il traffico reale, la SPA esistente resta invariata.
//
// Nessuna nuova libreria: fetch nativo verso l'API REST di Supabase (stesse
// env var gia' in uso in api/sitemap-cards.js). Nessun framework nuovo.

export const config = {
  matcher: '/carta/:slug',
};

const BOT_UA = /googlebot|bingbot|yandexbot|duckduckbot|baiduspider|slurp|facebookexternalhit|twitterbot|linkedinbot|discordbot|telegrambot|whatsapp|slackbot|redditbot|pinterest|applebot|semrushbot|ahrefsbot|mj12bot|dotbot|petalbot|bytespider|w3c_validator/i;

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

function notFoundHtml(slug) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>Card not found — DraGold</title>
<meta name="robots" content="noindex">
<meta name="description" content="This card is not yet available on DraGold.">
</head><body>
<h1>Card not found</h1>
<p>This card is not yet available on DraGold.</p>
<p><a href="https://dragold.org/">Back to home</a></p>
</body></html>`;
}

export default async function middleware(request) {
  const ua = request.headers.get('user-agent') || '';
  if (!BOT_UA.test(ua)) return; // utenti reali: nessun intervento, passa alla SPA normale

  const url = new URL(request.url);
  const slug = decodeURIComponent(url.pathname.replace(/^\/carta\//, ''));
  if (!slug) return;

  const env = typeof process !== 'undefined' ? process.env : {};

  const canonicalRows = await supaRest(
    `canonical_cards?slug=eq.${encodeURIComponent(slug)}&order=created_at.asc,id.asc&limit=1&select=*`,
    env
  );
  const canonical = canonicalRows && canonicalRows[0];
  if (!canonical) {
    return new Response(notFoundHtml(slug), { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }

  const variants = await supaRest(
    `cards?canonical_card_id=eq.${canonical.id}&select=id,tcg,name,set_id,set_name,card_number,rarity,image_url,image_url_hi,lang`,
    env
  ) || [];
  if (!variants.length) {
    return new Response(notFoundHtml(slug), { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }

  const primary = variants.find(c => c.id === canonical.primary_image_card_id)
    || variants.find(c => c.lang === 'en')
    || variants[0];
  const enVariant = variants.find(c => c.lang === 'en');
  const langLabels = { ja: 'Japanese', en: 'English', fr: 'French', de: 'German', es: 'Spanish', it: 'Italian', pt: 'Portuguese', ko: 'Korean', zh: 'Chinese' };
  const tcgLabels = { pokemon: 'Pokémon', mtg: 'Magic: The Gathering', ygo: 'Yu-Gi-Oh!', onepiece: 'One Piece' };
  const displayName = (enVariant && enVariant.name) || `${langLabels[primary.lang] || (primary.lang || '').toUpperCase()} ${tcgLabels[primary.tcg] || primary.tcg} Card ${primary.card_number || ''}`.trim();
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
  const imageUrl = primary.image_url_hi || primary.image_url || null;
  const priceTxt = currentPrice?.price_market != null ? ` — ${formatPrice(currentPrice.price_market, currentPrice.currency)}` : '';
  const title = `${displayName} (${displaySetName} #${primary.card_number}) — DraGold${priceTxt}`;
  const description = `${displayName} — ${displaySetName} #${primary.card_number}, rarity: ${primary.rarity || 'N/A'}. Market price, price history and best offers on DraGold.`;

  const graph = [
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'DraGold', item: 'https://dragold.org/' },
        { '@type': 'ListItem', position: 2, name: displayName, item: cardUrl },
      ],
    },
  ];
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
<a href="https://dragold.org/">← DraGold</a>
<h1>${escapeHtml(displayName)}</h1>
<p>${escapeHtml(displaySetName)} · #${escapeHtml(primary.card_number)} · ${escapeHtml((primary.lang || '').toUpperCase())}</p>
${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(displayName)}">` : ''}
${priceLine}
<h2>More from ${escapeHtml(displaySetName)}</h2>
${links || '<p>No other cards from this set indexed yet.</p>'}
</body></html>`;

  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600, s-maxage=3600' } });
}
