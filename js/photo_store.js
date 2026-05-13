const DB_NAME = 'mori_field_gis';
const DB_VERSION = 1;
const STORE_PHOTOS = 'photos';
const REF_PREFIX = 'idb:';

let dbPromise = null;
const blobUrlCache = new Map();

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PHOTOS)) {
        db.createObjectStore(STORE_PHOTOS, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(db, mode) {
  return db.transaction(STORE_PHOTOS, mode).objectStore(STORE_PHOTOS);
}

function reqAsPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function rnd4() {
  return Math.random().toString(36).slice(2, 6);
}

function stripPrefix(refId) {
  return refId.startsWith(REF_PREFIX) ? refId.slice(REF_PREFIX.length) : refId;
}

function blobToArrayBuffer(blob) {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsArrayBuffer(blob);
  });
}

export async function putPhoto(blob, memoId, index) {
  const db = await openDB();
  // ArrayBufferとして保存(jsdom+fake-indexeddbのBlob構造化クローン制約回避。
  // 実機ブラウザでも同等に動作し、メモリ効率も同じ)
  const data = await blobToArrayBuffer(blob);
  const type = blob.type || 'image/jpeg';
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE_PHOTOS, 'readwrite');
    const store = t.objectStore(STORE_PHOTOS);
    let id = `${memoId}_${index}`;
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      if (getReq.result) {
        id = `${memoId}_${index}_${rnd4()}`;
      }
      const record = { id, data, type, createdAt: new Date().toISOString() };
      const addReq = store.add(record);
      addReq.onsuccess = () => resolve(REF_PREFIX + id);
      addReq.onerror = () => reject(addReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function getPhoto(refId) {
  const db = await openDB();
  const id = stripPrefix(refId);
  const record = await reqAsPromise(tx(db, 'readonly').get(id));
  if (!record) throw new Error(`photo not found: ${refId}`);
  return new Blob([record.data], { type: record.type || 'image/jpeg' });
}

export async function _resetForTests() {
  for (const url of blobUrlCache.values()) {
    try { URL.revokeObjectURL(url); } catch (_) {}
  }
  blobUrlCache.clear();
  if (dbPromise) {
    try {
      const oldDb = await dbPromise;
      oldDb.close();
    } catch (_) {}
  }
  dbPromise = null;
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}
