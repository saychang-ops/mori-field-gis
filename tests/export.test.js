import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildExportGeoJSON, estimateExportSize, shareOrDownload } from '../js/export.js';

describe('buildExportGeoJSON', () => {
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

  it('FeatureCollection形式で出力', () => {
    const out = buildExportGeoJSON(sampleMemos);
    expect(out.type).toBe('FeatureCollection');
    expect(out.features.length).toBe(1);
  });

  it('_export_metaが付与される', () => {
    const out = buildExportGeoJSON(sampleMemos);
    expect(out._export_meta.source).toBe('mori-field-gis');
    expect(out._export_meta.device).toBe('smartphone');
    expect(out._export_meta.exported_at).toBeTruthy();
    expect(out._export_meta.version).toBeTruthy();
  });

  it('Featureの_type/_custom_layer_idが保持される', () => {
    const out = buildExportGeoJSON(sampleMemos);
    expect(out.features[0].properties._type).toBe('custom');
    expect(out.features[0].properties._custom_layer_id).toBe('smartphone_field_memo');
  });

  it('空配列でも正常出力', () => {
    const out = buildExportGeoJSON([]);
    expect(out.features).toEqual([]);
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
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => JSON.stringify([])),
      setItem: vi.fn()
    });
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:fake-url'),
      revokeObjectURL: vi.fn()
    });
    const fakeAnchor = {
      href: '',
      download: '',
      click: vi.fn(),
      remove: vi.fn()
    };
    vi.stubGlobal('document', {
      createElement: vi.fn(() => fakeAnchor),
      body: { appendChild: vi.fn() }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uses Web Share API when available and canShare returns true', async () => {
    const shareSpy = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      canShare: vi.fn(() => true),
      share: shareSpy
    });
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
    const err = new Error('share failed');
    vi.stubGlobal('navigator', {
      canShare: vi.fn(() => true),
      share: vi.fn().mockRejectedValue(err)
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
