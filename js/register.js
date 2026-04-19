import { CONFIG } from './config.js';
import { getMap } from './map.js';
import { openMemoForm } from './form.js';
import { loadMemos, saveMemos } from './storage.js';
import { getCurrentPositionRaw } from './gps.js';
import { showToast } from './toast.js';

let memoLayerGroup = null;

export function initMemoLayer(map) {
  memoLayerGroup = L.layerGroup().addTo(map);
  const memos = loadMemos();
  memos.forEach(renderMemo);
  updateMemoCount();
}

function renderMemo(feature) {
  const p = feature.properties;
  let layer;
  if (feature.geometry.type === 'Point') {
    const [lng, lat] = feature.geometry.coordinates;
    layer = L.circleMarker([lat, lng], {
      color: p.icon_color || CONFIG.style.fieldMemoPoint.color,
      fillColor: p.icon_color || CONFIG.style.fieldMemoPoint.color,
      fillOpacity: 0.85,
      radius: CONFIG.style.fieldMemoPoint.radius,
      weight: CONFIG.style.fieldMemoPoint.weight
    });
  } else if (feature.geometry.type === 'LineString') {
    const latlngs = feature.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    layer = L.polyline(latlngs, {
      color: p.line_color || CONFIG.style.fieldMemoLine.color,
      weight: p.line_width || CONFIG.style.fieldMemoLine.weight
    });
  } else {
    return;
  }
  layer.bindPopup(buildPopupHtml(feature));
  layer.feature = feature;
  layer.addTo(memoLayerGroup);
}

function buildPopupHtml(feature) {
  const p = feature.properties;
  const photos = (p.photos || [])
    .map(src => `<img src="${src}" style="width:60px;height:60px;object-fit:cover;margin:2px;border-radius:4px;">`)
    .join('');
  return `
    <div class="memo-popup" data-id="${p._id}">
      <b>現場メモ</b><br>
      <b>${escapeHtml(p.name || '')}</b><br>
      ${escapeHtml(p.remarks || '').replace(/\n/g, '<br>')}<br>
      <small>${escapeHtml(p.date || '')} ${escapeHtml(p.person || '')}</small><br>
      <div>${photos}</div>
      <div style="margin-top:8px;display:flex;gap:4px;">
        <button onclick="window.__editMemo('${p._id}')">編集</button>
        <button onclick="window.__deleteMemo('${p._id}')">削除</button>
      </div>
    </div>`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}

export function addNewPoint(latlng) {
  openMemoForm({
    geometry: { type: 'Point', coordinates: [latlng.lng, latlng.lat] },
    onSave: (feature) => {
      const memos = loadMemos();
      memos.push(feature);
      const result = saveMemos(memos);
      if (!result.ok) {
        showToast('保存失敗: ' + result.message, 'error');
        return;
      }
      renderMemo(feature);
      updateMemoCount();
      showToast('保存しました', 'success');
    }
  });
}

export async function addAtCurrentLocation() {
  try {
    const pos = await getCurrentPositionRaw();
    const { latitude, longitude, accuracy } = pos.coords;
    if (accuracy > CONFIG.gps.accuracyWarnThresholdM) {
      if (!confirm(`精度が低いです(±${accuracy.toFixed(0)}m)。このまま登録しますか？`)) return;
    }
    addNewPoint(L.latLng(latitude, longitude));
  } catch (e) {
    showToast('位置情報取得失敗: ' + (e.message || e), 'error');
  }
}

function updateMemoCount() {
  const count = loadMemos().length;
  const el = document.getElementById('memo-count');
  if (el) el.textContent = `${count}件`;
}

export function editMemoById(id) {
  const memos = loadMemos();
  const feature = memos.find(m => m.properties._id === id);
  if (!feature) return;
  openMemoForm({
    geometry: feature.geometry,
    editing: feature,
    onSave: (updated) => {
      const idx = memos.findIndex(m => m.properties._id === id);
      memos[idx] = updated;
      saveMemos(memos);
      rebuildMemoLayer();
      showToast('更新しました', 'success');
    }
  });
}

export function deleteMemoById(id) {
  if (!confirm('このメモを削除しますか？')) return;
  const memos = loadMemos().filter(m => m.properties._id !== id);
  saveMemos(memos);
  rebuildMemoLayer();
  showToast('削除しました', 'success');
}

function rebuildMemoLayer() {
  memoLayerGroup.clearLayers();
  loadMemos().forEach(renderMemo);
  updateMemoCount();
  getMap().closePopup();
}

window.__editMemo = editMemoById;
window.__deleteMemo = deleteMemoById;
