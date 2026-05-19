// mori-field-gis/js/sync.js
import { loadJSON, saveJSON } from './storage.js';
import { CONFIG } from './config.js';
import { loadLayers, loadLayerMemos, saveLayerMemos } from './layer_store.js';
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
  // Fix I4: 15秒タイムアウト（モバイル不安定回線対策）
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(CONFIG.api.syncEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// 1レイヤを同期: 未アップ写真をuploadPhoto→uploadLayer
export async function syncLayer(layerId) {
  const layers = loadLayers();
  const meta = layers.find((l) => l.id === layerId);
  if (!meta) { dequeueLayer(layerId); return { ok: true, skipped: true }; }

  const memos = loadLayerMemos(layerId);
  const photoMap = loadPhotoMap();
  const unmapped = collectUnmappedPhotoRefs(memos, photoMap);

  // Fix I1+M5: 写真1枚の失敗でレイヤ全体の同期を止めない
  const failedRefs = new Set();
  for (const idbRef of unmapped) {
    try {
      const dataUrl = await getPhotoAsDataUrl(idbRef);
      const base64 = dataUrl.replace(/^data:[^,]+,/, '');
      const r = await postAction({ action: 'uploadPhoto', layerId, image: base64 });
      photoMap[idbRef] = 'gcs:' + layerId + ':' + r.photoId;
      savePhotoMap(photoMap);
    } catch (e) {
      console.warn('syncLayer: photo upload failed, skipping ref:', idbRef, e);
      failedRefs.add(idbRef);
    }
  }

  // substitutePhotoRefs で置換後も残った idb: 参照（失敗分）をフィルタ除去
  const PHOTO_FIELDS = ['photos', 'photos_before', 'photos_after'];
  const features = substitutePhotoRefs(memos, photoMap).map((f) => {
    const p = Object.assign({}, f.properties || {});
    PHOTO_FIELDS.forEach((field) => {
      if (Array.isArray(p[field])) {
        p[field] = p[field].filter(
          (ref) => !(typeof ref === 'string' && ref.startsWith('idb:'))
        );
      }
    });
    return Object.assign({}, f, { properties: p });
  });

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

// gcs:写真参照を data URL で取得
export async function getRemotePhotoDataUrl(layerId, photoId) {
  const r = await postAction({ action: 'getPhoto', layerId, photoId });
  return r && r.dataUrl;
}

// GCS上のレイヤ一覧を取得
export async function listRemoteLayers() {
  const r = await postAction({ action: 'listLayers' });
  return (r && r.layers) || [];
}

// 1レイヤをGCSから取得し、ローカルメモにマージして保存
export async function pullLayer(layerId) {
  const fc = await postAction({ action: 'getLayer', layerId });
  if (!fc || !Array.isArray(fc.features)) return { ok: false };
  const local = loadLayerMemos(layerId);
  const merged = mergeLayerFeatures(local, fc.features);
  saveLayerMemos(layerId, merged);
  return { ok: true, count: merged.length };
}

// スマホが保持する全レイヤをGCSから取得・マージ
export async function pullAllLayers() {
  const layers = loadLayers();
  const result = { pulled: 0, failed: 0 };
  for (const layer of layers) {
    try {
      const r = await pullLayer(layer.id);
      if (r.ok) result.pulled++;
    } catch (e) {
      console.warn('[sync] pullLayer 失敗:', layer.id, e);
      result.failed++;
    }
  }
  return result;
}

// 双方向同期: ローカルとリモートのフィーチャを _id 単位でマージ（_updated 新しい方を採用）
export function mergeLayerFeatures(local, remote) {
  const byId = {};
  const order = [];
  (Array.isArray(local) ? local : []).forEach((feat) => {
    const id = feat && feat.properties && feat.properties._id;
    if (!id) return;
    if (!byId[id]) order.push(id);
    byId[id] = feat;
  });
  (Array.isArray(remote) ? remote : []).forEach((feat) => {
    const id = feat && feat.properties && feat.properties._id;
    if (!id) return;
    const cur = byId[id];
    if (!cur) {
      order.push(id);
      byId[id] = feat;
    } else {
      const curU = (cur.properties && cur.properties._updated) || '';
      const incU = (feat.properties && feat.properties._updated) || '';
      if (incU >= curU) byId[id] = feat;
    }
  });
  return order.map((id) => byId[id]);
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
