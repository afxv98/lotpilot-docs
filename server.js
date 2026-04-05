const express = require('express');
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

chromium.use(StealthPlugin());

const app = express();
app.use(express.json());

app.post('/scrape', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });

  const user = process.env.BRIGHTDATA_USER;
  const pass = process.env.BRIGHTDATA_PASS;

  const launchOptions = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--no-zygote',
      '--ignore-certificate-errors',
    ],
  };

  // Use Bright Data residential proxy (port 22225) if credentials are set.
  // Make sure BRIGHTDATA_USER is your residential zone username, e.g.
  //   brd-customer-XXXXXXXX-zone-residential1
  if (user && pass) {
    launchOptions.proxy = {
      server: 'http://brd.superproxy.io:22225',
      username: user,
      password: pass,
    };
  }

  let browser;
  try {
    browser = await chromium.launch(launchOptions);
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'America/New_York',
      viewport: { width: 1280, height: 800 },
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    const page = await context.newPage();

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Wait until the body has meaningful content (not a blank or bot-check page)
    await page.waitForFunction(
      () => document.body && document.body.innerText.trim().length > 300,
      { timeout: 30000 }
    );

    const html = await page.content();
    const title = await page.title();
    const finalUrl = page.url();
    const bodyText = html.replace(/<[^>]+>/g, ' ');

    const data = {
      accidents: bodyText.match(/No Accidents.*?Reported|(\d+)\s+Accident/i)?.[0] || null,
      owners: bodyText.match(/(\d+)-Owner/i)?.[0] || null,
      service: bodyText.match(/(\d+)\s+Service\s+history/i)?.[0] || null,
      use: bodyText.match(/Personal vehicle|Rental vehicle|Commercial/i)?.[0] || null,
      location: bodyText.match(/Last owned in ([^\n<]+)/i)?.[1]?.trim() || null,
      records: bodyText.match(/(\d+)\s+Detailed\s+records/i)?.[0] || null,
    };

    res.json({
      success: true,
      title,
      finalUrl,
      data,
      html: html.substring(0, 50000),
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

// Quick test: returns your exit IP as seen by an external service
app.get('/test-proxy', async (req, res) => {
  const user = process.env.BRIGHTDATA_USER;
  const pass = process.env.BRIGHTDATA_PASS;

  const launchOptions = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--no-zygote'],
  };
  if (user && pass) {
    launchOptions.proxy = {
      server: 'http://brd.superproxy.io:22225',
      username: user,
      password: pass,
    };
  }

  let browser;
  try {
    browser = await chromium.launch(launchOptions);
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
