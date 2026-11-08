// Reportes: por período, con ajuste por inflación, tendencias y exportación a PDF/Excel.
import { state, saveSettings } from '../store.js';
import { icon } from '../icons.js';
import { money, signed, esc, toast, openSheet } from '../ui.js';
import { catIc, empty, sparkline, sheetHead, txItem } from '../components.js';
import { curYm, addMonths, today, addDays, monthName, shortDate } from '../dates.js';
import { go } from '../router.js';
import { openTx } from '../sheets/tx.js';
import {
  PERIOD_KINDS, makePeriod, prevPeriod, buildReport, monthlySeries, chartMonths, netSeries,
  change, categoryChanges, inflationFor, shortYm,
} from '../logic/report.js';
import { refreshInflation, hasInflationData, lastKnownYm } from '../logic/inflation.js';
import { openInflation } from '../sheets/inflation.js';
import { exportCsv } from '../sheets/settings.js';

const S = { kind: 'month', anchor: curYm(), range: { from: addDays(today(), -89), to: today() } };
const pctFmt = (p, digits = 0) => `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p * 100).toFixed(digits).replace('.', ',')}%`;

function donut(arr, total) {
  const R = 78, C = 2 * Math.PI * R, gap = arr.length > 1 ? 2.5 : 0;
  let off = 0;
  const segs = arr.map(a => {
    const len = (a.v / total) * C;
    const s = `<circle r="${R}" cx="100" cy="100" fill="none" stroke="${a.cat.color}" stroke-width="20" stroke-dasharray="${Math.max(len - gap, 0.5)} ${C}" stroke-dashoffset="${-off}"/>`;
    off += len;
    return s;
  }).join('');
  return `<svg viewBox="0 0 200 200" aria-hidden="true"><circle r="${R}" cx="100" cy="100" fill="none" stroke="#152030" stroke-width="20"/>${segs}</svg>`;
}

const kpi = (label, value, sub, cls = '') => `<div class="kpi"><small>${label}</small><b class="${cls}">${value}</b><span>${sub}</span></div>`;
function vsText(now, before, goodWhenUp) {
  const c = change(now, before);
  if (c == null) return 'sin datos para comparar';
  const good = goodWhenUp ? c >= 0 : c <= 0;
  return `<span class="${good ? 'pos' : 'neg'}">${pctFmt(c)}</span> vs. anterior`;
}

