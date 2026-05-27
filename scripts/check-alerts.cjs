// DraGold — Price Alert Checker
// Runs daily via GitHub Actions
// Fetches Pokémon card prices from TCGdex (free, no API key)
// Sends email via Resend when price <= target

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_KEY   = process.env.RESEND_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !RESEND_KEY) {
  console.error('Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY');
  process.exit(1);
}

// ── Supabase REST helpers ────────────────────────────────────────────────────
async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    }
  });
  if (!res.ok) throw new Error(`Supabase GET ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function sbPatch(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Supabase PATCH ${path}: ${res.status} ${await res.text()}`);
}

// ── TCGdex price fetch ───────────────────────────────────────────────────────
async function getTCGdexData(cardApiId) {
  try {
    const res = await fetch(`https://api.tcgdex.net/v2/en/cards/${cardApiId}`, {
      headers: { 'User-Agent': 'DraGold-AlertChecker/1.0' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const cm = data?.pricing?.cardmarket;
    return {
      name: data?.name ?? cardApiId,
      set: data?.set?.name ?? '',
      // Use trend price (current market trend), fall back to avg
      price: cm ? (cm.trend ?? cm.avg ?? null) : null,
    };
  } catch (e) {
    console.warn(`  TCGdex fetch failed for ${cardApiId}: ${e.message}`);
    return null;
  }
}

// ── Resend email ─────────────────────────────────────────────────────────────
async function sendAlertEmail(email, cardName, cardApiId, currentPrice, targetPrice) {
  const ebayUrl = `https://www.ebay.it/sch/i.html?_nkw=${encodeURIComponent(cardName + ' pokemon card')}&LH_Sold=0`;
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0d0d1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#1a1a2e;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
    <div style="background:linear-gradient(135deg,#f59e0b,#f97316);padding:24px 32px;">
      <div style="font-size:28px;font-weight:800;color:#0d0d1a;letter-spacing:-0.5px;">⚡ DraGold Alert</div>
      <div style="color:rgba(0,0,0,0.7);font-size:13px;margin-top:4px;">Price drop detected</div>
    </div>
    <div style="padding:32px;">
      <div style="font-size:22px;font-weight:700;color:#f1f1f1;margin-bottom:8px;">${cardName}</div>
      <div style="font-size:13px;color:#888;margin-bottom:24px;">${cardApiId}</div>

      <div style="display:flex;gap:16px;margin-bottom:28px;">
        <div style="flex:1;background:#0d0d1a;border-radius:12px;padding:16px;text-align:center;">
          <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Current Price</div>
          <div style="font-size:28px;font-weight:800;color:#4ade80;">€${currentPrice.toFixed(2)}</div>
        </div>
        <div style="flex:1;background:#0d0d1a;border-radius:12px;padding:16px;text-align:center;">
          <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Your Target</div>
          <div style="font-size:28px;font-weight:800;color:#f59e0b;">€${targetPrice.toFixed(2)}</div>
        </div>
      </div>

      <a href="${ebayUrl}" style="display:block;background:linear-gradient(135deg,#f59e0b,#f97316);color:#0d0d1a;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:15px;margin-bottom:16px;">
        Buy on eBay.it →
      </a>
      <a href="https://dragold.org" style="display:block;background:#1e1e35;color:#a0a0c0;text-decoration:none;text-align:center;padding:12px;border-radius:10px;font-size:13px;">
        View on DraGold
      </a>

      <div style="margin-top:24px;font-size:11px;color:#555;text-align:center;">
        Price data from CardMarket via TCGdex API · Updated daily<br>
        This alert has been deactivated. Set a new one at dragold.org
      </div>
    </div>
  </div>
</body>
</html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'DraGold Alerts <alerts@dragold.org>',
      to: [email],
      subject: `⚡ ${cardName} is now €${currentPrice.toFixed(2)} — your alert triggered`,
      html,
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error: ${res.status} ${err}`);
  }
  const data = await res.json();
  console.log(`  ✉ Email sent → ${email} (id: ${data.id})`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔍 DraGold Alert Checker — ${new Date().toISOString()}\n`);

  // 1. Load all active pokemon alerts
  const alerts = await sbGet('/alerts?is_active=eq.true&direction=eq.below&tcg=eq.pokemon&select=*');
  console.log(`Found ${alerts.length} active Pokémon alert(s)`);
  if (alerts.length === 0) { console.log('Nothing to check. Done.'); return; }

  // 2. Deduplicate card IDs → one TCGdex call per card
  const uniqueIds = [...new Set(alerts.map(a => a.card_api_id))];
  console.log(`\nFetching prices for ${uniqueIds.length} unique card(s)...\n`);

  const cardData = {};
  for (const id of uniqueIds) {
    const data = await getTCGdexData(id);
    cardData[id] = data;
    const price = data?.price;
    const name = data?.name ?? id;
    console.log(`  ${id} (${name}): ${price !== null ? '€' + price : 'no price data'}`);
    await new Promise(r => setTimeout(r, 300)); // be polite to TCGdex
  }

  // 3. Check each alert
  console.log('\nChecking alerts...\n');
  let triggered = 0;
  let skipped = 0;

  for (const alert of alerts) {
    const data = cardData[alert.card_api_id];
    const price = data?.price ?? null;
    const cardName = alert.card_name || data?.name || alert.card_api_id;

    if (price === null) {
      console.log(`  SKIP  ${cardName} — no price data from TCGdex`);
      skipped++;
      continue;
    }

    if (price <= alert.target_eur) {
      console.log(`  FIRE  ${cardName} — €${price} ≤ €${alert.target_eur} → ${alert.email}`);
      try {
        await sendAlertEmail(alert.email, cardName, alert.card_api_id, price, alert.target_eur);
        // Deactivate alert after triggering (user sets new one if needed)
        await sbPatch(`/alerts?id=eq.${alert.id}`, {
          is_active: false,
          triggered_at: new Date().toISOString(),
        });
        triggered++;
      } catch (e) {
        console.error(`  ERROR sending alert ${alert.id}: ${e.message}`);
      }
    } else {
      console.log(`  OK    ${cardName} — €${price} > €${alert.target_eur} (target not reached)`);
    }
  }

  console.log(`\n✅ Done. Triggered: ${triggered} | Skipped (no price): ${skipped} | OK: ${alerts.length - triggered - skipped}\n`);
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
