// Piezas de interfaz reutilizables.
import { getAccount, getCategory, getInvestment, getDebt } from './store.js';
import { icon } from './icons.js';
import { esc, money, signed } from './ui.js';
import { ACCOUNT_TYPES, INVEST_KINDS } from './constants.js';
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

/** Cómo se muestra un movimiento vinculado a una inversión o a un préstamo. */
export function linkInfo(t) {
  if (t.link?.kind === 'investment') {
    const i = getInvestment(t.link.id);
    const k = INVEST_KINDS[i?.kind] || INVEST_KINDS.otro;
    return { title: i?.name || 'Inversión', icon: k.icon, color: k.color, label: t.type === 'out' ? 'Inversión' : 'Retiro de inversión' };
  }
  const d = getDebt(t.link?.id);
  const start = t.link?.role === 'start';
  const owe = d?.direction === 'owe';
  const label = owe ? (start ? 'Préstamo recibido' : 'Pago de deuda') : (start ? 'Préstamo dado' : 'Cobro de préstamo');
  return { title: d?.name || 'Préstamo', icon: 'handshake', color: '#FFB547', label };
}

export function txItem(t) {
  const acc = getAccount(t.accountId);
  if (t.type === 'in' || t.type === 'out') {
    const L = linkInfo(t);
    return `<button class="item tap" data-tx="${t.id}">
      ${catIc(L)}
      <span class="info"><b>${esc(t.note || L.title)}</b><small>${L.label} · ${esc(acc?.name || '—')}</small></span>
      <span class="val">${t.type === 'in' ? '+' : '−'}${money(t.amount)}</span></button>`;
  }
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
  if (i.kind === 'plan') when = `Plan de compra · ${relDay(i.date) === 'hoy' ? 'te toca hoy' : relDay(i.date)} · ${dayMonth(i.date)}`;
  else if (i.kind === 'inv') when = i.matured ? `<span class="acc-c">Venció el ${dayMonth(i.date)} · cobralo</span>` : `Plazo fijo · vence ${relDay(i.date)} · ${dayMonth(i.date)}`;
  else if (i.overdue) when = `<span class="neg">Venció ${relDay(i.date)} · ${dayMonth(i.date)}</span>`;
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

/** Mini gráfico de línea. */
export function sparkline(vals, W = 120, H = 40) {
  if (vals.length < 2) return '';
  const min = Math.min(...vals), max = Math.max(...vals);
  const y = v => (max === min ? H / 2 : H - 4 - ((v - min) / (max - min)) * (H - 8));
  const pts = vals.map((v, i) => `${((i / (vals.length - 1)) * W).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const id = `sg${Math.random().toString(36).slice(2, 7)}`;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#00E5FF" stop-opacity=".35"/><stop offset="1" stop-color="#00E5FF" stop-opacity="0"/></linearGradient></defs>
    <polygon points="0,${H} ${pts} ${W},${H}" fill="url(#${id})"/>
    <polyline points="${pts}" fill="none" stroke="#00E5FF" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

/** Anillo de progreso (0 a 1). */
export function ring(p, size = 58, color = '#00E5FF', stroke = 6) {
  const r = (size - stroke) / 2, C = 2 * Math.PI * r, f = Math.max(0, Math.min(1, p));
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="#152030" stroke-width="${stroke}"/>
    <circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${(C * f).toFixed(1)} ${C.toFixed(1)}" style="filter:drop-shadow(0 0 4px ${color})"/></svg>`;
}

/** Ganancia con signo y porcentaje. */
export const gainText = (gain, pct) =>
  `<span class="${gain > 0 ? 'pos' : gain < 0 ? 'neg' : ''}">${gain > 0 ? '▲' : gain < 0 ? '▼' : ''} ${signed(gain)}${pct ? ` (${(pct * 100).toFixed(1).replace('.', ',')}%)` : ''}</span>`;

export const sheetHead = title =>
  `<div class="grab"></div><div class="sheet-head"><h2>${title}</h2><button class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button></div>`;
