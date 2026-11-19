// Excel del negocio: resumen con gráficos, registro diario, campañas por día, conjuntos, creativos, pedidos, gastos y economía.
import { buildXlsx } from './xlsx.js';
import { bizDays, bizCosts } from '../store.js';
import { eco, prefs, totals, groupAds, breakEven, contribution, monthlyTotals, adsetVerdicts, statusLabel, costCat, costArs, costInPeriod, VERDICTS } from './biz.js';
import { monthName, cap, today } from '../dates.js';

const H = v => ({ v, s: 'head' });
const M = v => ({ v: v == null ? null : Math.round(v), s: 'money' });
const I = v => ({ v, s: 'int' });
const P = v => ({ v: v == null || !Number.isFinite(v) ? null : v, s: 'pct' });
const R = v => ({ v: v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100, s: 'ratio' });
const D = v => ({ v, s: 'date' });
const div = (a, b) => (b > 0 ? a / b : null);

export function businessWorkbook(p) {
  const e = eco(), pr = prefs();
  const be = breakEven(e);
  const t = totals(p);
  const days = t.days;
  const name = e.name || 'Negocio';

  /* ---------- Diario ---------- */
  const dHead = ['Fecha', 'Pedidos', 'Facturación bruta', 'Descuentos', 'Facturación neta', 'Comisión de cobranza', 'IIBB', 'Otros %', 'Costo de producto y envío',
    'Publicidad (Meta)', 'Impuestos sobre publicidad', 'Gastos fijos y otros', 'Resultado', 'Resultado acumulado', 'ROAS', 'ROAS de equilibrio', 'Costo por venta',
    'Visitas', 'Carritos', 'Checkouts', 'Conversión', 'Compras según Meta', 'Ventas por email', 'Pedidos con cupón'];
  const dRows = [dHead.map(H)];
  let acc = 0;
  days.forEach((x, i) => {
    const r = i + 2;
    acc += x.result;
    dRows.push([D(x.date), I(x.orders), M(x.gross), M(x.disc), M(x.net), M(x.fees), M(x.iibb), M(x.other), M(x.cogs), M(x.ads), M(x.adsTax), M(x.fixed), M(x.result),
      { v: Math.round(acc), s: 'money', f: i === 0 ? `M${r}` : `N${r - 1}+M${r}` },
      R(x.roas), R(be), M(div(x.ads, x.orders)), I(x.visits), I(x.carts), I(x.checkouts), P(div(x.orders, x.visits)), I(x.metaPurch), M(x.email), I(x.coupons)]);
  });
  const dLast = days.length + 1;
  const dTot = dLast + 1;
  const S = (c, v, s = 'tmoney') => ({ v: Math.round(v), s, f: `SUM(${c}2:${c}${dLast})` });
  if (days.length) {
    dRows.push([{ v: 'Total', s: 'tlabel' }, S('B', t.orders, 'tint'), S('C', t.gross), S('D', t.disc), S('E', t.net), S('F', t.fees), S('G', t.iibb), S('H', t.other), S('I', t.cogs),
      S('J', t.ads), S('K', t.adsTax), S('L', t.fixed), S('M', t.result), { v: null, s: 'tlabel' },
      { v: t.roas ? Math.round(t.roas * 100) / 100 : null, s: 'tratio', f: `IF(J${dTot}>0,E${dTot}/J${dTot},"")` }, { v: be ? Math.round(be * 100) / 100 : null, s: 'tratio' },
      { v: t.cpa ? Math.round(t.cpa) : null, s: 'tmoney', f: `IF(B${dTot}>0,J${dTot}/B${dTot},"")` },
      S('R', t.visits, 'tint'), S('S', t.carts, 'tint'), S('T', t.checkouts, 'tint'),
      { v: t.conv, s: 'tpct', f: `IF(R${dTot}>0,B${dTot}/R${dTot},"")` }, S('V', t.metaPurch, 'tint'), { v: t.email == null ? null : Math.round(t.email), s: 'tmoney' }, S('X', t.coupons, 'tint')]);
  }

  /* ---------- Campañas (un renglón por anuncio por día) ---------- */
  const cRows = [['Fecha', 'Campaña', 'Conjunto', 'Anuncio', 'Estado', 'Gasto', 'Impresiones', 'Clics', 'CTR', 'CPM', 'Carritos', 'Pagos iniciados', 'Compras', 'Valor de compras', 'Costo por compra', 'ROAS'].map(H)];
  for (const d of bizDays()) {
    if (d.date < p.from || d.date > p.to) continue;
    for (const a of [...(d.ads || [])].sort((x, y) => y.spend - x.spend)) {
      cRows.push([D(d.date), a.campaign, a.adset, a.name, statusLabel(a.status), M(a.spend), I(a.impr), I(a.clicks), P(div(a.clicks, a.impr)), M(div(a.spend * 1000, a.impr)),
        I(a.atc), I(a.ic), I(a.purch), M(a.value), M(div(a.spend, a.purch)), R(div(a.value, a.spend))]);
    }
  }

  /* ---------- Conjuntos ---------- */
  const v7 = new Map(adsetVerdicts().map(g => [g.key, g.v]));
  const sets = groupAds(p);
  const gRows = [['Conjunto', 'Campaña', 'Estado', 'Días con gasto', 'Gasto', 'Compras', 'Costo por compra', 'ROAS', 'vs. equilibrio', 'CTR', 'CPM', 'Carritos', 'Pagos iniciados', 'Veredicto (últimos 7 días)', 'Por qué', 'Valor de compras (Meta)'].map(H)];
  for (const g of sets) {
    const v = v7.get(g.key) || null;
    gRows.push([g.name, g.campaign, statusLabel(g.status), I(g.activeDays), M(g.spend), I(g.purch), M(g.cpa), R(g.roas), P(g.roas != null && be ? g.roas / be - 1 : null), P(g.ctr), M(g.cpm), I(g.atc), I(g.ic),
      v ? VERDICTS[v.k].label : (g.active ? '' : 'En pausa'), v?.why || '', M(g.value)]);
  }

  /* ---------- Creativos ---------- */
  const ads = groupAds(p, 'ad').sort((a, b) => b.purch - a.purch || (b.roas || 0) - (a.roas || 0));
  const aRows = [['Anuncio', 'Conjunto', 'Campaña', 'Estado', 'Primer día', 'Último día', 'Días con gasto', 'Gasto', 'Compras', 'Costo por compra', 'ROAS', 'CTR', 'CPM', 'Carritos', 'Pagos iniciados'].map(H)];
  for (const a of ads) aRows.push([a.name, a.adset, a.campaign, statusLabel(a.status), D(a.first), D(a.last), I(a.activeDays), M(a.spend), I(a.purch), M(a.cpa), R(a.roas), P(a.ctr), M(a.cpm), I(a.atc), I(a.ic)]);

  /* ---------- Pedidos ---------- */
  const oRows = [['Fecha', 'Hora', 'Pedido', 'Total', 'Descuento', 'Cupón', 'Devuelto'].map(H)];
  for (const d of bizDays()) {
    if (d.date < p.from || d.date > p.to) continue;
    for (const o of d.orders || []) oRows.push([D(d.date), o.t || '', o.n, M(o.total), M(o.disc || 0), o.code || '', o.refunded ? M(o.refunded) : '']);
  }

  /* ---------- Gastos ---------- */
  const xRows = [['Gasto', 'Categoría', 'Tipo', 'Moneda', 'Monto', 'En pesos (hoy)', 'Desde', 'Hasta', 'Imputado en el período'].map(H)];
  for (const c of bizCosts()) {
    xRows.push([c.name, costCat(c.cat).label, c.freq === 'once' ? 'Único' : 'Mensual', c.currency || 'ARS', { v: c.amount, s: c.currency === 'USD' ? 'ratio' : 'money' }, M(costArs(c)),
      c.date ? D(c.date) : '', c.until ? D(c.until) : '', M(costInPeriod(c, p.from, p.to))]);
  }
  if (!bizCosts().length) xRows.push([{ v: 'Todavía no cargaste gastos fijos (Shopify, apps, Klaviyo…). Se cargan en la app: Negocio → botón +.', s: 'note' }]);

  /* ---------- Economía ---------- */
  const eRows = [[{ v: 'Economía del producto', s: 'title' }], [],
    [H('Concepto'), H('Valor'), H('Detalle')],
    ['Precio de lista', M(e.price), e.product || ''],
    ['Costo del producto', M(e.unitCost), e.kind === 'digital' ? 'Producto digital: sin costo de producto' : ''],
    ['Envío que pagás vos', M(e.shipCost), ''],
    ['Comisión de cobranza', P(e.feePct / 100), e.feeDetail || ''],
    ['Ingresos brutos (IIBB)', P(e.iibbPct / 100), ''],
    ['Otros % sobre la venta', P(e.otherPct / 100), ''],
    ['Impuestos sobre la publicidad', P((pr.adsTaxPct || 0) / 100), 'IVA y percepciones que te cobran encima del gasto de Meta (se carga en la app)'],
    [{ v: 'Lo que queda por venta (CPA máximo)', s: 'bold' }, { v: Math.round(contribution(e)), s: 'tmoney' }, 'Lo máximo que podés pagar de publicidad por una venta sin perder'],
    [{ v: 'ROAS de equilibrio', s: 'bold' }, { v: be ? Math.round(be * 100) / 100 : null, s: 'tratio' }, 'Debajo de esto, la publicidad te hace perder plata'],
    ['Barra para escalar', R(be ? be * e.scaleMult : null), `${String(e.scaleMult).replace('.', ',')} veces el equilibrio`],
    ['Objetivo de facturación del mes', M(pr.goal || null), ''],
    ['Objetivo de ganancia del mes', M(pr.profitGoal || null), ''],
  ];

  /* ---------- Resumen ---------- */
  const months = monthlyTotals().filter(m => `${m.ym}-31` >= p.from && `${m.ym}-01` <= p.to);
  const kpi = (label, cell) => [label, cell];
  const rRows = [
    [{ v: `${name} · Informe del negocio`, s: 'title' }],
    [{ v: `${p.label} (${p.from.split('-').reverse().join('/')} al ${p.to.split('-').reverse().join('/')}) · generado el ${today().split('-').reverse().join('/')}`, s: 'note' }],
    [],
    [H('Indicador'), H('Valor')],
    kpi('Facturación neta', M(t.net)),
    kpi('Pedidos', I(t.orders)),
    kpi('Ticket promedio', M(t.ticket)),
    kpi('Publicidad (Meta)', M(t.ads)),
    kpi('Impuestos sobre publicidad', M(t.adsTax)),
    kpi('Comisión de cobranza', M(t.fees)),
    kpi('Ingresos brutos', M(t.iibb)),
    kpi('Otros % sobre la venta', M(t.other)),
    kpi('Costo de producto y envío', M(t.cogs)),
    kpi('Gastos fijos y otros', M(t.fixed)),
    [{ v: 'Resultado', s: 'tlabel' }, { v: Math.round(t.result), s: 'tmoney' }],
    kpi('Margen sobre la facturación', P(t.margin)),
    kpi('ROAS', R(t.roas)),
    kpi('ROAS de equilibrio', R(be)),
    kpi('Costo por venta (publicidad / pedidos)', M(t.cpa)),
    kpi('CPA máximo', M(contribution(e))),
    kpi('Visitas a la tienda', I(t.visits)),
    kpi('Conversión', P(t.conv)),
    kpi('Ventas por email', t.email == null ? 'sin datos' : M(t.email)),
    kpi('Pedidos con cupón', I(t.coupons)),
    [],
    [{ v: 'Por mes', s: 'sub' }],
    ['Mes', 'Pedidos', 'Facturación neta', 'Publicidad', 'Comisiones e IIBB', 'Gastos fijos', 'Resultado', 'ROAS', 'Margen'].map(H),
    ...months.map(m => [cap(monthName(m.ym)), I(m.orders), M(m.net), M(m.ads + m.adsTax), M(m.fees + m.iibb + m.other), M(m.fixed + m.cogs), M(m.result), R(m.roas), P(m.margin)]),
  ];

  const n = days.length;
  const charts = n ? [
    { type: 'bar', title: 'Facturación vs. publicidad por día', at: { col: 10, row: 3, w: 9, h: 17 }, yFmt: '"$ "#,##0',
      cat: { sheet: 'Diario', col: 0, from: 2, to: n + 1, date: true },
      series: [{ name: 'Facturación neta', sheet: 'Diario', col: 4, from: 2, to: n + 1, color: '0E9FB0' }, { name: 'Publicidad', sheet: 'Diario', col: 9, from: 2, to: n + 1, color: '9CA3AF' }] },
    { type: 'bar', title: 'Resultado por día', at: { col: 19, row: 3, w: 9, h: 17 }, yFmt: '"$ "#,##0',
      cat: { sheet: 'Diario', col: 0, from: 2, to: n + 1, date: true },
      series: [{ name: 'Resultado', sheet: 'Diario', col: 12, from: 2, to: n + 1, color: '10B981' }] },
    { type: 'line', title: 'ROAS diario vs. equilibrio', at: { col: 10, row: 21, w: 9, h: 17 }, yFmt: '0.0',
      cat: { sheet: 'Diario', col: 0, from: 2, to: n + 1, date: true },
      series: [{ name: 'ROAS', sheet: 'Diario', col: 14, from: 2, to: n + 1, color: '0E9FB0' }, { name: 'Equilibrio', sheet: 'Diario', col: 15, from: 2, to: n + 1, color: 'EF4444', dash: true }] },
    { type: 'line', title: 'Resultado acumulado', at: { col: 19, row: 21, w: 9, h: 17 }, yFmt: '"$ "#,##0',
      cat: { sheet: 'Diario', col: 0, from: 2, to: n + 1, date: true },
      series: [{ name: 'Resultado acumulado', sheet: 'Diario', col: 13, from: 2, to: n + 1, color: '10B981' }] },
    { type: 'bar', title: 'Pedidos por día', at: { col: 10, row: 39, w: 9, h: 17 }, yFmt: '0',
      cat: { sheet: 'Diario', col: 0, from: 2, to: n + 1, date: true },
      series: [{ name: 'Pedidos', sheet: 'Diario', col: 1, from: 2, to: n + 1, color: '6366F1' }, { name: 'Compras según Meta', sheet: 'Diario', col: 21, from: 2, to: n + 1, color: 'F59E0B' }] },
    ...(sets.length ? [{ type: 'bar', title: 'Gasto y valor de compras por conjunto', at: { col: 19, row: 39, w: 9, h: 17 }, yFmt: '"$ "#,##0', gap: 40,
      cat: { sheet: 'Conjuntos', col: 0, from: 2, to: Math.min(sets.length, 15) + 1 },
      series: [{ name: 'Gasto', sheet: 'Conjuntos', col: 4, from: 2, to: Math.min(sets.length, 15) + 1, color: '9CA3AF' }, { name: 'Valor de compras (Meta)', sheet: 'Conjuntos', col: 15, from: 2, to: Math.min(sets.length, 15) + 1, color: '0E9FB0' }] }] : []),
  ] : [];
  return buildXlsx({
    title: `${name} · Informe del negocio`,
    sheets: [
      { name: 'Resumen', rows: rRows, cols: [38, 16, 16, 14, 16, 14, 14, 9, 9], charts, noGrid: true },
      { name: 'Diario', rows: dRows, cols: [12, 9, 14, 12, 15, 14, 12, 10, 14, 14, 14, 14, 14, 15, 8, 10, 13, 9, 9, 10, 11, 11, 13, 11], freeze: 1, freezeCols: 1, filter: 1, filterTo: dLast },
      { name: 'Campañas', rows: cRows, cols: [12, 30, 28, 34, 14, 12, 12, 9, 8, 10, 9, 10, 9, 13, 13, 8], freeze: 1, filter: 1 },
      { name: 'Conjuntos', rows: gRows, cols: [30, 30, 14, 10, 13, 9, 13, 8, 11, 8, 10, 9, 10, 16, 60, 16], freeze: 1, filter: 1 },
      { name: 'Creativos', rows: aRows, cols: [38, 28, 30, 14, 12, 12, 9, 13, 9, 13, 8, 8, 10, 9, 10], freeze: 1, filter: 1 },
      { name: 'Pedidos', rows: oRows, cols: [12, 8, 10, 12, 12, 14, 12], freeze: 1, filter: 1 },
      { name: 'Gastos', rows: xRows, cols: [30, 22, 10, 9, 12, 14, 12, 12, 20], freeze: 1 },
      { name: 'Economía', rows: eRows, cols: [38, 14, 70], noGrid: true },
    ],
  });
}

export const workbookName = p => `negocio-${(eco().name || 'negocio').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')}-${p.from}_a_${p.to}.xlsx`;
