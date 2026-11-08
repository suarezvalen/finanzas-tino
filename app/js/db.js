// Base de datos local (IndexedDB). Todo queda guardado en el dispositivo.
const DB_NAME = 'finanzas-tino';
// Las versiones solo agregan almacenes, nunca borran datos.
// v2 (etapa 2): 'recurring'. v3 (etapa 3): 'investments', 'goals', 'debts'.
const VERSION = 3;
export const STORES = ['accounts', 'categories', 'transactions', 'meta', 'recurring', 'investments', 'goals', 'debts'];

let dbPromise;
function open() {
  dbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
    };
    req.onsuccess = () => {
      // Si se abre una versión más nueva de la app, esta conexión se cierra para no bloquearla.
      req.result.onversionchange = () => { req.result.close(); location.reload(); };
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function getAll(store) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store).objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putMany(store, items) {
  if (!items.length) return;
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    for (const item of items) os.put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAll() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES, 'readwrite');
    for (const s of STORES) tx.objectStore(s).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
