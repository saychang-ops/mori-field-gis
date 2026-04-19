import { CONFIG } from './config.js';
import { highlightLineFeature, highlightPointFeature } from './highlight.js';

export async function loadTownRoads(map) {
  const res = await fetch('/data/town_roads.geojson');
  if (!res.ok) throw new Error('町道データ読込失敗');
  const data = await res.json();

  const layer = L.geoJSON(data, {
    style: () => CONFIG.style.townRoad,
    onEachFeature: (feature, lyr) => {
      const p = feature.properties || {};
      const code = p.route_code || '—';
      const name = p.route_name || '未割当';
      lyr.bindPopup(`<b>町道</b><br>路線名: ${escapeHtml(name)}<br>コード: ${escapeHtml(code)}`);
      lyr.on('click', () => highlightLineFeature(map, feature));
    }
  }).addTo(map);

  return { layer, features: data.features };
}

export async function loadTownBridges(map) {
  const res = await fetch('/data/town_bridges.geojson');
  if (!res.ok) throw new Error('橋梁データ読込失敗');
  const data = await res.json();

  const bridgesRenderer = L.svg({ pane: 'townBridgesPane' });

  const layer = L.geoJSON(data, {
    pointToLayer: (feature, latlng) =>
      L.circleMarker(latlng, {
        ...CONFIG.style.townBridge,
        fillColor: CONFIG.style.townBridge.color,
        fillOpacity: 0.85,
        pane: 'townBridgesPane',
        renderer: bridgesRenderer
      }),
    onEachFeature: (feature, lyr) => {
      const p = feature.properties || {};
      lyr.bindPopup(renderBridgePopup(p));
      lyr.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        highlightPointFeature(map, feature);
      });
    }
  }).addTo(map);

  return { layer, features: data.features };
}

function renderBridgePopup(p) {
  return [
    '<b>町道橋</b>',
    `橋梁名: ${escapeHtml(p.name || '')} ${escapeHtml(p.furigana || '')}`,
    `路線: ${escapeHtml(p.route_name || '')}`,
    `橋長: ${p.bridge_length ?? '—'}m / 幅員: ${p.width ?? '—'}m`,
    `架設年: ${escapeHtml(p.built_year || '—')}`,
    `健全度: ${escapeHtml(p.health_rating || '—')}`,
    `点検年: ${p.inspection_year ?? '—'}`
  ].join('<br>');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}
