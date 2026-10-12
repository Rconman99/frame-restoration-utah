// Server-side proxy for Google PageSpeed Insights.
// The API key is read from the PAGESPEED_API_KEY environment variable
// (set in Vercel) so it is never shipped to the browser or committed.
const ALLOWED_ORIGINS = new Set([
  'https://www.framerestorationutah.com',
  'https://framerestorationutah.com',
]);
const ALLOWED_STRATEGIES = new Set(['mobile', 'desktop']);

module.exports = async function handler(req, res) {
  const key = process.env.PAGESPEED_API_KEY;
  if (!key) {
    res.status(503).json({ error: { message: 'PAGESPEED_API_KEY is not configured' } });
    return;
  }
  const target = String((req.query && req.query.url) || 'https://www.framerestorationutah.com').replace(/\/+$/, '');
  const strategy = String((req.query && req.query.strategy) || 'mobile');
  if (!ALLOWED_ORIGINS.has(target)) {
    res.status(400).json({ error: { message: 'url not allowed' } });
    return;
  }
  if (!ALLOWED_STRATEGIES.has(strategy)) {
    res.status(400).json({ error: { message: 'strategy not allowed' } });
    return;
  }
  const api = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=' +
    encodeURIComponent(target) + '&strategy=' + strategy + '&key=' + encodeURIComponent(key);
  try {
    const r = await fetch(api);
    const body = await r.json();
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');
    res.status(r.ok ? 200 : 502).json(body);
  } catch (e) {
    res.status(502).json({ error: { message: 'PageSpeed request failed' } });
  }
};
