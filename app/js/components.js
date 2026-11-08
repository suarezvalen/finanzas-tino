// Piezas de interfaz reutilizables.
import { getAccount, getCategory } from './store.js';
import { icon } from './icons.js';
import { esc, money, signed } from './ui.js';
import { ACCOUNT_TYPES } from './constants.js';
import { dayMonth, relDay } from './dates.js';

const NO_CAT = { name: 'Sin categoría', icon: 'shapes', color: '#8A9AA8' };

export function catIc(c, cls = '') {
  return `<span class="cat-ic ${cls}" style="--c:${c.color}">${icon(c.icon)}</span>`;
}

function tags(t) {
  let s = '';
  if (t.installment) s += `<span class="tag">${t.installment.n}/${t.installment.total}</span>`;
  if (t.recurringId) s += `<span class="tag">Fijo</span>`;
  return s;
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
    <span class="info"><b><span class="ell">${esc(t.note || c.name)}</span>${tags(t)}</b><small>${esc(c.name)} · ${esc(acc?.name || '—')}</small></span>
    <span class="val ${v > 0 ? 'pos' : ''}">${signed(v)}</span></button>`;
}

/** Fila de "próximos vencimientos". */
export function upcomingItem(i) {
  let when;
  if (i.overdue) when = `<span class="neg">Venció ${relDay(i.date)} · ${dayMonth(i.date)}</span>`;
  else if (i.auto) when = `Se registra solo ${relDay(i.date)} · ${dayMonth(i.date)}`;
  else if (i.estimate) when = `Vence ${relDay(i.date)} · ${dayMonth(i.date)} · resumen en curso`;
  else when = `${i.type === 'income' ? 'Cobrás' : 'Vence'} ${relDay(i.date)} · ${dayMonth(i.date)}`;
  const urgent = i.overdue ? '<span class="tag neg-tag">Vencido</span>' : '';
  return `<button class="item tap" data-up="${i.kind}|${i.id}|${i.ym || ''}">
    ${catIc({ icon: i.icon, color: i.color })}
    <span class="info"><b><span class="ell">${esc(i.title)}</span>${urgent}</b><small>${when}</small></span>
    <span class="val ${i.type === 'income' ? 'pos' : ''}">${i.estimate ? '≈ ' : ''}${money(i.amount)}</span></button>`;
}

export const accIcon = a => ACCOUNT_TYPES[a.type]?.icon || 'wallet';

/** Grilla de categorías para elegir (2 filas con scroll horizontal). */
export function catGrid(cats, selected) {
  return `<div class="cats" id="g-cat">${cats.map(c =>
    `<button class="cat ${selected === c.id ? 'on' : ''}" data-cat="${c.id}">${catIc(c)}<span class="cat-name">${esc(c.name)}</span></button>`).join('')}</div>`;
}

export function accChips(list, selected, attr = 'acc', id = 'g-acc') {
  return `<div class="chips" id="${id}">${list.map(a =>
    `<button class="chip ${selected === a.id ? 'on' : ''}" data-${attr}="${a.id}">${icon(accIcon(a))}${esc(a.name)}</button>`).join('')}</div>`;
}

export function monthSwitcher(label, disabled = false) {
  return `<div class="month-sw ${disabled ? 'disabled' : ''}">
    <button data-m="-1" aria-label="Mes anterior">${icon('chevron-left')}</button>
    <b>${esc(label)}</b>
    <button data-m="1" aria-label="Mes siguiente">${icon('chevron-right')}</button></div>`;
}

export function empty(ic, title, text) {
  return `<div class="empty">${icon(ic, 'empty-ic')}<b>${esc(title)}</b><small>${text}</small></div>`;
}

export const sheetHead = title =>
  `<div class="grab"></div><div class="sheet-head"><h2>${title}</h2><button class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button></div>`;
