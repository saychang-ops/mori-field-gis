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
