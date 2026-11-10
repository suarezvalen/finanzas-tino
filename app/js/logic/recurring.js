// Pagos recurrentes y lista de próximos vencimientos.
import { txs, recurrings, accounts, getAccount, getCategory, upsertMany } from '../store.js';
import { today, curYm, addMonths, addDays, dayIn } from '../dates.js';
import { cardStatus } from './cards.js';
import { activeInvestments, pfEnd, pfTotal, debtRemaining } from './wealth.js';
import { debts } from '../store.js';
import { INVEST_KINDS } from '../constants.js';
import { planDue } from './alerts-core.js';
import { alertRules } from '../store.js';

/** Fecha en la que toca un pago recurrente en un mes dado (o null si ese mes no corresponde). */
export function occurrence(r, ym) {
  if (r.frequency === 'yearly' && Number(ym.slice(5)) !== r.month) return null;
  return dayIn(ym, r.day);
}

/** Próxima fecha del pago a partir de una fecha (incluida). */
export function nextOccurrence(r, from = today()) {
  for (let i = 0; i < 14; i++) {
    const d = occurrence(r, addMonths(from.slice(0, 7), i));
    if (d && d >= from) return d;
  }
  return null;
}

export const isDone = (r, ym) =>
  (r.skipped || []).includes(ym) || txs().some(t => t.recurringId === r.id && t.date.startsWith(ym));

const usable = r => r.active !== false && getAccount(r.accountId) && !getAccount(r.accountId).deleted;

/** Registra solos los pagos marcados como automáticos que ya vencieron (hasta 2 meses atrás). */
export async function runAutoRecurring() {
  const t = today(), cur = curYm();
  const created = [];
  for (const r of recurrings()) {
    if (!r.auto || !usable(r)) continue;
    for (let i = 2; i >= 0; i--) {
      const ym = addMonths(cur, -i);
      const d = occurrence(r, ym);
      if (!d || d > t || d < (r.startDate || '') || isDone(r, ym)) continue;
      created.push({ type: r.type, amount: r.amount, date: d, note: r.name, categoryId: r.categoryId, accountId: r.accountId, recurringId: r.id });
    }
  }
  if (created.length) await upsertMany('transactions', created);
  return created.length;
}

/**
 * Lo que vence pronto: resúmenes de tarjeta y pagos recurrentes sin registrar.
 * Cada ítem: { kind: 'card'|'rec', id, ym?, title, date, amount, overdue, auto, estimate, type, icon, color }
 */
export function upcomingItems(horizon = 30) {
  const t = today(), end = addDays(t, horizon);
  const items = [];

  for (const card of accounts().filter(a => a.type === 'credit')) {
    const s = cardStatus(card);
    if (!s.configured) continue;
    const base = { kind: 'card', id: card.id, title: `Resumen ${card.name}`, icon: 'credit-card', color: '#FFC24D', type: 'expense' };
    if (s.toPay > 0) items.push({ ...base, date: s.lastDue, amount: s.toPay, overdue: s.overdue });
    else if (s.openAmt > 0 && s.nextDue <= end) items.push({ ...base, date: s.nextDue, amount: s.openAmt, estimate: true });
  }

  for (const r of recurrings()) {
    if (!usable(r)) continue;
    for (let i = 1; i >= -1; i--) {
      const ym = addMonths(curYm(), -i);
      const d = occurrence(r, ym);
      if (!d || d < (r.startDate || '') || d > end || isDone(r, ym)) continue;
      if (r.auto && d <= t) continue; // ya se registra solo
      const c = getCategory(r.categoryId);
      items.push({
        kind: 'rec', id: r.id, ym, title: r.name, date: d, amount: r.amount, overdue: d < t,
        auto: !!r.auto, type: r.type, icon: c?.icon || 'repeat', color: c?.color || '#94A3FF',
      });
    }
  }
  // Plazos fijos que vencen (o vencieron y falta cobrarlos).
  for (const i of activeInvestments()) {
    if (i.kind !== 'plazo_fijo') continue;
    const end = pfEnd(i);
    if (end > addDays(t, horizon)) continue;
    items.push({ kind: 'inv', id: i.id, title: i.name, date: end, amount: pfTotal(i), overdue: false, matured: end <= t,
      type: 'income', icon: INVEST_KINDS.plazo_fijo.icon, color: INVEST_KINDS.plazo_fijo.color });
  }
  // Deudas y préstamos con fecha de vencimiento.
  for (const d of debts()) {
    const rem = debtRemaining(d);
    if (!rem || !d.dueDate || d.dueDate > end) continue;
    items.push({ kind: 'debt', id: d.id, title: d.direction === 'owe' ? `Pagar a ${d.name}` : `Cobrar a ${d.name}`, date: d.dueDate,
      amount: rem, overdue: d.dueDate < t, type: d.direction === 'owe' ? 'expense' : 'income', icon: 'handshake', color: '#FFB547' });
  }
  // Planes de compra (próxima fecha dentro del horizonte).
  for (const r of alertRules()) {
    if (r.type !== 'plan' || r.active === false) continue;
    for (let k = 0; k <= horizon; k++) {
      const d = addDays(t, k);
      if (!planDue(r.plan || {}, d)) continue;
      items.push({ kind: 'plan', id: r.id, title: `Comprar ${r.ticker}`, date: d, amount: r.plan?.amount || 0, overdue: false,
        type: 'expense', icon: 'calendar-clock', color: '#2EF2A0', market: r.market, ticker: r.ticker });
      break;
    }
  }
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

/** Cantidad de avisos importantes: vencidos o que vencen en los próximos 3 días (sin contar automáticos). */
export const alertCount = () => upcomingItems(3).filter(i => i.overdue || (!i.auto && !i.estimate)).length;
