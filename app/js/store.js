// Estado de la app en memoria + guardado en la base local.
// Cada registro tiene id, createdAt, updatedAt y deleted (borrado lógico),
// pensado para poder sincronizar con la PC más adelante.
import * as db from './db.js';
import { curYm, today } from './dates.js';

const DEFAULT_SETTINGS = { id: 'settings', name: '', budget: 0, hideAmounts: false, onboarded: false, lastAccount: {} };
// Inflación mensual (% IPC) por mes 'AAAA-MM'. manual: meses cargados a mano.
const DEFAULT_INFLATION = { id: 'inflation', values: {}, manual: {}, fetchedAt: null };
export const DATA_KINDS = ['accounts', 'categories', 'transactions', 'recurring', 'investments', 'goals', 'debts'];

export const state = {
  accounts: [], categories: [], transactions: [], recurring: [], investments: [], goals: [], debts: [],
  settings: { ...DEFAULT_SETTINGS },
  inflation: { ...DEFAULT_INFLATION },
};

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
  state.inflation = { ...DEFAULT_INFLATION, ...byStore.meta.find(m => m.id === 'inflation') };
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

export async function saveInflation(patch) {
  state.inflation = { ...state.inflation, ...patch, id: 'inflation', updatedAt: now() };
  await db.putMany('meta', [state.inflation]);
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
  // Al restaurar, todo queda como "sin subir" (y con fecha nueva) para que la nube tome esta versión.
  const t = now();
  const fresh = r => { const { _remote, ...rest } = r; return { ...rest, updatedAt: t }; };
  for (const k of DATA_KINDS) await db.putMany(k, (data[k] || []).map(fresh));
  await db.putMany('meta', [fresh({ ...DEFAULT_SETTINGS, ...data.settings, id: 'settings' })]);
  if (data.inflation) await db.putMany('meta', [fresh({ ...DEFAULT_INFLATION, ...data.inflation, id: 'inflation' })]);
  await load();
  emit();
}
export const wipe = () => db.clearAll();

/* ---------- Sincronización ----------
 * Cada registro guarda en `_remote` la versión (updatedAt) que ya está en la nube.
 * Si updatedAt es más nuevo que _remote, el registro tiene cambios sin subir.
 * Gana siempre la versión con updatedAt más reciente.
 */
const metaOf = id => (id === 'settings' ? state.settings : id === 'inflation' ? state.inflation : null);
const isDirty = r => !!r?.updatedAt && r.updatedAt > (r._remote || '');
const toRow = (kind, r) => ({ kind, id: r.id, data: r, updated_at: r.updatedAt, deleted: !!r.deleted });

/** Registros con cambios sin subir, en formato de la nube. */
export function dirtyRows() {
  const rows = [];
  for (const k of DATA_KINDS) for (const r of state[k]) if (isDirty(r)) rows.push(toRow(k, r));
  for (const id of ['settings', 'inflation']) { const m = metaOf(id); if (isDirty(m)) rows.push(toRow('meta', m)); }
  return rows;
}

/** Marca como subidos los registros que se acaban de mandar a la nube. */
export async function markSynced(rows) {
  const byKind = {};
  for (const row of rows) {
    const rec = row.kind === 'meta' ? metaOf(row.id) : state[row.kind].find(x => x.id === row.id);
    if (!rec || rec.updatedAt !== row.updated_at) continue; // cambió mientras se subía: queda pendiente
    rec._remote = rec.updatedAt;
    (byKind[row.kind] ||= []).push(rec);
  }
  for (const [k, recs] of Object.entries(byKind)) await db.putMany(k, recs);
}

/** Aplica cambios bajados de la nube. Devuelve cuántos registros cambiaron. */
export async function applyRemote(rows) {
  const byKind = {};
  let changed = 0;
  for (const row of rows) {
    const data = { ...row.data, _remote: row.data?.updatedAt };
    if (row.kind === 'meta') {
      const cur = metaOf(row.id);
      if (!cur || (cur.updatedAt || '') >= (data.updatedAt || '')) continue;
      if (row.id === 'settings') state.settings = { ...DEFAULT_SETTINGS, ...data, id: 'settings' };
      else state.inflation = { ...DEFAULT_INFLATION, ...data, id: 'inflation' };
      (byKind.meta ||= []).push(metaOf(row.id));
      changed++;
      continue;
    }
    if (!DATA_KINDS.includes(row.kind)) continue;
    const local = state[row.kind].find(x => x.id === row.id);
    if (local && (local.updatedAt || '') >= (data.updatedAt || '')) {
      if (local.updatedAt === data.updatedAt && local._remote !== data.updatedAt) { local._remote = data.updatedAt; (byKind[row.kind] ||= []).push(local); }
      continue;
    }
    put(row.kind, data);
    (byKind[row.kind] ||= []).push(data);
    changed++;
  }
  for (const [k, recs] of Object.entries(byKind)) await db.putMany(k, recs);
  if (changed) emit();
  return changed;
}

/** ¿Este dispositivo ya tiene datos propios? */
export const hasLocalData = () => DATA_KINDS.some(k => state[k].some(r => !r.deleted)) || state.settings.onboarded;

/** Borra todo lo local y deja la app vacía (para traer los datos de la nube). */
export async function resetLocal() {
  await db.clearAll();
  await load();
  emit();
}

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
const byCreated = (a, b) => (a.createdAt || '').localeCompare(b.createdAt || '');
export const investments = () => live('investments').sort(byCreated);
export const goals = () => live('goals').sort(byCreated);
export const debts = () => live('debts').sort(byCreated);
export const getInvestment = id => state.investments.find(x => x.id === id);
export const getGoal = id => state.goals.find(x => x.id === id);
export const getDebt = id => state.debts.find(x => x.id === id);

/**
 * Cuánto cambia el saldo de una cuenta por un movimiento.
 * Tipos: income / expense / transfer, y desde la etapa 3 'in' / 'out':
 * plata que entra o sale de una cuenta hacia una inversión o un préstamo (no es ingreso ni gasto).
 */
export function txEffect(t, accId) {
  let v = 0;
  if (t.accountId === accId) v += t.type === 'income' || t.type === 'in' ? t.amount : -t.amount;
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