export function renderReports(el) {
  const real = !!state.settings.realValues;
  const p = makePeriod(S.kind, S.anchor, S.range);
  const r = buildReport(p, real);
  const prev = buildReport(prevPeriod(p), real);
  const cm = chartMonths(p);
  const series = monthlySeries(cm, real);
  const top = Math.max(1, ...series.flatMap(s => [s.income, s.expense]));
  const changes = prev.expense > 0 ? categoryChanges(r, prev) : [];
  const ups = changes.filter(c => c.diff > 0).slice(0, 3);
  const downs = changes.filter(c => c.diff < 0).slice(0, 2);
  const net = netSeries(cm, real);
  const infl = real || hasInflationData() ? inflationFor(p) : null;
  const isMonth = p.kind === 'month';
  const avg = isMonth ? (r.elapsedDays ? r.expense / r.elapsedDays : 0) : r.expense / r.monthsCount;
  const maxCat = r.byCat[0]?.v || 1;
  const maxAcc = r.byAcc[0]?.v || 1;
  const lastInfl = lastKnownYm();

  el.innerHTML = `
    <header class="top"><h1 class="page-title">Reportes</h1>
      <button class="icon-btn" data-export aria-label="Exportar">${icon('download')}</button></header>
    <div class="seg period-seg" style="margin-bottom:10px">${Object.entries(PERIOD_KINDS).map(([k, l]) => `<button data-kind="${k}" class="${S.kind === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${S.kind === 'range' ? `<div class="row range-row">
        <label class="date-pill">${icon('calendar')}<span>${shortDate(p.from)}</span><input type="date" data-rf value="${p.from}"></label>
        <span class="range-sep">a</span>
        <label class="date-pill">${icon('calendar')}<span>${shortDate(p.to)}</span><input type="date" data-rt value="${p.to}"></label></div>`
      : `<div class="month-sw"><button data-m="-1" aria-label="Anterior">${icon('chevron-left')}</button><b>${esc(p.label)}</b><button data-m="1" aria-label="Siguiente">${icon('chevron-right')}</button></div>`}
    <button class="switch-row compact" data-real>
      ${icon('percent')}<span class="info"><b>Ajustar por inflación</b><small>${real ? `En pesos de hoy · IPC INDEC${lastInfl ? ` hasta ${shortYm(lastInfl, true)}` : ''}` : 'Compará meses sin que la inflación te engañe'}</small></span>
      <span class="switch ${real ? 'on' : ''}"></span></button>
    ${real ? `<div class="row" style="justify-content:flex-end;margin:-4px 2px 10px"><button class="link" data-infl style="font-size:13px">${icon('pencil')}Ver o cargar inflación</button></div>` : ''}

    ${!r.list.length ? `<div style="margin-top:12px">${empty('chart-pie', 'Sin datos en este período', 'Cuando cargues movimientos, acá vas a ver en qué se te va la plata.')}</div>` : `
    <div class="kpis">
      ${kpi('Ingresos', money(r.income), vsText(r.income, prev.income, true), 'pos')}
      ${kpi('Gastos', money(r.expense), vsText(r.expense, prev.expense, false))}
      ${kpi('Ahorro', signed(r.savings), r.rate == null ? 'sin ingresos' : `${Math.round(r.rate * 100)}% de tus ingresos`, r.savings >= 0 ? 'pos' : 'neg')}
      ${kpi(isMonth ? 'Gasto diario' : 'Gasto mensual', money(avg), isMonth ? `promedio en ${r.elapsedDays} días` : `promedio en ${r.monthsCount} meses`)}
    </div>

    ${infl ? `<section class="card infl-card">
      <div class="row" style="align-items:center;gap:10px">${catIc({ icon: 'percent', color: '#FFB547' })}
        <div class="info"><b>Inflación del período: ${pctFmt(infl.pct, 1)}${infl.estimated ? '*' : ''}</b>
        <small>${inflationSentence(r, prev, infl)}</small></div></div>
      ${infl.estimated ? '<p class="help">* Los meses que el INDEC todavía no publicó se estiman con el último dato.</p>' : ''}
    </section>` : ''}

    ${r.byCat.length ? `<section class="card">
      <div class="label">Gastos por categoría</div>
      <div class="donut-wrap">${donut(r.byCat, r.expense)}
        <div class="donut-center"><div class="label">Total</div><div class="amount">${money(r.expense)}</div></div></div>
      <div class="legend">${r.byCat.map(a => `<button class="row-l" data-cat="${a.id}">${catIc(a.cat)}
        <span class="mid"><div><span>${esc(a.cat.name)}</span><span>${Math.round((a.v / r.expense) * 100)}%</span></div>
        <div class="bar-thin"><i style="width:${(a.v / maxCat) * 100}%;background:${a.cat.color}"></i></div></span>
        <span class="val">${money(a.v)}</span></button>`).join('')}</div>
      <p class="hint">Tocá una categoría para ver sus movimientos.</p>
    </section>` : ''}

    ${ups.length || downs.length ? `<section class="card">
      <div class="label">Qué cambió vs. el período anterior</div>
      <div class="list flat">${[...ups, ...downs].map(c => `<button class="item" data-cat="${c.id}">${catIc(c.cat)}
        <span class="info"><b>${esc(c.cat.name)}</b><small>${money(c.before)} → ${money(c.now)}</small></span>
        <span class="val ${c.diff > 0 ? 'neg' : 'pos'}">${c.diff > 0 ? '▲' : '▼'} ${c.pct == null ? 'nuevo' : pctFmt(c.pct)}</span></button>`).join('')}</div>
    </section>` : ''}`}

    <section class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <div class="label">Ingresos vs. gastos</div>
        <div class="legend-mini"><span><i style="background:var(--accent)"></i>Ingresos</span><span><i style="background:#5C6B7A"></i>Gastos</span></div>
      </div>
      <div class="bars ${series.length > 8 ? 'dense' : ''}">${series.map(s => `<div class="m ${isMonth && s.ym === p.anchor ? 'cur' : ''}"><div class="pair">
        <i class="in" style="height:${(s.income / top) * 100}%"></i><i class="out" style="height:${(s.expense / top) * 100}%"></i></div>
        <span>${shortYm(s.ym)}</span></div>`).join('')}</div>
    </section>

    ${r.list.length ? `
    ${r.byInc.length ? `<section class="card"><div class="label">Ingresos por categoría</div>
      <div class="list flat">${r.byInc.map(a => `<div class="item">${catIc(a.cat)}<span class="info"><b>${esc(a.cat.name)}</b><small>${Math.round((a.v / r.income) * 100)}% de tus ingresos</small></span><span class="val pos">${money(a.v)}</span></div>`).join('')}</div>
    </section>` : ''}

    ${r.byAcc.length ? `<section class="card"><div class="label">Gastos por medio de pago</div>
      <div class="legend">${r.byAcc.map(a => `<div class="row-l"><span class="mid"><div><span>${esc(a.acc?.name || '—')}</span><span>${Math.round((a.v / r.expense) * 100)}%</span></div>
        <div class="bar-thin"><i style="width:${(a.v / maxAcc) * 100}%;background:var(--accent)"></i></div></span><span class="val">${money(a.v)}</span></div>`).join('')}</div>
    </section>` : ''}

    ${r.top.length ? `<div class="section-h"><h3>Mayores gastos</h3></div><div class="list">${r.top.map(x => txItem(x.t)).join('')}</div>` : ''}
    ` : ''}

    ${net.length > 1 ? `<section class="card" style="margin-top:14px">
      <div class="label">Patrimonio neto${real ? ' (en pesos de hoy)' : ''}</div>
      <div class="net-row"><div><div class="amount" style="font-size:22px">${money(net[net.length - 1].v)}</div>
        <small class="${net[net.length - 1].v >= net[0].v ? 'pos' : 'neg'}">${signed(net[net.length - 1].v - net[0].v)} desde ${monthName(net[0].ym, { month: 'long' })}</small></div>
        ${sparkline(net.map(n => n.v), 140, 48)}</div>
    </section>` : ''}`;

  bind(el, p, r, real);
  if (real) refreshInflation().then(updated => { if (updated) renderReports(el); });
}

