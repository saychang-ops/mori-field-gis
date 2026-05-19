import { describe, it, expect, beforeEach } from 'vitest';
import { _resetForTests, openDB, putPhoto, listAllRefIds } from '../js/photo_store.js';
import { createLayer, saveLayerMemos } from '../js/layer_store.js';

if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => 'blob:fake';
  URL.revokeObjectURL = () => {};
}

function makeBlob(size = 10) {
  return new Blob([new Uint8Array(size)], { type: 'image/jpeg' });
}

describe('cleanupOrphans', () => {
  beforeEach(async () => {
    await _resetForTests();
    localStorage.clear();
  });

  it('レイヤ内で参照されない refId のみ削除する', async () => {
    const { cleanupOrphans } = await import('../js/orphan_gc.js');
    await openDB();
    const referenced = await putPhoto(makeBlob(), 'M1', 0);
    const orphan = await putPhoto(makeBlob(), 'M9', 0);

    const { layer } = createLayer('テスト');
    saveLayerMemos(layer.id, [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] },
        properties: { _id: 'M1', photos: [referenced] } }
    ]);

    await cleanupOrphans();

    const remaining = await listAllRefIds();
    expect(remaining).toContain(referenced);
    expect(remaining).not.toContain(orphan);
  });

  it('memos が空でも例外なく完走', async () => {
    const { cleanupOrphans } = await import('../js/orphan_gc.js');
    await openDB();
    await putPhoto(makeBlob(), 'Mo', 0);
    await cleanupOrphans();
    const remaining = await listAllRefIds();
    expect(remaining).toEqual([]);
  });

  it('複数レイヤにまたがる参照を正しく保護する', async () => {
    const { cleanupOrphans } = await import('../js/orphan_gc.js');
    await openDB();
    const refA = await putPhoto(makeBlob(), 'MA', 0);
    const refB = await putPhoto(makeBlob(), 'MB', 0);
    const orphan = await putPhoto(makeBlob(), 'MX', 0);

    const layerA = createLayer('A').layer;
    const layerB = createLayer('B').layer;
    saveLayerMemos(layerA.id, [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] },
        properties: { _id: 'MA', photos: [refA] } }
    ]);
    saveLayerMemos(layerB.id, [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] },
        properties: { _id: 'MB', photos: [refB] } }
    ]);

    await cleanupOrphans();

    const remaining = await listAllRefIds();
    expect(remaining).toContain(refA);
    expect(remaining).toContain(refB);
    expect(remaining).not.toContain(orphan);
  });
});
