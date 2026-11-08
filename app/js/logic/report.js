// Reportes por período (mes, 3 y 6 meses, año o rango), con ajuste opcional por inflación.
import { txs, getCategory, getAccount } from '../store.js';
import { today, curYm, addMonths, daysInMonth, pad, monthName, cap, shortDate, addDays, parseYmd, MONTHS_SHORT } from '../dates.js';
import { factorTo, periodInflation } from './inflation.js';
import { wealthAt } from './wealth.js';

export const PERIOD_KINDS = { month: 'Mes', m3: '3 meses', m6: '6 meses', year: 'Año', range: 'Rango' };
const NO_CAT = { name: 'Sin categoría', icon: 'shapes', color: '#8A9AA8' };

const monthEnd = ym => `${ym}-${pad(daysInMonth(ym))}`;
const monthsBetween = (a, b) => { const out = []; for (let m = a; m <= b; m = addMonths(m, 1)) out.push(m); return out; };
const days = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 86400000) + 1;
export function shortYm(ym, withYear) {
  const s = MONTHS_SHORT[Number(ym.slice(5)) - 1];
  return withYear ? `${s} ${ym.slice(2, 4)}` : s;
}

/** Arma el período. `anchor` es el mes de referencia ('AAAA-MM'); `range` = { from, to } para el rango libre. */
export function makePeriod(kind, anchor, range) {
  let months, from, to, label;
  if (kind === 'month') {
    months = [anchor];
    label = cap(monthName(anchor));
  } else if (kind === 'm3' || kind === 'm6') {
    const n = kind === 'm3' ? 3 : 6;
    months = monthsBetween(addMonths(anchor, -(n - 1)), anchor);
    const y = months[0].slice(0, 4) !== anchor.slice(0, 4) || anchor.slice(0, 4) !== curYm().slice(0, 4);
    label = `${cap(shortYm(months[0], y))} – ${shortYm(anchor, y)}`;
  } else if (kind === 'year') {
    const y = anchor.slice(0, 4);
    months = monthsBetween(`${y}-01`, `${y}-12`);
    label = `Año ${y}`;
  } else {
    from = range.from <= range.to ? range.from : range.to;
    to = range.from <= range.to ? range.to : range.from;
    months = monthsBetween(from.slice(0, 7), to.slice(0, 7));
    label = `${shortDate(from)} – ${shortDate(to)}`;
  }
  from ||= `${months[0]}-01`;
  to ||= monthEnd(months[months.length - 1]);
  const cur = curYm();
  // Etiqueta larga (para el PDF): "Junio a noviembre de 2026".
  const first = months[0], last = months[months.length - 1];
  const longLabel = kind === 'range' ? `Del ${shortDate(from)} al ${shortDate(to)} de ${to.slice(0, 4)}`
    : months.length === 1 ? cap(monthName(first))
    : first.slice(0, 4) === last.slice(0, 4) ? `${cap(monthName(first, { month: 'long' }))} a ${monthName(last)}`
    : `${cap(monthName(first))} a ${monthName(last)}`;
  return { kind, anchor, range, from, to, months, elapsed: months.filter(m => m <= cur), label, longLabel };
}

/** El período inmediatamente anterior, del mismo largo. */
export function prevPeriod(p) {
  if (p.kind === 'month') return makePeriod('month', addMonths(p.anchor, -1));
  if (p.kind === 'm3') return makePeriod('m3', addMonths(p.anchor, -3));
  if (p.kind === 'm6') return makePeriod('m6', addMonths(p.anchor, -6));
  if (p.kind === 'year') return makePeriod('year', addMonths(p.anchor, -12));
  const len = days(p.from, p.to);
  const to = addDays(p.from, -1);
  return makePeriod('range', null, { from: addDays(to, -(len - 1)), to });
}

const firstYm = () => txs().reduce((min, t) => (t.date < min ? t.date : min), '9999').slice(0, 7);
const sumInto = (map, key, v) => map.set(key, (map.get(key) || 0) + v);

