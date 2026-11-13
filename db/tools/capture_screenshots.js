// Capture application walkthrough screenshots for the project report.
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'http://localhost:3000';
const OUT = '/home/claude/riddhi2106/scholarly/docs/screenshots';

// Reviewer 5 has outstanding assignments in the synthetic dataset.
const REVIEWER = { email: 'reviewer13@scholarly-icdms.org', password: 'Password123!' };
// Alice is the seeded admin / chair from the core platform seed.
const AUTHOR = { email: 'alice@mit.edu', password: 'Password123!' };

async function shot(page, name, note) {
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  const { width, height } = await page.evaluate(() => ({
    width: document.body.scrollWidth, height: document.body.scrollHeight,
  }));
  console.log(`  ${name}.png  ${width}x${height}  ${note || ''}`);
}

async function login(page, who) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', who.email);
  await page.fill('input[type="password"]', who.password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(1500);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  console.log('Public pages:');
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await shot(page, '01_home', 'landing page');

  await page.goto(`${BASE}/register`, { waitUntil: 'networkidle' });
  await shot(page, '02_register', 'account registration');

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await shot(page, '03_login', 'sign in');

  await page.goto(`${BASE}/conferences`, { waitUntil: 'networkidle' });
  await shot(page, '04_conferences', 'conference listing');

  // Follow the first conference link rather than guessing an id.
  const href = await page.getAttribute('a[href^="/conferences/"]', 'href');
  if (href && /\/conferences\/\d+/.test(href)) {
    await page.goto(`${BASE}${href}`, { waitUntil: 'networkidle' });
    await shot(page, '05_conference_detail', `detail ${href}`);
  }

  console.log('Author session:');
  await login(page, AUTHOR);
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  await shot(page, '06_author_dashboard', 'author dashboard');

  if (href && /\/conferences\/\d+/.test(href)) {
    await page.goto(`${BASE}${href}/submit`, { waitUntil: 'networkidle' });
    await shot(page, '07_paper_submission', 'submission form');
  }

  console.log('Reviewer session:');
  await ctx.clearCookies();
  await login(page, REVIEWER);
  await page.goto(`${BASE}/reviewer`, { waitUntil: 'networkidle' });
  await shot(page, '08_reviewer_dashboard', 'double-blind assignment queue');

  // Open the inline review form so the scoring fields are visible.
  const write = page.locator('button', { hasText: /write review/i }).first();
  if (await write.count()) {
    await write.click();
    await shot(page, '09_review_form', 'review submission form');
  }

  await browser.close();
  console.log('done');
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
