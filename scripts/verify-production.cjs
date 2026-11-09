const { chromium } = require('playwright');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  console.log('Navigating to https://dragold.org/explore...');
  try {
    await page.goto('https://dragold.org/explore', { waitUntil: 'domcontentloaded', timeout: 15000 });
  } catch(e) {
    console.log('Navigation error:', e.message);
    await browser.close();
    process.exit(1);
  }

  await page.waitForTimeout(3000);

  const title = await page.title();
  console.log('Title:', title);

  console.log('\n=== TASK 2 VERIFICATION ===');
  const selectorVisible = await page.locator('.dg-set-selector, [class*="set-selector"]').first().isVisible({ timeout: 8000 }).catch(() => false);
  console.log('Set Selector visible:', selectorVisible);

  const pickSetText = await page.locator('text=Pick a Set').first().isVisible({ timeout: 5000 }).catch(() => false);
  console.log('"Pick a Set" text visible:', pickSetText);

  try {
    await page.screenshot({ path: '/tmp/dragold-explore-prod.png', fullPage: true });
    console.log('Screenshot: /tmp/dragold-explore-prod.png');
  } catch(e) {
    console.log('Screenshot failed:', e.message);
  }

  console.log('\n=== BODY TEXT SAMPLE (first 500 chars) ===');
  const bodyText = await page.locator('body').textContent().catch(() => '');
  console.log(bodyText.slice(0, 500));

  console.log('\n=== CONSOLE ERRORS ===');
  if (errors.length === 0) {
    console.log('No console errors');
  } else {
    errors.slice(0, 10).forEach(e => console.log('ERROR:', e));
  }

  await browser.close();
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(2); });
