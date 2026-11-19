// Sector Negocio: Resumen, Campañas, Registro y Ajustes. Aparte de las finanzas personales.
import { bizDays, bizCosts, bizCfg, upsert } from '../store.js';
import { icon } from '../icons.js';
import { money, esc, signed, toast, ensureVisible } from '../ui.js';
import { catIc, empty, sparkline } from '../components.js';
import { go, switchMode } from '../router.js';
import { addMonths, monthName, cap, today, addDays, daysInMonth, pad, parseYmd } from '../dates.js';
import {
  eco, prefs, hasBiz, breakEven, contribution, varPct, PERIODS, makeBizPeriod, prevBizPeriod, totals, pctChange,
  groupAds, adsetVerdicts, VERDICTS, fmtRoas, alerts, goalStatus, weekdayStats, monthsWithData, latestReport,
  lastDay, firstDay, shortDay, statusLabel, costCat, costArs, costInPeriod, dayCalc,
} from '../logic/biz.js';
import { sync, session, syncStatus } from '../logic/sync.js';
import {
  openBizCost, openAdset, openBizReport, openBizExport, openBizImport, openGoalEdit, openCreatives, openDayDetail,
} from '../sheets/biz.js';

/* ---------- Estado compartido de las pantallas ---------- */
export const BS = { kind: 'd7', month: null, creatives: 'activos' };

const pct = (v, d = 1) => (v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(d).replace('.', ',')}%`);
const pctSigned = v => (v == null ? '' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(0)}%`);
const intf = v => Math.round(v || 0).toLocaleString('es-AR');
const roasCls = (r, be) => (r == null || !be ? '' : r >= be ? 'pos' : 'neg');

function vs(now, before, goodUp = true) {
  const c = pctChange(now, before);
  if (c == null) return '<span>sin datos para comparar</span>';
  const good = goodUp ? c >= 0 : c <= 0;
  return `<span class="${good ? 'pos' : 'neg'}">${pctSigned(c)}</span> vs. anterior`;
}
const kpi = (label, value, sub, cls = '', act = '') =>
  `<${act ? `button data-act="${act}"` : 'div'} class="kpi">${''}<small>${label}</small><b class="${cls}">${value}</b><span>${sub}</span></${act ? 'button' : 'div'}>`;

function periodChips() {
  return `<div class="chips biz-periods" id="b-periods">${Object.entries(PERIODS).map(([k, l]) =>
    `<button class="chip ${BS.kind === k ? 'on' : ''}" data-kind="${k}">${l}</button>`).join('')}</div>`;
}

function header(title, extra = '') {
  return `<header class="top">
    <span class="biz-badge">${icon('store')}</span>
    <div class="hi"><small>${esc(eco().name || 'Negocio')}</small><strong class="biz-title">${title}</strong></div>
    ${extra}</header>`;
}

function dataLine() {
  const last = lastDay();
  if (!last) return '';
  const st = syncStatus();
  const y = addDays(today(), -1);
  const when = last === y ? 'ayer' : last === today() ? 'hoy' : shortDay(last);
  return `<p class="biz-data ${last < y ? 'late' : ''}">${icon(last < y ? 'clock' : 'circle-check')}Datos hasta ${when}${st.status === 'syncing' ? ' · actualizando…' : ''}</p>`;
}

function noData() {
  return `${empty('store', 'Todavía no llegaron datos del negocio', 'Todos los días a las 9:05 el reporte diario sube las ventas de Shopify, el gasto de Meta y el email del día anterior. Cuando llegue el primero, acá vas a ver todo.')}
    <button class="btn" data-act="sync" style="margin-top:12px">${icon('refresh-cw')}Buscar datos ahora</button>
    <button class="btn ghost" data-act="import" style="margin-top:6px">${icon('upload')}Importar un archivo a mano</button>`;
}

/* ---------- Gráficos ---------- */
function dailyBars(list, be) {
  const days = list.slice(-31);
  if (days.length < 2) return '';
  const top = Math.max(1, ...days.flatMap(x => [x.net, x.ads]));
  const dense = days.length > 14;
  return `<div class="bbars ${dense ? 'dense' : ''}">${days.map(x => {
    const r = x.ads > 0 ? x.net / x.ads : null;
    return `<button class="m" data-day="${x.date}" title="${shortDay(x.date)}"><div class="pair">
      <i class="in" style="height:${(x.net / top) * 100}%"></i><i class="out" style="height:${(x.ads / top) * 100}%"></i></div>
      <em class="dot ${r == null ? '' : r >= be ? 'ok' : 'bad'}"></em>
      <span>${dense ? (Number(x.date.slice(8)) % 5 === 0 || days.length <= 16 ? Number(x.date.slice(8)) : '') : Number(x.date.slice(8))}</span></button>`;
  }).join('')}</div>`;
}

