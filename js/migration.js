import { openDB, putPhoto } from './photo_store.js';

const MEMOS_KEY = 'mori_field_memos';
const FLAG_KEY = 'mori_field_migration_v1';

async function dataUrlToBlob(dataUrl) {
  const commaIdx = dataUrl.indexOf(',');
  const meta = dataUrl.slice(5, commaIdx);
  const isBase64 = meta.endsWith(';base64');
  const mime = isBase64 ? meta.slice(0, -7) : meta;
  const data = dataUrl.slice(commaIdx + 1);
  let bytes;
  if (isBase64) {
    const bin = atob(data);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } else {
    bytes = new TextEncoder().encode(decodeURIComponent(data));
  }
  return new Blob([bytes], { type: mime });
}

export async function migratePhotosToIndexedDB() {
  if (localStorage.getItem(FLAG_KEY) === 'done') return;

  await openDB();
  const raw = localStorage.getItem(MEMOS_KEY);
  const memos = raw ? JSON.parse(raw) : [];

  let touched = false;
  for (const memo of memos) {
    const props = memo.properties || {};
    const photos = Array.isArray(props.photos) ? props.photos : [];
    const newPhotos = [];
    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];
      if (typeof p === 'string' && p.startsWith('data:')) {
        const blob = await dataUrlToBlob(p);
        const refId = await putPhoto(blob, props._id || `unknown_${Date.now()}`, i);
        newPhotos.push(refId);
        touched = true;
      } else {
        newPhotos.push(p);
      }
    }
    props.photos = newPhotos;
  }

  if (touched) {
    localStorage.setItem(MEMOS_KEY, JSON.stringify(memos));
  }
  localStorage.setItem(FLAG_KEY, 'done');
}
