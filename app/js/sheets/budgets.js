// Presupuesto total del mes y límites por categoría.
import { state, categories, categorySpent, monthStats, upsert, saveSettings } from '../store.js';
import { icon } from '../icons.js';
import { openSheet, money, esc, toast } from '../ui.js';
import { sheetHead, catIc } from '../components.js';
import { curYm, monthName, daysInMonth, today } from '../dates.js';
import { openAmountSheet } from './amount.js';

const level = p => (p > 1 ? 'over' : p >= 0.8 ? 'warn' : '');

export function openBudgets() {
  openSheet({
    full: true,
    live: true,
    render(el, ctl) {
      const ym = curYm();
      const total = state.settings.budget || 0;
      const spent = monthStats(ym).expense;
      const daysLeft = daysInMonth(ym) - Number(today().slice(8)) + 1;
      const rows = categories('expense').map(c => ({ c, spent: categorySpent(c.id, ym), limit: c.budget || 0 }));
      const withLimit = rows.filter(r => r.limit > 0).sort((a, b) => b.spent / b.limit - a.spent / a.limit);
      const without = rows.filter(r => !(r.limit > 0)).sort((a, b) => b.spent - a.spent);
      const sumLimits = withLimit.reduce((s, r) => s + r.limit, 0);
      const pTotal = total ? spent / total : 0;

      const row = r => {
        const p = r.limit ? r.spent / r.limit : 0;
        return `<button class="item tap budget-row" data-cat="${r.c.id}">${catIc(r.c)}
          <span class="info"><b>${esc(r.c.name)}</b>
            ${r.limit ? `<span class="progress thin ${level(p)}"><i style="width:${Math.min(100, p * 100)}%"></i></span>
              <small>${money(r.spent)} de ${money(r.limit)} · ${r.spent <= r.limit ? `quedan ${money(r.limit - r.spent)}` : `<span class="neg">te pasaste ${money(r.spent - r.limit)}</span>`}</small>`
            : `<small>${r.spent ? `${money(r.spent)} este mes · ` : ''}<span class="acc-c">Poner límite</span></small>`}</span>
          ${r.limit ? `<span class="pct-badge ${level(p)}">${Math.round(p * 100)}%</span>` : icon('plus', 'chev')}</button>`;
      };

      el.innerHTML = `${sheetHead(`Presupuestos`)}
        <button class="card hero" data-total style="cursor:pointer">
          <div class="budget-top"><div class="label">Total de ${monthName(ym, { month: 'long' })}</div>${total ? `<span class="pct ${pTotal > 1 ? 'neg' : 'acc-c'}">${Math.round(pTotal * 100)}%</span>` : `<span class="acc-c" style="font-size:13px">Definir</span>`}</div>
          <div class="amount" style="font-size:26px;margin-top:6px">${money(spent)}${total ? `<span class="of"> de ${money(total)}</span>` : ''}</div>
          ${total ? `<div class="progress ${pTotal > 0.9 ? 'warn' : ''}"><i style="width:${Math.min(pTotal * 100, 100)}%"></i></div>
            <div class="budget-foot">${total >= spent ? `<span>Te quedan <b>${money(total - spent)}</b></span><span>≈ <b>${money((total - spent) / daysLeft)}</b> por día</span>` : `<span class="neg">Te pasaste por <b class="neg">${money(spent - total)}</b></span>`}</div>`
            : `<p class="help">Tocá para poner un máximo de gasto mensual.</p>`}
        </button>
        ${sumLimits ? `<p class="help" style="margin:-4px 4px 12px">Los límites por categoría suman ${money(sumLimits)}${total && sumLimits > total ? ` <span class="neg">(más que tu total)</span>` : ''}.</p>` : ''}
        ${withLimit.length ? `<div class="section-h"><h3>Con límite</h3></div><div class="list">${withLimit.map(row).join('')}</div>` : ''}
        <div class="section-h"><h3>${withLimit.length ? 'Sin límite' : 'Por categoría'}</h3></div>
        <p class="help" style="margin:-4px 4px 10px">Poné un límite a las categorías que querés controlar. Cuando llegues al 80% te aviso al cargar un gasto.</p>
        <div class="list">${without.map(row).join('')}</div>`;

      el.onclick = e => {
        const b = e.target.closest('button');
        if (!b) return;
        if ('close' in b.dataset) return ctl.close();
        if ('total' in b.dataset) {
          return openAmountSheet({
            title: 'Presupuesto total', label: 'Máximo de gasto por mes', value: total,
            clearLabel: 'Quitar presupuesto total',
            onSave: async v => { await saveSettings({ budget: v }); toast('Presupuesto guardado'); },
            onClear: () => saveSettings({ budget: 0 }),
          });
        }
        if (b.dataset.cat) {
          const r = rows.find(x => x.c.id === b.dataset.cat);
          openAmountSheet({
            title: r.c.name, label: 'Límite por mes', value: r.limit,
            help: `Este mes llevás gastado ${money(r.spent)} en ${esc(r.c.name)}.`,
            clearLabel: 'Quitar límite',
            onSave: async v => { await upsert('categories', { id: r.c.id, budget: v }); toast('Límite guardado'); },
            onClear: () => upsert('categories', { id: r.c.id, budget: 0 }),
          });
        }
      };
    },
  });
}

/** Categorías que ya pasaron el 80% de su límite este mes (para mostrar en Inicio). */
export function budgetAlerts() {
  const ym = curYm();
  return categories('expense')
    .filter(c => c.budget > 0)
    .map(c => ({ c, p: categorySpent(c.id, ym) / c.budget }))
    .filter(x => x.p >= 0.8)
    .sort((a, b) => b.p - a.p);
}
