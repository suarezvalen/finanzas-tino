// Tarjetas de crédito: fechas de cierre y vencimiento, resúmenes y cuotas.
import { txs, balance } from '../store.js';
import { today, addMonths, dayIn } from '../dates.js';

export const hasCycle = c => c.closingDay > 0 && c.dueDay > 0;

/** Cierre del resumen en el que cae una fecha. */
function closingFor(date, C) {
  const ym = date.slice(0, 7);
  const c = dayIn(ym, C);
  return date <= c ? c : dayIn(addMonths(ym, 1), C);
}
/** Vencimiento de un resumen: mismo mes si vence después del cierre, si no el mes siguiente. */
const dueFor = (close, C, D) => dayIn(D > C ? close.slice(0, 7) : addMonths(close.slice(0, 7), 1), D);

export function cardStatus(card) {
  const t = today();
  const debt = -balance(card);
  if (!hasCycle(card)) return { configured: false, debt };

  const C = card.closingDay, D = card.dueDay;
  const nextClose = closingFor(t, C);
  const lastClose = dayIn(addMonths(nextClose.slice(0, 7), -1), C);
  const prevClose = dayIn(addMonths(nextClose.slice(0, 7), -2), C);

  const charges = txs().filter(x => x.accountId === card.id && x.type === 'expense');
  const sum = (from, to) => charges.filter(x => x.date > from && x.date <= to).reduce((s, x) => s + x.amount, 0);

  const computed = sum(prevClose, lastClose);
  const override = card.statements?.[lastClose];
  const closedAmt = override ?? computed;
  const paid = txs()
    .filter(x => x.type === 'transfer' && x.toAccountId === card.id && x.date > lastClose && x.date <= t)
    .reduce((s, x) => s + x.amount, 0);
  const toPay = Math.max(0, closedAmt - paid);
  const lastDue = dueFor(lastClose, C, D);

  return {
    configured: true, debt,
    lastClose, lastDue, nextClose, nextDue: dueFor(nextClose, C, D),
    closedAmt, computed, hasOverride: override != null, paid, toPay,
    overdue: toPay > 0 && lastDue < t,
    openAmt: sum(lastClose, nextClose),
    future: charges.filter(x => x.date > nextClose).reduce((s, x) => s + x.amount, 0),
    available: card.limit > 0 ? card.limit - debt : null,
  };
}

/** Compras en cuotas de una tarjeta que todavía tienen cuotas por venir. */
export function pendingInstallments(card) {
  const t = today();
  const groups = new Map();
  for (const x of txs()) {
    if (x.accountId !== card.id || !x.installment) continue;
    const g = x.installment.group;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(x);
  }
  return [...groups.values()]
    .map(list => {
      list.sort((a, b) => a.installment.n - b.installment.n);
      const remaining = list.filter(x => x.date > t);
      return { first: list[0], total: list[0].installment.total, remaining, left: remaining.reduce((s, x) => s + x.amount, 0) };
    })
    .filter(g => g.remaining.length)
    .sort((a, b) => a.remaining[0].date.localeCompare(b.remaining[0].date));
}
