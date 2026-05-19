// mori-field-gis/js/sync.js
import { loadJSON, saveJSON } from './storage.js';
import { CONFIG } from './config.js';
import { loadLayers, loadLayerMemos } from './layer_store.js';
import { getPhotoAsDataUrl } from './photo_store.js';

const K = { photoMap: 'mori_field_photo_map', queue: 'mori_field_sync_queue' };

export function loadPhotoMap() { return loadJSON(K.photoMap, {}) || {}; }
export function savePhotoMap(m) { return saveJSON(K.photoMap, m); }
export function loadQueue() { return loadJSON(K.queue, []) || []; }
export function saveQueue(q) { return saveJSON(K.queue, q); }

export function enqueueLayer(layerId) {
  const q = loadQueue();
  if (!q.includes(layerId)) q.push(layerId);
  saveQueue(q);
}
export function dequeueLayer(layerId) {
  saveQueue(loadQueue().filter((x) => x !== layerId));
}

// 純: idb参照を写真マップでgcs参照に置換（元配列は破壊しない）
export function substitutePhotoRefs(memos, photoMap) {
  return memos.map((m) => {
    const p = Object.assign({}, m.properties || {});
    if (Array.isArray(p.photos)) {
      p.photos = p.photos.map((ref) => photoMap[ref] || ref);
    }
    return Object.assign({}, m, { properties: p });
  });
}

// 純: 写真マップ未登録の idb 参照を重複なく集める
export function collectUnmappedPhotoRefs(memos, photoMap) {
  const out = [];
  memos.forEach((m) => {
    const photos = (m.properties && m.properties.photos) || [];
    photos.forEach((ref) => {
      if (typeof ref === 'string' && ref.startsWith('idb:') && !photoMap[ref] && out.indexOf(ref) === -1) {
        out.push(ref);
      }
    });
  });
  return out;
}

async function postAction(payload) {
  const res = await fetch(CONFIG.api.syncEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return await res.json();
}

// 1レイヤを同期: 未アップ写真をuploadPhoto→uploadLayer
export async function syncLayer(layerId) {
  const layers = loadLayers();
  const meta = layers.find((l) => l.id === layerId);
  if (!meta) { dequeueLayer(layerId); return { ok: true, skipped: true }; }

  const memos = loadLayerMemos(layerId);
  const photoMap = loadPhotoMap();
  const unmapped = collectUnmappedPhotoRefs(memos, photoMap);

  for (const idbRef of unmapped) {
    const dataUrl = await getPhotoAsDataUrl(idbRef);
    const base64 = dataUrl.replace(/^data:[^,]+,/, '');
    const r = await postAction({ action: 'uploadPhoto', layerId, image: base64 });
    photoMap[idbRef] = 'gcs:' + layerId + ':' + r.photoId;
    savePhotoMap(photoMap);
  }

  const features = substitutePhotoRefs(memos, photoMap);
  await postAction({
    action: 'uploadLayer',
    layerId,
    name: meta.name,
    device: loadJSON('mori_field_author', '') || '',
    geojson: { type: 'FeatureCollection', features }
  });
  dequeueLayer(layerId);
  return { ok: true };
}

// レイヤをGCSから削除
export async function deleteLayerRemote(layerId) {
  await postAction({ action: 'deleteLayer', layerId });
  return { ok: true };
}

// 保存/編集時の同期トリガ: オンラインなら即送信、失敗/オフラインはキュー
export async function triggerLayerSync(layerId) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    enqueueLayer(layerId);
    return { ok: false, queued: true };
  }
  try {
    await syncLayer(layerId);
    return { ok: true };
  } catch (e) {
    enqueueLayer(layerId);
    return { ok: false, queued: true, error: e.message };
  }
}

// 起動時・online復帰時にキューを処理
export async function processQueue() {
  const q = loadQueue();
  const results = { sent: 0, failed: 0 };
  for (const layerId of q) {
    try {
      await syncLayer(layerId);
      results.sent++;
    } catch (e) {
      results.failed++;
    }
  }
  return results;
}