function costStack(t) {
  if (!(t.net > 0)) return '';
  const parts = [
    { k: 'Publicidad', v: t.ads + t.adsTax, c: '#FFB547' },
    { k: 'Comisiones e IIBB', v: t.fees + t.iibb + t.other, c: '#8B93FF' },
    { k: 'Producto y envío', v: t.cogs, c: '#5CC8FF' },
    { k: 'Gastos fijos', v: t.fixed, c: '#FF8FB8' },
  ].filter(p => p.v > 0);
  const used = parts.reduce((s, p) => s + p.v, 0);
  const gain = t.net - used;
  if (gain > 0) parts.push({ k: 'Te queda', v: gain, c: '#2EF2A0' });
  const base = Math.max(t.net, used);
  return `<section class="card">
    <div class="label">De cada $ 100 que facturaste</div>
    <div class="stack">${parts.map(p => `<i style="width:${(p.v / base) * 100}%;background:${p.c}"></i>`).join('')}</div>
    <div class="legend">${parts.map(p => `<div class="row-l"><span class="sw" style="background:${p.c}"></span>
      <span class="mid"><div><span>${p.k}</span><span>$ ${Math.round((p.v / t.net) * 100)}</span></div></span><span class="val">${money(p.v)}</span></div>`).join('')}
      ${gain < 0 ? `<div class="row-l"><span class="sw" style="background:var(--neg)"></span><span class="mid"><div><span>Pérdida</span><span class="neg">−$ ${Math.round((-gain / t.net) * 100)}</span></div></span><span class="val neg">${signed(gain)}</span></div>` : ''}</div>
  </section>`;
}

function funnelCard(t) {
  if (!(t.visits > 0)) return '';
  const steps = [['Visitas', t.visits], ['Agregaron al carrito', t.carts], ['Llegaron al pago', t.checkouts], ['Compraron', t.orders]];
  return `<section class="card">
    <div class="label">Embudo de la tienda</div>
    <div class="funnel">${steps.map(([l, v], i) => `<div class="f-row"><div class="f-top"><span>${l}</span><b>${intf(v)}${i ? ` <small>${pct(v / t.visits)}</small>` : ''}</b></div>
      <div class="bar-thin"><i style="width:${Math.max(1.5, (v / t.visits) * 100)}%;background:${['#5CC8FF', '#8B93FF', '#C084FC', '#2EF2A0'][i]}"></i></div></div>`).join('')}</div>
    <p class="hint">Conversión ${pct(t.conv)}: de cada 100 visitas, ${(t.conv * 100).toFixed(1).replace('.', ',')} compran.</p>
  </section>`;
}

function weekdayCard(p) {
  const w = weekdayStats(p);
  if (w.reduce((s, x) => s + x.n, 0) < 10) return '';
  const top = Math.max(0.01, ...w.map(x => x.avgOrders));
  const best = w.reduce((a, b) => (b.avgOrders > a.avgOrders ? b : a));
  return `<section class="card">
    <div class="label">Qué días vendés más</div>
    <div class="wbars">${w.map(x => `<div class="m ${x === best ? 'cur' : ''}"><b>${x.avgOrders.toFixed(1).replace('.', ',')}</b><i style="height:${(x.avgOrders / top) * 100}%"></i><span>${x.l}</span></div>`).join('')}</div>
    <p class="hint">Pedidos promedio por día de la semana en el período. El mejor: ${best.l.toLowerCase()} (ROAS ${fmtRoas(best.roas)}).</p>
  </section>`;
}

