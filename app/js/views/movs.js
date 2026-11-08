// Lista de movimientos con buscador y filtros.
import { txs, sortedTxs, accounts, getAccount, getCategory } from '../store.js';
import { icon } from '../icons.js';
import { signed, esc, normalize, ensureVisible, mark } from '../ui.js';
import { txItem, accIcon, monthSwitcher, empty, linkInfo } from '../components.js';
import { curYm, addMonths, monthTitle, dayLabel } from '../dates.js';
import { openTx } from '../sheets/tx.js';

// from/to: rango de fechas (viene de Reportes); si está, reemplaza al mes.
const F = { ym: curYm(), type: 'all', accountId: null, categoryId: null, q: '', from: null, to: null, rangeLabel: '' };
const TYPES = [['all', 'Todos', 'layers'], ['expense', 'Gastos', 'arrow-up-right'], ['income', 'Ingresos', 'arrow-down-left'], ['transfer', 'Otros movimientos', 'arrow-left-right']];

export function renderMovs(el, params) {
  if (params) Object.assign(F, { ym: curYm(), type: 'all', accountId: null, categoryId: null, q: '', from: null, to: null, rangeLabel: '' }, params);
  const accs = accounts();

  el.innerHTML = `
    <header class="top"><h1 class="page-title">Movimientos</h1></header>
    <div id="msw"></div>
    <label class="search">${icon('search')}<input id="q" type="search" placeholder="Buscar: súper, nafta, Netflix…" value="${esc(F.q)}" autocomplete="off" enterkeyhint="search">
      <button class="clear" data-clear ${F.q ? '' : 'hidden'} aria-label="Borrar búsqueda">${icon('x')}</button></label>
    <div class="chips" id="ftype">${TYPES.map(([k, l, i]) => `<button class="chip ${F.type === k ? 'on' : ''}" data-type="${k}">${icon(i)}${l}</button>`).join('')}</div>
    ${accs.length > 1 ? `<div class="chips" id="facc"><button class="chip ${!F.accountId ? 'on' : ''}" data-accf="">Todas las cuentas</button>${accs.map(a =>
      `<button class="chip ${F.accountId === a.id ? 'on' : ''}" data-accf="${a.id}">${icon(accIcon(a))}${esc(a.name)}</button>`).join('')}</div>` : ''}
    <div id="fcat"></div>
    <div class="sumbar" id="msum"></div>
    <div id="mlist"></div>`;

  const q = el.querySelector('#q');
  q.oninput = () => {
    F.q = q.value;
    el.querySelector('[data-clear]').hidden = !F.q;
    renderList(el);
  };
  ensureVisible(el.querySelector('#facc'));

  el.onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.tx) return openTx(d.tx);
    if (d.m) { F.ym = addMonths(F.ym, Number(d.m)); return renderList(el); }
    if ('rangeclear' in d) { F.ym = F.to.slice(0, 7); F.from = F.to = null; return renderList(el); }
    if (d.type) { F.type = d.type; mark(el.querySelector('#ftype'), b); return renderList(el); }
    if (d.accf !== undefined) { F.accountId = d.accf || null; mark(el.querySelector('#facc'), b); return renderList(el); }
    if ('catclear' in d) { F.categoryId = null; return renderList(el); }
    if ('clear' in d) { e.preventDefault(); F.q = ''; q.value = ''; b.hidden = true; return renderList(el); }
  };

  renderList(el);
}

function filtered() {
  const needle = normalize(F.q.trim());
  let list = needle ? txs()
    : F.from ? txs().filter(t => t.date >= F.from && t.date <= F.to)
    : txs().filter(t => t.date.startsWith(F.ym));
  if (F.type === 'transfer') list = list.filter(t => ['transfer', 'in', 'out'].includes(t.type));
  else if (F.type !== 'all') list = list.filter(t => t.type === F.type);
  if (F.accountId) list = list.filter(t => t.accountId === F.accountId || t.toAccountId === F.accountId);
  if (F.categoryId) list = list.filter(t => t.categoryId === F.categoryId);
  if (needle) {
    list = list.filter(t => normalize([
      t.note, getCategory(t.categoryId)?.name, getAccount(t.accountId)?.name, getAccount(t.toAccountId)?.name, t.amount,
      t.link ? linkInfo(t).title : '',
    ].join(' ')).includes(needle));
  }
  return sortedTxs(list);
}

function renderList(el) {
  const searching = !!F.q.trim();
  el.querySelector('#msw').innerHTML = monthSwitcher(
    searching ? 'Buscando en todos los meses' : F.from ? F.rangeLabel : monthTitle(F.ym), searching || !!F.from);

  const cat = F.categoryId ? getCategory(F.categoryId) : null;
  const chips = [
    F.from && !searching ? `<button class="chip on" data-rangeclear>${icon('calendar-range')}${esc(F.rangeLabel)} ${icon('x')}</button>` : '',
    cat ? `<button class="chip on" data-catclear>${icon(cat.icon)}${esc(cat.name)} ${icon('x')}</button>` : '',
  ].join('');
  el.querySelector('#fcat').innerHTML = chips ? `<div class="chips" style="margin-top:8px">${chips}</div>` : '';

  const list = filtered();
  let inc = 0, out = 0;
  for (const t of list) { if (t.type === 'income') inc += t.amount; else if (t.type === 'expense') out += t.amount; }
  el.querySelector('#msum').innerHTML = `
    <div class="pill"><small>Ingresos</small><b class="pos">${signed(inc)}</b></div>
    <div class="pill"><small>Gastos</small><b>${signed(-out)}</b></div>`;

  const groups = new Map();
  for (const t of list) {
    if (!groups.has(t.date)) groups.set(t.date, []);
    groups.get(t.date).push(t);
  }
  el.querySelector('#mlist').innerHTML = list.length
    ? [...groups].map(([date, items]) => {
      const tot = items.reduce((s, t) => s + (t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0), 0);
      return `<div class="day-h"><span>${dayLabel(date)}</span><span>${tot ? signed(tot) : ''}</span></div>
        <div class="list">${items.map(txItem).join('')}</div>`;
    }).join('')
    : `<div style="margin-top:16px">${empty('search', searching ? 'Sin resultados' : 'No hay movimientos',
      searching ? 'Probá con otra palabra o cambiá los filtros.' : 'No hay movimientos en este mes con estos filtros.')}</div>`;
}
