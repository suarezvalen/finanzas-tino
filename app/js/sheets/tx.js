// Panel para cargar o editar un gasto, ingreso o transferencia.
import { state, accounts, categories, upsert, remove, saveSettings, getCategory } from '../store.js';
import { icon } from '../icons.js';
import { openSheet, toast, esc, fmtMoney, ensureVisible, mark } from '../ui.js';
import { catIc, accIcon } from '../components.js';
import { today, shortDate } from '../dates.js';

const TYPES = { expense: 'Gasto', income: 'Ingreso', transfer: 'Transferencia' };
const SAVE_LABEL = { expense: 'Guardar gasto', income: 'Guardar ingreso', transfer: 'Guardar transferencia' };
const SAVED_MSG = { expense: 'Gasto guardado', income: 'Ingreso guardado', transfer: 'Transferencia guardada' };
const MAX_DIGITS = 11;

export function openTx(id) {
  const ex = id ? state.transactions.find(t => t.id === id && !t.deleted) : null;
  if (id && !ex) return;
  if (!ex && !accounts().length) {
    toast('Primero creá una cuenta en Más → Cuentas', { icon: 'info' });
    return;
  }
  const F = ex
    ? { type: ex.type, amount: String(ex.amount), categoryId: ex.categoryId, accountId: ex.accountId, toAccountId: ex.toAccountId, date: ex.date, note: ex.note || '' }
    : { type: 'expense', amount: '', categoryId: null, accountId: null, toAccountId: null, date: today(), note: '' };
  if (!ex) fixAccounts(F);

  let onKey;
  openSheet({
    cls: 'tx-sheet',
    render: (el, ctl) => {
      build(el, ctl, F, ex);
      if (!onKey) {
        onKey = e => keyboard(e, el, ctl, F, ex);
        document.addEventListener('keydown', onKey);
      }
    },
    onClose: () => document.removeEventListener('keydown', onKey),
  });
}

