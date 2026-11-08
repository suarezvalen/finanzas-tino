// Utilidades de interfaz: formato de montos, avisos y paneles deslizables.
import { state } from './store.js';
import { icon } from './icons.js';

const nf = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const nfPlain = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

/** Monto siempre visible (para el teclado de carga). */
export const fmtMoney = v => nf.format(Math.round(v));
export const fmtNum = v => nfPlain.format(Math.round(v));
/** Monto que respeta "ocultar montos". */
export const money = v => (state.settings.hideAmounts ? '$ ••••' : nf.format(Math.round(v)));
export const signed = v => (v > 0 ? '+' : v < 0 ? '−' : '') + money(Math.abs(v));
export const parseAmount = s => Number(String(s).replace(/\D/g, '')) || 0;

export const esc = s =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const normalize = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Formatea un input de monto mientras se escribe (1.234.567). */
export function amountInput(input, onChange) {
  input.addEventListener('input', () => {
    const n = parseAmount(input.value);
    input.value = n ? fmtNum(n) : '';
    onChange?.(input.value);
  });
}

/** Lleva a la vista el chip seleccionado dentro de una fila con scroll horizontal. */
export function ensureVisible(container) {
  const on = container?.querySelector('.on');
  if (!on) return;
  const left = on.offsetLeft - 16;
  const right = on.offsetLeft + on.offsetWidth - container.clientWidth + 16;
  if (container.scrollLeft > left) container.scrollLeft = left;
  else if (container.scrollLeft < right) container.scrollLeft = right;
}

export function mark(group, btn) {
  group.querySelectorAll('.on').forEach(x => x.classList.remove('on'));
  btn.classList.add('on');
  if (group.scrollWidth > group.clientWidth) ensureVisible(group);
}

/* ---------- Avisos ---------- */
let toastTimer;
export function toast(msg, { icon: ic = 'circle-check', action } = {}) {
  const t = document.getElementById('toast');
  t.innerHTML = `${icon(ic)}<span>${esc(msg)}</span>${action ? `<button class="toast-act">${esc(action.label)}</button>` : ''}`;
  if (action) t.querySelector('.toast-act').onclick = () => { t.classList.remove('show'); action.fn(); };
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), action ? 5000 : 2300);
}

/* ---------- Paneles deslizables (bottom sheets) ---------- */
const stack = [];

export function openSheet({ render, full = false, live = false, cls = '', onClose }) {
  const app = document.getElementById('app');
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  const el = document.createElement('div');
  el.className = `sheet${full ? ' full' : ''}${cls ? ' ' + cls : ''}`;
  el.setAttribute('role', 'dialog');
  app.append(scrim, el);

  const ctl = {
    el,
    live,
    refresh: () => { const top = el.scrollTop; render(el, ctl); el.scrollTop = top; },
    close,
  };
  function close() {
    const i = stack.indexOf(ctl);
    if (i < 0) return;
    stack.splice(i, 1);
    scrim.classList.remove('open');
    el.classList.remove('open');
    setTimeout(() => { scrim.remove(); el.remove(); }, 380);
    onClose?.();
  }
  scrim.onclick = close;

  // Deslizar hacia abajo desde la parte superior para cerrar.
  let startY = null, dy = 0;
  el.addEventListener('touchstart', e => {
    if (!e.target.closest('.grab, .sheet-head, .tx-head')) return;
    if (e.target.closest('button, input')) return;
    startY = e.touches[0].clientY; dy = 0; el.style.transition = 'none';
  }, { passive: true });
  el.addEventListener('touchmove', e => {
    if (startY === null) return;
    dy = Math.max(0, e.touches[0].clientY - startY);
    el.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  el.addEventListener('touchend', () => {
    if (startY === null) return;
    el.style.transition = ''; el.style.transform = '';
    startY = null;
    if (dy > 90) close();
  });

  render(el, ctl);
  stack.push(ctl);
  el.getBoundingClientRect();
  scrim.classList.add('open');
  el.classList.add('open');
  return ctl;
}

export const refreshSheets = () => stack.forEach(s => s.live && s.refresh());
export const topSheet = () => stack[stack.length - 1];

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && stack.length) topSheet().close();
});

/* ---------- Archivos ---------- */
export async function saveFile(name, content, type) {
  const blob = new Blob([content], { type });
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare) {
    const file = new File([blob], name, { type });
    if (navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
