// Persistência local via IndexedDB: pontos, mídias (blobs) e configurações.
const DB_NAME = 'mapa-convento-3d';
const DB_VERSION = 1;

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('markers')) db.createObjectStore('markers', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('media')) {
        const s = db.createObjectStore('media', { keyPath: 'id' });
        s.createIndex('markerId', 'markerId', { unique: false });
      }
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise = null;
const getDb = () => (dbPromise ||= open());

function tx(store, mode, fn) {
  return getDb().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const r = fn(s);
    t.oncomplete = () => resolve(r && r.result !== undefined ? r.result : r);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const db = {
  allMarkers: () => tx('markers', 'readonly', s => s.getAll()),
  putMarker: m => tx('markers', 'readwrite', s => s.put(m)),
  deleteMarker: id => tx('markers', 'readwrite', s => s.delete(id)),

  mediaFor: markerId => tx('media', 'readonly', s => s.index('markerId').getAll(markerId)),
  allMediaMeta: () => tx('media', 'readonly', s => s.getAll()).then(list => list.map(({ blob, ...rest }) => rest)),
  putMedia: m => tx('media', 'readwrite', s => s.put(m)),
  deleteMedia: id => tx('media', 'readwrite', s => s.delete(id)),
  deleteMediaFor: markerId => getDb().then(d => new Promise((resolve, reject) => {
    const t = d.transaction('media', 'readwrite');
    const idx = t.objectStore('media').index('markerId');
    const req = idx.openCursor(IDBKeyRange.only(markerId));
    req.onsuccess = () => { const c = req.result; if (c) { c.delete(); c.continue(); } };
    t.oncomplete = resolve; t.onerror = () => reject(t.error);
  })),

  getSetting: key => tx('settings', 'readonly', s => s.get(key)).then(r => r ? r.value : undefined),
  setSetting: (key, value) => tx('settings', 'readwrite', s => s.put({ key, value })),
  deleteSetting: key => tx('settings', 'readwrite', s => s.delete(key)),
};

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2));
