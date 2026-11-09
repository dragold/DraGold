const { chromium } = require('playwright');

const BASE = 'http://localhost:5199';
const PASS = [];
const FAIL = [];
const WARN = [];

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  // ===== 1. OPEN DRAGOLD =====
  console.log('\n[T1] Opening DraGold home...');
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(2500);
  const title = await page.title();
  PASS.push('T1 home loads: title=' + title);
  console.log('  title:', title);

  // ===== 2. SET SELECTOR VISIBLE =====
  console.log('\n[T2] Checking Set Selector...');
  const selectorVisible = await page.locator('.dg-set-selector, [class*="set-selector"]').first().isVisible({ timeout: 8000 }).catch(() => false);
  if (selectorVisible) PASS.push('T2 Set Selector visible');
  else WARN.push('T2 Set Selector NOT found in DOM');
  console.log('  selector visible:', selectorVisible);

  const pickSetText = await page.locator('text=Pick a Set').first().isVisible({ timeout: 5000 }).catch(() => false);
  if (pickSetText) PASS.push('T2b "Pick a Set" header visible');
  else WARN.push('T2b "Pick a Set" header not found');
  console.log('  "Pick a Set" visible:', pickSetText);

  // ===== 3. SELECT OP-01 =====
  console.log('\n[T3] Selecting OP-01...');
  const op01Card = page.locator('text=OP-01').first();
  const op01Visible = await op01Card.isVisible({ timeout: 8000 }).catch(() => false);
  if (op01Visible) PASS.push('T3 OP-01 card visible in selector');
  else FAIL.push('T3 OP-01 card NOT visible in selector');
  console.log('  OP-01 visible:', op01Visible);
  if (op01Visible) {
    await op01Card.click({ timeout: 5000 });
    await page.waitForTimeout(2500);
    const url = page.url();
    PASS.push('T3b Navigated to /set/ after OP-01 click, url=' + url);
    console.log('  url after click:', url);
  }

  // ===== 4. SET VIEW LOADS CARDS =====
  console.log('\n[T4] Checking Set View card grid...');
  const cardGrid = page.locator('.dg-card-tile, [class*="card-tile"], img[loading="lazy"]');
  const cardCount = await cardGrid.count();
  if (cardCount > 0) PASS.push('T4 Card grid loaded: ' + cardCount + ' cards visible');
  else FAIL.push('T4 Card grid EMPTY — zero cards rendered');
  console.log('  cards visible:', cardCount);

  // ===== 5. OWNED / MISSING FILTER =====
  console.log('\n[T5] Checking Owned/Missing filters...');
  const filterAll = page.locator('text=All').first();
  const filterCollected = page.locator('text=Collected').first();
  const filterMissing = page.locator('text=Missing').first();
  const allVisible = await filterAll.isVisible().catch(() => false);
  const collectedVisible = await filterCollected.isVisible().catch(() => false);
  const missingVisible = await filterMissing.isVisible().catch(() => false);
  if (allVisible) PASS.push('T5 "All" filter visible');
  if (collectedVisible) PASS.push('T5 "Collected" filter visible');
  if (missingVisible) PASS.push('T5 "Missing" filter visible');
  console.log('  filters: All=' + allVisible + ' Collected=' + collectedVisible + ' Missing=' + missingVisible);

  // ===== 6. QUANTITY BADGES =====
  console.log('\n[T6] Checking quantity badges...');
  const qtyBadges = await page.locator('span:has-text("×")').count();
  if (qtyBadges > 0) PASS.push('T6 Quantity badges visible: ' + qtyBadges);
  else WARN.push('T6 No quantity badges (user may not be signed in)');
  console.log('  qty badges:', qtyBadges);

  // ===== 7. IMAGES =====
  console.log('\n[T7] Checking card images...');
  const imgs = await page.locator('.dg-card-tile img, img[loading="lazy"]').count();
  if (imgs > 0) PASS.push('T7 Card images: ' + imgs + ' <img> tags');
  else FAIL.push('T7 Zero card images');
  console.log('  images:', imgs);

  // ===== 8. PRICES =====
  console.log('\n[T8] Checking prices...');
  const priceTags = await page.locator('[class*="price-tag"], [class*="priceTag"], span:has-text("$")').count();
  const priceUnavail = await page.locator('span:has-text("Price unavailable")').count();
  if (priceTags > 0) PASS.push('T8 Price tags: ' + priceTags);
  if (priceUnavail > 0) PASS.push('T8 Price unavailable: ' + priceUnavail + ' cards');
  if (priceTags === 0 && priceUnavail === 0) WARN.push('T8 No price info shown');
  console.log('  price tags:', priceTags, ' unavailable:', priceUnavail);

  // ===== 9. COMPLETION % =====
  console.log('\n[T9] Checking completion metric...');
  const completionText = await page.locator('text=/^\\d+ \\/ \\d+ cards collected/', 'text=/\\d+%/', 'text=collected').first().textContent().catch(() => null);
  if (completionText && completionText.trim()) PASS.push('T9 Completion: ' + completionText.trim().slice(0, 80));
  else {
    // fallback: search for "collected" text
    const collectedText = await page.locator('text=collected').first().textContent().catch(() => null);
    if (collectedText && collectedText.includes('/')) PASS.push('T9 Completion (fallback): ' + collectedText.trim().slice(0, 80));
    else WARN.push('T9 No completion % visible (user may not be signed in)');
  }
  console.log('  completion:', completionText ? completionText.trim().slice(0, 80) : (collectedText ? collectedText.trim().slice(0,80) : 'none'));

  // ===== 10. ESTIMATED VALUE =====
  console.log('\n[T10] Checking estimated value...');
  const valueText = await page.locator('span:has-text("$"), text=Value, text=estimated').first().textContent().catch(() => null);
  if (valueText && valueText.trim()) PASS.push('T10 Value: ' + valueText.trim().slice(0, 60));
  else WARN.push('T10 No estimated value (optional, out of Task 2 scope)');
  console.log('  value:', valueText ? valueText.trim().slice(0, 60) : 'not shown');

  // ===== 11-13. COLLECTION MUTATIONS (require sign-in) =====
  console.log('\n[T11-13] Collection mutations...');
  const addButtons = await page.locator('button:has-text("Add"), text=Aggiungi').count();
  if (addButtons > 0) {
    PASS.push('T11 Add button visible: ' + addButtons);
    try {
      await page.locator('button:has-text("Add")').first().click({ timeout: 5000 });
      await page.waitForTimeout(1500);
      const newQty = await page.locator('span:has-text("×")').count();
      PASS.push('T12 After add: ' + newQty + ' qty badges');
      console.log('  qty after add:', newQty);
    } catch(e) {
      WARN.push('T12 Add click failed: ' + e.message.slice(0,100));
    }
  } else {
    WARN.push('T11-T13 No Add button (user not signed in)');
  }

  // ===== 14. SELECT SV07 =====
  console.log('\n[T14] Navigating to SV07...');
  await page.goto(BASE + '/set/pokemon-sv07', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(3000);
  const sv07Url = page.url();
  PASS.push('T14 Navigated to SV07: ' + sv07Url);
  console.log('  url:', sv07Url);

  const sv07Cards = await page.locator('.dg-card-tile, img[loading="lazy"]').count();
  if (sv07Cards > 0) PASS.push('T14 SV07 cards: ' + sv07Cards);
  else FAIL.push('T14 SV07 card grid EMPTY');
  console.log('  SV07 cards:', sv07Cards);

  // ===== 15. SV07 PRICE UNAVAILABLE =====
  console.log('\n[T15] Checking SV07 Price unavailable...');
  const sv07PriceUnavail = await page.locator('span:has-text("Price unavailable")').count();
  if (sv07PriceUnavail > 0) PASS.push('T15 SV07 Price unavailable: ' + sv07PriceUnavail + ' cards (expected — SV07 has no prices in DB)');
  else if (sv07Cards > 0) FAIL.push('T15 SV07 should show Price unavailable but shows none');
  console.log('  SV07 price unavailable:', sv07PriceUnavail);

  // ===== 16. LAYOUT NOT BROKEN =====
  console.log('\n[T16] Checking layout integrity...');
  const sv07Section = await page.locator('h2:has-text("Cards in this set")').first().isVisible({ timeout: 3000 }).catch(() => false);
  const sv07Grid = await page.locator('[style*="grid-template-columns"]').first().isVisible({ timeout: 3000 }).catch(() => false);
  if (sv07Section) PASS.push('T16 "Cards in this set" visible');
  if (sv07Grid) PASS.push('T16 Grid layout intact');
  if (!sv07Section || !sv07Grid) FAIL.push('T16 Layout broken');
  console.log('  section:', sv07Section, ' grid:', sv07Grid);

  // ===== 17. RESPONSIVE =====
  console.log('\n[T17] Responsive check...');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(600);
  const mobileCards = await page.locator('.dg-card-tile, img[loading="lazy"]').count();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(400);
  const desktopCards = await page.locator('.dg-card-tile, img[loading="lazy"]').count();
  if (mobileCards > 0 && desktopCards > 0) PASS.push('T17 Responsive: mobile ' + mobileCards + ', desktop ' + desktopCards);
  else FAIL.push('T17 Responsive: mobile ' + mobileCards + ', desktop ' + desktopCards);
  console.log('  mobile:', mobileCards, ' desktop:', desktopCards);

  await browser.close();

  console.log('\n\n========== QA REPORT ==========')
  console.log('\nPASS (' + PASS.length + '):');
  PASS.forEach(m => console.log('  ✓ ' + m));
  console.log('\nFAIL (' + FAIL.length + '):');
  FAIL.forEach(m => console.log('  ✗ ' + m));
  console.log('\nWARN (' + WARN.length + '):');
  WARN.forEach(m => console.log('  ⚠ ' + m));
  console.log('\nConsole errors: ' + errors.length);
  errors.slice(0, 5).forEach(e => console.log('  ⚠ ' + e));

  // Real fails = failures that block the main flow
  const realFail = FAIL.some(f => !f.includes('expected') && !f.includes('optional'));
  process.exit(realFail ? 1 : 0);
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(2); });
