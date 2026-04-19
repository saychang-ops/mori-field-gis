export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=86400');

  const q = String(req.query.q || '').slice(0, 200).trim();
  if (!q) {
    return res.status(400).json({ error: 'missing q' });
  }

  const apiKey = process.env.GOOGLE_GEOCODING_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'server_misconfigured' });
  }

  const address = q.includes('森町') ? q : `北海道茅部郡森町 ${q}`;
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', address);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('language', 'ja');
  url.searchParams.set('region', 'jp');

  try {
    const r = await fetch(url);
    const data = await r.json();
    return res.status(200).json({
      status: data.status,
      results: (data.results || []).map(x => ({
        formatted_address: x.formatted_address,
        location: x.geometry.location,
        location_type: x.geometry.location_type
      }))
    });
  } catch (e) {
    console.error('geocode upstream error:', e);
    return res.status(500).json({ error: 'upstream_error' });
  }
}
