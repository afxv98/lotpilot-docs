const express = require('express');
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

chromium.use(StealthPlugin());

const app = express();
app.use(express.json());

app.post('/scrape', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });

  let browser;
  try {
    const launchOptions = {
      headless: true,
      executablePath: process.env.PLAYWRIGHT_BROWSERS_PATH
        ? undefined
        : '/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=390,844',
      ]
    };

    if (process.env.PROXY_URL) {
      launchOptions.proxy = { server: process.env.PROXY_URL };
    }

    browser = await chromium.launch(launchOptions);

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      locale: 'en-US',
      timezoneId: 'America/Los_Angeles',
      geolocation: { longitude: -121.88, latitude: 37.34 },
      permissions: ['geolocation'],
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      }
    });

    const page = await context.newPage();

    // Human-like behavior: random mouse movements
    await page.mouse.move(
      Math.floor(Math.random() * 300 + 50),
      Math.floor(Math.random() * 400 + 100)
    );

    // Navigate with realistic referer
    await page.setExtraHTTPHeaders({
      'Referer': 'https://www.capitolnissan.com/'
    });

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 45000
    });

    // Wait for DataDome to resolve if present
    const isDataDome = await page.$('iframe[title*="DataDome"]');
    if (isDataDome) {
      await page.waitForTimeout(8000);
      await page.reload({ waitUntil: 'domcontentloaded' });
    }

    // Wait for CarFax content
    await page.waitForTimeout(5000);

    const finalUrl = page.url();
    const html = await page.content();
    const title = await page.title();

    // Extract key data directly
    const data = await page.evaluate(() => {
      if (!document.body) return {};

      const getText = (selector) => {
        const el = document.querySelector(selector);
        return el ? el.innerText.trim() : null;
      };

      const bodyText = document.body.innerText || '';
      return {
        accidents: getText('[data-testid="ACCIDENT_HISTORY"]') ||
                   bodyText.match(/No Accidents.*Reported|(\d+) Accident/i)?.[0],
        owners: bodyText.match(/(\d+)-Owner/i)?.[0],
        service: bodyText.match(/(\d+) Service history/i)?.[0],
        use: bodyText.match(/Personal vehicle|Rental vehicle|Commercial/i)?.[0],
        location: bodyText.match(/Last owned in ([^\n]+)/i)?.[1],
        records: bodyText.match(/(\d+) Detailed records/i)?.[0],
      };
    });

    await browser.close();

    res.json({
      success: true,
      finalUrl,
      title,
      data,
      html: html.substring(0, 50000) // cap at 50KB
    });

  } catch (err) {
    if (browser) await browser.close();
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/health', (_, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CarFax scraper running on port ${PORT}`));
