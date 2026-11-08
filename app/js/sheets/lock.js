// Bloqueo con PIN (y Face ID / huella si el dispositivo lo permite).
// El PIN se guarda solo en este dispositivo, como huella (hash) con sal: nunca en texto ni en la nube.
import { icon } from '../icons.js';
import { openSheet, toast } from '../ui.js';
import { sheetHead } from '../components.js';

const LS = 'ft-lock';
const read = () => { try { return JSON.parse(localStorage.getItem(LS)) || null; } catch { return null; } };
const write = v => { try { v ? localStorage.setItem(LS, JSON.stringify(v)) : localStorage.removeItem(LS); } catch { /* sin almacenamiento */ } };
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const rand = n => crypto.getRandomValues(new Uint8Array(n));

async function hash(pin, salt) {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  return b64(await crypto.subtle.digest('SHA-256', data));
}

export const lockEnabled = () => !!read()?.hash;
export const lockSettings = () => read() || {};
export const TIMEOUTS = { 0: 'Al salir de la app', 1: 'Después de 1 minuto', 5: 'Después de 5 minutos' };

export async function setPin(pin) {
  const salt = b64(rand(16));
  write({ ...read(), salt, hash: await hash(pin, salt), timeout: read()?.timeout ?? 1 });
}
export const disableLock = () => write(null);
export const setLockTimeout = t => write({ ...read(), timeout: t });
const checkPin = async pin => { const s = read(); return !!s && (await hash(pin, s.salt)) === s.hash; };

/* ---------- Face ID / huella (WebAuthn, solo local) ---------- */
export async function biometricAvailable() {
  try { return !!window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch { return false; }
}
export async function enableBiometric() {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: rand(32),
      rp: { name: 'Finanzas Tino', id: location.hostname },
      user: { id: rand(16), name: 'finanzas', displayName: 'Finanzas Tino' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000,
    },
  });
  write({ ...read(), credId: b64(cred.rawId) });
}
export const disableBiometric = () => { const s = read(); if (s) { delete s.credId; write(s); } };
async function verifyBiometric() {
  const s = read();
  if (!s?.credId) return false;
  try {
    await navigator.credentials.get({
      publicKey: { challenge: rand(32), rpId: location.hostname, allowCredentials: [{ type: 'public-key', id: unb64(s.credId) }], userVerification: 'required', timeout: 60000 },
    });
    return true;
  } catch { return false; }
}

/* ---------- Pantalla de bloqueo ---------- */
let locked = false;
let hiddenAt = 0;
export const isLocked = () => locked;

/** Muestra la pantalla de bloqueo (si el PIN está activo). */
export function lockNow(onForgot) {
  if (!lockEnabled() || locked) return;
  locked = true;
  const el = document.createElement('div');
  el.className = 'lock';
  document.getElementById('app').append(el);
  let pin = '', fails = 0, waitUntil = 0;
  const bio = !!read()?.credId;

  el.innerHTML = `
    <div class="lock-body">
      <img class="ob-logo" src="icons/icon-192.png" alt="">
      <h2>Ingresá tu PIN</h2>
      <div class="pin-dots" id="pd">${'<i></i>'.repeat(4)}</div>
      <p class="lock-msg" id="lm"></p>
    </div>
    <div class="keypad lock-pad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', bio ? 'bio' : '', '0', 'del'].map(k =>
      k ? `<button data-k="${k}" aria-label="${k === 'del' ? 'Borrar' : k === 'bio' ? 'Face ID' : k}">${k === 'del' ? icon('delete') : k === 'bio' ? icon('shield-check') : k}</button>` : '<span></span>').join('')}</div>
    <button class="link lock-forgot" data-forgot>Olvidé mi PIN</button>`;

  const dots = () => el.querySelectorAll('#pd i').forEach((d, i) => d.classList.toggle('on', i < pin.length));
  const msg = t => { el.querySelector('#lm').textContent = t; };
  const unlock = () => { locked = false; el.classList.add('out'); setTimeout(() => el.remove(), 300); };
  const tryBio = async () => { if (await verifyBiometric()) unlock(); };

  async function press(k) {
    if (Date.now() < waitUntil) return;
    if (k === 'del') pin = pin.slice(0, -1);
    else if (k === 'bio') return tryBio();
    else if (pin.length < 4) pin += k;
    dots();
    if (pin.length === 4) {
      if (await checkPin(pin)) return unlock();
      fails++;
      pin = '';
      el.querySelector('#pd').classList.add('shake');
      setTimeout(() => { el.querySelector('#pd')?.classList.remove('shake'); dots(); }, 450);
      if (fails >= 5) { waitUntil = Date.now() + 30000; msg('Demasiados intentos. Esperá 30 segundos.'); setTimeout(() => msg(''), 30000); }
      else msg('PIN incorrecto');
    }
  }
  el.onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.k) press(b.dataset.k);
    else if ('forgot' in b.dataset) onForgot?.();
  };
  const onKey = e => {
    if (!locked) { document.removeEventListener('keydown', onKey); return; }
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') press('del');
  };
  document.addEventListener('keydown', onKey);
  if (bio) setTimeout(tryBio, 400);
}

/** Bloquea al volver a la app si pasó el tiempo configurado. */
export function watchVisibility(onForgot) {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
    const t = (read()?.timeout ?? 1) * 60000;
    if (hiddenAt && Date.now() - hiddenAt >= t) lockNow(onForgot);
  });
}

/* ---------- Configurar PIN ---------- */
export function openPinSetup(onDone) {
  let first = '', pin = '';
  openSheet({
    render(el, ctl) {
      el.innerHTML = `${sheetHead(first ? 'Repetí el PIN' : 'Elegí un PIN de 4 números')}
        <div class="pin-dots big" id="pd">${'<i></i>'.repeat(4)}</div>
        <p class="lock-msg" id="lm">${first ? 'Para confirmar' : 'Lo vas a usar para abrir la app'}</p>
        <div class="keypad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map(k =>
          k ? `<button data-k="${k}">${k === 'del' ? icon('delete') : k}</button>` : '<span></span>').join('')}</div>`;
      el.onclick = async e => {
        const b = e.target.closest('button');
        if (!b) return;
        if ('close' in b.dataset) return ctl.close();
        const k = b.dataset.k;
        if (!k) return;
        pin = k === 'del' ? pin.slice(0, -1) : (pin + k).slice(0, 4);
        el.querySelectorAll('#pd i').forEach((d, i) => d.classList.toggle('on', i < pin.length));
        if (pin.length < 4) return;
        if (!first) { first = pin; pin = ''; return setTimeout(() => ctl.refresh(), 150); }
        if (pin !== first) { toast('No coinciden. Probá de nuevo', { icon: 'info' }); first = ''; pin = ''; return setTimeout(() => ctl.refresh(), 150); }
        await setPin(pin);
        ctl.close();
        toast('PIN activado', { icon: 'shield-check' });
        onDone?.();
      };
    },
  });
}
