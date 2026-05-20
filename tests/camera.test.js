// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { calcResizedDimensions, fileToResizedBlob } from '../js/camera.js';

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

  it('5000x3000 を長辺1600で 1600x960 にリサイズ', () => {
    const r = calcResizedDimensions(5000, 3000, 1600);
    expect(r.width).toBe(1600);
    expect(r.height).toBe(960);
  });
});

describe('fileToResizedBlob', () => {
  beforeEach(() => {
    global.HTMLCanvasElement.prototype.getContext = function () {
      return { drawImage: () => {} };
    };
    global.HTMLCanvasElement.prototype.toBlob = function (cb, type) {
      cb(new Blob(['fake-jpeg-bytes'], { type: type || 'image/jpeg' }));
    };
    global.Image = class {
      constructor() {
        this.naturalWidth = 2000;
        this.naturalHeight = 1500;
        setTimeout(() => this.onload && this.onload(), 0);
      }
    };
    global.FileReader = class {
      readAsDataURL() {
        setTimeout(() => {
          this.result = 'data:image/jpeg;base64,AAAA';
          this.onload && this.onload();
        }, 0);
      }
    };
    // createImageBitmap 経路をデフォルトで無効化（fallback 経路をテスト）
    global.createImageBitmap = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Blob を返す', async () => {
    const file = new File(['x'], 'x.jpg', { type: 'image/jpeg' });
    const blob = await fileToResizedBlob(file);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/jpeg');
  });

  it('createImageBitmap が使える環境では bitmap 経路を通る', async () => {
    const bitmap = { width: 4032, height: 3024, close: vi.fn() };
    global.createImageBitmap = vi.fn().mockResolvedValue(bitmap);
    const file = new File(['x'], 'x.heic', { type: 'image/heic' });
    const blob = await fileToResizedBlob(file);
    expect(global.createImageBitmap).toHaveBeenCalledWith(
      file,
      { imageOrientation: 'from-image' }
    );
    expect(bitmap.close).toHaveBeenCalled();
    expect(blob).toBeInstanceOf(Blob);
  });

  it('createImageBitmap が失敗したら Image fallback に切替わる', async () => {
    global.createImageBitmap = vi.fn().mockRejectedValue(new Error('not supported'));
    const file = new File(['x'], 'x.jpg', { type: 'image/jpeg' });
    const blob = await fileToResizedBlob(file);
    expect(global.createImageBitmap).toHaveBeenCalled();
    expect(blob).toBeInstanceOf(Blob);
  });

  it('寸法 0 で reject される', async () => {
    const bitmap = { width: 0, height: 0, close: vi.fn() };
    global.createImageBitmap = vi.fn().mockResolvedValue(bitmap);
    const file = new File(['x'], 'x.jpg', { type: 'image/jpeg' });
    await expect(fileToResizedBlob(file)).rejects.toThrow(/画像寸法/);
    expect(bitmap.close).toHaveBeenCalled();
  });
});
