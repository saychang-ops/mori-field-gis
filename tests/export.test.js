import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildExportGeoJSON, estimateExportSize, shareOrDownload } from '../js/export.js';
import { _resetForTests, openDB, putPhoto } from '../js/photo_store.js';

if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => 'blob:fake';
  URL.revokeObjectURL = () => {};
}

function makeBlob(size = 32) {
  const u8 = new Uint8Array(size);
  for (let i = 0; i < size; i++) u8[i] = i % 256;
  return new Blob([u8], { type: 'image/jpeg' });
}

describe('buildExportGeoJSON (async)', () => {
  beforeEach(async () => {
    await _resetForTests();
    localStorage.clear();
  });

  const sampleMemos = [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [140.58, 42.10] },
      properties: {
        _type: 'custom',
        _custom_layer_id: 'smartphone_field_memo',
        _custom_layer_name: '現場メモ',
        _custom_fields: ['name', 'photos', 'remarks', 'date', 'person'],
        _id: 'M100',
        name: 'テスト', remarks: '', date: '2026-04-18', person: '浅利', photos: []
      }
    }
  ];

  it('FeatureCollection形式で出力', async () => {
    const out = await buildExportGeoJSON(sampleMemos);
    expect(out.type).toBe('FeatureCollection');
    expect(out.features.length).toBe(1);
  });

  it('_export_metaが付与される', async () => {
    const out = await buildExportGeoJSON(sampleMemos);
    expect(out._export_meta.source).toBe('mori-field-gis');
    expect(out._export_meta.device).toBe('smartphone');
    expect(out._export_meta.exported_at).toBeTruthy();
    expect(out._export_meta.version).toBeTruthy();
  });

  it('Featureの_type/_custom_layer_idが保持される', async () => {
    const out = await buildExportGeoJSON(sampleMemos);
    expect(out.features[0].properties._type).toBe('custom');
    expect(out.features[0].properties._custom_layer_id).toBe('smartphone_field_memo');
  });

  it('空配列でも正常出力', async () => {
    const out = await buildExportGeoJSON([]);
    expect(out.features).toEqual([]);
  });

  it('refId 入りの photos[] は base64 (data:) に復元される', async () => {
    await openDB();
    const refId = await putPhoto(makeBlob(64), 'M200', 0);
    const memos = [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] },
        properties: { _id: 'M200', photos: [refId] } }
    ];
    const out = await buildExportGeoJSON(memos);
    expect(out.features[0].properties.photos.length).toBe(1);
    expect(out.features[0].properties.photos[0]).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('layerName 指定時は _custom_layer_id が一意化され _custom_layer_name が上書きされる', async () => {
    const memos = [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] },
        properties: {
          _id: 'M500', name: 'A',
          _custom_layer_id: 'smartphone_field_memo',
          _custom_layer_name: '現場メモ',
          photos: []
        } }
    ];
    const out = await buildExportGeoJSON(memos, '砂原調査');
    expect(out._export_meta.layer_name).toBe('砂原調査');
    expect(out.features[0].properties._custom_layer_name).toBe('砂原調査');
    expect(out.features[0].properties._custom_layer_id).toMatch(/^smartphone_.*_\d{13}$/);
    expect(out.features[0].properties._custom_layer_id).not.toBe('smartphone_field_memo');
  });

  it('layerName 未指定または空文字なら従来のデフォルト維持(後方互換)', async () => {
    const memos = [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] },
        properties: {
          _id: 'M600', name: 'B',
          _custom_layer_id: 'smartphone_field_memo',
          _custom_layer_name: '現場メモ',
          photos: []
        } }
    ];
    const out1 = await buildExportGeoJSON(memos);
    expect(out1.features[0].properties._custom_layer_id).toBe('smartphone_field_memo');
    expect(out1._export_meta.layer_name).toBeNull();

    const out2 = await buildExportGeoJSON(memos, '   ');
    expect(out2.features[0].properties._custom_layer_id).toBe('smartphone_field_memo');
  });

  it('既存 base64 はそのまま通す (混在)', async () => {
    const memos = [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] },
        properties: { _id: 'M300', photos: ['data:image/jpeg;base64,AAAA'] } }
    ];
    const out = await buildExportGeoJSON(memos);
    expect(out.features[0].properties.photos[0]).toBe('data:image/jpeg;base64,AAAA');
  });
});

describe('estimateExportSize', () => {
  it('returns bytes and mb', () => {
    const result = estimateExportSize([]);
    expect(typeof result.bytes).toBe('number');
    expect(typeof result.mb).toBe('number');
    expect(result.bytes).toBeGreaterThan(0);
  });
});

describe('shareOrDownload', () => {
  beforeEach(async () => {
    await _resetForTests();
    localStorage.clear();
    localStorage.setItem('mori_field_memos', JSON.stringify([]));
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:fake-url'),
      revokeObjectURL: vi.fn()
    });
    const fakeAnchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
    vi.spyOn(document, 'createElement').mockImplementation(() => fakeAnchor);
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uses Web Share API when available', async () => {
    const shareSpy = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { canShare: vi.fn(() => true), share: shareSpy });
    const result = await shareOrDownload();
    expect(shareSpy).toHaveBeenCalled();
    expect(result.method).toBe('share');
  });

  it('returns abort when user cancels share', async () => {
    const abortErr = new Error('user cancelled');
    abortErr.name = 'AbortError';
    vi.stubGlobal('navigator', {
      canShare: vi.fn(() => true),
      share: vi.fn().mockRejectedValue(abortErr)
    });
    const result = await shareOrDownload();
    expect(result.method).toBe('abort');
  });

  it('falls back to download when share rejects with non-Abort error', async () => {
    vi.stubGlobal('navigator', {
      canShare: vi.fn(() => true),
      share: vi.fn().mockRejectedValue(new Error('share failed'))
    });
    const result = await shareOrDownload();
    expect(result.method).toBe('download');
  });

  it('uses download path when canShare is unavailable', async () => {
    vi.stubGlobal('navigator', {});
    const result = await shareOrDownload();
    expect(result.method).toBe('download');
  });
});
