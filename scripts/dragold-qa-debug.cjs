const { chromium } = require('playwright');

const BASE = 'http://localhost:5199';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleLines = [];
  const errors = [];
  page.on('console', msg => consoleLines.push('[' + msg.type() + '] ' + msg.text()));
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  console.log('Navigating to home...');
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(3000);

  console.log('\n=== PAGE TITLE ===');
  console.log(page.title());

  console.log('\n=== HTML BODY (first 3000 chars) ===');
  const bodyHTML = await page.evaluate(() => document.body.innerHTML.slice(0, 3000));
  console.log(bodyHTML);

  console.log('\n=== LOCATOR SCAN ===');
  const selectors = [
    '.dg-set-selector',
    'text=Pick a Set',
    'text=OP-01',
    '.dg-card-tile',
    'h2:has-text("Cards in this set")',
    'span:has-text("Price unavailable")',
    'span:has-text("collected")',
  ];
  for (const sel of selectors) {
    const count = await page.locator(sel).count();
    const visible = await page.locator(sel).first().isVisible().catch(() => false);
    console.log(`  ${sel}: count=${count}, visible=${visible}`);
  }

  console.log('\n=== CONSOLE OUTPUT ===');
  consoleLines.slice(-20).forEach(l => console.log(l));

  console.log('\n=== ERRORS ===');
  errors.forEach(e => console.log(e));

  await browser.close();
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(2); });
