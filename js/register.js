import { CONFIG } from './config.js';
import { getMap } from './map.js';
import { openMemoForm } from './form.js';
import { loadMemos, saveMemos } from './storage.js';
import { showToast } from './toast.js';
import { setTownLayersInteractive } from './layers.js';
import { getPhotoUrl, deletePhotosByMemoId, clearAll as clearAllPhotos } from './photo_store.js';
import { loadLayers, loadLayerMemos, saveLayerMemos, getActiveLayerId, findMemoLayerId } from './layer_store.js';
import { triggerLayerSync } from './sync.js';

let memoLayerGroup = null;
let memoRenderer = null;

export function initMemoLayer(map) {
  memoRenderer = L.svg({ pane: 'memoPane' });
  memoLayerGroup = L.layerGroup().addTo(map);
  loadVisibleMemos().forEach(renderMemo);
  updateMemoCount();
  initLightbox();

  map.on('popupopen', (e) => {
    const root = e.popup.getElement();
    if (!root) return;
    const imgs = root.querySelectorAll('img[data-photo-ref]');
    imgs.forEach(async (img) => {
      const ref = img.dataset.photoRef;
      if (!ref) return;
      if (ref.startsWith('data:')) {
        img.src = ref;
      } else if (ref.startsWith('idb:')) {
        try {
          img.src = await getPhotoUrl(ref);
        } catch (_) {
          img.alt = '写真読込失敗';
          img.style.background = '#fee';
        }
      }
      // v1.2.1: タップで拡大表示
      img.addEventListener('click', () => {
        const allImgs = Array.from(root.querySelectorAll('img[data-photo-ref]'));
        const refs = allImgs.map(i => i.getAttribute('data-photo-ref'));
        const idx = allImgs.indexOf(img);
        openLightbox(refs, idx);
      });
    });
  });
}

// v1.2.1: ライトボックス（タップ拡大表示）
let lightboxPhotos = [];
let lightboxIndex = 0;

function initLightbox() {
  const lb = document.getElementById('lightbox');
  if (!lb || lb.dataset.wired === '1') return;
  lb.dataset.wired = '1';
  document.getElementById('lightbox-prev').addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (lightboxIndex > 0) { lightboxIndex--; showLightboxImage(); updateLightboxNav(); }
  });
  document.getElementById('lightbox-next').addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (lightboxIndex < lightboxPhotos.length - 1) { lightboxIndex++; showLightboxImage(); updateLightboxNav(); }
  });
  document.getElementById('lightbox-close').addEventListener('click', (ev) => {
    ev.stopPropagation();
    closeLightbox();
  });
  lb.addEventListener('click', (ev) => {
    if (ev.target.id === 'lightbox') closeLightbox();
  });
}

function openLightbox(refs, startIdx) {
  lightboxPhotos = (refs || []).slice();
  lightboxIndex = Math.max(0, Math.min(startIdx || 0, lightboxPhotos.length - 1));
  document.getElementById('lightbox').classList.remove('hidden');
  showLightboxImage();
  updateLightboxNav();
}

function showLightboxImage() {
  const imgEl = document.getElementById('lightbox-img');
  const ref = lightboxPhotos[lightboxIndex];
  if (!ref) { imgEl.src = ''; return; }
  if (typeof ref === 'string' && ref.startsWith('idb:')) {
    imgEl.src = '';
    const idxAtCall = lightboxIndex;
    getPhotoUrl(ref).then(url => {
      if (idxAtCall === lightboxIndex) imgEl.src = url;
    }).catch(() => {
      if (idxAtCall === lightboxIndex) imgEl.alt = '写真読込失敗';
    });
  } else {
    imgEl.src = ref;
  }
  const counter = document.getElementById('lightbox-counter');
  if (counter) counter.textContent = (lightboxIndex + 1) + ' / ' + lightboxPhotos.length;
}

