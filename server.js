const express = require('express');
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

chromium.use(StealthPlugin());

const app = express();
app.use(express.json());

function buildLaunchOptions() {
  const proxyServer = process.env.PROXY_SERVER;
  const proxyUser   = process.env.PROXY_USER;
  const proxyPass   = process.env.PROXY_PASS;

  const opts = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--no-zygote',
      '--ignore-certificate-errors',
    ],
  };

  if (proxyServer && proxyUser && proxyPass) {
    opts.proxy = { server: proxyServer, username: proxyUser, password: proxyPass };
  }

  return opts;
}

app.post('/scrape', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });

  let browser;
  const screenshots = {}; // keyed by stage name, value = base64 PNG

  try {
    browser = await chromium.launch(buildLaunchOptions());
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'America/New_York',
      viewport: { width: 1280, height: 800 },
      extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
    });

    const page = await context.newPage();

    // Screenshot helper — never throws, so a failed capture won't abort the scrape
    const snap = async (label) => {
      try {
        const buf = await page.screenshot({ fullPage: false });
        screenshots[label] = buf.toString('base64');
      } catch (_) {}
    };

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await snap('after_goto');

    // Wait for meaningful content
    try {
      await page.waitForFunction(
        () => document.body && document.body.innerText.trim().length > 300,
        { timeout: 30000 }
      );
    } catch (_) {
      // Timed out — still take a snapshot so we can see what blocked us
    }
    await snap('after_wait');

    const html      = await page.content();
    const title     = await page.title();
    const finalUrl  = page.url();
    const bodyText  = html.replace(/<[^>]+>/g, ' ');

    const data = {
      accidents : bodyText.match(/No Accidents.*?Reported|(\d+)\s+Accident/i)?.[0]          || null,
      owners    : bodyText.match(/(\d+)-Owner/i)?.[0]                                        || null,
      service   : bodyText.match(/(\d+)\s+Service\s+history/i)?.[0]                         || null,
      use       : bodyText.match(/Personal vehicle|Rental vehicle|Commercial/i)?.[0]         || null,
      location  : bodyText.match(/Last owned in ([^\n<]+)/i)?.[1]?.trim()                   || null,
      records   : bodyText.match(/(\d+)\s+Detailed\s+records/i)?.[0]                        || null,
    };

    res.json({ success: true, title, finalUrl, data, screenshots, html: html.substring(0, 50000) });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message, screenshots });
  } finally {
    if (browser) await browser.close();
  }
});

// View a screenshot as an actual image in the browser
// POST /screenshot  { "url": "...", "stage": "after_wait" }
app.post('/screenshot', async (req, res) => {
  const { url, stage = 'after_wait' } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });

  let browser;
  try {
    browser = await chromium.launch(buildLaunchOptions());
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'America/New_York',
      viewport: { width: 1280, height: 800 },
    });

    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    if (stage === 'after_wait') {
      try {
        await page.waitForFunction(
          () => document.body && document.body.innerText.trim().length > 300,
          { timeout: 20000 }
        );
      } catch (_) {}
    }

    const buf = await page.screenshot({ fullPage: true });
    res.setHeader('Content-Type', 'image/png');
    res.send(buf);

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

// Quick proxy check
app.get('/test-proxy', async (req, res) => {
  let browser;
  try {
    browser = await chromium.launch(buildLaunchOptions());
    const page = await (await browser.newContext()).newPage();
    await page.goto('https://ip.decodo.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
    const body = await page.innerText('body');
    res.json({ success: true, ip: body.trim() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

app.get('/health', (_, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CarFax scraper running on port ${PORT}`));
