import { describe, it, expect } from 'vitest';
import { buildExportGeoJSON } from '../js/export.js';

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