/** Cuentas disponibles según el tipo (con tarjeta de crédito no se cobran ingresos). */
function pools(F) {
  const base = accounts(true).filter(a => !a.archived || a.id === F.accountId || a.id === F.toAccountId);
  const src = base.filter(a => F.type === 'expense' || a.type !== 'credit');
  const dest = base.filter(a => a.id !== F.accountId);
  return { src, dest };
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

const valid = F => {
  if (!(Number(F.amount) > 0) || !F.accountId) return false;
  return F.type === 'transfer' ? !!F.toAccountId && F.toAccountId !== F.accountId : !!F.categoryId;
};

function build(el, ctl, F, ex) {
  const isT = F.type === 'transfer';
  const { src, dest } = pools(F);
  let cats = isT ? [] : categories(F.type);
  if (F.categoryId && !cats.some(c => c.id === F.categoryId)) {
    const old = getCategory(F.categoryId);
    if (old && old.kind === F.type) cats = [old, ...cats];
  }
  const chip = (a, attr, sel) =>
    `<button class="chip ${sel === a.id ? 'on' : ''}" data-${attr}="${a.id}">${icon(accIcon(a))}${esc(a.name)}</button>`;

  el.innerHTML = `
    <div class="grab"></div>
    <div class="tx-head">
      <div class="seg">${Object.entries(TYPES).map(([k, l]) => `<button data-type="${k}" class="${F.type === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <button class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button>
    </div>
    <div class="big-amount ${F.type === 'income' ? 'in' : ''}" id="amt"></div>
    <div class="sub-amount"><label class="date-pill">${icon('calendar')}<span id="dlabel">${shortDate(F.date)}</span><input type="date" id="dinput" value="${F.date}" aria-label="Fecha"></label></div>
    ${isT ? `
      <div class="mini-label">Desde</div><div class="chips" id="g-acc">${src.map(a => chip(a, 'acc', F.accountId)).join('')}</div>
      <div class="mini-label">Hacia</div><div class="chips" id="g-to">${dest.map(a => chip(a, 'to', F.toAccountId)).join('')}</div>`
    : `
      <div class="mini-label">Categoría</div>
      <div class="cats" id="g-cat">${cats.map(c => `<button class="cat ${F.categoryId === c.id ? 'on' : ''}" data-cat="${c.id}">${catIc(c)}<span class="cat-name">${esc(c.name)}</span></button>`).join('')}</div>
      <div class="mini-label">${F.type === 'expense' ? 'Pagaste con' : 'Entró en'}</div>
      <div class="chips" id="g-acc">${src.map(a => chip(a, 'acc', F.accountId)).join('')}</div>`}
    <input class="note" id="note" maxlength="80" autocomplete="off" enterkeyhint="done" placeholder="Nota (opcional): Coto, Uber, regalo…" value="${esc(F.note)}">
    <div class="keypad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'del'].map(k =>
      `<button data-k="${k}" aria-label="${k === 'del' ? 'Borrar' : k}">${k === 'del' ? icon('delete') : k}</button>`).join('')}</div>
    <button class="save" id="save"></button>
    ${ex ? `<button class="btn danger" data-del style="margin-top:10px">${icon('trash-2')}Eliminar movimiento</button>` : ''}`;

  refreshAmount(el, F, ex);
  ['#g-cat', '#g-acc', '#g-to'].forEach(s => ensureVisible(el.querySelector(s)));

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
      if (F.type !== d.type) { F.type = d.type; F.categoryId = null; fixAccounts(F); build(el, ctl, F, ex); }
    } else if ('close' in d) {
      ctl.close();
    } else if (d.k) {
      press(d.k, F); refreshAmount(el, F, ex);
    } else if (d.cat) {
      F.categoryId = d.cat; mark(el.querySelector('#g-cat'), b); refreshAmount(el, F, ex);
    } else if (d.acc) {
      F.accountId = d.acc;
      if (F.type === 'transfer') { fixAccounts(F); build(el, ctl, F, ex); }
      else { mark(el.querySelector('#g-acc'), b); refreshAmount(el, F, ex); }
    } else if (d.to) {
      F.toAccountId = d.to; mark(el.querySelector('#g-to'), b); refreshAmount(el, F, ex);
    } else if (b.id === 'save') {
      await save(F, ex); ctl.close();
    } else if ('del' in d) {
      if (!confirm('¿Eliminar este movimiento?')) return;
      await remove('transactions', ex.id);
      ctl.close();
      toast('Movimiento eliminado', { icon: 'trash-2', action: { label: 'Deshacer', fn: () => upsert('transactions', { id: ex.id, deleted: false }) } });
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
  el.querySelector('#amt').innerHTML = `${fmtMoney(Number(F.amount || 0))}<span class="caret"></span>`;
  const btn = el.querySelector('#save');
  btn.disabled = !valid(F);
  btn.textContent = ex ? 'Guardar cambios' : SAVE_LABEL[F.type];
}

/** En la PC se puede cargar con el teclado: números, borrar y Enter. */
function keyboard(e, el, ctl, F, ex) {
  if (!el.isConnected || e.target.closest?.('input, textarea')) return;
  if (/^\d$/.test(e.key)) { press(e.key, F); refreshAmount(el, F, ex); e.preventDefault(); }
  else if (e.key === 'Backspace') { press('del', F); refreshAmount(el, F, ex); e.preventDefault(); }
  else if (e.key === 'Enter' && valid(F)) { e.preventDefault(); save(F, ex).then(() => ctl.close()); }
}

async function save(F, ex) {
  const rec = {
    type: F.type,
    amount: Number(F.amount),
    date: F.date,
    note: F.note.trim(),
    accountId: F.accountId,
    categoryId: F.type === 'transfer' ? null : F.categoryId,
    toAccountId: F.type === 'transfer' ? F.toAccountId : null,
  };
  if (ex) rec.id = ex.id;
  await upsert('transactions', rec);
  if (!ex) await saveSettings({ lastAccount: { ...state.settings.lastAccount, [F.type]: F.accountId } });
  toast(ex ? 'Cambios guardados' : SAVED_MSG[F.type]);
}
