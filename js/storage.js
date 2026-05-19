import { CONFIG } from './config.js';
import { getActiveLayerId, loadLayerMemos, saveLayerMemos } from './layer_store.js';

export function loadJSON(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('loadJSON failed for', key, e);
    return fallback;
  }
}

export function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return { ok: true };
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      return { ok: false, error: 'quota', message: 'localStorage容量が不足しています' };
    }
    return { ok: false, error: 'unknown', message: e.message };
  }
}

// 作業中レイヤのメモを返す（複数レイヤ化 v1.4.0）
export function loadMemos() {
  const id = getActiveLayerId();
  if (!id) return [];
  return loadLayerMemos(id);
}

export function saveMemos(memos) {
  const id = getActiveLayerId();
  if (!id) return { ok: false, error: 'no-active-layer', message: '作業中レイヤがありません' };
  return saveLayerMemos(id, memos);
}

export function getAuthor() {
  return loadJSON(CONFIG.storageKeys.author, '');
}

export function setAuthor(name) {
  return saveJSON(CONFIG.storageKeys.author, name);
}

export function getBasemap() {
  return loadJSON(CONFIG.storageKeys.basemap, 'chiriin_pale');
}

export function setBasemap(key) {
  return saveJSON(CONFIG.storageKeys.basemap, key);
}

export function getView() {
  return loadJSON(CONFIG.storageKeys.view, null);
}

export function setView(view) {
  return saveJSON(CONFIG.storageKeys.view, view);
}

export function estimateStorageUsage() {
  let total = 0;
  for (const key in localStorage) {
    if (!localStorage.hasOwnProperty(key)) continue;
    total += (localStorage.getItem(key) || '').length + key.length;
  }
  return { bytes: total * 2, mb: (total * 2) / 1048576 };
}
