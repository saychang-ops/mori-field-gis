import { CONFIG } from './config.js';
import { fileToResizedDataUrl } from './camera.js';
import { getAuthor, setAuthor } from './storage.js';
import { showToast } from './toast.js';

let pendingPhotos = [];
let currentGeometry = null;
let currentEditingId = null;
let onSaveCallback = null;

export function openMemoForm({ geometry, editing = null, onSave }) {
  currentGeometry = geometry;
  currentEditingId = editing ? editing.properties._id : null;
  onSaveCallback = onSave;

  const overlay = document.getElementById('bottom-sheet-overlay');

  document.getElementById('f-name').value = editing ? editing.properties.name || '' : '';
  document.getElementById('f-remarks').value = editing ? editing.properties.remarks || '' : '';
  document.getElementById('f-date').value = editing ? editing.properties.date || todayStr() : todayStr();
  document.getElementById('f-person').value = editing ? editing.properties.person || '' : getAuthor() || '';

  pendingPhotos = editing ? [...(editing.properties.photos || [])] : [];
  renderThumbs();

  overlay.classList.remove('hidden');
}

export function closeMemoForm() {
  document.getElementById('bottom-sheet-overlay').classList.add('hidden');
  pendingPhotos = [];
  currentGeometry = null;
  currentEditingId = null;
  onSaveCallback = null;
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
  pendingPhotos.forEach((dataUrl, idx) => {
    const div = document.createElement('div');
    div.className = 'photo-thumb';
    const img = document.createElement('img');
    img.src = dataUrl;
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
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.idx, 10);
      pendingPhotos.splice(i, 1);
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
  const toProcess = Array.from(files).slice(0, remaining);
  for (const file of toProcess) {
    try {
      const dataUrl = await fileToResizedDataUrl(file);
      pendingPhotos.push(dataUrl);
    } catch (e) {
      console.warn('写真処理失敗:', e);
      showToast('写真の読込に失敗しました', 'error');
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

function confirmClose() {
  const hasInput =
    document.getElementById('f-name').value ||
    document.getElementById('f-remarks').value ||
    pendingPhotos.length > 0;
  if (hasInput && !currentEditingId && !confirm('入力内容を破棄しますか？')) return;
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
    icon_type: 'simple',
    icon_shape: 'circle',
    icon_color: CONFIG.style.fieldMemoPoint.color,
    line_style: 'solid',
    line_color: CONFIG.style.fieldMemoLine.color,
    line_width: CONFIG.style.fieldMemoLine.weight
  };
  if (!currentEditingId) {
    props._created_at_iso = new Date().toISOString();
  }

  const feature = { type: 'Feature', geometry: currentGeometry, properties: props };

  if (onSaveCallback) onSaveCallback(feature);
  closeMemoForm();
}
