// Panel para cargar o editar un gasto, ingreso o transferencia (con cuotas en tarjetas).
import {
  state, accounts, categories, txs, upsert, upsertMany, saveSettings, getAccount, getCategory, getRecurring, categorySpent, uid,
} from '../store.js';
import { icon } from '../icons.js';
import { openSheet, toast, esc, fmtMoney, money, ensureVisible, mark } from '../ui.js';
import { catGrid, accChips } from '../components.js';
import { today, shortDate, addMonthsToDate } from '../dates.js';
import { openInvestment } from './investments.js';
import { openDebt } from './debts.js';

const TYPES = { expense: 'Gasto', income: 'Ingreso', transfer: 'Transferencia' };
const SAVE_LABEL = { expense: 'Guardar gasto', income: 'Guardar ingreso', transfer: 'Guardar transferencia' };
const SAVED_MSG = { expense: 'Gasto guardado', income: 'Ingreso guardado', transfer: 'Transferencia guardada' };
const CUOTAS = [1, 2, 3, 6, 9, 12, 18, 24];
const MAX_DIGITS = 11;

/**
 * Abre el panel. Sin id: movimiento nuevo (preset opcional para precargar datos).
 * Si el movimiento es una cuota, se edita la compra completa.
 */
export function openTx(id, preset = null) {
  const ex = id ? state.transactions.find(t => t.id === id && !t.deleted) : null;
  if (id && !ex) return;
  // Plata hacia/desde una inversión o un préstamo: se maneja desde su detalle.
  if (ex && (ex.type === 'in' || ex.type === 'out')) {
    return ex.link?.kind === 'investment' ? openInvestment(ex.link.id) : openDebt(ex.link?.id);
  }
  if (!ex && !accounts().length) {
    toast('Primero creá una cuenta en Más → Cuentas', { icon: 'info' });
    return;
  }
  const group = ex?.installment
    ? txs().filter(t => t.installment?.group === ex.installment.group).sort((a, b) => a.installment.n - b.installment.n)
    : ex ? [ex] : [];

  const F = ex
    ? {
      type: ex.type, categoryId: ex.categoryId, accountId: ex.accountId, toAccountId: ex.toAccountId, note: ex.note || '',
      recurringId: ex.recurringId || null,
      amount: String(ex.installment?.purchase ?? ex.amount),
      date: ex.installment?.purchaseDate ?? ex.date,
      cuotas: ex.installment?.total ?? 1,
    }
    : {
      type: 'expense', amount: '', categoryId: null, accountId: null, toAccountId: null, date: today(), note: '', cuotas: 1, recurringId: null,
      ...preset, ...(preset?.amount ? { amount: String(preset.amount) } : {}),
    };
  if (!ex) fixAccounts(F);

  let onKey;
  openSheet({
    cls: 'tx-sheet',
    render: (el, ctl) => {
      build(el, ctl, F, ex, group, preset);
      if (!onKey) {
        onKey = e => keyboard(e, el, ctl, F, ex, group);
        document.addEventListener('keydown', onKey);
      }
    },
    onClose: () => document.removeEventListener('keydown', onKey),
  });
}

/** Cuentas disponibles según el tipo (con tarjeta de crédito no se cobran ingresos). */
function pools(F) {
  const base = accounts(true).filter(a => !a.archived || a.id === F.accountId || a.id === F.toAccountId);
  return {
    src: base.filter(a => F.type === 'expense' || a.type !== 'credit'),
    dest: base.filter(a => a.id !== F.accountId),
  };
}

function fixAccounts(F) {
  const { src } = pools(F);
  if (!src.some(a => a.id === F.accountId)) {
    const last = state.settings.lastAccount?.[F.type];
    F.accountId = src.some(a => a.id === last) ? last : src[0]?.id ?? null;
  }
  if (F.type === 'transfer') {
    const { dest } = pools(F);
    if (!dest.some(a => a.id === F.toAccountId)) F.toAccountId = dest[0]?.id ?? null;
  }
}

const isCard = F => F.type === 'expense' && getAccount(F.accountId)?.type === 'credit';
const cuotasOf = F => (isCard(F) ? F.cuotas : 1);

const valid = F => {
  if (!(Number(F.amount) > 0) || !F.accountId) return false;
  return F.type === 'transfer' ? !!F.toAccountId && F.toAccountId !== F.accountId : !!F.categoryId;
};

