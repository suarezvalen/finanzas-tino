// Reportes: indicadores del mes, gastos por categoría e ingresos vs. gastos.
import { monthStats, getCategory } from '../store.js';
import { money, esc } from '../ui.js';
import { catIc, monthSwitcher, empty } from '../components.js';
import { curYm, addMonths, monthTitle, monthName, daysInMonth, today } from '../dates.js';
import { go } from '../router.js';

let ym = curYm();
const NO_CAT = { name: 'Sin categoría', icon: 'shapes', color: '#8A9AA8' };

function donut(arr, total) {
  const R = 78, C = 2 * Math.PI * R, gap = arr.length > 1 ? 2.5 : 0;
  let off = 0;
  const segs = arr.map(a => {
    const len = (a.v / total) * C;
    const s = `<circle r="${R}" cx="100" cy="100" fill="none" stroke="${a.c.color}" stroke-width="20" stroke-dasharray="${Math.max(len - gap, 0.5)} ${C}" stroke-dashoffset="${-off}"/>`;
    off += len;
    return s;
  }).join('');
  return `<svg viewBox="0 0 200 200" aria-hidden="true"><circle r="${R}" cx="100" cy="100" fill="none" stroke="#152030" stroke-width="20"/>${segs}</svg>`;
}

export function renderReports(el) {
  const cur = curYm();
  const st = monthStats(ym);
  const prev = monthStats(addMonths(ym, -1));

  const byCat = new Map();
  for (const t of st.list) if (t.type === 'expense') byCat.set(t.categoryId, (byCat.get(t.categoryId) || 0) + t.amount);
  const arr = [...byCat].map(([id, v]) => ({ id, v, c: getCategory(id) || NO_CAT })).sort((a, b) => b.v - a.v);
  const max = arr[0]?.v || 1;

  const days = ym === cur ? Number(today().slice(8)) : ym < cur ? daysInMonth(ym) : 0;
  const savings = st.income > 0 ? (st.income - st.expense) / st.income : null;
  const biggest = st.list.filter(t => t.type === 'expense').sort((a, b) => b.amount - a.amount)[0];
  const diff = prev.expense > 0 ? (st.expense - prev.expense) / prev.expense : null;
  const prevName = monthName(addMonths(ym, -1), { month: 'long' });

  const months = Array.from({ length: 6 }, (_, i) => addMonths(ym, i - 5));
  const series = months.map(m => monthStats(m));
  const top = Math.max(1, ...series.flatMap(s => [s.income, s.expense]));

  const kpi = (label, value, sub, cls = '') => `<div class="kpi"><small>${label}</small><b class="${cls}">${value}</b><span>${sub}</span></div>`;

  el.innerHTML = `
    <header class="top"><h1 class="page-title">Reportes</h1></header>
    ${monthSwitcher(monthTitle(ym))}
    ${!st.list.length ? empty('chart-pie', 'Sin datos en este mes', 'Cuando cargues movimientos, acá vas a ver en qué se te va la plata.') : `
    <div class="kpis">
      ${kpi('Tasa de ahorro', savings === null ? '—' : `${Math.round(savings * 100)}%`, savings === null ? 'Sin ingresos este mes' : savings >= 0 ? 'de tus ingresos' : 'gastaste más de lo que entró', savings === null ? '' : savings >= 0 ? 'pos' : 'neg')}
      ${kpi('Gasto diario promedio', days ? money(st.expense / days) : '—', days ? `en ${days} día${days > 1 ? 's' : ''}` : 'mes futuro')}
      ${kpi('Mayor gasto', biggest ? money(biggest.amount) : '—', biggest ? esc(biggest.note || getCategory(biggest.categoryId)?.name || '') : 'Sin gastos')}
      ${kpi(`vs. ${prevName}`, diff === null ? '—' : `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${Math.abs(Math.round(diff * 100))}%`, diff === null ? 'Sin datos para comparar' : diff <= 0 ? 'gastás menos' : 'gastás más', diff === null ? '' : diff <= 0 ? 'pos' : 'neg')}
    </div>

    ${arr.length ? `<section class="card">
      <div class="label">Gastos por categoría</div>
      <div class="donut-wrap">${donut(arr, st.expense)}
        <div class="donut-center"><div class="label">Total</div><div class="amount">${money(st.expense)}</div></div></div>
      <div class="legend">${arr.map(a => `<button class="row-l" data-cat="${a.id}">${catIc(a.c)}
        <span class="mid"><div><span>${esc(a.c.name)}</span><span>${Math.round((a.v / st.expense) * 100)}%</span></div>
        <div class="bar-thin"><i style="width:${(a.v / max) * 100}%;background:${a.c.color}"></i></div></span>
        <span class="val">${money(a.v)}</span></button>`).join('')}</div>
      <p class="hint">Tocá una categoría para ver sus movimientos.</p>
    </section>` : ''}`}

    <section class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <div class="label">Ingresos vs. gastos</div>
        <div class="legend-mini"><span><i style="background:var(--accent)"></i>Ingresos</span><span><i style="background:#5C6B7A"></i>Gastos</span></div>
      </div>
      <div class="bars">${months.map((m, i) => `<div class="m ${m === ym ? 'cur' : ''}"><div class="pair">
        <i class="in" style="height:${(series[i].income / top) * 100}%"></i><i class="out" style="height:${(series[i].expense / top) * 100}%"></i></div>
        <span>${monthName(m, { month: 'short' }).replace('.', '')}</span></div>`).join('')}</div>
    </section>`;

  el.onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.m) { ym = addMonths(ym, Number(b.dataset.m)); renderReports(el); el.scrollTop = 0; return; }
    if (b.dataset.cat) go('movs', { ym, type: 'expense', categoryId: b.dataset.cat });
  };
}
