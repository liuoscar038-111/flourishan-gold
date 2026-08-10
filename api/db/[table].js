// Vercel Serverless Function — generic server-side proxy to Supabase's REST API
// (PostgREST) for our four shared data tables. The browser talks only to
// /api/db/<table> (same-origin, no CORS issues); this function forwards the
// request to Supabase using the URL + key stored as Vercel environment
// variables (SUPABASE_URL, SUPABASE_KEY), so the key never has to live in the
// page's source code.
//
// Supported: GET (list, with optional query-string filters), POST (insert),
// PATCH (update, needs a filter like ?id=eq.xxx), DELETE (needs a filter).
// No npm install needed — uses Node's built-in `https` module only.

const https = require('https');

const ALLOWED_TABLES = ['products', 'purchases', 'sales', 'employees'];

module.exports = (req, res) => {
  const table = req.query && req.query.table;
  if (!ALLOWED_TABLES.includes(table)) {
    res.status(400).json({ error: 'Unknown table: ' + table });
    return;
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    res.status(500).json({ error: 'Server missing SUPABASE_URL / SUPABASE_KEY environment variables' });
    return;
  }

  // Rebuild the query string, dropping our own `table` param (that's a Vercel
  // routing artifact, not a real filter Supabase should see).
  const params = new URLSearchParams(req.query || {});
  params.delete('table');
  const qs = params.toString();
  const targetUrl = SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/' + table + (qs ? ('?' + qs) : '');

  const method = req.method || 'GET';
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json',
    'Prefer': method === 'POST' ? 'return=representation' : 'return=minimal',
  };

  const bodyStr = (method === 'POST' || method === 'PATCH' || method === 'PUT')
    ? JSON.stringify(req.body || {})
    : null;
  if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);

  const upstreamReq = https.request(targetUrl, { method, headers, timeout: 10000 }, (upstreamRes) => {
    let data = '';
    upstreamRes.on('data', (chunk) => { data += chunk; });
    upstreamRes.on('end', () => {
      res.status(upstreamRes.statusCode || 200);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.send(data || (method === 'DELETE' || method === 'PATCH' ? '{"success":true}' : '[]'));
    });
  });

  upstreamReq.on('timeout', () => {
    upstreamReq.destroy();
    res.status(504).json({ error: 'Upstream request timed out' });
  });
  upstreamReq.on('error', (err) => {
    res.status(502).json({ error: 'Upstream request failed', detail: err.message });
  });

  if (bodyStr) upstreamReq.write(bodyStr);
  upstreamReq.end();
};
