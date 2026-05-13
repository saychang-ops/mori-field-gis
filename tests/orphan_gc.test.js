import { describe, it, expect, beforeEach } from 'vitest';
import { _resetForTests, openDB, putPhoto, listAllRefIds } from '../js/photo_store.js';

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

  it('localStorage から参照されない refId のみ削除する', async () => {
    const { cleanupOrphans } = await import('../js/orphan_gc.js');
    await openDB();
    const referenced = await putPhoto(makeBlob(), 'M1', 0);
    const orphan = await putPhoto(makeBlob(), 'M9', 0);

    localStorage.setItem('mori_field_memos', JSON.stringify([
      { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] },
        properties: { _id: 'M1', photos: [referenced] } }
    ]));

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
});
