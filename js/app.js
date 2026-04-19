import { CONFIG } from './config.js';
import { initMap, getMap, toggleBasemap } from './map.js';
import { loadTownRoads, loadTownBridges, setTownLayersInteractive } from './layers.js';
import { centerOnCurrentLocation, startWatching } from './gps.js';
import { initMemoLayer, addAtCurrentLocation, addNewPoint, startLineMode, clearAllMemos } from './register.js';
import { initFormHandlers } from './form.js';
import { showToast } from './toast.js';
import { searchRoads, searchBridges, geocodeAddress, reverseGeocodeNearby } from './search.js';
import { highlightLineFeature, highlightPointFeature, clearHighlight } from './highlight.js';
import { shareOrDownload, estimateExportSize } from './export.js';
import { loadMemos } from './storage.js';

async function main() {
  const map = initMap();

  let roadFeatures = [];
  let bridgeFeatures = [];
  try {
    const [roads, bridges] = await Promise.all([
      loadTownRoads(map),
      loadTownBridges(map)
    ]);
    roadFeatures = roads.features;
    bridgeFeatures = bridges.features;
  } catch (e) {
    console.error('データ読込失敗:', e);
    showToast('データ読込に失敗しました', 'error');
  }

  initMemoLayer(map);
  initFormHandlers();

  wireFab(map);
  wireShareButton();
  wireClearAllButton();
  setupSearchHandlers(map, roadFeatures, bridgeFeatures);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('SW registration failed', err);
    });
  }

  try {
    startWatching(map);
  } catch (e) {
    console.warn('GPS watch unavailable', e);
  }
}

function wireFab(map) {
  document.getElementById('fab-basemap')?.addEventListener('click', () => {
    toggleBasemap();
  });

  document.getElementById('fab-gps')?.addEventListener('click', async () => {
    try {
      const pt = await centerOnCurrentLocation(map);
      if (pt.accuracy > CONFIG.gps.accuracyWarnThresholdM) {
        showToast(`測位精度: 約${Math.round(pt.accuracy)}m`, 'warning');
      }
    } catch (e) {
      showToast(e.message || '現在地取得失敗', 'error');
    }
  });

  document.getElementById('fab-add')?.addEventListener('click', () => {
    showAddMenu();
  });
}

function wireClearAllButton() {
  const btn = document.getElementById('clear-all-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    clearAllMemos();
  });
}

function wireShareButton() {
  const shareBtn = document.getElementById('share-btn');
  if (!shareBtn) return;
  shareBtn.addEventListener('click', async () => {
    const memos = loadMemos();
    if (memos.length === 0) {
      showToast('エクスポートするメモがありません', 'warning');
      return;
    }
    const { mb } = estimateExportSize(memos);
    if (!confirm(`現場メモ ${memos.length}件 / 約 ${mb.toFixed(2)} MB を共有しますか？`)) return;
    try {
      const r = await shareOrDownload();
      if (r.method === 'share') showToast('共有しました', 'success');
      else if (r.method === 'download') showToast('ダウンロードしました', 'success');
      else if (r.method === 'failed') showToast('エクスポート失敗: ' + r.error, 'error');
    } catch (e) {
      showToast('エクスポート失敗: ' + e.message, 'error');
    }
  });
}

function showAddMenu() {
  closeAddMenu();
  const menu = document.createElement('div');
  menu.id = 'add-menu';
  const items = [
    { action: 'current', label: '📍 現在地に点' },
    { action: 'tap',     label: '👆 地図タップで点' },
    { action: 'line',    label: '〰️ 線を描画' },
    { action: 'cancel',  label: 'キャンセル' }
  ];
  items.forEach(({ action, label }) => {
    const btn = document.createElement('button');
    btn.dataset.action = action;
    btn.textContent = label;
    menu.appendChild(btn);
  });
  document.body.appendChild(menu);
  menu.addEventListener('click', (e) => {
    const action = e.target.dataset?.action;
    if (!action) return;
    closeAddMenu();
    if (action === 'current') {
      addAtCurrentLocation();
    } else if (action === 'tap') {
      enableTapToAddMode();
    } else if (action === 'line') {
      startLineMode();
    }
  });
}

function closeAddMenu() {
  const existing = document.getElementById('add-menu');
  if (existing) existing.remove();
}

