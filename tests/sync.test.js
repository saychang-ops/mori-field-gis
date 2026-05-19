// mori-field-gis/tests/sync.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadPhotoMap, savePhotoMap, loadQueue, saveQueue,
  enqueueLayer, dequeueLayer, substitutePhotoRefs, collectUnmappedPhotoRefs
} from '../js/sync.js';

beforeEach(() => localStorage.clear());

describe('送信キュー', () => {
  it('enqueue は重複を避けて積む', () => {
    enqueueLayer('L1');
    enqueueLayer('L1');
    enqueueLayer('L2');
    expect(loadQueue()).toEqual(['L1', 'L2']);
  });
  it('dequeue は該当IDを取り除く', () => {
    saveQueue(['L1', 'L2', 'L3']);
    dequeueLayer('L2');
    expect(loadQueue()).toEqual(['L1', 'L3']);
  });
});

describe('substitutePhotoRefs', () => {
  it('idb参照を写真マップでgcs参照に置換', () => {
    const memos = [
      { geometry: {}, properties: { _id: 'M1', photos: ['idb:a', 'idb:b'] } }
    ];
    const map = { 'idb:a': 'gcs:L1:p1' };
    const out = substitutePhotoRefs(memos, map);
    expect(out[0].properties.photos).toEqual(['gcs:L1:p1', 'idb:b']);
  });
  it('photos が無いメモはそのまま', () => {
    const out = substitutePhotoRefs([{ properties: { _id: 'M1' } }], {});
    expect(out[0].properties._id).toBe('M1');
  });
  it('元のメモ配列を破壊しない', () => {
    const memos = [{ properties: { _id: 'M1', photos: ['idb:a'] } }];
    substitutePhotoRefs(memos, { 'idb:a': 'gcs:L1:p1' });
    expect(memos[0].properties.photos).toEqual(['idb:a']);
  });
});

describe('collectUnmappedPhotoRefs', () => {
  it('マップ未登録のidb参照だけを重複なく集める', () => {
    const memos = [
      { properties: { photos: ['idb:a', 'idb:b'] } },
      { properties: { photos: ['idb:b', 'idb:c', 'gcs:L1:x'] } }
    ];
    const map = { 'idb:a': 'gcs:L1:p1' };
    expect(collectUnmappedPhotoRefs(memos, map)).toEqual(['idb:b', 'idb:c']);
  });
});

