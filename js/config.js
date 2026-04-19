export const CONFIG = {
  // 森町中心座標（設計書§2参照）
  center: [42.1067, 140.5857],
  zoom: 14,
  minZoom: 10,
  maxZoom: 19,

  tiles: {
    chiriin_pale: {
      url: 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png',
      attribution: '<a href="https://www.gsi.go.jp/" target="_blank">国土地理院</a>',
      maxZoom: 18,
      label: '地理院地図'
    },
    google_satellite: {
      url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
      attribution: '&copy; Google',
      maxZoom: 19,
      label: '航空写真'
    }
  },

  storageKeys: {
    memos: 'mori_field_memos',
    author: 'mori_field_author',
    basemap: 'mori_field_basemap',
    view: 'mori_field_view'
  },

  photo: {
    maxCount: 3,
    maxLongEdgePx: 1600,
    jpegQuality: 0.82
  },

  gps: {
    highAccuracy: true,
    timeoutMs: 15000,
    accuracyWarnThresholdM: 50
  },

  longPress: {
    durationMs: 500
  },

  style: {
    townRoad: { color: '#1976d2', weight: 3, opacity: 0.85 },
    townBridge: { color: '#616161', radius: 7, weight: 1 },
    fieldMemoPoint: { color: '#e63946', radius: 8, weight: 2 },
    fieldMemoLine: { color: '#e63946', weight: 4, dashArray: null },
    currentLocation: { color: '#ff00ff', radius: 8, fillOpacity: 0.9 },
    accuracyCircle: { color: '#ff00ff', fillColor: '#ff00ff', fillOpacity: 0.1, weight: 1 }
  },

  api: {
    geocodeEndpoint: '/api/geocode'
  },

  iconPalette: [
    { name: '赤', value: '#e63946' },
    { name: '青', value: '#457b9d' },
    { name: '黄', value: '#f4a261' },
    { name: '緑', value: '#2a9d8f' },
    { name: 'オレンジ', value: '#ff8c00' },
    { name: '紫', value: '#6a0dad' }
  ],
  iconShapes: ['circle', 'square', 'triangle', 'star'],
  lineStyles: ['solid', 'dashed', 'dotted'],
  lineWidths: [2, 4, 6],

  version: 'v1.0.2'
};
