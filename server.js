const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

app.post('/scrape', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });

  try {
    const response = await axios.get('https://api.scraperapi.com/', {
      params: {
        api_key: process.env.SCRAPERAPI_KEY,
        url,
        render: 'true',
        country_code: 'us',
        keep_headers: 'true',
      },
      timeout: 120000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
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
