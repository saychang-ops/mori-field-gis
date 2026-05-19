import { listAllRefIds, deletePhoto } from './photo_store.js';
import { loadLayers, loadLayerMemos } from './layer_store.js';

export async function cleanupOrphans() {
  const referenced = new Set();
  for (const layer of loadLayers()) {
    const memos = loadLayerMemos(layer.id);
    for (const m of memos) {
      const photos = (m.properties && m.properties.photos) || [];
      for (const p of photos) {
        if (typeof p === 'string' && p.startsWith('idb:')) {
          referenced.add(p);
        }
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
