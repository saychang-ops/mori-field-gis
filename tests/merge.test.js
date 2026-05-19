// mori-field-gis/tests/merge.test.js
import { describe, it, expect } from 'vitest';
import { mergeLayerFeatures } from '../js/sync.js';

const f = (id, updated, extra) => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] },
  properties: Object.assign({ _id: id, _updated: updated }, extra || {})
});

describe('mergeLayerFeatures', () => {
  it('ローカルに無いリモートフィーチャは追加される', () => {
    const r = mergeLayerFeatures([f('A', '2026-05-20T01:00:00Z')], [f('B', '2026-05-20T01:00:00Z')]);
    expect(r.map(x => x.properties._id).sort()).toEqual(['A', 'B']);
  });
  it('リモートの _updated が新しければ更新される', () => {
    const r = mergeLayerFeatures([f('A', '2026-05-20T01:00:00Z', { name: 'old' })], [f('A', '2026-05-20T05:00:00Z', { name: 'new' })]);
    expect(r.length).toBe(1);
    expect(r[0].properties.name).toBe('new');
  });
  it('リモートの _updated が古ければローカルを保持', () => {
    const r = mergeLayerFeatures([f('A', '2026-05-20T05:00:00Z', { name: 'keep' })], [f('A', '2026-05-20T01:00:00Z', { name: 'stale' })]);
    expect(r[0].properties.name).toBe('keep');
  });
  it('リモートに無いローカルフィーチャは保持される（不在≠削除）', () => {
    const r = mergeLayerFeatures([f('A', '2026-05-20T01:00:00Z'), f('B', '2026-05-20T01:00:00Z')], [f('A', '2026-05-20T05:00:00Z')]);
    expect(r.map(x => x.properties._id).sort()).toEqual(['A', 'B']);
  });
  it('リモートの _deleted:true tombstone がローカルに反映される', () => {
    const r = mergeLayerFeatures([f('A', '2026-05-20T01:00:00Z')], [f('A', '2026-05-20T05:00:00Z', { _deleted: true })]);
    expect(r[0].properties._deleted).toBe(true);
  });
  it('_updated が同値なら remote を採用する（LWWはincoming優先）', () => {
    const r = mergeLayerFeatures(
      [f('A', '2026-05-20T03:00:00Z', { name: 'local' })],
      [f('A', '2026-05-20T03:00:00Z', { name: 'remote' })]
    );
    expect(r[0].properties.name).toBe('remote');
  });
});
