import { CONFIG } from './config.js';
import { initMap, getMap, toggleBasemap } from './map.js';
import { loadTownRoads, loadTownBridges } from './layers.js';
import { centerOnCurrentLocation, startWatching } from './gps.js';
import { loadMemos } from './storage.js';

async function main() {
  const map = initMap();

  updateMemoCount();

  try {
    await Promise.all([
      loadTownRoads(map).catch(e => console.warn(e)),
      loadTownBridges(map).catch(e => console.warn(e))
    ]);
  } catch (e) {
    console.warn('レイヤ読込エラー', e);
  }

  wireFab(map);

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
  const basemapBtn = document.getElementById('fab-basemap');
  const gpsBtn = document.getElementById('fab-gps');
  const addBtn = document.getElementById('fab-add');

  if (basemapBtn) {
    basemapBtn.addEventListener('click', () => {
      toggleBasemap();
    });
  }

  if (gpsBtn) {
    gpsBtn.addEventListener('click', async () => {
      try {
        const pt = await centerOnCurrentLocation(map);
        if (pt.accuracy > CONFIG.gps.accuracyWarnThresholdM) {
          console.info(`測位精度: 約${Math.round(pt.accuracy)}m`);
        }
      } catch (e) {
        alert(e.message || '現在地取得失敗');
      }
    });
  }

  if (addBtn) {
    addBtn.addEventListener('click', () => {
      alert('登録UIは v0.2.0 で実装予定です');
    });
  }
}

function updateMemoCount() {
  const el = document.getElementById('memo-count');
  if (!el) return;
  const memos = loadMemos();
  el.textContent = `${memos.length}件`;
}

document.addEventListener('DOMContentLoaded', main);
