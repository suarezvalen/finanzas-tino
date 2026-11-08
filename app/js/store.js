// Estado de la app en memoria + guardado en la base local.
// Cada registro tiene id, createdAt, updatedAt y deleted (borrado lógico),
// pensado para poder sincronizar con la PC más adelante.
import * as db from './db.js';
import { curYm, today, addMonths, daysInMonth, pad } from './dates.js';

const DEFAULT_SETTINGS = { id: 'settings', name: '', budget: 0, hideAmounts: false, onboarded: false, lastAccount: {} };
export const DATA_KINDS = ['accounts', 'categories', 'transactions', 'recurring'];

export const state = { accounts: [], categories: [], transactions: [], recurring: [], settings: { ...DEFAULT_SETTINGS } };

const listeners = new Set();
export const subscribe = fn => listeners.add(fn);
const emit = () => listeners.forEach(fn => fn());

export const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const now = () => new Date().toISOString();

export async function load() {
  const all = await Promise.all(db.STORES.map(db.getAll));
  const byStore = Object.fromEntries(db.STORES.map((s, i) => [s, all[i]]));
  for (const k of DATA_KINDS) state[k] = byStore[k] || [];
  state.settings = { ...DEFAULT_SETTINGS, ...byStore.meta.find(m => m.id === 'settings') };
}

function build(kind, obj) {
  const prev = obj.id ? state[kind].find(x => x.id === obj.id) : null;
  const base = prev || { id: obj.id || uid(), createdAt: now(), deleted: false };
  return { ...base, ...obj, id: base.id, updatedAt: now() };
}
function put(kind, rec) {
  const list = state[kind];
  const i = list.findIndex(x => x.id === rec.id);
  if (i >= 0) list[i] = rec; else list.push(rec);
}

export async function upsert(kind, obj) {
  const [rec] = await upsertMany(kind, [obj]);
  return rec;
}
export async function upsertMany(kind, objs) {
  const recs = [];
  for (const o of objs) { const r = build(kind, o); put(kind, r); recs.push(r); }
  await db.putMany(kind, recs);
  emit();
  return recs;
}
export const remove = (kind, id) => upsert(kind, { id, deleted: true });

export async function saveSettings(patch) {
  state.settings = { ...state.settings, ...patch, updatedAt: now() };
  await db.putMany('meta', [state.settings]);
  emit();
}

/** Primera configuración: crea cuentas, categorías y ajustes de una vez. */
export async function setup({ accounts, categories, settings }) {
  const accs = accounts.map(a => build('accounts', a));
  const cats = categories.map(c => build('categories', c));
  accs.forEach(a => put('accounts', a));
  cats.forEach(c => put('categories', c));
  await db.putMany('accounts', accs);
  await db.putMany('categories', cats);
  await saveSettings({ ...settings, onboarded: true });
}

export async function replaceAll(data) {
  await db.clearAll();
  for (const k of DATA_KINDS) await db.putMany(k, data[k] || []);
  await db.putMany('meta', [{ ...DEFAULT_SETTINGS, ...data.settings, id: 'settings' }]);
  await load();
  emit();
}
export const wipe = () => db.clearAll();

/* ---------- Consultas ---------- */
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name);
const live = kind => state[kind].filter(x => !x.deleted);

export const accounts = (includeArchived = false) =>
  live('accounts').filter(a => includeArchived || !a.archived).sort(byOrder);
export const categories = kind => live('categories').filter(c => c.kind === kind).sort(byOrder);
export const txs = () => live('transactions');
export const recurrings = () => live('recurring').sort((a, b) => a.day - b.day || a.name.localeCompare(b.name));
export const getAccount = id => state.accounts.find(a => a.id === id);
export const getCategory = id => state.categories.find(c => c.id === id);
export const getRecurring = id => state.recurring.find(r => r.id === id);

/** Cuánto cambia el saldo de una cuenta por un movimiento. */
export function txEffect(t, accId) {
  let v = 0;
  if (t.accountId === accId) v -= t.type === 'income' ? -t.amount : t.amount;
  if (t.type === 'transfer' && t.toAccountId === accId) v += t.amount;
  return v;
}

/** Fecha desde la que un movimiento afecta el saldo: las cuotas cuentan como deuda desde la compra. */
const effectiveDate = (t, acc) => (acc.type === 'credit' && t.installment?.purchaseDate) || t.date;

/** Saldo a una fecha (por defecto hoy). Lo cargado con fecha futura todavía no cuenta. */
export function balance(acc, upTo = today()) {
  let total = acc.initialBalance || 0;
  for (const t of txs()) if (effectiveDate(t, acc) <= upTo) total += txEffect(t, acc.id);
  return total;
}

export function monthStats(ym) {
  const list = txs().filter(t => t.date.startsWith(ym));
  let income = 0, expense = 0;
  for (const t of list) {
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') expense += t.amount;
  }
  return { list, income, expense };
}

export const categorySpent = (catId, ym = curYm()) =>
  txs().filter(t => t.type === 'expense' && t.categoryId === catId && t.date.startsWith(ym)).reduce((s, t) => s + t.amount, 0);

export const sortedTxs = (list = txs()) =>
  [...list].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));

export function netWorthSeries(months = 6) {
  const accs = accounts();
  const cur = curYm();
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const ym = addMonths(cur, -i);
    const end = i === 0 ? today() : `${ym}-${pad(daysInMonth(ym))}`;
    out.push(accs.reduce((s, a) => s + balance(a, end), 0));
  }
  return out;
}