function goalCard() {
  const g = goalStatus();
  if (!g) return `<button class="card card-cta" data-act="goal"><span class="cta-ic">${icon('target')}</span><span class="info"><b>Poné un objetivo del mes</b><small>Facturación o ganancia: te digo si llegás y cuánto necesitás por día</small></span>${icon('chevron-right', 'chev')}</button>`;
  const row = (label, x) => x ? `<div class="goal-row">
    <div class="budget-top"><span class="g-l">${label}</span><span class="pct ${x.pct >= 1 ? 'pos' : 'acc-c'}">${Math.round(x.pct * 100)}%</span></div>
    <div class="progress"><i style="width:${Math.min(100, x.pct * 100)}%"></i><b class="proj" style="left:${Math.min(100, (x.projected / x.goal) * 100)}%"></b></div>
    <div class="budget-foot"><span>Vas <b>${money(x.sofar)}</b> de ${money(x.goal)}</span><span>Proyección <b class="${x.projected >= x.goal ? 'pos' : 'neg'}">${money(x.projected)}</b></span></div>
    ${g.left > 0 && x.pct < 1 ? `<p class="hint" style="margin:6px 0 0">Para llegar necesitás ${money(x.perDay)} por día en los ${g.left} días que quedan.</p>` : ''}</div>` : '';
  return `<button class="card" data-act="goal"><div class="label">Objetivo de ${monthName(g.ym, { month: 'long' })}</div>
    ${row('Facturación', g.sales)}${row('Ganancia', g.profit)}</button>`;
}

function alertsCard() {
  const list = alerts();
  if (!list.length) return '';
  return `<div class="section-h"><h3>Atención</h3></div><div class="list">${list.map(a => `<${a.go ? `button data-goto="${a.go}"` : 'div'} class="item biz-alert lv-${a.level}">
    ${catIc({ icon: a.icon, color: a.level === 'bad' ? '#FF9A3C' : a.level === 'good' ? '#2EF2A0' : a.level === 'info' ? '#5CC8FF' : '#FFC24D' })}
    <span class="info"><b>${esc(a.title)}</b><small class="wrap">${esc(a.text)}</small></span></${a.go ? 'button' : 'div'}>`).join('')}</div>`;
}

function todoCard() {
  const v = adsetVerdicts().filter(g => g.v);
  if (!v.length) return '';
  const by = k => v.filter(g => g.v.k === k);
  const chip = k => by(k).length ? `<span class="vchip" style="--c:${VERDICTS[k].color}">${VERDICTS[k].label} ${by(k).length}</span>` : '';
  return `<button class="card card-cta" data-goto="bcamp"><span class="cta-ic">${icon('target')}</span>
    <span class="info"><b>Qué hacer hoy con los anuncios</b><small class="vchips">${['escalar', 'cortar', 'esperar', 'mantener'].map(chip).join('')}</small></span>${icon('chevron-right', 'chev')}</button>`;
}

function reportCard() {
  const d = latestReport();
  if (!d) return '';
  return `<button class="card card-cta report-card" data-report="${d.id}"><span class="cta-ic">${icon('file-text')}</span>
    <span class="info"><b>Informe del ${shortDay(d.date)}</b><small class="wrap">${esc(d.report.headline || 'Tocá para leerlo completo')}</small></span>${icon('chevron-right', 'chev')}</button>`;
}

