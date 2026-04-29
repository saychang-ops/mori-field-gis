import { describe, it, expect } from 'vitest';
import { normalize, fuzzyMatch, searchRoads, searchBridges } from '../js/search.js';

describe('normalize', () => {
  it('全角数字→半角', () => {
    expect(normalize('白川１号線')).toBe('白川1号線');
  });
  it('スペース除去', () => {
    expect(normalize(' 本町 141 ')).toBe('本町141');
  });
  it('小文字化', () => {
    expect(normalize('Main St')).toBe('mainst');
  });
  it('小書きヶ→大書きケに統一', () => {
    expect(normalize('駒ヶ岳')).toBe(normalize('駒ケ岳'));
  });
});

describe('searchRoads ヶ/ケ正規化', () => {
  const features = [
    { properties: { route_code: '3001', route_name: '駒ケ岳線' } }
  ];
  it('小書きヶで駒ケ岳線が見つかる', () => {
    expect(searchRoads(features, '駒ヶ岳').length).toBe(1);
  });
  it('大書きケでも見つかる', () => {
    expect(searchRoads(features, '駒ケ岳').length).toBe(1);
  });
});

describe('fuzzyMatch', () => {
  it('部分一致', () => {
    expect(fuzzyMatch('常盤橋', '常盤')).toBe(true);
  });
  it('フリガナ一致', () => {
    expect(fuzzyMatch('ﾄｷﾜﾊｼ', 'ﾄｷﾜ')).toBe(true);
  });
  it('不一致', () => {
    expect(fuzzyMatch('中央橋', '森川')).toBe(false);
  });
});

describe('searchRoads', () => {
  const features = [
    { properties: { route_code: '1001', route_name: '中央線' } },
    { properties: { route_code: '1002', route_name: '本町1号線' } },
    { properties: { route_code: '2001', route_name: '白川１号線' } }
  ];
  it('コード一致', () => {
    const r = searchRoads(features, '1001');
    expect(r.length).toBe(1);
    expect(r[0].properties.route_code).toBe('1001');
  });
  it('路線名部分一致', () => {
    const r = searchRoads(features, '本町');
    expect(r.length).toBe(1);
  });
  it('全角数字で白川1号線が見つかる', () => {
    const r = searchRoads(features, '白川1');
    expect(r.length).toBe(1);
  });
});

describe('searchBridges', () => {
  const features = [
    { properties: { name: '常盤橋', furigana: '(ﾄｷﾜﾊｼ)' } },
    { properties: { name: '第２中の川橋', furigana: '(ﾀﾞｲﾆﾅｶﾉｶﾜﾊｼ)' } }
  ];
  it('漢字部分一致', () => {
    expect(searchBridges(features, '常盤').length).toBe(1);
  });
  it('カタカナ部分一致', () => {
    expect(searchBridges(features, 'ﾄｷﾜ').length).toBe(1);
  });
});
