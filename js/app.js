import { CONFIG } from './config.js';
import { initMap, getMap, toggleBasemap } from './map.js';
import { loadTownRoads, loadTownBridges } from './layers.js';
import { centerOnCurrentLocation, startWatching } from './gps.js';
import { initMemoLayer, addAtCurrentLocation, addNewPoint, startLineMode } from './register.js';
import { initFormHandlers } from './form.js';
import { showToast } from './toast.js';

async function main() {
  const map = initMap();

  await Promise.all([
    loadTownRoads(map).catch(e => console.warn(e)),
    loadTownBridges(map).catch(e => console.warn(e))
  ]);

  initMemoLayer(map);
  initFormHandlers();

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
  const handler = (e) => {
    map.off('click', handler);
    addNewPoint(e.latlng);
  };
  map.on('click', handler);
}

document.addEventListener('DOMContentLoaded', main);
