// mori-field-gis/js/layer_store.js
import { loadJSON, saveJSON } from './storage.js';
import { CONFIG } from './config.js';

export const MAX_LAYERS = CONFIG.layer.maxCount;

const K = {
  layers: 'mori_field_layers',
  active: 'mori_field_active_layer',
  memosPrefix: 'mori_field_layer_',
  legacy: 'mori_field_memos'
};

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function loadLayers() {
  return loadJSON(K.layers, []) || [];
}
export function saveLayers(layers) {
  return saveJSON(K.layers, layers);
}
export function loadLayerMemos(layerId) {
  return loadJSON(K.memosPrefix + layerId, []) || [];
}
export function saveLayerMemos(layerId, memos) {
  return saveJSON(K.memosPrefix + layerId, memos);
}
export function getActiveLayerId() {
  return loadJSON(K.active, null);
}
export function setActiveLayerId(id) {
  return saveJSON(K.active, id);
}

export function createLayer(name) {
  const layers = loadLayers();
  const createdCount = layers.filter((l) => !l.imported).length;
  if (createdCount >= MAX_LAYERS) return { ok: false, error: 'limit' };
  const layer = {
    id: uuid(),
    name: String(name || '').trim() || '新規レイヤ',
    visible: true,
    createdAt: new Date().toISOString()
  };
  layers.push(layer);
  const r = saveLayers(layers);
  if (!r.ok) return { ok: false, error: r.error || 'save', message: r.message };
  if (getActiveLayerId() == null) setActiveLayerId(layer.id);
  return { ok: true, layer };
}

// GCSから取り込んだレイヤをメタに追加（指定IDで・上限対象外）
export function importLayer(layerId, name) {
  const layers = loadLayers();
  if (layers.some((l) => l.id === layerId)) return { ok: false, error: 'exists' };
  const layer = {
    id: layerId,
    name: String(name || '').trim() || '取込レイヤ',
    visible: true,
    createdAt: new Date().toISOString(),
    imported: true
  };
  layers.push(layer);
  const r = saveLayers(layers);
  if (!r.ok) return { ok: false, error: r.error || 'save', message: r.message };
  return { ok: true, layer };
}

export function renameLayer(id, name) {
  const layers = loadLayers();
  const l = layers.find((x) => x.id === id);
  if (!l) return { ok: false, error: 'notfound' };
  l.name = String(name || '').trim() || l.name;
  return saveLayers(layers);
}

export function setLayerVisible(id, visible) {
  const layers = loadLayers();
  const l = layers.find((x) => x.id === id);
  if (!l) return { ok: false, error: 'notfound' };
  l.visible = !!visible;
  return saveLayers(layers);
}

export function deleteLayer(id) {
  const remaining = loadLayers().filter((x) => x.id !== id);
  const saveResult = saveLayers(remaining);  // Fix M1: propagate save failure
  if (!saveResult.ok) return saveResult;
  localStorage.removeItem(K.memosPrefix + id);
  if (getActiveLayerId() === id) {
    setActiveLayerId(remaining.length ? remaining[0].id : null);
  }
  return { ok: true };
}

export function findMemoLayerId(memoId) {
  for (const l of loadLayers()) {
    const memos = loadLayerMemos(l.id);
    if (memos.some((m) => m.properties && m.properties._id === memoId)) return l.id;
  }
  return null;
}

// _deleted tombstone を除いた生存メモ数
export function countLiveMemos(memos) {
  return (Array.isArray(memos) ? memos : []).filter(
    (m) => !(m && m.properties && m.properties._deleted)
  ).length;
}

export function ensureMigrated() {
  if (loadJSON(K.layers, null) !== null) return { migrated: false };
  const legacy = loadJSON(K.legacy, []) || [];
  const layer = {
    id: uuid(),
    name: CONFIG.layer.defaultName,
    visible: true,
    createdAt: new Date().toISOString()
  };
  legacy.forEach((m) => {
    m.properties = m.properties || {};
    m.properties._layer_id = layer.id;
  });
  saveLayers([layer]);
  saveLayerMemos(layer.id, legacy);
  setActiveLayerId(layer.id);
  return { migrated: true, layerId: layer.id, count: legacy.length };
}
