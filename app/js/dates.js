// Fechas como texto 'AAAA-MM-DD' en hora local.
export const pad = n => String(n).padStart(2, '0');
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());
export const curYm = () => today().slice(0, 7);
export const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(s, n) {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}
export function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
export function monthName(ym, opts = { month: 'long', year: 'numeric' }) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('es-AR', opts);
}
export function monthTitle(ym) {
  const [y] = ym.split('-').map(Number);
  const name = monthName(ym, { month: 'long' });
  return cap(y === new Date().getFullYear() ? name : `${name} ${y}`);
}

export function dayLabel(s) {
  const t = today();
  if (s === t) return 'Hoy';
  if (s === addDays(t, -1)) return 'Ayer';
  if (s === addDays(t, 1)) return 'Mañana';
  const d = parseYmd(s);
  const o = { weekday: 'long', day: 'numeric', month: 'short' };
  if (d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
  return cap(d.toLocaleDateString('es-AR', o));
}

/** Misma fecha N meses después (si el día no existe, el último del mes). */
export function addMonthsToDate(s, n) {
  const ym = addMonths(s.slice(0, 7), n);
  return `${ym}-${pad(Math.min(Number(s.slice(8)), daysInMonth(ym)))}`;
}
/** Día del mes acotado a la cantidad de días del mes. */
export const dayIn = (ym, d) => `${ym}-${pad(Math.min(d, daysInMonth(ym)))}`;
export const dayMonth = s => `${Number(s.slice(8))}/${Number(s.slice(5, 7))}`;
export const daysUntil = s => Math.round((parseYmd(s) - parseYmd(today())) / 86400000);
export function relDay(s) {
  const n = daysUntil(s);
  if (n === 0) return 'hoy';
  if (n === 1) return 'mañana';
  if (n === -1) return 'ayer';
  return n > 0 ? `en ${n} días` : `hace ${-n} días`;
}
export const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function shortDate(s) {
  const t = today();
  if (s === t) return 'Hoy';
  if (s === addDays(t, -1)) return 'Ayer';
  const d = parseYmd(s);
  const o = { day: 'numeric', month: 'short' };
  if (d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
  return d.toLocaleDateString('es-AR', o);
}
