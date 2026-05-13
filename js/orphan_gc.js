import { listAllRefIds, deletePhoto } from './photo_store.js';

const MEMOS_KEY = 'mori_field_memos';

export async function cleanupOrphans() {
  const raw = localStorage.getItem(MEMOS_KEY);
  const memos = raw ? JSON.parse(raw) : [];
  const referenced = new Set();
  for (const m of memos) {
    const photos = (m.properties && m.properties.photos) || [];
    for (const p of photos) {
      if (typeof p === 'string' && p.startsWith('idb:')) {
        referenced.add(p);
      }
    }
  }
  const allInIdb = await listAllRefIds();
  for (const refId of allInIdb) {
    if (!referenced.has(refId)) {
      await deletePhoto(refId);
    }
  }
}
