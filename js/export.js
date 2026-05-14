import { CONFIG } from './config.js';
import { loadMemos } from './storage.js';
import { getPhoto } from './photo_store.js';

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

async function resolvePhotos(photos) {
  if (!Array.isArray(photos) || photos.length === 0) return [];
  const out = [];
  for (const p of photos) {
    if (typeof p === 'string' && p.startsWith('idb:')) {
      try {
        const blob = await getPhoto(p);
        out.push(await blobToDataUrl(blob));
      } catch (e) {
        console.warn('photo missing in IDB:', p, e);
      }
    } else {
      out.push(p);
    }
  }
  return out;
}

// v1.2.0: 任意でレイヤ名を指定可能。指定された場合は各featureの _custom_layer_id を一意化し、
// _custom_layer_name を指定名に上書き → PC版で新規レイヤとして取り込まれる。
// 指定なしの場合は従来通り 'smartphone_field_memo' (後方互換)
export async function buildExportGeoJSON(memos, layerName) {
  const trimmedName = (layerName || '').trim();
  let layerId = null;
  let layerLabel = null;
  if (trimmedName) {
    const slug = trimmedName.replace(/[^\w぀-ヿ一-鿿-]/g, '_').slice(0, 40);
    layerId = `smartphone_${slug}_${Date.now()}`;
    layerLabel = trimmedName;
  }

  const features = [];
  for (const memo of memos) {
    const props = { ...memo.properties };
    props.photos = await resolvePhotos(props.photos);
    if (layerId) {
      props._custom_layer_id = layerId;
      props._custom_layer_name = layerLabel;
    }
    features.push({ ...memo, properties: props });
  }
  return {
    type: 'FeatureCollection',
    _export_meta: {
      source: 'mori-field-gis',
      version: CONFIG.version,
      exported_at: new Date().toISOString(),
      device: 'smartphone',
      layer_name: layerLabel || null
    },
    features
  };
}

export function sanitizeFilename(name) {
  // ファイル名に使えない文字を _ に置換
  return String(name || '').replace(/[\\/:*?"<>|]/g, '_').trim();
}

export function estimateExportSize(memos) {
  const json = JSON.stringify({
    type: 'FeatureCollection',
    features: memos,
    _export_meta: { source: 'mori-field-gis', version: CONFIG.version }
  });
  const bytes = new Blob([json]).size;
  return { bytes, mb: bytes / 1048576 };
}

export async function shareOrDownload(layerName) {
  const memos = loadMemos();
  const geojson = await buildExportGeoJSON(memos, layerName);
  const jsonStr = JSON.stringify(geojson);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const filename = buildFilename(layerName);
  const file = new File([blob], filename, { type: 'application/json' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: '現場メモ',
        text: `現場メモ ${memos.length}件`
      });
      return { method: 'share', count: memos.length };
    } catch (e) {
      if (e.name === 'AbortError') return { method: 'abort' };
      console.warn('share failed, falling back to download:', e);
    }
  }

  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 10000);
    return { method: 'download', count: memos.length };
  } catch (e) {
    console.error('download fallback failed:', e);
    return { method: 'failed', count: memos.length, error: e.message };
  }
}

function buildFilename(layerName) {
  const safe = sanitizeFilename(layerName);
  if (safe) {
    return safe.endsWith('.geojson') ? safe : `${safe}.geojson`;
  }
  // 名前未指定なら従来のタイムスタンプ形式
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `field_memos_${y}${m}${day}_${hh}${mm}.geojson`;
}
