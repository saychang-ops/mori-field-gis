import { CONFIG } from './config.js';
import { loadMemos } from './storage.js';

export function buildExportGeoJSON(memos) {
  return {
    type: 'FeatureCollection',
    _export_meta: {
      source: 'mori-field-gis',
      version: CONFIG.version,
      exported_at: new Date().toISOString(),
      device: 'smartphone'
    },
    features: memos
  };
}

export function estimateExportSize(memos) {
  const json = JSON.stringify(buildExportGeoJSON(memos));
  const bytes = new Blob([json]).size;
  return { bytes, mb: bytes / 1048576 };
}

export async function shareOrDownload() {
  const memos = loadMemos();
  const geojson = buildExportGeoJSON(memos);
  const jsonStr = JSON.stringify(geojson);
  const blob = new Blob([jsonStr], { type: 'application/geo+json' });
  const filename = buildFilename();
  const file = new File([blob], filename, { type: 'application/geo+json' });

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

function buildFilename() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `field_memos_${y}${m}${day}_${hh}${mm}.geojson`;
}
