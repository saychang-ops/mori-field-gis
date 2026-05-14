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

// v1.3.5: ユーザー操作 (送信ボタンクリック) の gesture を保ったまま
// navigator.share() を呼び出すため、写真解決を「事前」に行い、レイヤ名適用は
// 「同期」関数として分離。これにより送信クリック→share() の間に async/await を
// 挟まずに済むので、Chrome の transient activation が期限切れにならない。

// 写真IDB→dataURL解決のみ済ませた中間feature配列を生成 (async、時間がかかる)
export async function buildResolvedBaseFeatures(memos) {
  const features = [];
  for (const memo of memos) {
    const props = { ...memo.properties };
    props.photos = await resolvePhotos(props.photos);
    features.push({ ...memo, properties: props });
  }
  return features;
}

// レイヤ名を適用して最終的なGeoJSON FeatureCollectionを返す (同期)
export function applyLayerNameAndBuild(baseFeatures, layerName) {
  const trimmedName = (layerName || '').trim();
  let layerId = null;
  let layerLabel = null;
  if (trimmedName) {
    const slug = trimmedName.replace(/[^\w぀-ヿ一-鿿-]/g, '_').slice(0, 40);
    layerId = `smartphone_${slug}_${Date.now()}`;
    layerLabel = trimmedName;
  }
  const features = baseFeatures.map(f => {
    const props = { ...f.properties };
    if (layerId) {
      props._custom_layer_id = layerId;
      props._custom_layer_name = layerLabel;
    }
    return { ...f, properties: props };
  });
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

// 後方互換用: 旧API (memos -> resolve -> apply の一気通貫)。新コードからは
// buildResolvedBaseFeatures + applyLayerNameAndBuild の組合せ推奨。
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

  // 診断: Web Share API のサポート状況を可視化
  const hasShare = typeof navigator.share === 'function';
  const hasCanShare = typeof navigator.canShare === 'function';
  const canShareFiles = hasCanShare ? navigator.canShare({ files: [file] }) : false;
  console.log('[Share Diag]', {
    hasShare, hasCanShare, canShareFiles,
    fileName: file.name, fileType: file.type, fileSize: file.size,
    userAgent: navigator.userAgent
  });

  if (!hasShare) {
    return { method: 'download', count: memos.length, diag: 'no-share-api', _doDownload: true, _blob: blob, _filename: filename };
  }
  if (!canShareFiles) {
    return { method: 'download', count: memos.length, diag: 'canShare-false', _doDownload: true, _blob: blob, _filename: filename };
  }

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
    return { method: 'download', count: memos.length, diag: 'share-threw:' + e.name + ':' + (e.message || ''), _doDownload: true, _blob: blob, _filename: filename };
  }
}

// shareOrDownload が返した _doDownload フラグに従って blob ダウンロードを発火
export function performBlobDownload(blob, filename) {
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
    return true;
  } catch (e) {
    console.error('blob download failed:', e);
    return false;
  }
}

function buildFilename(layerName) {
  // 拡張子は .json に固定 (Chrome の Web Share API が .geojson 拡張子を
  // 許可リスト外と判定し、共有シートを出さずにblob downloadに落ちるため)。
  // PC版v1.6.0以降は .json も .geojson も両方取込対応。
  const safe = sanitizeFilename(layerName).replace(/\.(geo)?json$/i, '');
  if (safe) {
    return `${safe}.json`;
  }
  // 名前未指定なら従来のタイムスタンプ形式
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `field_memos_${y}${m}${day}_${hh}${mm}.json`;
}