/* ---------- Resumen ---------- */
export function renderBizHome(el) {
  if (!hasBiz()) {
    el.innerHTML = `${header('Negocio', exitBtn())}${noData()}`;
    return bindCommon(el);
  }
  const e = eco();
  const be = breakEven(e);
  const p = makeBizPeriod(BS.kind);
  const t = totals(p);
  const prev = totals(prevBizPeriod(p));
  const winning = t.result >= 0;
  const emailShare = t.email != null && t.net > 0 ? t.email / t.net : null;

  el.innerHTML = `
    ${header('Resumen', `<button class="icon-btn" data-act="export" aria-label="Descargar Excel">${icon('file-spreadsheet')}</button>
      <button class="icon-btn" data-act="sync" aria-label="Actualizar">${icon('refresh-cw')}</button>${exitBtn()}`)}
    ${dataLine()}
    ${periodChips()}

    <section class="card hero biz-hero">
      <div class="budget-top"><div class="label">Resultado · ${esc(p.label)}</div><span class="pill-st ${winning ? 'pos' : 'neg'}">${winning ? 'Ganando' : 'Perdiendo'}</span></div>
      <div class="amount ${winning ? '' : 'neg'}">${signed(t.result)}</div>
      <div class="net"><span>${prev.n ? `<span class="${t.result >= prev.result ? 'pos' : 'neg'}">${signed(t.result - prev.result)}</span> vs. ${BS.kind === 'ayer' ? 'el día anterior' : 'el período anterior'}` : 'sin período anterior para comparar'}</span>${sparkline(cumulative(t.days), 120, 36)}</div>
      <div class="row">
        <div class="pill"><small>Facturaste</small><b>${money(t.net)}</b></div>
        <div class="pill"><small>Publicidad</small><b>${money(t.ads + t.adsTax)}</b></div>
        <div class="pill"><small>ROAS</small><b class="${roasCls(t.roas, be)}">${fmtRoas(t.roas)}</b></div>
      </div>
      <p class="help" style="margin-top:10px">${be ? `Equilibrio ${fmtRoas(be)}: por debajo, la publicidad te hace perder plata. Lo máximo que podés pagar por venta es ${money(contribution(e))}.` : 'Falta cargar la economía del producto para saber el equilibrio.'}</p>
    </section>

    ${reportCard()}
    ${todoCard()}

    <div class="kpis">
      ${kpi('Facturación', money(t.net), vs(t.net, prev.net))}
      ${kpi('Pedidos', intf(t.orders), t.ticket ? `ticket ${money(t.ticket)}` : '—')}
      ${kpi('Costo por venta', t.cpa ? money(t.cpa) : '—', t.cpa ? `<span class="${t.cpa <= contribution(e) ? 'pos' : 'neg'}">máx. ${money(contribution(e))}</span>` : 'sin ventas')}
      ${kpi('Margen', pct(t.margin, 0), `${money(t.result)} de ${money(t.net)}`, t.margin >= 0 ? 'pos' : 'neg')}
      ${kpi('Comisiones e IIBB', money(t.fees + t.iibb + t.other), `${pct(varPct(e), 1)} de lo que vendés`)}
      ${kpi('Gastos fijos', money(t.fixed), bizCosts().length ? `${bizCosts().length} cargado${bizCosts().length === 1 ? '' : 's'}` : '<span class="acc-c">cargalos con +</span>', '', 'costs')}
      ${kpi('Conversión', pct(t.conv), `${intf(t.visits)} visitas`)}
      ${kpi('Ventas por email', emailShare == null ? 'sin datos' : pct(emailShare, 0), emailShare == null ? 'Klaviyo' : money(t.email))}
    </div>

    ${alertsCard()}

    <section class="card" style="margin-top:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <div class="label">Facturación vs. publicidad</div>
        <div class="legend-mini"><span><i style="background:var(--accent)"></i>Ventas</span><span><i style="background:#5C6B7A"></i>Meta</span></div>
      </div>
      ${dailyBars(t.days.length >= 7 ? t.days : totals({ from: addDays(p.to, -13), to: p.to }).days, be)}
      <p class="hint">El punto verde marca los días por encima del equilibrio. Tocá un día para ver el detalle.</p>
    </section>

    ${goalCard()}
    ${costStack(t)}
    ${funnelCard(t)}
    ${weekdayCard(BS.kind === 'ayer' ? makeBizPeriod('todo') : p)}
    <p class="foot">Los resultados son estimados: salen de los porcentajes de la economía del producto, no de la contabilidad.<br>Para la plata vale Shopify; para decidir sobre un anuncio, Meta.</p>`;
  bindCommon(el);
}

const cumulative = days => { let a = 0; return days.map(x => (a += x.result)); };
const exitBtn = () => `<button class="icon-btn" data-act="personal" aria-label="Volver a mis finanzas">${icon('house')}</button>`;

