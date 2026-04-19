import { CONFIG } from './config.js';

let watchId = null;
let locationMarker = null;
let accuracyCircle = null;

export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('この端末は位置情報に対応していません'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        timestamp: pos.timestamp
      }),
      err => reject(mapGeolocationError(err)),
      {
        enableHighAccuracy: CONFIG.gps.highAccuracy,
        timeout: CONFIG.gps.timeoutMs,
        maximumAge: 0
      }
    );
  });
}

export function getCurrentPositionRaw() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('この端末は位置情報に対応していません'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve(pos),
      err => reject(mapGeolocationError(err)),
      {
        enableHighAccuracy: CONFIG.gps.highAccuracy,
        timeout: CONFIG.gps.timeoutMs,
        maximumAge: 0
      }
    );
  });
}

export function startWatching(map, onUpdate) {
  if (!('geolocation' in navigator)) {
    throw new Error('この端末は位置情報に対応していません');
  }
  stopWatching();
  watchId = navigator.geolocation.watchPosition(
    pos => {
      const point = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        timestamp: pos.timestamp
      };
      renderLocation(map, point);
      if (typeof onUpdate === 'function') onUpdate(point);
    },
    err => console.warn('GPS watch error', err),
    {
      enableHighAccuracy: CONFIG.gps.highAccuracy,
      timeout: CONFIG.gps.timeoutMs,
      maximumAge: 2000
    }
  );
  return watchId;
}

export function stopWatching() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

export function centerOnCurrentLocation(map) {
  return getCurrentPosition().then(pt => {
    renderLocation(map, pt);
    map.setView([pt.lat, pt.lng], Math.max(map.getZoom(), 16));
    return pt;
  });
}

function renderLocation(map, pt) {
  const latlng = [pt.lat, pt.lng];
  if (!locationMarker) {
    locationMarker = L.circleMarker(latlng, {
      ...CONFIG.style.currentLocation,
      fillColor: CONFIG.style.currentLocation.color
    }).addTo(map);
  } else {
    locationMarker.setLatLng(latlng);
  }
  if (!accuracyCircle) {
    accuracyCircle = L.circle(latlng, {
      ...CONFIG.style.accuracyCircle,
      radius: pt.accuracy || 0
    }).addTo(map);
  } else {
    accuracyCircle.setLatLng(latlng);
    accuracyCircle.setRadius(pt.accuracy || 0);
  }
}

function mapGeolocationError(err) {
  switch (err.code) {
    case 1: return new Error('位置情報の利用が拒否されました');
    case 2: return new Error('位置を取得できませんでした');
    case 3: return new Error('位置情報の取得がタイムアウトしました');
    default: return new Error(err.message || '位置情報エラー');
  }
}
