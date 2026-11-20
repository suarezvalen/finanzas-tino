// Base de datos local (IndexedDB). Todo queda guardado en el dispositivo.
const DB_NAME = 'finanzas-tino';
// Las versiones solo agregan almacenes, nunca borran datos.
// v2 (etapa 2): 'recurring'. v3 (etapa 3): 'investments', 'goals', 'debts'.
// v4 (mercado): 'watch' (seguimiento), 'alerts' (reglas), 'alertlog' (avisos), 'push' (dispositivos para notificaciones).
// v5: 'informes' (informes diarios y semanales que arma la rutina en la nube).
// v6 (negocio): 'biz_days' (un día del negocio: ventas, embudo, anuncios), 'biz_cfg' (economía y preferencias), 'biz_costs' (gastos del negocio).
// v7: 'biz_insights' (análisis diario del negocio), 'biz_notes' (ideas que marcaste y cambios que anotaste).
const VERSION = 7;
export const STORES = ['accounts', 'categories', 'transactions', 'meta', 'recurring', 'investments', 'goals', 'debts', 'watch', 'alerts', 'alertlog', 'push', 'informes', 'biz_days', 'biz_cfg', 'biz_costs', 'biz_insights', 'biz_notes'];

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

export async function clearAll(stores = STORES) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite');
    for (const s of stores) tx.objectStore(s).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