/* ---------- Campañas ---------- */
export function renderBizCampaigns(el) {
  if (!hasBiz()) { el.innerHTML = `${header('Campañas', exitBtn())}${noData()}`; return bindCommon(el); }
  const e = eco();
  const be = breakEven(e);
  const p = makeBizPeriod(BS.kind);
  const v = adsetVerdicts();
  const withV = v.filter(g => g.v).sort((a, b) => ['escalar', 'cortar', 'esperar', 'mantener'].indexOf(a.v.k) - ['escalar', 'cortar', 'esperar', 'mantener'].indexOf(b.v.k) || b.spend - a.spend);
  const sets = groupAds(p);
  const days = totals(p).days.slice().reverse();
  const cr = groupAds(makeBizPeriod('todo'), 'ad').filter(a => BS.creatives === 'todos' || a.active).sort((a, b) => b.purch - a.purch || (b.roas || 0) - (a.roas || 0));

  el.innerHTML = `
    ${header('Campañas', `<button class="icon-btn" data-act="export" aria-label="Descargar Excel">${icon('file-spreadsheet')}</button>${exitBtn()}`)}
    ${dataLine()}

    <div class="section-h" style="margin-top:4px"><h3>Qué hacer hoy</h3><small class="muted-s">últimos 7 días</small></div>
    ${withV.length ? `<div class="list">${withV.map(g => adsetItem(g, be, true)).join('')}</div>
      <p class="hint">Reglas: escalar si el ROAS pasa ${fmtRoas(be * e.scaleMult)} (subir ${e.scaleUpPct}%), cortar si queda debajo de ${fmtRoas(be)} con más de ${money(e.minSpendTickets * e.price)} gastados o sin compras con ${money(e.cutNoSalesTickets * e.price)}. Los cambios los hacés vos en Meta.</p>`
      : '<p class="help" style="margin:0 4px">No hay conjuntos activos con gasto en los últimos 7 días.</p>'}

    <div class="section-h"><h3>Conjuntos</h3></div>
    ${periodChips()}
    ${sets.length ? `<div class="list" style="margin-top:10px">${sets.map(g => adsetItem(g, be, false)).join('')}</div>` : '<p class="help">Sin gasto en este período.</p>'}

    <div class="section-h"><h3>Registro diario de Meta</h3></div>
    ${days.length ? `<div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Día</th><th>Gasto</th><th>Compras</th><th>Costo/compra</th><th>ROAS</th><th>CPM</th><th>CTR</th></tr></thead>
      <tbody>${days.map(x => `<tr data-day="${x.date}"><td>${shortDay(x.date)}</td><td>${money(x.ads)}</td><td>${x.metaPurch}</td><td>${x.metaPurch ? money(x.ads / x.metaPurch) : '—'}</td>
        <td class="${roasCls(x.metaValue / x.ads, be)}">${x.ads ? fmtRoas(x.metaValue / x.ads) : '—'}</td><td>${x.impr ? money(x.ads / x.impr * 1000) : '—'}</td><td>${x.impr ? pct(x.clicks / x.impr, 2) : '—'}</td></tr>`).join('')}</tbody></table></div>
      <p class="hint">ROAS y compras según Meta (atribución de Meta). Tocá un día para ver cada anuncio.</p>` : ''}

    <div class="section-h"><h3>Ranking de creativos</h3><button data-act="creatives">Ver todo</button></div>
    <div class="seg" style="margin-bottom:10px"><button data-cr="activos" class="${BS.creatives === 'activos' ? 'on' : ''}">Activos</button><button data-cr="todos" class="${BS.creatives === 'todos' ? 'on' : ''}">Todos, desde el principio</button></div>
    ${cr.length ? `<div class="list">${cr.slice(0, 8).map((a, i) => `<button class="item tap" data-adset="${esc(a.adsetId || a.adset)}">
      <span class="rank">${i + 1}</span>
      <span class="info"><b>${esc(a.name)}</b><small>${a.purch} ventas · ${a.cpa ? `${money(a.cpa)} c/u` : 'sin ventas'} · ${a.activeDays} días · ${statusLabel(a.status)}</small></span>
      <span class="val"><span class="${roasCls(a.roas, be)}">${fmtRoas(a.roas)}</span><small class="sub-val">${money(a.spend)}</small></span></button>`).join('')}</div>` : '<p class="help">No hay anuncios activos.</p>'}
    <p class="foot">Los veredictos son una recomendación: la app nunca toca tus campañas.</p>`;
  bindCommon(el);
}

function adsetItem(g, be, withVerdict) {
  const V = withVerdict && g.v ? VERDICTS[g.v.k] : null;
  return `<button class="item tap" data-adset="${esc(g.key)}">
    <span class="info"><b><span class="ell">${esc(g.name)}</span>${V ? `<span class="vchip" style="--c:${V.color}">${V.label}</span>` : g.active ? '' : '<span class="tag off-tag">Pausa</span>'}</b>
      <small>${g.purch} compras · ${g.cpa ? `${money(g.cpa)} c/u` : 'sin compras'} · ${money(g.spend)}</small>
      ${V ? `<small class="wrap why">${esc(g.v.why)}</small>` : ''}</span>
    <span class="val"><span class="${roasCls(g.roas, be)}">${fmtRoas(g.roas)}</span><small class="sub-val">ROAS</small></span></button>`;
}

