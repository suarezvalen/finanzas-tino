// Pantalla de inicio.
import { state, accounts, balance, monthStats, sortedTxs, txs, netWorthSeries, saveSettings, getAccount } from '../store.js';
import { icon } from '../icons.js';
import { money, esc } from '../ui.js';
import { txItem, accIcon, empty, upcomingItem } from '../components.js';
import { today, curYm, daysInMonth, cap, monthName } from '../dates.js';
import { go } from '../router.js';
import { openTx } from '../sheets/tx.js';
import { openAccounts, openAccountEdit } from '../sheets/accounts.js';
import { openBudgets, budgetAlerts } from '../sheets/budgets.js';
import { openCard } from '../sheets/cards.js';
import { openUpcoming, handleUpcoming } from '../sheets/upcoming.js';
import { upcomingItems, alertCount } from '../logic/recurring.js';

function greeting() {
  const h = new Date().getHours();
  return h < 6 ? 'Buenas noches' : h < 13 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
}

function sparkline(vals) {
  if (vals.length < 2) return '';
  const W = 120, H = 40, min = Math.min(...vals), max = Math.max(...vals);
  const y = v => (max === min ? H / 2 : H - 4 - ((v - min) / (max - min)) * (H - 8));
  const pts = vals.map((v, i) => `${((i / (vals.length - 1)) * W).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <defs><linearGradient id="sg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#00E5FF" stop-opacity=".35"/><stop offset="1" stop-color="#00E5FF" stop-opacity="0"/></linearGradient></defs>
    <polygon points="0,${H} ${pts} ${W},${H}" fill="url(#sg)"/>
    <polyline points="${pts}" fill="none" stroke="#00E5FF" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

function budgetCard(st, ym) {
  const budget = state.settings.budget;
  const alerts = budgetAlerts();
  const alertChips = alerts.length
    ? `<div class="budget-cats">${alerts.slice(0, 3).map(a =>
      `<span class="mini-tag ${a.p > 1 ? 'over' : ''}">${esc(a.c.name)} ${Math.round(a.p * 100)}%</span>`).join('')}</div>` : '';
  if (!(budget > 0)) {
    if (alerts.length) {
      return `<button class="card" data-act="budget"><div class="label">Presupuestos al límite</div>${alertChips}</button>`;
    }
    return `<button class="card card-cta" data-act="budget"><span class="cta-ic">${icon('gauge')}</span>
      <span class="info"><b>Definí tu presupuesto</b><small>Total del mes o por categoría, y sabés cuánto podés gastar por día</small></span>${icon('chevron-right', 'chev')}</button>`;
  }
  const used = st.expense / budget;
  const left = budget - st.expense;
  const daysLeft = daysInMonth(ym) - Number(today().slice(8)) + 1;
  return `<button class="card" data-act="budget">
    <div class="budget-top"><div class="label">Presupuesto de ${monthName(ym, { month: 'long' })}</div><span class="pct ${used > 1 ? 'neg' : 'acc-c'}">${Math.round(used * 100)}%</span></div>
    <div class="progress ${used > 0.9 ? 'warn' : ''}"><i style="width:${Math.min(used * 100, 100)}%"></i></div>
    <div class="budget-foot">${left >= 0
      ? `<span>Te quedan <b>${money(left)}</b></span><span>≈ <b>${money(left / daysLeft)}</b> por día</span>`
      : `<span class="neg">Te pasaste por <b class="neg">${money(-left)}</b></span>`}</div>${alertChips}</button>`;
}

export function renderHome(el) {
  const s = state.settings;
  const ym = curYm();
  const t = today();
  const accs = accounts();
  const avail = accs.filter(a => a.type !== 'credit').reduce((x, a) => x + balance(a), 0);
  const net = accs.reduce((x, a) => x + balance(a), 0);
  const st = monthStats(ym);
  const recent = sortedTxs(txs().filter(x => x.date <= t)).slice(0, 6);
  const upcoming = upcomingItems(15);
  const alerts = alertCount();
  const dateStr = cap(new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }));
  const initial = (s.name || '').trim().charAt(0).toUpperCase() || '$';

  el.innerHTML = `
    <header class="top">
      <div class="avatar">${esc(initial)}</div>
      <div class="hi"><small>${dateStr}</small><strong>${greeting()}${s.name ? ', ' + esc(s.name) : ''}</strong></div>
      <button class="icon-btn" data-act="hide" aria-label="${s.hideAmounts ? 'Mostrar' : 'Ocultar'} montos">${icon(s.hideAmounts ? 'eye-off' : 'eye')}</button>
      <button class="icon-btn" data-act="upcoming" aria-label="Próximos vencimientos">${icon('bell')}${alerts ? `<span class="dot-count">${alerts}</span>` : ''}</button>
    </header>

    <section class="card hero">
      <div class="label">Disponible</div>
      <div class="amount">${money(avail)}</div>
      <div class="net"><span>Patrimonio neto <b>${money(net)}</b></span>${sparkline(netWorthSeries(6))}</div>
      <div class="row">
        <div class="pill"><small>${icon('arrow-down-left', 'pos')}Ingresos del mes</small><b class="pos">${money(st.income)}</b></div>
        <div class="pill"><small>${icon('arrow-up-right', 'neg')}Gastos del mes</small><b>${money(st.expense)}</b></div>
      </div>
    </section>

    ${budgetCard(st, ym)}

    ${upcoming.length ? `<div class="section-h"><h3>Próximos vencimientos</h3><button data-act="upcoming">Ver todos</button></div>
      <div class="list">${upcoming.slice(0, 4).map(upcomingItem).join('')}</div>` : ''}

    <div class="section-h"><h3>Cuentas</h3><button data-act="accounts">Administrar</button></div>
    <div class="accounts">
      ${accs.map(a => {
        const b = balance(a);
        return `<button class="acc" data-acc="${a.id}"><div class="ic">${icon(accIcon(a))}</div><small>${esc(a.name)}</small>
          <b class="${b < 0 ? 'neg' : ''}">${b < 0 ? '−' : ''}${money(Math.abs(b))}</b></button>`;
      }).join('')}
      <button class="acc acc-add" data-act="new-account"><div class="ic">${icon('plus')}</div><small>Nueva cuenta</small></button>
    </div>

    <div class="section-h"><h3>Últimos movimientos</h3>${recent.length ? '<button data-act="all">Ver todos</button>' : ''}</div>
    ${recent.length
      ? `<div class="list">${recent.map(txItem).join('')}</div>`
      : empty('sparkles', 'Todavía no hay movimientos', 'Tocá el botón <span class="acc-c">+</span> de abajo para anotar tu primer gasto o ingreso.')}`;

  el.onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.tx) return openTx(d.tx);
    if (d.up) return handleUpcoming(d.up);
    if (d.acc) return getAccount(d.acc)?.type === 'credit' ? openCard(d.acc) : go('movs', { accountId: d.acc });
    switch (d.act) {
      case 'hide': return saveSettings({ hideAmounts: !s.hideAmounts });
      case 'budget': return openBudgets();
      case 'upcoming': return openUpcoming();
      case 'accounts': return openAccounts();
      case 'new-account': return openAccountEdit();
      case 'all': return go('movs', {});
    }
  };
}
