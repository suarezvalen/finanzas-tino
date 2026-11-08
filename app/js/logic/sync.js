// Sincronización con la nube (Supabase), sin librerías: usa su API REST directamente.
// Tabla `records`: una fila por registro (cuenta, movimiento, etc.), protegida por usuario.
// La sesión y el estado de sincronización se guardan solo en este dispositivo (localStorage).
import { dirtyRows, markSynced, applyRemote, resetLocal } from '../store.js';
import { SYNC } from '../constants.js';

const LS_AUTH = 'ft-auth', LS_SYNC = 'ft-sync', LS_CFG = 'ft-sync-config';
const ls = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* sin almacenamiento */ } },
};

export class SyncError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

/* ---------- Configuración y estado ---------- */
export const config = () => { const c = ls.get(LS_CFG); return c?.url ? c : SYNC.url ? SYNC : null; };
export const isConfigured = () => !!config();
export const saveConfig = (url, key) => ls.set(LS_CFG, { url: url.trim().replace(/\/+$/, ''), key: key.trim() });
export const session = () => ls.get(LS_AUTH);
export const syncInfo = () => ls.get(LS_SYNC) || {};

const listeners = new Set();
export const onSyncChange = fn => listeners.add(fn);
let status = 'idle'; // idle | syncing | ok | error | auth | offline
let lastError = '';
export const syncStatus = () => ({ status, error: lastError });
const notify = () => listeners.forEach(fn => { try { fn(); } catch { /* sigue */ } });
const setStatus = (s, err = '') => { status = s; lastError = err; notify(); };

/* ---------- Llamadas a la API ---------- */
async function request(path, { method = 'GET', body, token, headers = {} } = {}) {
  const c = config();
  if (!c) throw new SyncError('Sincronización no configurada');
  const h = { apikey: c.key, 'Content-Type': 'application/json', ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(c.url + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
  } catch {
    throw new SyncError('Sin conexión con el servidor', 0);
  }
  if (!res.ok) {
    let msg = '';
    try { const j = await res.json(); msg = j.msg || j.error_description || j.message || j.error || ''; } catch { /* sin cuerpo */ }
    throw new SyncError(translate(msg) || `Error ${res.status}`, res.status);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function translate(msg) {
  const m = String(msg).toLowerCase();
  if (m.includes('invalid login')) return 'Email o contraseña incorrectos';
  if (m.includes('email not confirmed')) return 'Falta confirmar el email: abrí el mail que te llegó y tocá el link';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Ese email ya tiene cuenta: iniciá sesión';
  if (m.includes('password should be')) return 'La contraseña tiene que tener al menos 6 caracteres';
  if (m.includes('rate limit')) return 'Demasiados intentos. Esperá unos minutos';
  return msg;
}

function saveSession(j) {
  const s = {
    access_token: j.access_token, refresh_token: j.refresh_token,
    expires_at: Date.now() + (j.expires_in || 3600) * 1000,
    user: { id: j.user?.id, email: j.user?.email },
  };
  ls.set(LS_AUTH, s);
  notify();
  return s;
}

async function validSession() {
  const s = session();
  if (!s) return null;
  if (Date.now() < s.expires_at - 60000) return s;
  try {
    return saveSession(await request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh_token } }));
  } catch (e) {
    if (e.status >= 400 && e.status < 500) { ls.del(LS_AUTH); setStatus('auth', 'Tu sesión venció. Volvé a iniciar sesión'); }
    throw e;
  }
}

async function authed(path, opts = {}) {
  const s = await validSession();
  if (!s) throw new SyncError('Iniciá sesión', 401);
  return request(path, { ...opts, token: s.access_token });
}

/* ---------- Cuenta ---------- */
export async function signUp(email, password) {
  const j = await request('/auth/v1/signup', { method: 'POST', body: { email, password } });
  if (j?.access_token) { saveSession(j); ls.set(LS_SYNC, {}); return { session: true }; }
  return { confirm: true };
}
export async function signIn(email, password) {
  saveSession(await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } }));
  ls.set(LS_SYNC, {});
}
export async function signOut() {
  try { await authed('/auth/v1/logout', { method: 'POST' }); } catch { /* igual se cierra */ }
  ls.del(LS_AUTH);
  ls.del(LS_SYNC);
  setStatus('idle');
}

/** ¿La nube ya tiene datos de esta cuenta? */
export async function remoteHasData() {
  const rows = await authed('/rest/v1/records?select=id&limit=1');
  return rows.length > 0;
}

/* ---------- Sincronizar ---------- */
let running = null;
let queued = false;

/** Sube lo pendiente y baja lo nuevo. Si ya hay una sincronización en curso, la repite al terminar. */
export function sync() {
  if (!isConfigured() || !session()) return Promise.resolve(0);
  if (!navigator.onLine) { setStatus('offline'); return Promise.resolve(0); }
  if (running) { queued = true; return running; }
  running = run().finally(() => {
    running = null;
    if (queued) { queued = false; sync(); }
  });
  return running;
}

async function run() {
  setStatus('syncing');
  try {
    const s = await validSession();
    if (!s) throw new SyncError('Iniciá sesión', 401);
    // 1) Subir cambios locales.
    const rows = dirtyRows();
    for (let i = 0; i < rows.length; i += 400) {
      const batch = rows.slice(i, i + 400);
      await authed('/rest/v1/records?on_conflict=user_id,kind,id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: batch.map(r => ({ ...r, user_id: s.user.id })),
      });
      await markSynced(batch);
    }
    // 2) Bajar lo que cambió en la nube desde la última vez.
    const info = syncInfo();
    let cursor = info.cursor || '1970-01-01T00:00:00Z';
    let pulled = 0;
    for (;;) {
      const page = await authed(`/rest/v1/records?select=kind,id,data,updated_at,deleted,server_ts&server_ts=gt.${encodeURIComponent(cursor)}&order=server_ts.asc&limit=1000`);
      if (!page.length) break;
      pulled += await applyRemote(page);
      cursor = page[page.length - 1].server_ts;
      if (page.length < 1000) break;
    }
    ls.set(LS_SYNC, { cursor, lastSync: new Date().toISOString() });
    setStatus('ok');
    return pulled;
  } catch (e) {
    setStatus(e.status === 401 ? 'auth' : e.status === 0 ? 'offline' : 'error', e.message);
    throw e;
  }
}

/** Primera vez en un dispositivo: reemplaza lo local por lo que hay en la nube. */
export async function replaceWithRemote() {
  await resetLocal();
  ls.set(LS_SYNC, {});
  return sync();
}

/* ---------- Sincronización automática ---------- */
let timer;
/** Programa una sincronización unos segundos después del último cambio. */
export function scheduleSync(delay = 3000) {
  if (!isConfigured() || !session()) return;
  clearTimeout(timer);
  timer = setTimeout(() => sync().catch(() => {}), delay);
}