/** Totales del período. Con `real`, todo en pesos de hoy según la inflación. */
export function buildReport(p, real = false) {
  const list = txs().filter(t => t.date >= p.from && t.date <= p.to);
  const adj = t => (real ? t.amount * factorTo(t.date.slice(0, 7)) : t.amount);
  let income = 0, expense = 0;
  const byCat = new Map(), byInc = new Map(), byAcc = new Map(), catMonth = new Map();
  const byMonth = new Map(p.months.map(m => [m, { ym: m, income: 0, expense: 0 }]));
  const expenses = [];
  for (const t of list) {
    const ym = t.date.slice(0, 7);
    if (t.type === 'expense') {
      const v = adj(t);
      expense += v;
      sumInto(byCat, t.categoryId, v);
      sumInto(byAcc, t.accountId, v);
      byMonth.get(ym).expense += v;
      if (!catMonth.has(t.categoryId)) catMonth.set(t.categoryId, new Map());
      sumInto(catMonth.get(t.categoryId), ym, v);
      expenses.push({ t, v });
    } else if (t.type === 'income') {
      const v = adj(t);
      income += v;
      sumInto(byInc, t.categoryId, v);
      byMonth.get(ym).income += v;
    }
  }
  const end = p.to < today() ? p.to : today();
  const elapsedDays = p.from > today() ? 0 : days(p.from, end);
  const toArr = (map, get) => [...map].map(([id, v]) => ({ id, v, ...get(id) })).sort((a, b) => b.v - a.v);
  return {
    p, real, list, income, expense,
    savings: income - expense,
    rate: income > 0 ? (income - expense) / income : null,
    byCat: toArr(byCat, id => ({ cat: getCategory(id) || NO_CAT })),
    byInc: toArr(byInc, id => ({ cat: getCategory(id) || NO_CAT })),
    byAcc: toArr(byAcc, id => ({ acc: getAccount(id) })),
    catMonth,
    months: [...byMonth.values()],
    top: expenses.sort((a, b) => b.v - a.v).slice(0, 5),
    elapsedDays,
    // Para promedios: solo los meses desde que empezaste a cargar datos.
    monthsCount: Math.max(1, p.elapsed.filter(m => m >= firstYm()).length),
  };
}

/** Totales mes a mes (para el gráfico de evolución). */
export function monthlySeries(months, real = false) {
  return months.map(ym => {
    let income = 0, expense = 0;
    for (const t of txs()) {
      if (!t.date.startsWith(ym)) continue;
      const v = real ? t.amount * factorTo(ym) : t.amount;
      if (t.type === 'income') income += v; else if (t.type === 'expense') expense += v;
    }
    return { ym, income, expense };
  });
}

/** Meses del gráfico de evolución: para un mes, los 6 anteriores; para el resto, los del período. */
export const chartMonths = p => (p.kind === 'month' ? monthsBetween(addMonths(p.anchor, -5), p.anchor) : p.months);

/** Patrimonio neto a fin de cada mes (sin meses futuros). */
export function netSeries(months, real = false) {
  const cur = curYm();
  return months.filter(m => m <= cur).map(ym => {
    const date = ym === cur ? today() : monthEnd(ym);
    const v = wealthAt(date).net;
    return { ym, v: real ? v * factorTo(ym) : v };
  });
}

/** Cambio porcentual (null si no hay base). */
export const change = (now, before) => (before > 0 ? (now - before) / before : null);

/** Categorías que más cambiaron respecto del período anterior. */
export function categoryChanges(r, prev) {
  const ids = new Set([...r.byCat.map(x => x.id), ...prev.byCat.map(x => x.id)]);
  const get = (arr, id) => arr.find(x => x.id === id)?.v || 0;
  return [...ids].map(id => {
    const now = get(r.byCat, id), before = get(prev.byCat, id);
    return { id, cat: getCategory(id) || NO_CAT, now, before, diff: now - before, pct: change(now, before) };
  }).filter(x => Math.abs(x.diff) > 0).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}

export function inflationFor(p) {
  const cur = curYm();
  const last = p.months[p.months.length - 1] <= cur ? p.months[p.months.length - 1] : cur;
  return p.months[0] > cur ? null : periodInflation(p.months[0], last);
}

