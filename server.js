const express = require('express');
const axios = require('axios');
const https = require('https');

const app = express();
app.use(express.json());

// Bright Data Web Unlocker proxy agent (self-signed cert)
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

app.post('/scrape', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });

  const user = process.env.BRIGHTDATA_USER;
  const pass = process.env.BRIGHTDATA_PASS;
  if (!user || !pass) {
    return res.status(500).json({ error: 'BRIGHTDATA_USER or BRIGHTDATA_PASS not configured' });
  }

  try {
    const response = await axios.get(url, {
      proxy: {
        protocol: 'https',
        host: 'brd.superproxy.io',
        port: 33335,
        auth: { username: user, password: pass },
      },
      httpsAgent,
      timeout: 120000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    const html = response.data || '';
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || '';
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
      data,
      html: html.substring(0, 50000),
    });

  } catch (err) {
    const detail = err.response?.data || err.message;
    res.status(500).json({ success: false, error: detail });
  }
});

app.get('/health', (_, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CarFax scraper running on port ${PORT}`));