function enableTapToAddMode() {
  const map = getMap();
  showToast('地図をタップして点を登録', 'success');
  setTownLayersInteractive(map, false);
  const handler = (e) => {
    map.off('click', handler);
    setTownLayersInteractive(map, true);
    addNewPoint(e.latlng);
  };
  map.on('click', handler);
}

let searchPinLayer = null;
let searchHighlightLayer = null;

function setupSearchHandlers(map, roadFeatures, bridgeFeatures) {
  const btn = document.getElementById('search-btn');
  const input = document.getElementById('search-input');
  const typeSel = document.getElementById('search-type');
  const results = document.getElementById('search-results');

  async function doSearch() {
    const q = input.value.trim();
    if (!q) return;
    const type = typeSel.value;
    results.innerHTML = '';
    results.classList.remove('hidden');

    if (type === 'address') {
      results.innerHTML = '<div class="result-empty">検索中...</div>';
      try {
        const data = await geocodeAddress(q);
        if (data.status !== 'OK' || !data.results.length) {
          results.innerHTML = '<div class="result-empty">該当なし</div>';
          return;
        }
        results.innerHTML = '';
        data.results.forEach(r => results.appendChild(buildAddressItem(map, r, results)));

        if (data.results[0].isApprox) {
          const loc = data.results[0].location;
          const nearby = await reverseGeocodeNearby(loc.lat, loc.lng);
          if (nearby.length) {
            const header = document.createElement('div');
            header.className = 'result-header';
            header.textContent = '▼ 付近の住所候補';
            results.appendChild(header);
            nearby.forEach(r => results.appendChild(buildAddressItem(map, r, results)));
          }
        }
      } catch (e) {
        showToast('住所検索に失敗: ' + e.message, 'error');
        results.classList.add('hidden');
      }
    } else if (type === 'road') {
      const matches = searchRoads(roadFeatures, q);
      renderFeatureResults(matches, (f) => {
        clearSearchMarkers(map);
        const bounds = L.geoJSON(f).getBounds();
        map.fitBounds(bounds, { maxZoom: 17 });
        highlightLineFeature(map, f);
      });
    } else if (type === 'bridge') {
      const matches = searchBridges(bridgeFeatures, q);
      renderFeatureResults(matches, (f) => {
        clearSearchMarkers(map);
        const [lng, lat] = f.geometry.coordinates;
        map.setView([lat, lng], 18);
        highlightPointFeature(map, f);
      });
    }
  }

  function renderFeatureResults(features, onSelect) {
    results.innerHTML = '';
    if (features.length === 0) {
      results.innerHTML = '<div class="result-empty">該当なし</div>';
      return;
    }
    features.forEach(f => {
      const p = f.properties || {};
      const item = document.createElement('div');
      item.className = 'result-item';
      item.textContent = p.route_name ? `${p.route_code}: ${p.route_name}` : p.name;
      item.addEventListener('click', () => {
        onSelect(f);
        results.classList.add('hidden');
      });
      results.appendChild(item);
    });
  }

  btn.addEventListener('click', doSearch);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); doSearch(); }
  });
}

function clearSearchMarkers(map) {
  if (searchPinLayer) { map.removeLayer(searchPinLayer); searchPinLayer = null; }
  if (searchHighlightLayer) { map.removeLayer(searchHighlightLayer); searchHighlightLayer = null; }
  clearHighlight(map);
}

function buildAddressItem(map, r, resultsEl) {
  const item = document.createElement('div');
  item.className = 'result-item';
  if (r.isApprox) {
    const main = document.createElement('div');
    main.textContent = r.formatted_address;
    const warn = document.createElement('div');
    warn.className = 'result-warn';
    warn.textContent = '※番地が特定できないため、おおよその位置です';
    item.appendChild(main);
    item.appendChild(warn);
  } else {
    item.textContent = r.formatted_address;
  }
  item.addEventListener('click', () => {
    clearSearchMarkers(map);
    map.setView([r.location.lat, r.location.lng], 17);
    searchPinLayer = L.marker([r.location.lat, r.location.lng])
      .addTo(map).bindPopup(r.formatted_address).openPopup();
    resultsEl.classList.add('hidden');
  });
  return item;
}

document.addEventListener('DOMContentLoaded', main);