/* ---------- Registro ---------- */
export function renderBizLog(el) {
  if (!hasBiz()) { el.innerHTML = `${header('Registro', exitBtn())}${noData()}`; return bindCommon(el); }
  const months = monthsWithData();
  if (!BS.month || !months.includes(BS.month)) BS.month = months.at(-1);
  const ym = BS.month;
  const be = breakEven();
  const p = { from: `${ym}-01`, to: `${ym}-${pad(daysInMonth(ym))}` };
  const t = totals(p);
  const rows = t.days.slice().reverse();
  const orders = bizDays().filter(d => d.date.startsWith(ym)).flatMap(d => (d.orders || []).map(o => ({ ...o, date: d.date }))).reverse();
  const costs = bizCosts().map(c => ({ c, v: costInPeriod(c, p.from, p.to) })).filter(x => x.v > 0);
  const i = months.indexOf(ym);

  el.innerHTML = `
    ${header('Registro', `<button class="icon-btn" data-act="export" aria-label="Descargar Excel">${icon('file-spreadsheet')}</button>${exitBtn()}`)}
    <div class="month-sw ${months.length < 2 ? 'disabled' : ''}">
      <button data-mm="-1" aria-label="Mes anterior" ${i <= 0 ? 'disabled' : ''}>${icon('chevron-left')}</button>
      <b>${cap(monthName(ym))}</b>
      <button data-mm="1" aria-label="Mes siguiente" ${i >= months.length - 1 ? 'disabled' : ''}>${icon('chevron-right')}</button></div>

    <div class="kpis three">
      ${kpi('Facturación', money(t.net), `${t.orders} pedidos`)}
      ${kpi('Publicidad', money(t.ads + t.adsTax), `ROAS ${fmtRoas(t.roas)}`)}
      ${kpi('Resultado', signed(t.result), pct(t.margin, 0) + ' de margen', t.result >= 0 ? 'pos' : 'neg')}
    </div>

    <button class="btn primary" data-act="export">${icon('download')}Descargar Excel con gráficos</button>

    <div class="section-h"><h3>Día por día</h3><small class="muted-s">${t.n} días cargados</small></div>
    <div class="tbl-wrap"><table class="tbl sticky1">
      <thead><tr><th>Día</th><th>Pedidos</th><th>Facturación</th><th>Publicidad</th><th>Comisiones e IIBB</th><th>Fijos</th><th>Resultado</th><th>ROAS</th><th>Visitas</th><th>Conv.</th></tr></thead>
      <tbody>${rows.map(x => `<tr data-day="${x.date}"><td>${shortDay(x.date)}</td><td>${x.orders}</td><td>${money(x.net)}</td><td>${money(x.ads + x.adsTax)}</td><td>${money(x.fees + x.iibb + x.other)}</td><td>${money(x.fixed + x.cogs)}</td>
        <td class="${x.result >= 0 ? 'pos' : 'neg'}">${signed(x.result)}</td><td class="${roasCls(x.roas, be)}">${fmtRoas(x.roas)}</td><td>${intf(x.visits)}</td><td>${x.visits ? pct(x.orders / x.visits) : '—'}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Total</td><td>${t.orders}</td><td>${money(t.net)}</td><td>${money(t.ads + t.adsTax)}</td><td>${money(t.fees + t.iibb + t.other)}</td><td>${money(t.fixed + t.cogs)}</td>
        <td class="${t.result >= 0 ? 'pos' : 'neg'}">${signed(t.result)}</td><td>${fmtRoas(t.roas)}</td><td>${intf(t.visits)}</td><td>${pct(t.conv)}</td></tr></tfoot>
    </table></div>
    <p class="hint">Deslizá la tabla hacia los costados. Tocá un día para ver pedidos y anuncios.</p>

    <div class="section-h"><h3>Gastos del mes</h3><button data-act="newcost">Agregar</button></div>
    ${costs.length ? `<div class="list">${costs.map(({ c, v }) => `<button class="item tap" data-cost="${c.id}">${catIc(costCat(c.cat))}
      <span class="info"><b>${esc(c.name)}</b><small>${c.freq === 'once' ? `Único · ${shortDay(c.date)}` : `Mensual · ${c.currency === 'USD' ? `US$ ${c.amount}` : money(c.amount)}`}</small></span>
      <span class="val">${money(v)}</span></button>`).join('')}</div>`
      : `<button class="card card-cta" data-act="newcost"><span class="cta-ic">${icon('plus')}</span><span class="info"><b>Cargá tus gastos fijos</b><small>Shopify, apps, Klaviyo, dominio, diseño… así el resultado es el real</small></span>${icon('chevron-right', 'chev')}</button>`}

    <div class="section-h"><h3>Pedidos del mes</h3><small class="muted-s">${orders.length}</small></div>
    ${orders.length ? `<div class="list">${orders.slice(0, 40).map(o => `<div class="item"><span class="info"><b>${esc(o.n)}${o.code ? `<span class="tag">${esc(o.code)}</span>` : ''}</b><small>${shortDay(o.date)}${o.t ? ` · ${esc(o.t)}` : ''}</small></span>
      <span class="val">${money(o.total)}</span></div>`).join('')}</div>${orders.length > 40 ? `<p class="hint">Y ${orders.length - 40} más: están todos en el Excel.</p>` : ''}` : '<p class="help">Sin pedidos cargados este mes.</p>'}`;
  bindCommon(el);
}

/* ---------- Ajustes ---------- */
export function renderBizSettings(el) {
  const e = eco(), pr = prefs();
  const be = breakEven(e);
  const days = bizDays();
  const first = firstDay(), last = lastDay();
  const gaps = first && last ? Math.round((parseYmd(last) - parseYmd(first)) / 86400000) + 1 - days.length : 0;
  const hasEco = !!bizCfg('economia');
  const row = (label, value, sub = '') => `<div class="item"><span class="info"><b>${label}</b>${sub ? `<small class="wrap">${sub}</small>` : ''}</span><span class="val">${value}</span></div>`;

  el.innerHTML = `
    ${header('Ajustes', exitBtn())}

    <div class="section-h" style="margin-top:4px"><h3>Carga automática</h3></div>
    <div class="list">
      ${row('Último día cargado', last ? shortDay(last) : '—', last ? `${days.length} días desde el ${shortDay(first)}${gaps > 0 ? ` · faltan ${gaps}` : ''}` : 'Todavía no llegó ninguno')}
      ${row('Cómo llegan', '9:05', 'El reporte diario junta Shopify, Meta y Klaviyo del día anterior y los sube a tu cuenta. Aparecen acá y en todos tus dispositivos.')}
      ${session() ? '' : row('<span class="neg">Sincronización apagada</span>', '', 'Iniciá sesión en Más → Sincronización para recibir los datos del negocio.')}
    </div>
    <div class="row" style="margin-top:10px"><button class="btn" data-act="sync">${icon('refresh-cw')}Actualizar</button><button class="btn" data-act="import">${icon('upload')}Importar archivo</button></div>

    <div class="section-h"><h3>Objetivos y ajustes</h3></div>
    <div class="list">
      <button class="item tap" data-act="goal">${catIc({ icon: 'target', color: '#2EF2A0' })}<span class="info"><b>Objetivo del mes</b><small>${pr.goal ? `Facturar ${money(pr.goal)}` : 'Sin objetivo de facturación'}${pr.profitGoal ? ` · ganar ${money(pr.profitGoal)}` : ''}</small></span>${icon('chevron-right', 'chev')}</button>
      <button class="item tap" data-act="adstax">${catIc({ icon: 'receipt', color: '#FFB547' })}<span class="info"><b>Impuestos sobre la publicidad</b><small>${pr.adsTaxPct ? `${String(pr.adsTaxPct).replace('.', ',')}% encima del gasto de Meta` : 'No cargado: el gasto de Meta se toma sin IVA ni percepciones'}</small></span>${icon('chevron-right', 'chev')}</button>
    </div>

    <div class="section-h"><h3>Gastos fijos y otros</h3><button data-act="newcost">Agregar</button></div>
    ${bizCosts().length ? `<div class="list">${bizCosts().map(c => `<button class="item tap" data-cost="${c.id}">${catIc(costCat(c.cat))}
      <span class="info"><b>${esc(c.name)}</b><small>${costCat(c.cat).label} · ${c.freq === 'once' ? `único, ${shortDay(c.date)}` : `mensual${c.date ? ` desde ${shortDay(c.date)}` : ''}${c.until ? ` hasta ${shortDay(c.until)}` : ''}`}</small></span>
      <span class="val">${c.currency === 'USD' ? `US$ ${c.amount}` : money(c.amount)}${c.currency === 'USD' ? `<small class="sub-val">≈ ${money(costArs(c))}</small>` : ''}</span></button>`).join('')}</div>`
      : '<p class="help" style="margin:0 4px">Los gastos mensuales se reparten por día, así cada día y cada período muestra el resultado real.</p>'}

    <div class="section-h"><h3>Economía del producto</h3></div>
    ${hasEco ? `<div class="list">
      ${row('Precio', money(e.price), esc(e.product || ''))}
      ${row('Costo de producto y envío', money(e.unitCost + e.shipCost), e.kind === 'digital' ? 'Producto digital: sin costo de producto ni envío' : '')}
      ${row('Cobranza', `${String(e.feePct).replace('.', ',')}%`, esc(e.feeDetail || ''))}
      ${row('Ingresos brutos', `${String(e.iibbPct).replace('.', ',')}%`)}
      ${e.otherPct ? row('Otros', `${String(e.otherPct).replace('.', ',')}%`) : ''}
      ${row('<b>Lo que queda por venta</b>', money(contribution(e)), 'Es lo máximo que podés pagar de publicidad por una venta')}
      ${row('<b>ROAS de equilibrio</b>', fmtRoas(be), `Barra para escalar: ${fmtRoas(be * e.scaleMult)}`)}
    </div>
    <p class="hint">Vienen de economia.json, el mismo archivo que usa el reporte de las 9:05. Si cambia el precio o una comisión, pedile a Claude que lo actualice y se ajusta solo acá.</p>`
      : '<p class="help" style="margin:0 4px">Todavía no llegó la economía del producto (precio y comisiones). Llega con la primera carga automática.</p>'}

    <button class="switch-row" data-act="personal" style="margin-top:22px">${icon('house')}<span class="info"><b>Volver a mis finanzas personales</b><small>El negocio queda aparte: no suma a tus saldos, gastos ni reportes</small></span>${icon('chevron-right', 'chev')}</button>
    <p class="foot">Negocio · Finanzas Tino</p>`;
  bindCommon(el);
}

/* ---------- Acciones comunes ---------- */
function bindCommon(el) {
  el.onclick = async ev => {
    const b = ev.target.closest('button, tr[data-day]');
    if (!b) return;
    const d = b.dataset;
    if (d.kind) { BS.kind = d.kind; return rerenderScroll(el); }
    if (d.cr) { BS.creatives = d.cr; return rerenderScroll(el); }
    if (d.mm) {
      const months = monthsWithData();
      const i = months.indexOf(BS.month) + Number(d.mm);
      if (months[i]) { BS.month = months[i]; return rerenderScroll(el, true); }
      return;
    }
    if (d.goto) return go(d.goto);
    if (d.adset) return openAdset(d.adset);
    if (d.day) return openDayDetail(d.day);
    if (d.report) return openBizReport(d.report);
    if (d.cost) return openBizCost(d.cost);
    switch (d.act) {
      case 'personal': return switchMode('personal');
      case 'export': return openBizExport(makeBizPeriod(BS.kind), BS.month);
      case 'import': return openBizImport();
      case 'goal': return openGoalEdit();
      case 'adstax': return openGoalEdit({ focus: 'tax' });
      case 'newcost': return openBizCost();
      case 'costs': return go('bset');
      case 'creatives': return openCreatives();
      case 'sync': {
        if (!session()) { toast('Iniciá sesión en Más → Sincronización para recibir los datos', { icon: 'cloud' }); return; }
        b.classList.add('spin');
        try { const n = await sync(); toast(n ? 'Datos actualizados' : 'Ya tenés lo último', { icon: 'circle-check' }); }
        catch { toast('No se pudo actualizar. Probá de nuevo con internet.', { icon: 'triangle-alert' }); }
        b.classList.remove('spin');
        return;
      }
    }
  };
}

function rerenderScroll(el, top = false) {
  const y = el.scrollTop;
  const renderers = { 's-bres': renderBizHome, 's-bcamp': renderBizCampaigns, 's-breg': renderBizLog, 's-bset': renderBizSettings };
  renderers[el.id]?.(el);
  el.scrollTop = top ? 0 : y;
  ensureVisible(el.querySelector('#b-periods'));
}

/** Guarda una preferencia del negocio (objetivo, impuestos de publicidad). */
export const savePrefs = patch => upsert('biz_cfg', { ...prefs(), ...patch, id: 'prefs' });
export { dayCalc };
