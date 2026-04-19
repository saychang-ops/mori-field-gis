// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { calcResizedDimensions } from '../js/camera.js';

describe('calcResizedDimensions', () => {
  it('縦長画像を長辺1600にリサイズ（元3000x4000 → 1200x1600）', () => {
    const r = calcResizedDimensions(3000, 4000, 1600);
    expect(r.width).toBe(1200);
    expect(r.height).toBe(1600);
  });

  it('横長画像を長辺1600にリサイズ（元4000x3000 → 1600x1200）', () => {
    const r = calcResizedDimensions(4000, 3000, 1600);
    expect(r.width).toBe(1600);
    expect(r.height).toBe(1200);
  });

  it('既に長辺より小さい画像はリサイズしない', () => {
    const r = calcResizedDimensions(800, 600, 1600);
    expect(r.width).toBe(800);
    expect(r.height).toBe(600);
  });

  it('正方形は長辺に揃える', () => {
    const r = calcResizedDimensions(2000, 2000, 1600);
    expect(r.width).toBe(1600);
    expect(r.height).toBe(1600);
  });
});
