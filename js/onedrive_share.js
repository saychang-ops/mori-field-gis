// OneDrive直接書込みモジュール (v1.3.0)
// FileSystemDirectoryHandle を IDB に永続化し、↑ボタン押下時に直接書き込む。
// Android Chrome/Edge: showDirectoryPicker 対応 → 直接書込み
// iOS Safari: 非対応 → isSupported() で false を返し、呼び出し側でWeb Share APIにフォールバック

const DB_NAME = 'mori_field_share';
const DB_VERSION = 1;
const STORE = 'config';
const KEY_FOLDER = 'onedrive_folder';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function reqAsPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function isSupported() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

export async function selectOneDriveFolder() {
  if (!isSupported()) {
    throw new Error('この端末/ブラウザはフォルダ直接指定をサポートしていません (iOS Safari は非対応)');
  }
  const handle = await window.showDirectoryPicker({
    id: 'mori_field_onedrive',
    mode: 'readwrite'
  });
  const db = await openDB();
  const tx = db.transaction(STORE, 'readwrite').objectStore(STORE);
  await reqAsPromise(tx.put({ id: KEY_FOLDER, handle, name: handle.name, savedAt: Date.now() }));
  return { handle, name: handle.name };
}

export async function getStoredFolderInfo() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readonly').objectStore(STORE);
    const rec = await reqAsPromise(tx.get(KEY_FOLDER));
    if (!rec || !rec.handle) return null;
    return { handle: rec.handle, name: rec.name, savedAt: rec.savedAt };
  } catch (e) {
    console.warn('[onedrive_share] getStoredFolderInfo failed:', e);
    return null;
  }
}

export async function clearStoredFolder() {
  const db = await openDB();
  const tx = db.transaction(STORE, 'readwrite').objectStore(STORE);
  await reqAsPromise(tx.delete(KEY_FOLDER));
}

async function ensurePermission(handle) {
  if (!handle || typeof handle.queryPermission !== 'function') return 'denied';
  const opts = { mode: 'readwrite' };
  let perm = await handle.queryPermission(opts);
  if (perm === 'granted') return 'granted';
  perm = await handle.requestPermission(opts);
  return perm;
}

export async function writeFileToFolder(handle, filename, blob) {
  const perm = await ensurePermission(handle);
  if (perm !== 'granted') {
    throw new Error('フォルダ書込み権限が拒否されました');
  }
  const fileHandle = await handle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
  return true;
}
