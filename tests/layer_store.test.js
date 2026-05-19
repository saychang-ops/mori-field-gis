// mori-field-gis/tests/layer_store.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadLayers, saveLayers, loadLayerMemos, saveLayerMemos,
  getActiveLayerId, setActiveLayerId, createLayer, renameLayer,
  setLayerVisible, deleteLayer, findMemoLayerId, ensureMigrated, MAX_LAYERS
} from '../js/layer_store.js';

beforeEach(() => localStorage.clear());

describe('createLayer', () => {
  it('レイヤを作成しUUID・既定値を持つ', () => {
    const r = createLayer('テスト');
    expect(r.ok).toBe(true);
    expect(r.layer.name).toBe('テスト');
    expect(r.layer.visible).toBe(true);
    expect(typeof r.layer.id).toBe('string');
    expect(r.layer.id.length).toBeGreaterThan(0);
    expect(loadLayers().length).toBe(1);
  });

  it('MAX_LAYERS を超えると ok:false / error:limit', () => {
    for (let i = 0; i < MAX_LAYERS; i++) createLayer('L' + i);
    const r = createLayer('overflow');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('limit');
    expect(loadLayers().length).toBe(MAX_LAYERS);
  });
});

describe('renameLayer / setLayerVisible', () => {
  it('リネームできる', () => {
    const { layer } = createLayer('旧名');
    renameLayer(layer.id, '新名');
    expect(loadLayers()[0].name).toBe('新名');
  });
  it('表示/非表示を切り替えられる', () => {
    const { layer } = createLayer('L');
    setLayerVisible(layer.id, false);
    expect(loadLayers()[0].visible).toBe(false);
  });
});

describe('deleteLayer', () => {
  it('メタとメモを消し、作業中だったら別レイヤに移す', () => {
    const a = createLayer('A').layer;
    const b = createLayer('B').layer;
    setActiveLayerId(a.id);
    saveLayerMemos(a.id, [{ properties: { _id: 'M1' } }]);
    deleteLayer(a.id);
    expect(loadLayers().length).toBe(1);
    expect(loadLayerMemos(a.id)).toEqual([]);
    expect(getActiveLayerId()).toBe(b.id);
  });
});

describe('findMemoLayerId', () => {
  it('メモIDから所属レイヤIDを返す', () => {
    const a = createLayer('A').layer;
    const b = createLayer('B').layer;
    saveLayerMemos(b.id, [{ properties: { _id: 'M9' } }]);
    expect(findMemoLayerId('M9')).toBe(b.id);
    expect(findMemoLayerId('nope')).toBe(null);
  });
});

describe('ensureMigrated', () => {
  it('mori_field_layers が無ければ旧mori_field_memosを1レイヤに移行', () => {
    localStorage.setItem('mori_field_memos', JSON.stringify([
      { properties: { _id: 'M1' } }, { properties: { _id: 'M2' } }
    ]));
    const r = ensureMigrated();
    expect(r.migrated).toBe(true);
    expect(r.count).toBe(2);
    const layers = loadLayers();
    expect(layers.length).toBe(1);
    expect(layers[0].name).toBe('現場メモ');
    expect(getActiveLayerId()).toBe(layers[0].id);
    expect(loadLayerMemos(layers[0].id).length).toBe(2);
    // 移行後の各メモに _layer_id が付く
    expect(loadLayerMemos(layers[0].id)[0].properties._layer_id).toBe(layers[0].id);
  });

  it('旧データが無い初回起動でも空レイヤ1つを作る', () => {
    const r = ensureMigrated();
    expect(r.migrated).toBe(true);
    expect(loadLayers().length).toBe(1);
  });

  it('既に mori_field_layers があれば何もしない', () => {
    createLayer('既存');
    const r = ensureMigrated();
    expect(r.migrated).toBe(false);
    expect(loadLayers().length).toBe(1);
  });
});