function build(el, ctl, F, ex, group, preset) {
  const isT = F.type === 'transfer';
  const { src, dest } = pools(F);
  let cats = isT ? [] : categories(F.type);
  if (F.categoryId && !cats.some(c => c.id === F.categoryId)) {
    const old = getCategory(F.categoryId);
    if (old && old.kind === F.type) cats = [old, ...cats];
  }
  const rec = F.recurringId ? getRecurring(F.recurringId) : null;

  el.innerHTML = `
    <div class="grab"></div>
    <div class="tx-head">
      <div class="seg">${Object.entries(TYPES).map(([k, l]) => `<button data-type="${k}" class="${F.type === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <button class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button>
    </div>
    ${rec ? `<div class="banner">${icon('repeat')}<span>Pago recurrente: <b>${esc(rec.name)}</b>. Revisá el monto antes de guardar.</span></div>` : ''}
    <div class="big-amount ${F.type === 'income' ? 'in' : ''}" id="amt"></div>
    <div class="sub-amount"><label class="date-pill">${icon('calendar')}<span id="dlabel">${shortDate(F.date)}</span><input type="date" id="dinput" value="${F.date}" aria-label="Fecha"></label></div>
    ${isT ? `
      <div class="mini-label">Desde</div>${accChips(src, F.accountId)}
      <div class="mini-label">Hacia</div>${accChips(dest, F.toAccountId, 'to', 'g-to')}`
    : `
      <div class="mini-label">Categoría</div>${catGrid(cats, F.categoryId)}
      <div class="mini-label">${F.type === 'expense' ? 'Pagaste con' : 'Entró en'}</div>${accChips(src, F.accountId)}
      ${isCard(F) ? `<div class="chips" id="g-cuotas" style="margin-top:8px">${CUOTAS.map(n =>
        `<button class="chip ${F.cuotas === n ? 'on' : ''}" data-cuotas="${n}">${n === 1 ? '1 pago' : `${n} cuotas`}</button>`).join('')}</div>` : ''}`}
    <input class="note" id="note" maxlength="80" autocomplete="off" enterkeyhint="done" placeholder="Nota (opcional): Coto, Uber, regalo…" value="${esc(F.note)}">
    <div class="keypad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'del'].map(k =>
      `<button data-k="${k}" aria-label="${k === 'del' ? 'Borrar' : k}">${k === 'del' ? icon('delete') : k}</button>`).join('')}</div>
    <button class="save" id="save"></button>
    ${ex ? `<button class="btn danger" data-del style="margin-top:10px">${icon('trash-2')}${group.length > 1 ? 'Eliminar la compra (todas las cuotas)' : 'Eliminar movimiento'}</button>` : ''}
    ${!ex && rec && preset?.ym ? `<button class="btn ghost" data-skip style="margin-top:6px">${icon('skip-forward')}Este mes no corresponde (omitir)</button>` : ''}`;

  refreshAmount(el, F, ex);
  ['#g-cat', '#g-acc', '#g-to', '#g-cuotas'].forEach(s => ensureVisible(el.querySelector(s)));

  el.querySelector('#note').oninput = e => { F.note = e.target.value; };
  const dinput = el.querySelector('#dinput');
  dinput.onchange = () => {
    F.date = dinput.value || today();
    el.querySelector('#dlabel').textContent = shortDate(F.date);
  };
  dinput.onclick = () => { try { dinput.showPicker?.(); } catch { /* el navegador abre su propio selector */ } };

  el.onclick = async e => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.type) {
      if (F.type !== d.type) { F.type = d.type; F.categoryId = null; fixAccounts(F); build(el, ctl, F, ex, group, preset); }
    } else if ('close' in d) {
      ctl.close();
    } else if (d.k) {
      press(d.k, F); refreshAmount(el, F, ex);
    } else if (d.cat) {
      F.categoryId = d.cat; mark(el.querySelector('#g-cat'), b); refreshAmount(el, F, ex);
    } else if (d.acc) {
      const wasCard = isCard(F);
      F.accountId = d.acc;
      if (F.type === 'transfer' || wasCard !== isCard(F)) { fixAccounts(F); build(el, ctl, F, ex, group, preset); }
      else { mark(el.querySelector('#g-acc'), b); refreshAmount(el, F, ex); }
    } else if (d.to) {
      F.toAccountId = d.to; mark(el.querySelector('#g-to'), b); refreshAmount(el, F, ex);
    } else if (d.cuotas) {
      F.cuotas = Number(d.cuotas); mark(el.querySelector('#g-cuotas'), b); refreshAmount(el, F, ex);
    } else if (b.id === 'save') {
      b.disabled = true;
      await save(F, ex, group); ctl.close();
    } else if ('del' in d) {
      const msg = group.length > 1 ? `¿Eliminar la compra completa (${group.length} cuotas)?` : '¿Eliminar este movimiento?';
      if (!confirm(msg)) return;
      await upsertMany('transactions', group.map(t => ({ id: t.id, deleted: true })));
      ctl.close();
      toast(group.length > 1 ? 'Compra eliminada' : 'Movimiento eliminado', {
        icon: 'trash-2',
        action: { label: 'Deshacer', fn: () => upsertMany('transactions', group.map(t => ({ id: t.id, deleted: false }))) },
      });
    } else if ('skip' in d) {
      await upsert('recurring', { id: rec.id, skipped: [...(rec.skipped || []), preset.ym] });
      ctl.close();
      toast(`${rec.name}: omitido este mes`, { icon: 'skip-forward' });
    }
  };
}

function press(k, F) {
  if (k === 'del') F.amount = F.amount.slice(0, -1);
  else {
    const next = (F.amount + k).replace(/^0+/, '');
    if (next.length <= MAX_DIGITS) F.amount = next;
  }
}

function refreshAmount(el, F, ex) {
  const n = Number(F.amount || 0);
  el.querySelector('#amt').innerHTML = `${fmtMoney(n)}<span class="caret"></span>`;
  const c = cuotasOf(F);
  const btn = el.querySelector('#save');
  btn.disabled = !valid(F);
  btn.textContent = c > 1
    ? `Guardar · ${c} cuotas de ${fmtMoney(Math.floor(n / c))}`
    : ex ? 'Guardar cambios' : SAVE_LABEL[F.type];
}

/** En la PC se puede cargar con el teclado: números, borrar y Enter. */
function keyboard(e, el, ctl, F, ex, group) {
  if (!el.isConnected || e.target.closest?.('input, textarea')) return;
  if (/^\d$/.test(e.key)) { press(e.key, F); refreshAmount(el, F, ex); e.preventDefault(); }
  else if (e.key === 'Backspace') { press('del', F); refreshAmount(el, F, ex); e.preventDefault(); }
  else if (e.key === 'Enter' && valid(F)) { e.preventDefault(); save(F, ex, group).then(() => ctl.close()); }
}

async function save(F, ex, group) {
  const total = Number(F.amount);
  const n = cuotasOf(F);
  const base = {
    type: F.type, note: F.note.trim(), accountId: F.accountId,
    categoryId: F.type === 'transfer' ? null : F.categoryId,
    toAccountId: F.type === 'transfer' ? F.toAccountId : null,
    recurringId: F.recurringId || null,
  };
  let recs;
  if (n > 1) {
    const gid = ex?.installment?.group || uid();
    const per = Math.floor(total / n);
    recs = Array.from({ length: n }, (_, k) => ({
      ...base,
      amount: per + (k === 0 ? total - per * n : 0),
      date: addMonthsToDate(F.date, k),
      installment: { group: gid, n: k + 1, total: n, purchase: total, purchaseDate: F.date },
    }));
  } else {
    recs = [{ ...base, amount: total, date: F.date, installment: null }];
  }
  // Reusa los registros existentes y borra los que sobran (por ejemplo, si bajaron las cuotas).
  recs.forEach((r, k) => { if (group[k]) r.id = group[k].id; });
  const extra = group.slice(recs.length).map(t => ({ id: t.id, deleted: true }));
  await upsertMany('transactions', [...recs, ...extra]);

  if (!ex) await saveSettings({ lastAccount: { ...state.settings.lastAccount, [F.type]: F.accountId } });

  const warn = F.type === 'expense' ? budgetWarning(F.categoryId, recs[0].date) : null;
  if (warn) toast(warn, { icon: 'triangle-alert' });
  else toast(ex ? 'Cambios guardados' : n > 1 ? `Compra en ${n} cuotas guardada` : SAVED_MSG[F.type]);
}

function budgetWarning(catId, date) {
  const c = getCategory(catId);
  if (!(c?.budget > 0)) return null;
  const spent = categorySpent(catId, date.slice(0, 7));
  const p = spent / c.budget;
  if (p > 1) return `Te pasaste del presupuesto de ${c.name} por ${money(spent - c.budget)}`;
  if (p >= 0.8) return `Ya usaste el ${Math.round(p * 100)}% del presupuesto de ${c.name}`;
  return null;
}
