// mori-field-gis/tests/sync_layer.test.js
// Fix I1+M5 regression: syncLayer must succeed even when a photo IDB record is missing
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createLayer, saveLayerMemos } from '../js/layer_store.js';
import { syncLayer, enqueueLayer, loadQueue } from '../js/sync.js';

// mock photo_store so we can simulate IDB miss without real IDB wiring
vi.mock('../js/photo_store.js', () => ({
  openDB: vi.fn().mockResolvedValue(undefined),
  getPhotoAsDataUrl: vi.fn(),
  getPhoto: vi.fn(),
  putPhoto: vi.fn(),
  deletePhoto: vi.fn(),
  deletePhotosByMemoId: vi.fn().mockResolvedValue(undefined),
  listAllRefIds: vi.fn().mockResolvedValue([]),
  clearAll: vi.fn().mockResolvedValue(undefined),
  _resetForTests: vi.fn().mockResolvedValue(undefined)
}));

import { getPhotoAsDataUrl } from '../js/photo_store.js';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('syncLayer — 写真欠落耐性 (Fix I1+M5)', () => {
  it('IDB欠落写真をスキップし、残りのフィーチャを送信してdequeueする', async () => {
    const { layer } = createLayer('テスト');
    saveLayerMemos(layer.id, [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [140.58, 42.10] },
        properties: { _id: 'M1', name: 'テスト', photos: ['idb:M1_0', 'idb:M1_1'] }
      }
    ]);
    enqueueLayer(layer.id);

    // idb:M1_0 は欠落（reject）、idb:M1_1 は成功
    getPhotoAsDataUrl.mockImplementation((ref) => {
      if (ref === 'idb:M1_0') return Promise.reject(new Error('IDB record not found'));
      return Promise.resolve('data:image/jpeg;base64,/9j/fake');
    });

    let uploadLayerBody = null;
    let uploadPhotoCount = 0;
    global.fetch = vi.fn().mockImplementation((_url, opts) => {
      const body = JSON.parse(opts.body);
      if (body.action === 'uploadPhoto') {
        uploadPhotoCount++;
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ photoId: 'gcs_p' + uploadPhotoCount }) });
      }
      if (body.action === 'uploadLayer') {
        uploadLayerBody = body;
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    let result;
    try {
      result = await syncLayer(layer.id);
    } finally {
      global.fetch = undefined;
    }

    // syncLayer は例外を投げずに ok:true で完走すること
    expect(result.ok).toBe(true);
    // キューから dequeue されていること
    expect(loadQueue()).not.toContain(layer.id);
    // uploadLayer が呼ばれていること
    expect(uploadLayerBody).not.toBeNull();
    // features[0].photos に idb: 参照が残っていないこと
    const photos = uploadLayerBody.geojson.features[0].properties.photos;
    expect(photos.every((r) => !r.startsWith('idb:'))).toBe(true);
  });

  it('全写真が欠落しても uploadLayer を呼び dequeue する', async () => {
    const { layer } = createLayer('欠落レイヤ');
    saveLayerMemos(layer.id, [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [140.58, 42.10] },
        properties: { _id: 'M2', photos: ['idb:M2_0'] }
      }
    ]);
    enqueueLayer(layer.id);

    // 全写真が欠落
    getPhotoAsDataUrl.mockRejectedValue(new Error('IDB record not found'));

    let uploadLayerBody = null;
    global.fetch = vi.fn().mockImplementation((_url, opts) => {
      const body = JSON.parse(opts.body);
      if (body.action === 'uploadLayer') {
        uploadLayerBody = body;
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    let result;
    try {
      result = await syncLayer(layer.id);
    } finally {
      global.fetch = undefined;
    }

    expect(result.ok).toBe(true);
    expect(loadQueue()).not.toContain(layer.id);
    // photos は空配列になること（idb: を除去）
    const photos = uploadLayerBody.geojson.features[0].properties.photos;
    expect(photos).toEqual([]);
  });
});
