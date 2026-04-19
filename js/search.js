export function normalize(s) {
  if (!s) return '';
  return String(s)
    .replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
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

export async function geocodeAddress(query) {
  const url = `/api/geocode?q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('検索サーバーエラー');
  return res.json();
}
