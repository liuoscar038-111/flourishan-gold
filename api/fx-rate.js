// Vercel Serverless Function — server-side fetch of the HKD/CNY exchange rate.
// This runs on Vercel's servers, not in the browser, so it is a server-to-server
// request and is NOT subject to the browser's CORS policy — unlike fetching these
// bank pages directly from client-side JS (which kept failing via third-party CORS
// proxies: corsproxy.io requires domain registration, AllOrigins/CodeTabs/x2u are
// free public services that are frequently too slow or unreliable).
//
// Tries BOCHK (Bank of China Hong Kong) first, then falls back to mainland Bank of
// China if that fails. Both pages happen to be old-style server-rendered HTML with
// the rate numbers baked directly into the page source (unlike ICBC/CCB/CMB, which
// inject via client-side JS and can't be scraped this way).
//
// No npm install needed — uses Node's built-in `https` module only.

const https = require('https');

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 8000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

function parseBochkHkdCny(html) {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const idx = text.indexOf('人民幣(在岸)');
  if (idx === -1) return null;
  const after = text.slice(idx, idx + 100);
  const nums = after.match(/\d+\.\d+/g);
  if (!nums || nums.length < 2) return null;
  const buy = parseFloat(nums[1]); // 客户买入价 (customer_buy), HKD per 1 CNY — matches
  // the convention used by the colleague's independent BOCHK scraper (Cloudflare Worker),
  // which uses customer_buy directly rather than averaging sell/buy.
  if (!buy) return null;
  return 1 / buy; // invert to CNY per 1 HKD
}

function parseBocHkd(html) {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const idx = text.indexOf('港币');
  if (idx === -1) return null;
  const after = text.slice(idx, idx + 200);
  const nums = after.match(/\d+\.?\d*/g);
  if (!nums || nums.length < 5) return null;
  const conv = parseFloat(nums[4]); // 中行折算价, per 100 HKD
  if (!conv) return null;
  return conv / 100;
}

const BOCHK_URL = 'https://www.bochk.com/whk/rates/exchangeRatesHKD/exchangeRatesHKD-input.action?lang=hk';
const BOC_URL = 'https://www.boc.cn/sourcedb/whpj/index.html';

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  try {
    const html = await fetchText(BOCHK_URL);
    const rate = parseBochkHkdCny(html);
    if (rate) {
      res.status(200).json({ success: true, source: 'bochk', rate });
      return;
    }
  } catch (e) {
    // fall through to BOC
  }

  try {
    const html = await fetchText(BOC_URL);
    const rate = parseBocHkd(html);
    if (rate) {
      res.status(200).json({ success: true, source: 'boc', rate });
      return;
    }
  } catch (e) {
    // fall through to failure response
  }

  res.status(200).json({ success: false, source: null, rate: null });
};
