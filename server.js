const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

app.post('/scrape', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });

  try {
    const response = await axios.post(
      'https://scraper-api.decodo.com/v2/scrape',
      {
        url,
        proxy_pool: 'premium',
        headless: 'html',
        geo: 'United States',
      },
      {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${process.env.DECODO_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    );

    const result = response.data.results?.[0] || {};
    const html = result.content || '';
    const statusCode = result.status_code;
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
      decodo_status: statusCode,
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
