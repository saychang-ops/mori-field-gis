import { CONFIG } from './config.js';
import { initMap, toggleBasemap } from './map.js';
import { loadTownRoads, loadTownBridges } from './layers.js';
import { centerOnCurrentLocation, startWatching } from './gps.js';
import { initMemoLayer, startPointMode, startLineMode, clearAllMemos } from './register.js';
import { initFormHandlers } from './form.js';
import { showToast } from './toast.js';
import { searchRoads, searchBridges, geocodeAddress, reverseGeocodeNearby } from './search.js';
import { highlightLineFeature, highlightPointFeature, clearHighlight } from './highlight.js';
import { estimateExportSize, performBlobDownload, buildResolvedBaseFeatures, applyLayerNameAndBuild, sanitizeFilename } from './export.js';
import { loadMemos } from './storage.js';
import { migratePhotosToIndexedDB } from './migration.js';
import { cleanupOrphans } from './orphan_gc.js';

async function main() {
  try {
    await migratePhotosToIndexedDB();
  } catch (e) {
    console.warn('photo migration failed:', e);
    showToast('写真データの移行に一部失敗しました', 'warning');
  }

  // footer のバージョン表示を CONFIG から動的反映（ハードコード忘れ防止）
  const versionEl = document.getElementById('version-label');
  if (versionEl) versionEl.textContent = CONFIG.version;

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

  const scheduleIdle = (cb) => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(cb, { timeout: 5000 });
    else setTimeout(cb, 2000);
  };
  scheduleIdle(() => {
    cleanupOrphans().catch((e) => console.warn('orphan GC failed:', e));
  });
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

function buildFilenameForName(name) {
  // export.js の buildFilename と同等ロジックだが、app.js 側で同期に必要
  const safe = sanitizeFilename(name).replace(/\.(geo)?json$/i, '');
  if (safe) return `${safe}.json`;
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `field_memos_${y}${m}${day}_${hh}${mm}.json`;
}

function openShareModal({ defaultName, summaryText, onSend }) {
  const overlay = document.getElementById('share-modal-overlay');
  const nameInput = document.getElementById('share-modal-name');
  const summaryEl = document.getElementById('share-modal-summary');
  const cancelBtn = document.getElementById('share-modal-cancel');
  const sendBtn = document.getElementById('share-modal-send');
  if (!overlay || !nameInput || !summaryEl || !cancelBtn || !sendBtn) {
    return;
  }
  nameInput.value = defaultName;
  summaryEl.textContent = summaryText;
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');

  const close = () => {
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
    cancelBtn.removeEventListener('click', onCancel);
    sendBtn.removeEventListener('click', onClick);
  };
  const onCancel = () => close();
  const onClick = () => {
    const name = (nameInput.value || '').trim() || defaultName;
    close();
    onSend(name);
  };
  cancelBtn.addEventListener('click', onCancel);
  sendBtn.addEventListener('click', onClick);
  setTimeout(() => nameInput.focus(), 50);
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

    // 写真IDB→dataURL解決を事前に済ませる (送信クリック後のasync待ちをゼロにするため)
    let baseFeatures;
    try {
      baseFeatures = await buildResolvedBaseFeatures(memos);
    } catch (e) {
      showToast('写真読込失敗: ' + e.message, 'error');
      return;
    }

    const today = new Date();
    const defaultName = `現場メモ_${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;
    const { mb } = estimateExportSize(memos);
    const summaryText = `${memos.length} 件 / 約 ${mb.toFixed(2)} MB`;

    openShareModal({
      defaultName,
      summaryText,
      // 送信ボタンクリックは fresh user gesture。share() を同期で呼び gesture を保持
      onSend: (finalName) => {
        const geojson = applyLayerNameAndBuild(baseFeatures, finalName);
        const blob = new Blob([JSON.stringify(geojson)], { type: 'application/json' });
        const filename = buildFilenameForName(finalName);
        const file = new File([blob], filename, { type: 'application/json' });

        const hasShare = typeof navigator.share === 'function';
        const canShareFiles = hasShare && typeof navigator.canShare === 'function' &&
                              navigator.canShare({ files: [file] });
        console.log('[Share Diag]', {
          hasShare,
          canShareFiles,
          fileName: file.name, fileType: file.type, fileSize: file.size,
          userAgent: navigator.userAgent
        });

        if (!hasShare || !canShareFiles) {
          showToast('共有不可 (canShare=' + canShareFiles + ') → ダウンロード', 'warning');
          const ok = performBlobDownload(blob, filename);
          if (ok) showToast('ダウンロードしました: ' + filename, 'success');
          else showToast('ダウンロードにも失敗', 'error');
          return;
        }

        // navigator.share を同期で呼ぶ (ここ重要: await/.then前のこの行が gesture を消費する)
        const sharePromise = navigator.share({
          files: [file],
          title: '現場メモ',
          text: `現場メモ ${memos.length}件`
        });
        sharePromise.then(() => {
          showToast('共有しました', 'success');
        }).catch((e) => {
          if (e.name === 'AbortError') {
            showToast('共有をキャンセルしました', 'warning');
            return;
          }
          console.warn('navigator.share threw:', e);
          showToast('共有失敗 (' + e.name + ') → ダウンロード', 'warning');
          const ok = performBlobDownload(blob, filename);
          if (ok) showToast('ダウンロードしました: ' + filename, 'success');
        });
      }
    });
  });
}

function showAddMenu() {
  closeAddMenu();
  const menu = document.createElement('div');
  menu.id = 'add-menu';
  const items = [
    { action: 'point', label: '📍 点で登録' },
    { action: 'line',  label: '〰️ 線で登録' },
    { action: 'cancel', label: 'キャンセル' }
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
    if (action === 'point') {
      startPointMode();
    } else if (action === 'line') {
      startLineMode();
    }
  });
}

function closeAddMenu() {
  const existing = document.getElementById('add-menu');
  if (existing) existing.remove();
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
