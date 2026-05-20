import { CONFIG } from './config.js';

export function calcResizedDimensions(origW, origH, maxLongEdge) {
  const longEdge = Math.max(origW, origH);
  if (longEdge <= maxLongEdge) {
    return { width: origW, height: origH };
  }
  const ratio = maxLongEdge / longEdge;
  return {
    width: Math.round(origW * ratio),
    height: Math.round(origH * ratio)
  };
}

// createImageBitmap が使える環境では EXIF auto-rotate 付きで利用（iOS Safari/Chrome の HEIC 画像対応）。
// 失敗時は Image() + FileReader にフォールバック。
async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (_) {
      // fall through to legacy path
    }
  }
  return loadImage(file);
}

async function resizeToCanvas(file) {
  const bitmap = await loadBitmap(file);
  const srcW = bitmap.naturalWidth || bitmap.width || 0;
  const srcH = bitmap.naturalHeight || bitmap.height || 0;
  if (!srcW || !srcH) {
    if (typeof bitmap.close === 'function') bitmap.close();
    throw new Error('画像寸法を取得できませんでした (HEIC/未対応形式の可能性)');
  }
  const { width, height } = calcResizedDimensions(srcW, srcH, CONFIG.photo.maxLongEdgePx);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);
  if (typeof bitmap.close === 'function') bitmap.close();
  if (typeof console !== 'undefined' && console.info) {
    console.info('[camera] resized %dx%d -> %dx%d', srcW, srcH, width, height);
  }
  return canvas;
}

export async function fileToResizedDataUrl(file) {
  const canvas = await resizeToCanvas(file);
  return canvas.toDataURL('image/jpeg', CONFIG.photo.jpegQuality);
}

export async function fileToResizedBlob(file) {
  const canvas = await resizeToCanvas(file);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('toBlob returned null'));
      else resolve(blob);
    }, 'image/jpeg', CONFIG.photo.jpegQuality);
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('画像読込失敗'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('ファイル読込失敗'));
    reader.readAsDataURL(file);
  });
}
