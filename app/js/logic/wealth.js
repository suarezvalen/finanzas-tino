// Inversiones, deudas, metas y patrimonio neto.
import { txs, accounts, balance, investments, debts, getAccount, getInvestment } from '../store.js';
import { today, curYm, addMonths, daysInMonth, pad, addDays, parseYmd, daysUntil } from '../dates.js';

/** Movimientos de plata vinculados a una inversión o a un préstamo. */
export const linked = (kind, id) => txs().filter(t => t.link?.kind === kind && t.link.id === id);
const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 86400000);

/* ---------- Plazo fijo ---------- */
export const pfEnd = i => addDays(i.startDate, i.days);
export const pfInterestTotal = i => Math.round(i.capital * (i.tna / 100) * (i.days / 365));
export const pfTotal = i => i.capital + pfInterestTotal(i);
export function pfInterestAt(i, date = today()) {
  const d = Math.max(0, Math.min(daysBetween(i.startDate, date), i.days));
  return Math.round(i.capital * (i.tna / 100) * (d / 365));
}
export const pfMatured = i => i.kind === 'plazo_fijo' && !i.closedAt && pfEnd(i) <= today();

/* ---------- Inversiones ---------- */
/** Plata puesta (aportes − retiros), sin contar ganancias. */
export function invested(i, upTo = today()) {
  let v = i.initialInvested || 0;
  for (const t of linked('investment', i.id)) if (t.date <= upTo) v += t.type === 'out' ? t.amount : -t.amount;
  return v;
}

/** Valor de la inversión en una fecha. */
export function valueAt(i, date = today()) {
  if (date < (i.startDate || '')) return 0;
  if (i.closedAt && date >= i.closedAt) return 0;
  if (i.kind === 'plazo_fijo') return i.capital + pfInterestAt(i, date);
  // Último valor informado + aportes/retiros posteriores.
  const vals = (i.valuations || []).filter(v => v.date <= date)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.at || '').localeCompare(b.at || ''));
  const last = vals[vals.length - 1];
  let v = last ? last.value : 0;
  for (const t of linked('investment', i.id)) {
    if (t.date > date) continue;
    const after = !last || t.date > last.date || (t.date === last.date && (t.createdAt || '') > (last.at || ''));
    if (after) v += t.type === 'out' ? t.amount : -t.amount;
  }
  return Math.max(0, v);
}

export function investStats(i) {
  const value = valueAt(i);
  const inv = invested(i);
  const gain = value - inv;
  const base = (i.initialInvested || 0) + linked('investment', i.id).filter(t => t.type === 'out').reduce((s, t) => s + t.amount, 0);
  return { value, invested: inv, gain, pct: base > 0 ? gain / base : 0 };
}

/** Días desde la última actualización de valor (null si es plazo fijo). */
export function staleDays(i) {
  if (i.kind === 'plazo_fijo') return null;
  const last = (i.valuations || []).map(v => v.date).sort().pop();
  return last ? -daysUntil(last) : null;
}

export const activeInvestments = () => investments().filter(i => !i.closedAt);

/* ---------- Deudas y préstamos ---------- */
export function debtPaid(d, upTo = today()) {
  return (d.paidBefore || 0) + linked('debt', d.id)
    .filter(t => t.link.role === 'payment' && t.date <= upTo)
    .reduce((s, t) => s + t.amount, 0);
}
export const debtRemaining = (d, upTo = today()) => (d.date > upTo ? 0 : Math.max(0, d.amount - debtPaid(d, upTo)));
export const debtSettled = d => debtRemaining(d) === 0;

/* ---------- Metas ---------- */
export function goalSaved(g) {
  if (g.source === 'account') {
    const a = getAccount(g.sourceId);
    return a && !a.deleted ? Math.max(0, balance(a)) : 0;
  }
  if (g.source === 'investment') {
    const i = getInvestment(g.sourceId);
    return i && !i.deleted ? valueAt(i) : 0;
  }
  return (g.entries || []).reduce((s, e) => s + e.amount, 0);
}
export function goalPlan(g) {
  const saved = goalSaved(g);
  const left = Math.max(0, g.target - saved);
  let perMonth = null, monthsLeft = null;
  if (g.deadline && left > 0) {
    monthsLeft = Math.max(1, Math.ceil(daysUntil(g.deadline) / 30.44));
    perMonth = left / monthsLeft;
  }
  return { saved, left, pct: g.target ? saved / g.target : 0, perMonth, monthsLeft, overdue: !!g.deadline && left > 0 && g.deadline < today() };
}

/* ---------- Patrimonio ---------- */
export function wealthAt(date = today()) {
  const accs = accounts().reduce((s, a) => s + balance(a, date), 0);
  const inv = investments().reduce((s, i) => s + valueAt(i, date), 0);
  let owed = 0, owe = 0;
  for (const d of debts()) {
    const r = debtRemaining(d, date);
    if (d.direction === 'owed') owed += r; else owe += r;
  }
  return { accs, inv, owed, owe, net: accs + inv + owed - owe };
}

export function netWorthSeries(months = 6) {
  const cur = curYm();
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const ym = addMonths(cur, -i);
    out.push(wealthAt(i === 0 ? today() : `${ym}-${pad(daysInMonth(ym))}`).net);
  }
  return out;
}

export function investSeries(months = 6) {
  const cur = curYm();
  const out = [];
  for (let k = months - 1; k >= 0; k--) {
    const ym = addMonths(cur, -k);
    const date = k === 0 ? today() : `${ym}-${pad(daysInMonth(ym))}`;
    out.push(investments().reduce((s, i) => s + valueAt(i, date), 0));
  }
  return out;
}
