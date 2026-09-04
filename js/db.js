// 依存なしの薄い IndexedDB ラッパー。
// DB: pt-karte / v1  stores: clients, charts(by_client), settings
const DB_NAME = 'pt-karte';
const DB_VERSION = 1;

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains('clients')) {
        db.createObjectStore('clients', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('charts')) {
        const s = db.createObjectStore('charts', { keyPath: 'id' });
        s.createIndex('by_client', 'clientId', { unique: false });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function tx(store, mode, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        let result;
        Promise.resolve(fn(s)).then((r) => (result = r));
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const db = {
  get: (store, key) => tx(store, 'readonly', (s) => reqToPromise(s.get(key))),
  getAll: (store) => tx(store, 'readonly', (s) => reqToPromise(s.getAll())),
  getAllByIndex: (store, index, value) =>
    tx(store, 'readonly', (s) => reqToPromise(s.index(index).getAll(value))),
  put: (store, value) => tx(store, 'readwrite', (s) => reqToPromise(s.put(value))),
  delete: (store, key) => tx(store, 'readwrite', (s) => reqToPromise(s.delete(key))),
  clear: (store) => tx(store, 'readwrite', (s) => reqToPromise(s.clear())),
  bulkPut: (store, values) =>
    tx(store, 'readwrite', (s) => {
      for (const v of values) s.put(v);
    }),
};

// 端末データ削除への耐性を少しでも上げる
export async function requestPersistentStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      return await navigator.storage.persist();
    }
  } catch (_) {}
  return false;
}

export function uid(prefix = '') {
  return (
    prefix +
    Date.now().toString(36) +
    '-' +
    Math.random().toString(36).slice(2, 8)
  );
}