function inflationSentence(r, prev, infl) {
  const c = change(r.expense, prev.expense);
  if (r.real) return c == null ? 'Montos expresados en pesos de hoy.' : `En pesos de hoy, tus gastos ${c >= 0 ? 'subieron' : 'bajaron'} ${pctFmt(Math.abs(c))} respecto del período anterior.`;
  return 'Activá el ajuste para comparar sin el efecto de la inflación.';
}

function bind(el, p, r, real) {
  el.onclick = async e => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.kind) { S.kind = d.kind; if (d.kind !== 'range') S.anchor = curYm(); return rerender(el); }
    if (d.m) {
      const step = { month: 1, m3: 3, m6: 6, year: 12 }[S.kind];
      S.anchor = addMonths(S.anchor, Number(d.m) * step);
      return rerender(el);
    }
    if ('real' in d) {
      if (!real && !hasInflationData()) {
        toast('Descargando datos de inflación…', { icon: 'percent' });
        const ok = await refreshInflation({ force: true });
        if (!ok) { toast('Necesito internet la primera vez para bajar la inflación', { icon: 'info' }); return; }
      }
      return saveSettings({ realValues: !real });
    }
    if ('infl' in d) return openInflation();
    if (d.cat) {
      const params = { type: 'expense', categoryId: d.cat };
      if (p.kind === 'month') params.ym = p.anchor;
      else Object.assign(params, { from: p.from, to: p.to, rangeLabel: p.label });
      return go('movs', params);
    }
    if (d.tx) return openTx(d.tx);
    if ('export' in d) return openExport(p, r, real);
  };
  for (const [sel, key] of [['[data-rf]', 'from'], ['[data-rt]', 'to']]) {
    const inp = el.querySelector(sel);
    if (!inp) continue;
    inp.onchange = () => { if (inp.value) { S.range = { ...S.range, [key]: inp.value }; rerender(el); } };
    inp.onclick = () => { try { inp.showPicker?.(); } catch { /* selector nativo */ } };
  }
}

function rerender(el) { renderReports(el); el.scrollTop = 0; }

function openExport(p, r, real) {
  openSheet({
    render(el, ctl) {
      el.innerHTML = `${sheetHead('Exportar reporte')}
        <p class="help" style="margin:-6px 2px 14px">${esc(p.label)}${real ? ' · ajustado por inflación' : ''}</p>
        <div class="list">
          <button class="item tap" data-pdf>${catIc({ icon: 'file-text', color: '#FF5C7A' })}<span class="info"><b>Reporte en PDF</b><small>Resumen con gráficos, listo para guardar o compartir</small></span>${icon('chevron-right', 'chev')}</button>
          <button class="item tap" data-csv>${catIc({ icon: 'file-spreadsheet', color: '#2EF2A0' })}<span class="info"><b>Movimientos en Excel</b><small>Archivo .csv con los movimientos del período</small></span>${icon('chevron-right', 'chev')}</button>
        </div>`;
      el.onclick = async e => {
        const b = e.target.closest('button');
        if (!b) return;
        if ('close' in b.dataset) return ctl.close();
        if ('csv' in b.dataset) {
          await exportCsv(r.list, `finanzas-movimientos-${p.from}_a_${p.to}.csv`);
          return ctl.close();
        }
        if ('pdf' in b.dataset) {
          b.disabled = true;
          b.querySelector('small').textContent = 'Generando…';
          try {
            const { exportReportPdf } = await import('../logic/pdf.js');
            await exportReportPdf(p, real);
            ctl.close();
          } catch (err) {
            console.error(err);
            toast('No se pudo generar el PDF. Probá de nuevo con internet.', { icon: 'triangle-alert' });
            b.disabled = false;
          }
        }
      };
    },
  });
}
