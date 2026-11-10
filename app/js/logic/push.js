// Notificaciones push: este dispositivo se registra y el robot de GitHub le manda los avisos.
// La suscripción se guarda como un registro más (tipo 'push') y viaja a la nube con la sincronización.
import { state, upsert, remove } from '../store.js';
import { PUSH_PUBLIC_KEY } from '../constants.js';
import { session, sync } from './sync.js';

export function deviceId() {
  try {
    let id = localStorage.getItem('ft-device');
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('ft-device', id); }
    return id;
  } catch { return 'sin-id'; }
}

const standalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

/** 'ok' | 'install' (hay que instalar la app en el iPhone) | 'unsupported' */
export function pushSupported() {
  const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (ok) return 'ok';
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone() ? 'install' : 'unsupported';
}

export const pushEnabled = () =>
  pushSupported() === 'ok' && Notification.permission === 'granted' && state.push.some(p => p.id === deviceId() && !p.deleted);

function keyToBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

export async function enablePush() {
  if (pushSupported() !== 'ok') throw new Error('Este dispositivo no permite notificaciones');
  if (!session()) throw new Error('Primero activá la sincronización (Más → Sincronización): el robot lee tus alertas desde ahí');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('No diste permiso. Podés activarlo en Ajustes del iPhone → Notificaciones → Finanzas');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())
    || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(PUSH_PUBLIC_KEY) });
  const json = sub.toJSON();
  await upsert('push', { id: deviceId(), endpoint: json.endpoint, keys: json.keys, device: navigator.userAgent.slice(0, 120) });
  await sync().catch(() => {});
}

export async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    await (await reg.pushManager.getSubscription())?.unsubscribe();
  } catch { /* nada */ }
  await remove('push', deviceId());
  await sync().catch(() => {});
}
