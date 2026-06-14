// DraGold — Price Alert Checker v12 (zero imports, pure fetch)
// No ESM imports — uses Supabase REST API + Resend directly via fetch
// Eliminates BOOT_ERROR caused by esm.sh resolution failures at cold start

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_ROLE_KEY') || '';
const RESEND_KEY   = Deno.env.get('RESEND_API_KEY') || '';
const EBAY_CAMP    = '5339152703';

// ── Supabase REST helpers ────────────────────────────────────────────────────
function sbHeaders() {
  return {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };
}

async function sbSelect(table, query) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`;
  const res = await fetch(url, { headers: sbHeaders() });
  if (!res.ok) throw new Error(`sbSelect ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function sbUpdate(table, query, body) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: sbHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) console.warn(`sbUpdate ${table}: ${res.status}`);
}

async function sbAuthUsers() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) return [];
  const d = await res.json();
  return (d && d.users) ? d.users : (Array.isArray(d) ? d : []);
}

// ── eBay affiliate links ─────────────────────────────────────────────────────
const EBAY_STORES = {
  it: { domain: 'ebay.it',    flag: '🇮🇹', label: 'eBay Italy',   mkrid: '724-53478-19255-0',  siteid: '101' },
  de: { domain: 'ebay.de',    flag: '🇩🇪', label: 'eBay Germany', mkrid: '707-53477-19255-0',  siteid: '77'  },
  fr: { domain: 'ebay.fr',    flag: '🇫🇷', label: 'eBay France',  mkrid: '709-53476-19255-0',  siteid: '71'  },
  es: { domain: 'ebay.es',    flag: '🇪🇸', label: 'eBay Spain',   mkrid: '1185-53479-19255-0', siteid: '186' },
  gb: { domain: 'ebay.co.uk', flag: '🇬🇧', label: 'eBay UK',      mkrid: '710-53481-19255-0',  siteid: '3'   },
};

function ebayAffiliateUrl(country, cardName, tcg) {
  const store = EBAY_STORES[country.toLowerCase()] || EBAY_STORES['it'];
  const suffix = tcg === 'mtg' ? ' magic card' : tcg === 'yugioh' ? ' yugioh card' : tcg === 'onepiece' ? ' one piece card' : ' pokemon card';
  const q = encodeURIComponent(cardName + suffix);
  return `https://www.${store.domain}/sch/i.html?_nkw=${q}&LH_BIN=1&mkevt=1&mkrid=${store.mkrid}&mkcid=1&campid=${EBAY_CAMP}&toolid=10001&siteid=${store.siteid}`;
}

// ── eBay Browse API — prezzo live (active listings, lowest price) ────────────
// Chiamata diretta alla fetch-ebay-prices edge function già deployata
const EBAY_FN_URL = `${SUPABASE_URL}/functions/v1/fetch-ebay-prices`;

async function getEbayLivePrice(cardName: string, tcg: string, country: string): Promise<{ price: number; name: string; source: string } | null> {
  try {
    const tcgStr = tcg === 'mtg' ? 'magic gathering' : tcg === 'ygo' || tcg === 'yugioh' ? 'yugioh' : tcg === 'onepiece' ? 'one piece' : 'pokemon';
    const query = `${cardName} ${tcgStr}`.trim();
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 10000);
    let res: Response;
    try {
      res = await fetch(EBAY_FN_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, country: country || 'it', limit: 5 }),
      });
    } finally { clearTimeout(tid); }
    if (!res.ok) return null;
    const data = await res.json();
    const items: any[] = (data?.items || []).filter((i: any) => i.price && i.price > 0);
    if (!items.length) return null;
    // Mediana tra i primi 3 risultati (evita outlier altissimi o bassissimi)
    const prices = items.slice(0, 3).map((i: any) => i.price).sort((a: number, b: number) => a - b);
    const price = prices[Math.floor(prices.length / 2)];
    return { price, name: cardName, source: 'ebay_live' };
  } catch (e: any) {
    console.warn(`eBay live price error for "${cardName}": ${e?.message}`);
    return null;
  }
}

