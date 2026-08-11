// Vercel Serverless Function — server-side fetch of the HKD/CNY exchange rate.
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
  const buy = parseFloat(nums[1]); // 客户买入价 (customer_buy), HKD per 1 CNY
  if (!buy) return null;
  return 1 / buy;
}

function parseBocHkd(html) {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const idx = text.indexOf('港币');
  if (idx === -1) return null;
  const after = text.slice(idx, idx + 200);
  const nums = after.match(/\d+\.?\d*/g);
  if (!nums || nums.length < 5) return null;
  const conv = parseFloat(nums[4]);
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
  } catch (e) {}

  try {
    const html = await fetchText(BOC_URL);
    const rate = parseBocHkd(html);
    if (rate) {
      res.status(200).json({ success: true, source: 'boc', rate });
      return;
    }
  } catch (e) {}

  res.status(200).json({ success: false, source: null, rate: null });
};
