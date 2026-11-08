// Piezas de interfaz reutilizables.
import { getAccount, getCategory } from './store.js';
import { icon } from './icons.js';
import { esc, money, signed } from './ui.js';
import { ACCOUNT_TYPES } from './constants.js';

const NO_CAT = { name: 'Sin categoría', icon: 'shapes', color: '#8A9AA8' };

export function catIc(c, cls = '') {
  return `<span class="cat-ic ${cls}" style="--c:${c.color}">${icon(c.icon)}</span>`;
}

export function txItem(t) {
  const acc = getAccount(t.accountId);
  if (t.type === 'transfer') {
    const to = getAccount(t.toAccountId);
    return `<button class="item tap" data-tx="${t.id}">
      ${catIc({ icon: 'arrow-left-right', color: '#5CC8FF' })}
      <span class="info"><b>${esc(t.note || 'Transferencia')}</b><small>${esc(acc?.name || '—')} → ${esc(to?.name || '—')}</small></span>
      <span class="val">${money(t.amount)}</span></button>`;
  }
  const c = getCategory(t.categoryId) || NO_CAT;
  const v = t.type === 'income' ? t.amount : -t.amount;
  return `<button class="item tap" data-tx="${t.id}">
    ${catIc(c)}
    <span class="info"><b>${esc(t.note || c.name)}</b><small>${esc(c.name)} · ${esc(acc?.name || '—')}</small></span>
    <span class="val ${v > 0 ? 'pos' : ''}">${signed(v)}</span></button>`;
}

export const accIcon = a => ACCOUNT_TYPES[a.type]?.icon || 'wallet';

export function monthSwitcher(label, disabled = false) {
  return `<div class="month-sw ${disabled ? 'disabled' : ''}">
    <button data-m="-1" aria-label="Mes anterior">${icon('chevron-left')}</button>
    <b>${esc(label)}</b>
    <button data-m="1" aria-label="Mes siguiente">${icon('chevron-right')}</button></div>`;
}

export function empty(ic, title, text) {
  return `<div class="empty">${icon(ic, 'empty-ic')}<b>${esc(title)}</b><small>${text}</small></div>`;
}