function updateLightboxNav() {
  document.getElementById('lightbox-prev').style.visibility = lightboxIndex > 0 ? 'visible' : 'hidden';
  document.getElementById('lightbox-next').style.visibility = lightboxIndex < lightboxPhotos.length - 1 ? 'visible' : 'hidden';
  const counter = document.getElementById('lightbox-counter');
  if (counter) counter.style.visibility = lightboxPhotos.length > 1 ? 'visible' : 'hidden';
}

function closeLightbox() {
  document.getElementById('lightbox').classList.add('hidden');
  document.getElementById('lightbox-img').src = '';
  lightboxPhotos = [];
  lightboxIndex = 0;
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

// visible=true の全レイヤのメモを集めて返す（各メモに _layer_id を保証）
function loadVisibleMemos() {
  const out = [];
  loadLayers().forEach((layer) => {
    if (!layer.visible) return;
    loadLayerMemos(layer.id).forEach((m) => {
      if (m.properties && m.properties._deleted) return;
      m.properties = m.properties || {};
      m.properties._layer_id = layer.id;
      out.push(m);
    });
  });
  return out;
}

function buildPopupHtml(feature) {
  const p = feature.properties;
  const layer = loadLayers().find((l) => l.id === p._layer_id);
  const layerName = layer ? layer.name : '現場メモ';
  const photos = (p.photos || [])
    .map((src, idx) => `<img data-photo-ref="${escapeHtml(src)}" data-photo-idx="${idx}" alt="写真" />`)
    .join('');
  return `
    <div class="memo-popup" data-id="${p._id}">
      <b>${escapeHtml(layerName)}</b><br>
      <b>${escapeHtml(p.name || '')}</b><br>
      ${escapeHtml(p.remarks || '').replace(/\n/g, '<br>')}<br>
      <small>${escapeHtml(p.date || '')} ${escapeHtml(p.person || '')}</small><br>
      <div class="memo-popup-photos">${photos}</div>
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

function openMemoFormForPoint(latlng) {
  openMemoForm({
    geometry: { type: 'Point', coordinates: [latlng.lng, latlng.lat] },
    onSave: (feature) => {
      const activeId = getActiveLayerId();
      feature.properties = feature.properties || {};
      feature.properties._layer_id = activeId;
      feature.properties._updated = new Date().toISOString();
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
      triggerLayerSync(activeId).then((r) => {
        if (r.queued) showToast('オフライン: 後で自動送信します', 'warning');
      });
    }
  });
}

// v1.1.1: 線描画と同じ2段階フロー（タップで選択→確定で詳細登録）
let pointMode = null;
let pointHandlersWired = false;

export function startPointMode() {
  const map = getMap();
  if (pointMode) return;
  pointMode = { latlng: null, marker: null };
  document.getElementById('point-mode-bar').classList.remove('hidden');
  setTownLayersInteractive(map, false);
  map.on('click', onPointTap);
  if (!pointHandlersWired) {
    document.getElementById('point-confirm').addEventListener('click', confirmPoint);
    document.getElementById('point-cancel').addEventListener('click', cancelPointMode);
    pointHandlersWired = true;
  }
  updatePointBarState();
  showToast('地図をタップして登録地点を選択', 'success');
}

function updatePointBarState() {
  const confirmBtn = document.getElementById('point-confirm');
  const label = document.getElementById('point-mode-label');
  const hasPoint = !!(pointMode && pointMode.latlng);
  if (confirmBtn) confirmBtn.disabled = !hasPoint;
  if (label) label.textContent = hasPoint
    ? '登録地点を確定してください（タップで再選択可）'
    : '登録地点をタップして選択してください';
}

function onPointTap(e) {
  if (!pointMode) return;
  const map = getMap();
  pointMode.latlng = e.latlng;
  if (pointMode.marker) map.removeLayer(pointMode.marker);
  pointMode.marker = L.circleMarker(e.latlng, {
    color: '#e53935', fillColor: '#e53935', fillOpacity: 0.7,
    radius: 10, weight: 3
  }).addTo(map);
  updatePointBarState();
}

function confirmPoint() {
  if (!pointMode || !pointMode.latlng) {
    showToast('地点が選択されていません', 'warning');
    return;
  }
  const latlng = pointMode.latlng;
  cleanupPointMode();
  openMemoFormForPoint(latlng);
}

function cancelPointMode() {
  if (!pointMode) return;
  if (pointMode.latlng && !confirm('点登録をキャンセルしますか？')) return;
  cleanupPointMode();
}

function cleanupPointMode() {
  if (!pointMode) return;
  const map = getMap();
  map.off('click', onPointTap);
  setTownLayersInteractive(map, true);
  if (pointMode.marker) map.removeLayer(pointMode.marker);
  document.getElementById('point-mode-bar').classList.add('hidden');
  pointMode = null;
}

function updateMemoCount() {
  const count = loadMemos().length;
  const el = document.getElementById('memo-count');
  if (el) el.textContent = `${count}件`;
}

export function editMemoById(id) {
  const layerId = findMemoLayerId(id);
  if (!layerId) return;
  const memos = loadLayerMemos(layerId);
  const feature = memos.find((m) => m.properties._id === id);
  if (!feature) return;
  openMemoForm({
    geometry: feature.geometry,
    editing: feature,
    onSave: (updated) => {
      updated.properties = updated.properties || {};
      updated.properties._layer_id = layerId;
      updated.properties._updated = new Date().toISOString();
      const idx = memos.findIndex((m) => m.properties._id === id);
      memos[idx] = updated;
      saveLayerMemos(layerId, memos);
      rebuildMemoLayer();
      showToast('更新しました', 'success');
      triggerLayerSync(layerId).then((r) => {
        if (r.queued) showToast('オフライン: 後で自動送信します', 'warning');
      });
    }
  });
}

export function deleteMemoById(id) {
  if (!confirm('このメモを削除しますか？')) return;
  const layerId = findMemoLayerId(id);
  if (!layerId) return;
  const memos = loadLayerMemos(layerId);
  const target = memos.find((m) => m.properties._id === id);
  if (!target) return;
  target.properties._deleted = true;
  target.properties._updated = new Date().toISOString();
  saveLayerMemos(layerId, memos);
  deletePhotosByMemoId(id).catch((e) => console.warn('photo cleanup failed', e));
  rebuildMemoLayer();
  showToast('削除しました', 'success');
  triggerLayerSync(layerId).then((r) => {
    if (r.queued) showToast('オフライン: 後で自動送信します', 'warning');
  });
}

export function rebuildMemoLayer() {
  memoLayerGroup.clearLayers();
  loadVisibleMemos().forEach(renderMemo);
  updateMemoCount();
  getMap().closePopup();
}

export function clearAllMemos() {
  const activeId = getActiveLayerId();
  const layer = loadLayers().find((l) => l.id === activeId);
  const count = loadMemos().length;
  if (!layer || count === 0) {
    showToast('削除するメモがありません', 'warning');
    return;
  }
  if (!confirm(`レイヤ「${layer.name}」の ${count}件 をすべて削除しますか？\n元に戻せません。`)) return;
  if (!confirm('本当に削除しますか？')) return;
  const result = saveMemos([]);
  if (!result.ok) {
    showToast('削除失敗: ' + result.message, 'error');
    return;
  }
  rebuildMemoLayer();
  showToast(`${count}件のメモを削除しました`, 'success');
  triggerLayerSync(activeId);
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
      const activeId = getActiveLayerId();
      feature.properties = feature.properties || {};
      feature.properties._layer_id = activeId;
      feature.properties._updated = new Date().toISOString();
      const memos = loadMemos();
      memos.push(feature);
      const result = saveMemos(memos);
      if (!result.ok) { showToast('保存失敗: ' + result.message, 'error'); return; }
      renderMemo(feature);
      updateMemoCount();
      cleanupLineMode();
      showToast('線を保存しました', 'success');
      triggerLayerSync(activeId).then((r) => {
        if (r.queued) showToast('オフライン: 後で自動送信します', 'warning');
      });
    },
    onCancel: () => {
      cleanupLineMode();
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
