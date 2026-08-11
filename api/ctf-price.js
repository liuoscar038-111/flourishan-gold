// Vercel Serverless Function — server-side fetch of Chow Tai Fook's official gold pellet
// (投資金粒) buy/sell prices. This runs on Vercel's servers, not in the browser, so it is a
// server-to-server request and is NOT subject to the browser's CORS policy.
//
// Endpoint discovered via the browser's Network tab while loading CTF's own
// "今日金價" page (https://www.chowtaifook.com/zh-hk/eshop/realtime-gold-price.html) — it's
// the JSON API their own frontend calls to fill in the price table. Response shape is a
// dictionary keyed by "priceCode" (1-12 as observed), each holding a one-item array with
// fields like goldPriceGram (HKD/gram) and updateDate. The codes we care about:
//   4 = 金粒賣出價 (Gold Pellet - Sell)  — what a customer pays CTF, used for 售价预警
//   5 = 金粒買入價 (Gold Pellet - Buy)   — what CTF pays a customer, used for 回收警示
//
// No npm install needed — uses Node's built-in `https` module only.

const https = require('https');

const CTF_URL = 'https://www.chowtaifook.com/bin/servlet/ctfweb/goldPrice?region=HK';

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      timeout: 8000,
      headers: {
        // Some sites gate this kind of internal API on looking like a normal browser
        // request from their own pages; a plain User-Agent/Referer makes that more likely
        // to succeed than Node's default bare request.
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://www.chowtaifook.com/zh-hk/eshop/realtime-gold-price.html',
        'Accept': 'application/json, text/plain, */*',
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const text = await fetchText(CTF_URL);
    const json = JSON.parse(text);
    const sellEntry = json['4'] && json['4'][0];
    const buyEntry = json['5'] && json['5'][0];
    if (!sellEntry && !buyEntry) throw new Error('unexpected response shape');
    res.status(200).json({
      success: true,
      sell: sellEntry ? sellEntry.goldPriceGram : null,   // 金粒賣出價, HKD/g
      buy: buyEntry ? buyEntry.goldPriceGram : null,      // 金粒買入價, HKD/g
      updateDate: (sellEntry || buyEntry).updateDate,
    });
  } catch (e) {
    res.status(200).json({ success: false, sell: null, buy: null, error: e.message });
  }
};