// ── TCGdex price fetch (fallback) ────────────────────────────────────────────
async function getTCGdexData(cardApiId: string): Promise<{ price: number; name: string; source: string } | null> {
  try {
    const res = await fetch(`https://api.tcgdex.net/v2/en/cards/${cardApiId}`, {
      headers: { 'User-Agent': 'DraGold-AlertChecker/2.0' }
    });
    if (!res.ok) return null;
    const d = await res.json();
    const cm = d && d.pricing && d.pricing.cardmarket;
    if (!cm) return null;
    const p = (cm.prices && typeof cm.prices === 'object') ? cm.prices : cm;
    const price = p.trendPrice || p.trend || p.avg1 || p.avg7 || p.avg30 || p.avg || p.averageSellPrice || p.low || null;
    if (price == null) return null;
    return { price: parseFloat(price), name: d.name || cardApiId, source: 'tcgdex' };
  } catch (e: any) {
    console.warn(`TCGdex error ${cardApiId}: ${e.message}`);
    return null;
  }
}

// ── Card image ───────────────────────────────────────────────────────────────
async function getCardImage(cardApiId) {
  try {
    const rows = await sbSelect('cards', `id=eq.${encodeURIComponent(cardApiId)}&select=image_url_hi,image_url&limit=1`);
    const row = rows && rows[0];
    return (row && (row.image_url_hi || row.image_url)) || null;
  } catch (_e) {
    return null;
  }
}

// ── Portfolio context ────────────────────────────────────────────────────────
async function getPortfolioData(email, cardApiId) {
  try {
    const users = await sbAuthUsers();
    const user = users.find((u) => u.email && u.email.toLowerCase() === email.toLowerCase());
    if (!user) return null;

    const rows = await sbSelect('collection',
      `user_id=eq.${user.id}&card_api_id=eq.${encodeURIComponent(cardApiId)}&select=purchase_price,fmv_snapshot,condition`
    );
    if (!rows || rows.length === 0) return null;

    const copies = rows.length;
    const purchases = rows.map((r) => r.purchase_price).filter((p) => p != null);
    const fmvs = rows.map((r) => r.fmv_snapshot).filter((f) => f != null);
    const conditions = rows.map((r) => r.condition).filter(Boolean);
    const condOrder = ['PSA 10', 'PSA 9', 'GEM-MT', 'MINT', 'NM-MT', 'NM', 'LP', 'MP', 'HP', 'D'];
    const bestCondition = conditions.sort((a, b) => {
      const ai = condOrder.findIndex((c) => a.toUpperCase().includes(c));
      const bi = condOrder.findIndex((c) => b.toUpperCase().includes(c));
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    })[0] || null;

    return {
      copies,
      totalPurchase: purchases.length ? purchases.reduce((a, b) => a + b, 0) : null,
      avgFmv: fmvs.length ? fmvs.reduce((a, b) => a + b, 0) / fmvs.length : null,
      bestCondition,
    };
  } catch (e) {
    console.warn(`Portfolio lookup error: ${e.message}`);
    return null;
  }
}

