import { describe, it, expect } from 'vitest';
import { CONFIG } from '../js/config.js';

describe('PC互換アイコン設定', () => {
  it('6色パレットがPC版と同じ', () => {
    const colors = CONFIG.iconPalette.map(c => c.value);
    expect(colors).toEqual([
      '#e63946', '#457b9d', '#f4a261', '#2a9d8f', '#ff8c00', '#6a0dad'
    ]);
  });

  it('4形状が定義されている', () => {
    expect(CONFIG.iconShapes).toEqual(['circle', 'square', 'triangle', 'star']);
  });

  it('線スタイル3種', () => {
    expect(CONFIG.lineStyles).toEqual(['solid', 'dashed', 'dotted']);
  });

  it('線幅3種', () => {
    expect(CONFIG.lineWidths).toEqual([2, 4, 6]);
  });

  it('点のデフォルト色がパレット先頭と一致', () => {
    expect(CONFIG.style.fieldMemoPoint.color).toBe(CONFIG.iconPalette[0].value);
  });
});
