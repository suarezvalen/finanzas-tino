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

export function shortDate(s) {
  const t = today();
  if (s === t) return 'Hoy';
  if (s === addDays(t, -1)) return 'Ayer';
  const d = parseYmd(s);
  const o = { day: 'numeric', month: 'short' };
  if (d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
  return d.toLocaleDateString('es-AR', o);
}
