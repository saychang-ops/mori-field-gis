import { describe, it, expect, beforeEach } from 'vitest';
import { openDB, putPhoto, getPhoto, _resetForTests } from '../js/photo_store.js';

if (typeof URL.createObjectURL !== 'function') {
  let counter = 0;
  URL.createObjectURL = () => `blob:fake-${++counter}`;
  URL.revokeObjectURL = () => {};
}

function makeBlob(size = 100, type = 'image/jpeg') {
  const u8 = new Uint8Array(size);
  for (let i = 0; i < size; i++) u8[i] = i % 256;
  return new Blob([u8], { type });
}

describe('photo_store: openDB / putPhoto / getPhoto', () => {
  beforeEach(async () => {
    await _resetForTests();
  });

  it('openDB が解決する', async () => {
    await expect(openDB()).resolves.toBeDefined();
  });

  it('putPhoto が refId を返し、getPhoto で同じバイト列の Blob が取れる', async () => {
    await openDB();
    const blob = makeBlob(256);
    const refId = await putPhoto(blob, 'M1', 0);
    expect(refId).toBe('idb:M1_0');

    const out = await getPhoto(refId);
    expect(out).toBeInstanceOf(Blob);
    expect(out.size).toBe(256);
  });

  it('同じ memoId+index で2回 put すると衝突回避サフィックスが付く', async () => {
    await openDB();
    const first = await putPhoto(makeBlob(10), 'M1', 0);
    const second = await putPhoto(makeBlob(20), 'M1', 0);
    expect(first).toBe('idb:M1_0');
    expect(second).toMatch(/^idb:M1_0_[a-z0-9]{4}$/);
    const blobSecond = await getPhoto(second);
    expect(blobSecond.size).toBe(20);
  });
});

describe('photo_store: getPhotoUrl', () => {
  beforeEach(async () => {
    await _resetForTests();
  });

  it('getPhotoUrl は blob: 形式のURLを返す', async () => {
    const { getPhotoUrl } = await import('../js/photo_store.js');
    await openDB();
    const refId = await putPhoto(makeBlob(50), 'M2', 0);
    const url = await getPhotoUrl(refId);
    expect(typeof url).toBe('string');
    expect(url.startsWith('blob:')).toBe(true);
  });

  it('同じ refId に対して getPhotoUrl を2回呼ぶと同じURLが返る (キャッシュ)', async () => {
    const { getPhotoUrl } = await import('../js/photo_store.js');
    await openDB();
    const refId = await putPhoto(makeBlob(50), 'M3', 0);
    const url1 = await getPhotoUrl(refId);
    const url2 = await getPhotoUrl(refId);
    expect(url1).toBe(url2);
  });
});

describe('photo_store: delete / list / clearAll', () => {
  beforeEach(async () => {
    await _resetForTests();
  });

  it('deletePhoto で個別削除できる', async () => {
    const { deletePhoto } = await import('../js/photo_store.js');
    await openDB();
    const refId = await putPhoto(makeBlob(20), 'M4', 0);
    await deletePhoto(refId);
    await expect(getPhoto(refId)).rejects.toThrow(/not found/);
  });

  it('deletePhotosByMemoId で同じmemoIdの写真をすべて削除', async () => {
    const { deletePhotosByMemoId, listAllRefIds } = await import('../js/photo_store.js');
    await openDB();
    await putPhoto(makeBlob(10), 'M5', 0);
    await putPhoto(makeBlob(10), 'M5', 1);
    await putPhoto(makeBlob(10), 'M6', 0);
    await deletePhotosByMemoId('M5');
    const remaining = await listAllRefIds();
    expect(remaining).toEqual(['idb:M6_0']);
  });

  it('listAllRefIds は idb: プレフィックス付きで全件返す', async () => {
    const { listAllRefIds } = await import('../js/photo_store.js');
    await openDB();
    await putPhoto(makeBlob(10), 'M7', 0);
    await putPhoto(makeBlob(10), 'M7', 1);
    const list = await listAllRefIds();
    expect(list.sort()).toEqual(['idb:M7_0', 'idb:M7_1']);
  });

  it('clearAll で全件消える', async () => {
    const { clearAll, listAllRefIds } = await import('../js/photo_store.js');
    await openDB();
    await putPhoto(makeBlob(10), 'M8', 0);
    await clearAll();
    const list = await listAllRefIds();
    expect(list).toEqual([]);
  });
});
