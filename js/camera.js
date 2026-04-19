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

export async function fileToResizedDataUrl(file) {
  const img = await loadImage(file);
  const { width, height } = calcResizedDimensions(
    img.naturalWidth, img.naturalHeight,
    CONFIG.photo.maxLongEdgePx
  );
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', CONFIG.photo.jpegQuality);
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
