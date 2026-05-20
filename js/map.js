import { CONFIG } from './config.js';
import { getBasemap, setBasemap, getView, setView } from './storage.js';

let mapInstance = null;
let currentTileLayer = null;

export function initMap() {
  const savedView = getView();
  const center = savedView ? [savedView.lat, savedView.lng] : CONFIG.center;
  const zoom = savedView ? savedView.zoom : CONFIG.zoom;

  mapInstance = L.map('map', {
    renderer: L.canvas({ tolerance: 15 }),
    zoomControl: false,
    preferCanvas: true,
    minZoom: CONFIG.minZoom,
    maxZoom: CONFIG.maxZoom
  }).setView(center, zoom);

  mapInstance.createPane('townRoadsPane');
  mapInstance.getPane('townRoadsPane').style.zIndex = 440;

  mapInstance.createPane('townBridgesPane');
  mapInstance.getPane('townBridgesPane').style.zIndex = 450;

  mapInstance.createPane('memoPane');
  mapInstance.getPane('memoPane').style.zIndex = 460;

  const initialBasemap = getBasemap();
  applyBasemap(initialBasemap);

  mapInstance.on('moveend zoomend', () => {
    const c = mapInstance.getCenter();
    setView({ lat: c.lat, lng: c.lng, zoom: mapInstance.getZoom() });
  });

  return mapInstance;
}

export function applyBasemap(key) {
  if (!mapInstance) return;
  if (currentTileLayer) {
    mapInstance.removeLayer(currentTileLayer);
  }
  const tileCfg = CONFIG.tiles[key];
  if (!tileCfg) {
    console.warn('Unknown basemap:', key);
    return;
  }
  currentTileLayer = L.tileLayer(tileCfg.url, {
    attribution: tileCfg.attribution,
    maxZoom: tileCfg.maxZoom
  }).addTo(mapInstance);
  setBasemap(key);
}

export function toggleBasemap() {
  const current = getBasemap();
  const next = current === 'chiriin_pale' ? 'google_satellite' : 'chiriin_pale';
  applyBasemap(next);
  return next;
}

export function getMap() {
  return mapInstance;
}
