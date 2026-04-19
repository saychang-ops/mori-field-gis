let highlightLayer = null;
let blinkTimer = null;

export function clearHighlight(map) {
  if (blinkTimer) {
    clearInterval(blinkTimer);
    blinkTimer = null;
  }
  if (highlightLayer) {
    map.removeLayer(highlightLayer);
    highlightLayer = null;
  }
}

export function highlightLineFeature(map, feature) {
  clearHighlight(map);
  highlightLayer = L.geoJSON(feature, {
    style: { color: '#ff0000', weight: 6, opacity: 0.9 }
  }).addTo(map);
  startFadeBlink();
}

export function highlightPointFeature(map, feature) {
  clearHighlight(map);
  const coords = feature.geometry.coordinates;
  highlightLayer = L.circleMarker(L.latLng(coords[1], coords[0]), {
    radius: 14, color: '#ff0000', weight: 3,
    fillColor: '#ff0000', fillOpacity: 0.4
  }).addTo(map);
  startFadeBlink();
}

function startFadeBlink() {
  let opacity = 1.0;
  let fadeOut = true;
  const minOpacity = 0.1;
  const maxOpacity = 1.0;
  const step = 0.05;

  blinkTimer = setInterval(() => {
    if (!highlightLayer) return;
    if (fadeOut) {
      opacity -= step;
      if (opacity <= minOpacity) { opacity = minOpacity; fadeOut = false; }
    } else {
      opacity += step;
      if (opacity >= maxOpacity) { opacity = maxOpacity; fadeOut = true; }
    }
    const apply = (l) => {
      if (l.setStyle) l.setStyle({ opacity, fillOpacity: opacity * 0.5 });
    };
    if (highlightLayer.eachLayer) {
      highlightLayer.eachLayer(apply);
    } else {
      apply(highlightLayer);
    }
  }, 30);
}
