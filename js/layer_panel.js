// mori-field-gis/js/layer_panel.js
import {
  loadLayers, createLayer, renameLayer, setLayerVisible, deleteLayer,
  getActiveLayerId, setActiveLayerId, loadLayerMemos, MAX_LAYERS
} from './layer_store.js';
import { rebuildMemoLayer } from './register.js';
import { deleteLayerRemote, triggerLayerSync } from './sync.js';
import { showToast } from './toast.js';

function updateActiveLayerLabel() {
  const el = document.getElementById('active-layer-name');
  if (!el) return;
  const active = loadLayers().find((l) => l.id === getActiveLayerId());
  el.textContent = active ? active.name : '—';
}

function renderLayerList() {
  const listEl = document.getElementById('layer-list');
  if (!listEl) return;
  const layers = loadLayers();
  const activeId = getActiveLayerId();
  listEl.innerHTML = '';
  layers.forEach((layer) => {
    const row = document.createElement('div');
    row.className = 'layer-row' + (layer.id === activeId ? ' active' : '');
    const count = loadLayerMemos(layer.id).length;
    row.innerHTML = `
      <input type="checkbox" class="layer-vis" ${layer.visible ? 'checked' : ''} />
      <input type="radio" name="active-layer" class="layer-active" ${layer.id === activeId ? 'checked' : ''} />
      <span class="layer-name">${escapeHtml(layer.name)}</span>
      <span class="layer-count">${count}件</span>
      <button class="layer-rename">✏️</button>
      <button class="layer-delete">🗑</button>`;
    row.querySelector('.layer-vis').addEventListener('change', (e) => {
      setLayerVisible(layer.id, e.target.checked);
      rebuildMemoLayer();
    });
    row.querySelector('.layer-active').addEventListener('change', () => {
      setActiveLayerId(layer.id);
      updateActiveLayerLabel();
      renderLayerList();
    });
    row.querySelector('.layer-rename').addEventListener('click', () => {
      const name = window.prompt('レイヤ名を入力', layer.name);
      if (name == null) return;
      renameLayer(layer.id, name);
      renderLayerList();
      updateActiveLayerLabel();
      rebuildMemoLayer();
      triggerLayerSync(layer.id);
    });
    row.querySelector('.layer-delete').addEventListener('click', () => {
      if (loadLayers().length <= 1) { showToast('最後の1レイヤは削除できません', 'warning'); return; }
      if (!confirm(`レイヤ「${layer.name}」を削除しますか？`)) return;
      if (!confirm('GCS上のデータも削除されます。本当に削除しますか？')) return;
      deleteLayerRemote(layer.id).catch((e) => console.warn('remote delete failed', e));
      deleteLayer(layer.id);
      renderLayerList();
      updateActiveLayerLabel();
      rebuildMemoLayer();
      showToast('レイヤを削除しました', 'success');
    });
    listEl.appendChild(row);
  });
  const addBtn = document.getElementById('layer-add-btn');
  if (addBtn) addBtn.disabled = layers.length >= MAX_LAYERS;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function openSheet() {
  renderLayerList();
  document.getElementById('layer-sheet').classList.remove('hidden');
}
function closeSheet() {
  document.getElementById('layer-sheet').classList.add('hidden');
}

export function initLayerPanel() {
  updateActiveLayerLabel();
  document.getElementById('active-layer-btn')?.addEventListener('click', openSheet);
  document.getElementById('layer-sheet-close')?.addEventListener('click', closeSheet);
  document.querySelector('.layer-sheet-backdrop')?.addEventListener('click', closeSheet);
  document.getElementById('layer-add-btn')?.addEventListener('click', () => {
    const name = window.prompt('新しいレイヤ名を入力');
    if (name == null) return;
    const r = createLayer(name);
    if (!r.ok) {
      showToast(r.error === 'limit' ? `レイヤは最大${MAX_LAYERS}個までです` : '作成に失敗しました', 'warning');
      return;
    }
    renderLayerList();
    updateActiveLayerLabel();
  });
}
