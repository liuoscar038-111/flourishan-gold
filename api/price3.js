// Vercel Serverless Function — server-side proxy for the third-party gold price API.
// Because this code runs on Vercel's servers (not in the user's browser), the request to
// model.zhlsy.com is a server-to-server call and is NOT subject to the browser's CORS policy.
// The browser only ever talks to our own domain (/api/price3), which is always same-origin.
//
// No npm install needed — uses Node's built-in `https` module only.

const https = require('https');

const TARGET_URL = 'https://model.zhlsy.com/gateway/market/app/precious/price/calc/Price3';

module.exports = (req, res) => {
  // Allow this endpoint to also be called cross-origin from other pages/tools if ever needed.
  res.setHeader('Access-Control-Allow-Origin', '*');

  const upstreamReq = https.get(TARGET_URL, { timeout: 8000 }, (upstreamRes) => {
    let data = '';
    upstreamRes.on('data', (chunk) => { data += chunk; });
    upstreamRes.on('end', () => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.status(upstreamRes.statusCode || 200).send(data);
    });
  });

  upstreamReq.on('timeout', () => {
    upstreamReq.destroy();
    res.status(504).json({ success: false, error: 'Upstream request timed out' });
  });

  upstreamReq.on('error', (err) => {
    res.status(502).json({ success: false, error: 'Upstream request failed', detail: err.message });
  });
};
