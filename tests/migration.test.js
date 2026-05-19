import { describe, it, expect, beforeEach } from 'vitest';
import { _resetForTests, openDB, getPhoto, listAllRefIds } from '../js/photo_store.js';
import { createLayer, saveLayerMemos, loadLayerMemos, loadLayers } from '../js/layer_store.js';

if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => 'blob:fake';
  URL.revokeObjectURL = () => {};
}

const FLAG_KEY = 'mori_field_migration_v1';

function makeBase64Photo() {
  return 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AL+AB//Z';
}

describe('migratePhotosToIndexedDB', () => {
  beforeEach(async () => {
    await _resetForTests();
    localStorage.clear();
  });

  it('base64 入りメモを IDB に移し、photos[] を refId に書き換える', async () => {
    const { migratePhotosToIndexedDB } = await import('../js/migration.js');
    const { layer } = createLayer('テスト');
    saveLayerMemos(layer.id, [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [140.58, 42.10] },
        properties: { _id: 'M100', name: 'A', photos: [makeBase64Photo()] }
      }
    ]);

    await migratePhotosToIndexedDB();

    const after = loadLayerMemos(layer.id);
    expect(after[0].properties.photos).toEqual(['idb:M100_0']);
    expect(localStorage.getItem(FLAG_KEY)).toBe('done');

    const blob = await getPhoto('idb:M100_0');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('既に refId 化されているメモには手を加えない', async () => {
    const { migratePhotosToIndexedDB } = await import('../js/migration.js');
    const { layer } = createLayer('テスト');
    saveLayerMemos(layer.id, [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] },
        properties: { _id: 'M200', photos: ['idb:M200_0'] } }
    ]);

    await migratePhotosToIndexedDB();

    const after = loadLayerMemos(layer.id);
    expect(after[0].properties.photos).toEqual(['idb:M200_0']);
    const refs = await listAllRefIds();
    expect(refs).toEqual([]);
  });

  it('既に migration_v1 フラグがあれば何もしない', async () => {
    const { migratePhotosToIndexedDB } = await import('../js/migration.js');
    localStorage.setItem(FLAG_KEY, 'done');
    const { layer } = createLayer('テスト');
    saveLayerMemos(layer.id, [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] },
        properties: { _id: 'M300', photos: [makeBase64Photo()] } }
    ]);

    await migratePhotosToIndexedDB();

    const after = loadLayerMemos(layer.id);
    expect(after[0].properties.photos[0].startsWith('data:')).toBe(true);
  });

  it('混在 (base64 + refId) でも base64 だけを変換する', async () => {
    const { migratePhotosToIndexedDB } = await import('../js/migration.js');
    const { layer } = createLayer('テスト');
    saveLayerMemos(layer.id, [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] },
        properties: { _id: 'M400', photos: ['idb:M400_0', makeBase64Photo()] } }
    ]);

    await migratePhotosToIndexedDB();

    const after = loadLayerMemos(layer.id);
    expect(after[0].properties.photos[0]).toBe('idb:M400_0');
    expect(after[0].properties.photos[1]).toMatch(/^idb:M400_/);
  });

  it('メモ無しでも安全に完走しフラグを立てる', async () => {
    const { migratePhotosToIndexedDB } = await import('../js/migration.js');
    await migratePhotosToIndexedDB();
    expect(localStorage.getItem(FLAG_KEY)).toBe('done');
  });

  it('複数レイヤにまたがる base64 写真をすべて変換する', async () => {
    const { migratePhotosToIndexedDB } = await import('../js/migration.js');
    const layerA = createLayer('A').layer;
    const layerB = createLayer('B').layer;
    saveLayerMemos(layerA.id, [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] },
        properties: { _id: 'MA1', photos: [makeBase64Photo()] } }
    ]);
    saveLayerMemos(layerB.id, [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] },
        properties: { _id: 'MB1', photos: [makeBase64Photo()] } }
    ]);

    await migratePhotosToIndexedDB();

    const afterA = loadLayerMemos(layerA.id);
    const afterB = loadLayerMemos(layerB.id);
    expect(afterA[0].properties.photos[0]).toMatch(/^idb:MA1_/);
    expect(afterB[0].properties.photos[0]).toMatch(/^idb:MB1_/);
    expect(localStorage.getItem(FLAG_KEY)).toBe('done');
  });
});
