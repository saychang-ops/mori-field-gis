import { CONFIG } from './config.js';
import { fileToResizedBlob } from './camera.js';
import { getAuthor, setAuthor } from './storage.js';
import { showToast } from './toast.js';
import { putPhoto, getPhotoUrl, deletePhoto } from './photo_store.js';

let pendingPhotos = [];
let pendingThumbUrls = [];
let originalPhotosForEdit = [];
let newlyAddedRefIds = [];
let currentGeometry = null;
let currentEditingId = null;
let onSaveCallback = null;
let onCancelCallback = null;
let currentStyleProps = {};

export function openMemoForm({ geometry, editing = null, onSave, onCancel = null }) {
  currentGeometry = geometry;
  currentEditingId = editing ? editing.properties._id : null;
  onSaveCallback = onSave;
  onCancelCallback = onCancel;

  const overlay = document.getElementById('bottom-sheet-overlay');

  document.getElementById('f-name').value = editing ? editing.properties.name || '' : '';
  document.getElementById('f-remarks').value = editing ? editing.properties.remarks || '' : '';
  document.getElementById('f-date').value = editing ? editing.properties.date || todayStr() : todayStr();
  document.getElementById('f-person').value = editing ? editing.properties.person || '' : getAuthor() || '';

  pendingPhotos = editing ? [...(editing.properties.photos || [])] : [];
  originalPhotosForEdit = [...pendingPhotos];
  newlyAddedRefIds = [];
  pendingThumbUrls = new Array(pendingPhotos.length).fill('');
  renderThumbs();

  const isLine = geometry && geometry.type === 'LineString';
  renderStylePickers(isLine, editing ? editing.properties : null);

  overlay.classList.remove('hidden');
}

function renderStylePickers(isLine, existing) {
  currentStyleProps = {};

  if (isLine) {
    document.getElementById('style-point-panel').classList.add('hidden');
    document.getElementById('style-line-panel').classList.remove('hidden');
    const style = existing?.line_style || 'solid';
    const width = existing?.line_width ?? 4;
    const color = existing?.line_color || CONFIG.iconPalette[0].value;
    currentStyleProps.line_style = style;
    currentStyleProps.line_width = width;
    currentStyleProps.line_color = color;

    renderPickerGroup('pick-line-style', CONFIG.lineStyles, style, (v) => {
      currentStyleProps.line_style = v;
    }, (v) => `<div class="line-preview ${v}"></div>`);

    renderPickerGroup('pick-line-width', CONFIG.lineWidths, width, (v) => {
      currentStyleProps.line_width = v;
    }, (v) => `<div class="line-preview w${v}"></div>`);

    renderPickerGroup('pick-line-color', CONFIG.iconPalette.map(c => c.value), color, (v) => {
      currentStyleProps.line_color = v;
    }, (v) => `<div class="color-dot" style="background:${v}"></div>`);
  } else {
    document.getElementById('style-point-panel').classList.remove('hidden');
    document.getElementById('style-line-panel').classList.add('hidden');
    const shape = existing?.icon_shape || 'circle';
    const color = existing?.icon_color || CONFIG.iconPalette[0].value;
    currentStyleProps.icon_type = 'simple';
    currentStyleProps.icon_shape = shape;
    currentStyleProps.icon_color = color;

    renderPickerGroup('pick-shape', CONFIG.iconShapes, shape, (v) => {
      currentStyleProps.icon_shape = v;
    }, (v) => `<div class="shape-preview ${v}"></div>`);

    renderPickerGroup('pick-icon-color', CONFIG.iconPalette.map(c => c.value), color, (v) => {
      currentStyleProps.icon_color = v;
    }, (v) => `<div class="color-dot" style="background:${v}"></div>`);
  }
}

function renderPickerGroup(containerId, values, selectedValue, onPick, renderPreview) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  values.forEach(v => {
    const btn = document.createElement('div');
    btn.className = 'style-option' + (String(v) === String(selectedValue) ? ' selected' : '');
    btn.dataset.val = String(v);
    btn.innerHTML = renderPreview(v);
    btn.addEventListener('click', () => {
      container.querySelectorAll('.style-option').forEach(o => o.classList.remove('selected'));
      btn.classList.add('selected');
      onPick(typeof v === 'number' ? v : v);
    });
    container.appendChild(btn);
  });
}

export function closeMemoForm() {
  document.getElementById('bottom-sheet-overlay').classList.add('hidden');
  if (onCancelCallback) onCancelCallback();
  pendingPhotos = [];
  pendingThumbUrls = [];
  originalPhotosForEdit = [];
  newlyAddedRefIds = [];
  currentGeometry = null;
  currentEditingId = null;
  onSaveCallback = null;
  onCancelCallback = null;
}

