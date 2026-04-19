import { CONFIG } from './config.js';
import { getMap } from './map.js';
import { openMemoForm } from './form.js';
import { loadMemos, saveMemos } from './storage.js';
import { getCurrentPositionRaw } from './gps.js';
import { showToast } from './toast.js';
import { setTownLayersInteractive } from './layers.js';

let memoLayerGroup = null;
let memoRenderer = null;

export function initMemoLayer(map) {
  memoRenderer = L.canvas({ pane: 'memoPane', tolerance: 15 });
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
    const shape = p.icon_shape || 'circle';
    const color = p.icon_color || CONFIG.style.fieldMemoPoint.color;
    layer = L.marker([lat, lng], { icon: buildShapeDivIcon(shape, color) });
  } else if (feature.geometry.type === 'LineString') {
    const latlngs = feature.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    const style = p.line_style || 'solid';
    let dashArray = null;
    if (style === 'dashed') dashArray = '12,8';
    else if (style === 'dotted') dashArray = '4,6';
    layer = L.polyline(latlngs, {
      color: p.line_color || CONFIG.style.fieldMemoLine.color,
      weight: p.line_width || CONFIG.style.fieldMemoLine.weight,
      dashArray,
      pane: 'memoPane',
      renderer: memoRenderer
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

export function clearAllMemos() {
  const count = loadMemos().length;
  if (count === 0) {
    showToast('削除するメモがありません', 'warning');
    return;
  }
  if (!confirm(`現場メモ ${count}件をすべて削除しますか？\n元に戻せません。`)) return;
  if (!confirm('本当に削除しますか？')) return;
  const result = saveMemos([]);
  if (!result.ok) {
    showToast('削除失敗: ' + result.message, 'error');
    return;
  }
  memoLayerGroup.clearLayers();
  updateMemoCount();
  getMap().closePopup();
  showToast(`${count}件のメモを削除しました`, 'success');
}

function buildShapeDivIcon(shape, color) {
  let html;
  if (shape === 'square') {
    html = `<div style="width:16px;height:16px;background:${color};border:2px solid #fff;"></div>`;
  } else if (shape === 'triangle') {
    html = `<div style="width:0;height:0;border-left:10px solid transparent;border-right:10px solid transparent;border-bottom:18px solid ${color};filter:drop-shadow(0 0 1px #fff);"></div>`;
  } else if (shape === 'star') {
    html = `<div style="width:20px;height:20px;background:${color};clip-path:polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%);"></div>`;
  } else {
    html = `<div style="width:16px;height:16px;background:${color};border-radius:50%;border:2px solid #fff;"></div>`;
  }
  return L.divIcon({
    className: 'memo-shape-marker',
    html,
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });
}

window.__editMemo = editMemoById;
window.__deleteMemo = deleteMemoById;

let lineMode = null;
let lineHandlersWired = false;

export function startLineMode() {
  const map = getMap();
  if (lineMode) return;
  lineMode = {
    vertices: [],
    previewLine: null,
    vertexMarkers: []
  };
  document.getElementById('line-mode-bar').classList.remove('hidden');
  setTownLayersInteractive(map, false);
  map.on('click', onLineTap);
  if (!lineHandlersWired) {
    document.getElementById('line-undo').addEventListener('click', undoVertex);
    document.getElementById('line-confirm').addEventListener('click', confirmLine);
    document.getElementById('line-cancel').addEventListener('click', cancelLineMode);
    lineHandlersWired = true;
  }
  updateLineBarState();
  showToast('地図をタップして頂点を追加', 'success');
}

function updateLineBarState() {
  const confirmBtn = document.getElementById('line-confirm');
  const undoBtn = document.getElementById('line-undo');
  const label = document.getElementById('line-mode-label');
  const count = lineMode ? lineMode.vertices.length : 0;
  if (confirmBtn) confirmBtn.disabled = count < 2;
  if (undoBtn) undoBtn.disabled = count === 0;
  if (label) label.textContent = `線描画中（${count}点）`;
}

function onLineTap(e) {
  if (!lineMode) return;
  const map = getMap();
  lineMode.vertices.push(e.latlng);

  const marker = L.circleMarker(e.latlng, {
    color: '#e53935', fillColor: '#e53935', fillOpacity: 1,
    radius: 6, weight: 2
  }).addTo(map);
  lineMode.vertexMarkers.push(marker);

  if (lineMode.previewLine) map.removeLayer(lineMode.previewLine);
  if (lineMode.vertices.length >= 2) {
    lineMode.previewLine = L.polyline(lineMode.vertices, {
      color: '#e53935', weight: 3, opacity: 0.7, dashArray: '6,6'
    }).addTo(map);
  }
  updateLineBarState();
}

function undoVertex() {
  if (!lineMode || lineMode.vertices.length === 0) return;
  const map = getMap();
  lineMode.vertices.pop();
  const m = lineMode.vertexMarkers.pop();
  if (m) map.removeLayer(m);
  if (lineMode.previewLine) {
    map.removeLayer(lineMode.previewLine);
    lineMode.previewLine = null;
  }
  if (lineMode.vertices.length >= 2) {
    lineMode.previewLine = L.polyline(lineMode.vertices, {
      color: '#e53935', weight: 3, opacity: 0.7, dashArray: '6,6'
    }).addTo(map);
  }
  updateLineBarState();
}

function confirmLine() {
  if (!lineMode || lineMode.vertices.length < 2) {
    showToast('頂点が足りません（2点以上必要）', 'warning');
    return;
  }
  const coords = lineMode.vertices.map(v => [v.lng, v.lat]);
  openMemoForm({
    geometry: { type: 'LineString', coordinates: coords },
    onSave: (feature) => {
      const memos = loadMemos();
      memos.push(feature);
      const result = saveMemos(memos);
      if (!result.ok) { showToast('保存失敗: ' + result.message, 'error'); return; }
      renderMemo(feature);
      updateMemoCount();
      cleanupLineMode();
      showToast('線を保存しました', 'success');
    }
  });
}

function cancelLineMode() {
  if (!lineMode) return;
  if (lineMode.vertices.length > 0 && !confirm('線描画をキャンセルしますか？')) return;
  cleanupLineMode();
}

function cleanupLineMode() {
  if (!lineMode) return;
  const map = getMap();
  map.off('click', onLineTap);
  setTownLayersInteractive(map, true);
  lineMode.vertexMarkers.forEach(m => map.removeLayer(m));
  if (lineMode.previewLine) map.removeLayer(lineMode.previewLine);
  document.getElementById('line-mode-bar').classList.add('hidden');
  lineMode = null;
}