// ── HTML Email builder ───────────────────────────────────────────────────────
function buildEmail(params: any) {
  const { cardName, cardApiId, tcg, currentPrice, targetPrice, imageUrl, portfolio, primaryCountry, priceSource = 'eBay live' } = params;
  const savingsPct = Math.round(((targetPrice - currentPrice) / targetPrice) * 100);
  const tcgLabel = tcg === 'mtg' ? 'Magic: The Gathering' : tcg === 'yugioh' ? 'Yu-Gi-Oh!' : tcg === 'onepiece' ? 'One Piece TCG' : 'Pokémon TCG';
  const accentA  = tcg === 'mtg' ? '#8b5cf6' : tcg === 'yugioh' ? '#3b82f6' : tcg === 'onepiece' ? '#ef4444' : '#f59e0b';
  const accentB  = tcg === 'mtg' ? '#6366f1' : tcg === 'yugioh' ? '#1d4ed8' : tcg === 'onepiece' ? '#dc2626' : '#f97316';

  const primaryStore = EBAY_STORES[primaryCountry.toLowerCase()] || EBAY_STORES['it'];
  const primaryUrl   = ebayAffiliateUrl(primaryCountry, cardName, tcg);

  let portfolioHtml = '';
  if (portfolio && portfolio.copies > 0) {
    const totalFmv    = portfolio.avgFmv != null ? (portfolio.avgFmv * portfolio.copies) : null;
    const totalBought = portfolio.totalPurchase;
    const pl          = (totalFmv != null && totalBought != null) ? totalFmv - totalBought : null;
    const plColor     = (pl != null && pl >= 0) ? '#4ade80' : '#f87171';
    const plSign      = (pl != null && pl >= 0) ? '+' : '';
    portfolioHtml = `
<div style="background:#0d0d1a;border:1px solid rgba(139,92,246,.18);border-radius:12px;padding:16px 20px;margin-bottom:20px;">
  <div style="font-size:9px;font-weight:700;color:#8b5cf6;text-transform:uppercase;letter-spacing:2px;margin-bottom:12px;">🐉 Your Vault — this card</div>
  <div style="display:flex;gap:18px;flex-wrap:wrap;">
    <div><div style="font-size:9px;color:#555;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Copies</div><div style="font-size:22px;font-weight:900;color:#e0e0f0;">${portfolio.copies}</div></div>
    ${portfolio.bestCondition ? `<div><div style="font-size:9px;color:#555;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Best cond.</div><div style="font-size:22px;font-weight:900;color:#e0e0f0;">${portfolio.bestCondition}</div></div>` : ''}
    ${totalFmv != null ? `<div><div style="font-size:9px;color:#555;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">FMV</div><div style="font-size:22px;font-weight:900;color:#a78bfa;">€${totalFmv.toFixed(2)}</div></div>` : ''}
    ${pl != null ? `<div><div style="font-size:9px;color:#555;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">P&L</div><div style="font-size:22px;font-weight:900;color:${plColor};">${plSign}€${Math.abs(pl).toFixed(2)}</div></div>` : ''}
  </div>
  <div style="margin-top:10px;font-size:10px;color:#444;">Buying more at this price could lower your average cost basis.</div>
</div>`;
  } else {
    portfolioHtml = `
<div style="background:#0d0d1a;border:1px dashed rgba(139,92,246,.15);border-radius:12px;padding:14px 20px;margin-bottom:20px;">
  <div style="font-size:11px;color:#555;line-height:1.5;">🐉 Not in your vault yet. <a href="https://dragold.org" style="color:#8b5cf6;text-decoration:none;">Add it after you buy →</a></div>
</div>`;
  }

  const otherStores = Object.entries(EBAY_STORES)
    .filter(([k]) => k !== primaryCountry.toLowerCase())
    .map(([k, s]) => {
      const url = ebayAffiliateUrl(k, cardName, tcg);
      return `<td style="background:#191930;border:1px solid rgba(255,255,255,.06);border-radius:8px;padding:9px 4px;text-align:center;"><a href="${url}" style="color:#8888aa;text-decoration:none;font-size:11px;font-weight:600;white-space:nowrap;">${s.flag} ${s.label}</a></td>`;
    }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${cardName} — DraGold Alert</title></head>
<body style="margin:0;padding:20px 0 40px;background:#0a0a18;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="max-width:560px;margin:0 auto;background:#131325;border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,0.06);box-shadow:0 24px 80px rgba(0,0,0,.7);">
  <div style="background:linear-gradient(135deg,${accentA},${accentB});padding:22px 28px 20px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td><div style="font-size:10px;font-weight:700;letter-spacing:2.5px;color:rgba(0,0,0,.5);text-transform:uppercase;margin-bottom:4px;">DraGold · Price Alert</div><div style="font-size:28px;font-weight:900;color:#0d0d1a;letter-spacing:-.5px;line-height:1;">⚡ Target reached</div></td>
      <td align="right" style="vertical-align:top;"><div style="font-size:9px;color:rgba(0,0,0,.4);text-align:right;line-height:1.6;">${tcgLabel}<br>${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</div></td>
    </tr></table>
  </div>
  <div style="padding:24px 28px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:22px;"><tr>
      <td width="88" valign="top">${imageUrl ? `<img src="${imageUrl}" alt="${cardName}" width="80" style="border-radius:10px;box-shadow:0 12px 28px rgba(0,0,0,.55);display:block;">` : `<div style="width:80px;height:112px;border-radius:10px;background:#1e1e38;text-align:center;line-height:112px;font-size:28px;">🃏</div>`}</td>
      <td valign="top" style="padding-left:16px;padding-top:4px;">
        <div style="font-size:9px;font-weight:700;letter-spacing:2px;color:${accentA};text-transform:uppercase;margin-bottom:6px;">${tcgLabel}</div>
        <div style="font-size:20px;font-weight:900;color:#f0f0f8;line-height:1.2;margin-bottom:6px;">${cardName}</div>
        <div style="font-size:10px;color:#3a3a55;font-family:monospace;">${cardApiId}</div>
      </td>
    </tr></table>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;"><tr>
      <td width="49%" style="background:#0a0a18;border-radius:12px;padding:16px;border:1px solid rgba(74,222,128,.15);"><div style="font-size:9px;font-weight:700;letter-spacing:2px;color:#4ade80;text-transform:uppercase;margin-bottom:6px;">Current price</div><div style="font-size:34px;font-weight:900;color:#4ade80;letter-spacing:-1px;line-height:1;">€${currentPrice.toFixed(2)}</div><div style="font-size:10px;color:#555;margin-top:3px;">CardMarket trend</div></td>
      <td width="2%"></td>
      <td width="49%" style="background:#0a0a18;border-radius:12px;padding:16px;border:1px solid rgba(245,158,11,.15);"><div style="font-size:9px;font-weight:700;letter-spacing:2px;color:${accentA};text-transform:uppercase;margin-bottom:6px;">Your target</div><div style="font-size:34px;font-weight:900;color:${accentA};letter-spacing:-1px;line-height:1;">€${targetPrice.toFixed(2)}</div><div style="font-size:10px;color:#4ade80;margin-top:3px;">${savingsPct}% below target 🎯</div></td>
    </tr></table>
    ${portfolioHtml}
    <a href="${primaryUrl}" style="display:block;background:linear-gradient(135deg,${accentA},${accentB});color:#0d0d1a;text-decoration:none;text-align:center;padding:17px;border-radius:13px;font-weight:900;font-size:17px;letter-spacing:-.2px;margin-bottom:10px;box-shadow:0 8px 24px rgba(0,0,0,.35);">${primaryStore.flag}&nbsp; Buy on ${primaryStore.label} →</a>
    <div style="font-size:9px;color:#3a3a55;text-align:center;margin-bottom:7px;text-transform:uppercase;letter-spacing:1.5px;">Also search on</div>
    <table width="100%" cellpadding="0" cellspacing="4" border="0" style="margin-bottom:22px;"><tr>${otherStores}</tr></table>
    <table width="100%" cellpadding="0" cellspacing="8" border="0" style="margin-bottom:28px;"><tr>
      <td width="49%" style="background:#191930;border:1px solid rgba(255,255,255,.05);border-radius:9px;padding:11px;text-align:center;"><a href="https://dragold.org" style="color:#8888aa;text-decoration:none;font-size:12px;font-weight:600;">🐉 View on DraGold</a></td>
      <td width="2%"></td>
      <td width="49%" style="background:#191930;border:1px solid rgba(255,255,255,.05);border-radius:9px;padding:11px;text-align:center;"><a href="https://dragold.org" style="color:#8888aa;text-decoration:none;font-size:12px;font-weight:600;">🔔 Set a new alert</a></td>
    </tr></table>
  </div>
  <div style="border-top:1px solid rgba(255,255,255,.04);padding:15px 28px;text-align:center;">
    <div style="font-size:9px;color:#2e2e48;line-height:1.8;">Price source: ${priceSource} · Checked daily<br>This alert has been deactivated — <a href="https://dragold.org" style="color:#444;">set a new one at dragold.org</a><br>eBay links include affiliate tracking (EPN) at no extra cost to you</div>
  </div>
</div>
</body>
</html>`;
}

// ── Send via Resend ──────────────────────────────────────────────────────────
async function sendAlertEmail(to, subject, html) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: 'DraGold Alerts <alerts@dragold.org>', to: [to], subject, html }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend ${res.status}: ${err}`);
  }
  const d = await res.json();
  return d.id;
}

// ── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 });
  }

  console.log(`\n[${new Date().toISOString()}] DraGold Alert Checker v12 starting...`);

  // debug_price: skip TCGdex and use a fixed price (for testing only)
  let debugPrice = null;
  try {
    const body = await req.json();
    if (body && typeof body.debug_price === 'number') {
      debugPrice = body.debug_price;
      console.log(`DEBUG MODE: using fixed price €${debugPrice}`);
    }
  } catch (_e) { /* no body or not JSON — normal production flow */ }

  try {
    const alerts = await sbSelect('alerts',
      'is_active=eq.true&direction=eq.below&target_eur=not.is.null&email=not.is.null'
    );

    const total = (alerts && alerts.length) || 0;
    console.log(`Found ${total} active alert(s)`);

    if (total === 0) {
      return new Response(JSON.stringify({ ok: true, triggered: 0, checked: 0 }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Raggruppa alert per card_api_id per evitare chiamate duplicate
    const alertsByCard = new Map<string, typeof alerts[0][]>();
    for (const a of alerts) {
      const key = a.card_api_id;
      if (!alertsByCard.has(key)) alertsByCard.set(key, []);
      alertsByCard.get(key)!.push(a);
    }

    const priceCache: Record<string, { price: number; name: string; source: string } | null> = {};

    for (const [id, cardAlerts] of alertsByCard) {
      if (debugPrice !== null) {
        priceCache[id] = { price: debugPrice, name: id, source: 'debug' };
        console.log(`  ${id}: €${debugPrice} (debug)`);
        continue;
      }

      // Strategia: 1) eBay live (Browse API) — più affidabile e sempre aggiornato
      //            2) TCGdex Cardmarket — fallback storico
      const firstAlert = cardAlerts[0];
      const cardName   = firstAlert.card_name || id;
      const tcg        = firstAlert.tcg || 'pokemon';
      const country    = firstAlert.country || 'it';

      let priceData = await getEbayLivePrice(cardName, tcg, country);
      if (priceData) {
        console.log(`  ${id} [eBay live]: €${priceData.price}`);
      } else {
        priceData = await getTCGdexData(id);
        if (priceData) console.log(`  ${id} [TCGdex fallback]: €${priceData.price}`);
        else console.log(`  ${id}: no data`);
      }

      priceCache[id] = priceData;
      await new Promise((r) => setTimeout(r, 300)); // rate limit
    }

    let triggered = 0, skipped = 0;
    for (const alert of alerts) {
      const priceData = priceCache[alert.card_api_id];
      const cardName  = alert.card_name || (priceData && priceData.name) || alert.card_api_id;
      const tcg       = alert.tcg || 'pokemon';
      const country   = alert.country || 'it';

      if (!priceData) { skipped++; continue; }

      const price  = priceData.price;
      const target = parseFloat(alert.target_eur);

      if (price > target) continue;

      console.log(`  FIRE  "${cardName}" — €${price} <= €${target} -> ${alert.email}`);

      try {
        const [imageUrl, portfolio] = await Promise.all([
          getCardImage(alert.card_api_id),
          getPortfolioData(alert.email, alert.card_api_id),
        ]);

        const priceSource = priceData?.source === 'ebay_live' ? 'eBay live' : 'Cardmarket';
        const html    = buildEmail({ cardName, cardApiId: alert.card_api_id, tcg, currentPrice: price, targetPrice: target, imageUrl, portfolio, primaryCountry: country, priceSource });
        const savePct = Math.round(((target - price) / target) * 100);
        const subject = `⚡ ${cardName} is now €${price.toFixed(2)} on ${priceSource} — ${savePct}% below your target`;
        const emailId = await sendAlertEmail(alert.email, subject, html);
        console.log(`  Sent to ${alert.email} (id: ${emailId})`);

        await sbUpdate('alerts', `id=eq.${alert.id}`, { is_active: false, triggered_at: new Date().toISOString() });
        triggered++;
      } catch (e) {
        console.error(`  ERROR alert ${alert.id}: ${e.message}`);
      }

      await new Promise((r) => setTimeout(r, 200));
    }

    const result = { ok: true, triggered, skipped, checked: total };
    console.log(`Done — Triggered: ${triggered} | Skipped: ${skipped}`);
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });

  } catch (e) {
    console.error('Fatal:', e.message);
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
