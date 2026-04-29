export function normalize(s) {
  if (!s) return '';
  return String(s)
    .replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/ヶ/g, 'ケ')
    .replace(/\s+/g, '')
    .toLowerCase();
}

export function fuzzyMatch(target, query) {
  if (!query) return false;
  const t = normalize(target);
  const q = normalize(query);
  return t.includes(q);
}

export function searchRoads(features, query) {
  const q = normalize(query);
  if (!q) return [];
  return features.filter(f => {
    const p = f.properties || {};
    const code = normalize(p.route_code);
    const name = normalize(p.route_name);
    return code === q || name.includes(q);
  });
}

export function searchBridges(features, query) {
  const q = normalize(query);
  if (!q) return [];
  return features.filter(f => {
    const p = f.properties || {};
    return normalize(p.name).includes(q) || normalize(p.furigana).includes(q);
  });
}

const GEOCODE_API_KEY = 'AIzaSyC7G3Yyk623eMerW4GP8d3xyqiP2sDyi-4';
let _geocodeRecentCalls = [];

function checkGeocodeRateLimit() {
  const now = Date.now();
  _geocodeRecentCalls = _geocodeRecentCalls.filter(t => now - t < 60000);
  if (_geocodeRecentCalls.length >= 30) return false;
  _geocodeRecentCalls.push(now);
  return true;
}

function stripJapanPrefix(s) {
  return String(s || '').replace(/^日本、?\s*/, '');
}

function mapResult(r) {
  const approx = r.geometry.location_type !== 'ROOFTOP' &&
                 r.geometry.location_type !== 'RANGE_INTERPOLATED';
  return {
    formatted_address: stripJapanPrefix(r.formatted_address),
    location: r.geometry.location,
    location_type: r.geometry.location_type,
    types: r.types || [],
    isApprox: approx
  };
}

export async function geocodeAddress(query) {
  if (!checkGeocodeRateLimit()) {
    throw new Error('短時間に検索しすぎです。しばらく待ってから再試行してください');
  }
  const fullQuery = query.indexOf('北海道') === -1 ? `北海道茅部郡森町${query}` : query;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullQuery)}&key=${GEOCODE_API_KEY}&language=ja&region=jp`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('通信エラー');
  const data = await res.json();
  return {
    status: data.status,
    results: (data.results || []).map(mapResult)
  };
}

export async function reverseGeocodeNearby(lat, lng) {
  if (!checkGeocodeRateLimit()) return [];
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GEOCODE_API_KEY}&language=ja&region=jp`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  if (data.status !== 'OK') return [];
  return (data.results || [])
    .filter(r => (r.types || []).some(t => t === 'premise' || t === 'street_address' || t === 'subpremise'))
    .slice(0, 5)
    .map(mapResult);
}
