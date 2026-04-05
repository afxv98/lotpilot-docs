/**
 * Local headed test — watch the bot visit a CARFAX URL in real Chromium.
 *
 * Usage:
 *   node test-headed.js "https://www.carfax.com/VehicleHistory/ar20/..."
 *
 * Optional env vars (Decodo proxy — skip if your local network blocks proxies):
 *   PROXY_SERVER=http://gate.decodo.com:10000
 *   PROXY_USER=your_user
 *   PROXY_PASS=your_pass
 */

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

chromium.use(StealthPlugin());

const url = process.argv[2];
if (!url) {
  console.error('Usage: node test-headed.js "<carfax url>"');
  process.exit(1);
}

// Human-like random delay
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

async function humanScroll(page) {
  for (let i = 0; i < rand(3, 6); i++) {
    await page.mouse.wheel(0, rand(200, 600));
    await sleep(rand(300, 800));
  }
}

async function humanMove(page) {
  const x = rand(200, 1000);
  const y = rand(100, 600);
  await page.mouse.move(x, y, { steps: rand(5, 15) });
  await sleep(rand(100, 400));
}

(async () => {
  const launchOptions = {
    headless: false,
    slowMo: 80,
    args: [
      '--start-maximized',
      '--no-sandbox',
      '--ignore-certificate-errors',
    ],
  };

  const proxyServer = process.env.PROXY_SERVER;
  const proxyUser   = process.env.PROXY_USER;
  const proxyPass   = process.env.PROXY_PASS;

  if (proxyServer && proxyUser && proxyPass) {
    launchOptions.proxy = { server: proxyServer, username: proxyUser, password: proxyPass };
    console.log(`[proxy] ${proxyServer}`);
  } else {
    console.log('[proxy] none — using your local IP');
  }

  const browser = await chromium.launch(launchOptions);

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'America/New_York',
    viewport: null, // use actual window size
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
  });

  const page = await context.newPage();

  // Log every navigation so you can see redirects
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) console.log('[nav]', frame.url());
  });

  // Log responses that look like bot-check triggers
  page.on('response', res => {
    const u = res.url();
    if (u.includes('datadome') || u.includes('captcha') || u.includes('challenge')) {
      console.log('[bot-check]', res.status(), u);
    }
  });

  console.log('\n[go]', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Simulate human presence
  await sleep(rand(800, 1500));
  await humanMove(page);
  await sleep(rand(500, 1000));
  await humanScroll(page);
  await sleep(rand(1000, 2000));
  await humanMove(page);

  console.log('\n[title]', await page.title());
  console.log('[url]  ', page.url());

  const bodyText = await page.evaluate(() => document.body?.innerText || '');
  const hasDataDome = bodyText.includes('captcha') || bodyText.toLowerCase().includes('datadome');
  const hasReport   = bodyText.match(/Accident|Owner|Service\s+history|Detailed\s+records/i);

  if (hasDataDome)  console.log('\n⚠️  DataDome / CAPTCHA detected');
  if (hasReport)    console.log('\n✅  Report content found!');
  if (!hasDataDome && !hasReport) console.log('\n❓  Unknown page — inspect the browser');

  console.log('\n--- Browser stays open. Press Ctrl+C when done. ---');
  await new Promise(() => {}); // keep alive until Ctrl+C
})();