function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function renderThumbs() {
  const container = document.getElementById('photo-thumbnails');
  container.innerHTML = '';
  pendingPhotos.forEach((ref, idx) => {
    const div = document.createElement('div');
    div.className = 'photo-thumb';
    const img = document.createElement('img');
    img.alt = '写真';
    if (typeof ref === 'string' && ref.startsWith('data:')) {
      img.src = ref;
    } else if (typeof ref === 'string' && ref.startsWith('idb:')) {
      if (pendingThumbUrls[idx]) {
        img.src = pendingThumbUrls[idx];
      } else {
        getPhotoUrl(ref).then((url) => {
          pendingThumbUrls[idx] = url;
          img.src = url;
        }).catch(() => {
          img.alt = '写真読込失敗';
        });
      }
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'remove-btn';
    btn.dataset.idx = String(idx);
    btn.textContent = '×';
    div.appendChild(img);
    div.appendChild(btn);
    container.appendChild(div);
  });
  container.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const i = parseInt(btn.dataset.idx, 10);
      const removed = pendingPhotos[i];
      pendingPhotos.splice(i, 1);
      pendingThumbUrls.splice(i, 1);
      if (removed && typeof removed === 'string' && removed.startsWith('idb:')
          && newlyAddedRefIds.includes(removed)) {
        try { await deletePhoto(removed); } catch (_) {}
        newlyAddedRefIds = newlyAddedRefIds.filter(r => r !== removed);
      }
      renderThumbs();
    });
  });
}

async function handlePhotoFiles(files) {
  const remaining = CONFIG.photo.maxCount - pendingPhotos.length;
  if (remaining <= 0) {
    showToast(`写真は最大${CONFIG.photo.maxCount}枚までです`, 'warning');
    return;
  }
  const tempMemoId = currentEditingId || ('M' + Date.now());
  const toProcess = Array.from(files).slice(0, remaining);
  for (const file of toProcess) {
    try {
      const blob = await fileToResizedBlob(file);
      const idx = pendingPhotos.length;
      const refId = await putPhoto(blob, tempMemoId, idx);
      pendingPhotos.push(refId);
      pendingThumbUrls.push('');
      newlyAddedRefIds.push(refId);
    } catch (e) {
      console.warn('写真処理失敗:', e);
      const msg = (e && e.name === 'QuotaExceededError')
        ? '端末ストレージ容量が不足しています。古い写真を整理してください'
        : '写真の読込に失敗しました';
      showToast(msg, 'error');
    }
  }
  renderThumbs();
}

export function initFormHandlers() {
  document.getElementById('bottom-sheet-close').addEventListener('click', confirmClose);
  document.getElementById('form-cancel').addEventListener('click', confirmClose);

  document.getElementById('f-photo-camera').addEventListener('change', (e) => {
    handlePhotoFiles(e.target.files);
    e.target.value = '';
  });
  document.getElementById('f-photo-gallery').addEventListener('change', (e) => {
    handlePhotoFiles(e.target.files);
    e.target.value = '';
  });

  document.getElementById('memo-form').addEventListener('submit', (e) => {
    e.preventDefault();
    handleSave();
  });
}

async function confirmClose() {
  const hasInput =
    document.getElementById('f-name').value ||
    document.getElementById('f-remarks').value ||
    pendingPhotos.length > 0;
  if (hasInput && !currentEditingId && !confirm('入力内容を破棄しますか？')) return;

  for (const refId of newlyAddedRefIds) {
    if (!originalPhotosForEdit.includes(refId)) {
      try { await deletePhoto(refId); } catch (_) {}
    }
  }

  closeMemoForm();
}

function handleSave() {
  const name = document.getElementById('f-name').value.trim();
  if (!name) {
    showToast('タイトルは必須です', 'warning');
    return;
  }
  const person = document.getElementById('f-person').value.trim();
  if (person) setAuthor(person);

  const props = {
    _type: 'custom',
    _custom_layer_id: 'smartphone_field_memo',
    _custom_layer_name: '現場メモ',
    _custom_fields: ['name', 'photos', 'remarks', 'date', 'person'],
    _id: currentEditingId || ('M' + Date.now()),
    _field_origin: 'smartphone',
    name,
    remarks: document.getElementById('f-remarks').value,
    date: document.getElementById('f-date').value,
    person,
    photos: [...pendingPhotos],
    ...currentStyleProps
  };
  if (!currentEditingId) {
    props._created_at_iso = new Date().toISOString();
  }

  if (currentEditingId) {
    const stillReferenced = new Set(props.photos);
    for (const oldRef of originalPhotosForEdit) {
      if (oldRef && typeof oldRef === 'string' && oldRef.startsWith('idb:')
          && !stillReferenced.has(oldRef)) {
        deletePhoto(oldRef).catch(() => {});
      }
    }
  }

  const feature = { type: 'Feature', geometry: currentGeometry, properties: props };

  if (onSaveCallback) onSaveCallback(feature);
  onCancelCallback = null;
  closeMemoForm();
}
