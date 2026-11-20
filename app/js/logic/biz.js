// Números del negocio: resultado, ROAS, ROAS de equilibrio, veredictos por conjunto, alertas y objetivo.
// Los datos llegan solos (reporte diario de las 9:05 → Supabase): un registro 'biz_days' por día cerrado.
// Nada de esto toca las finanzas personales.
import { bizDays, bizCfg, bizCosts } from '../store.js';
import { addDays, daysInMonth, today, parseYmd, pad, cap, monthName } from '../dates.js';
import { marketCache } from './market.js';

/* ---------- Configuración ---------- */
const DEFAULT_ECO = { name: 'Mi negocio', price: 0, unitCost: 0, shipCost: 0, feePct: 0, iibbPct: 0, otherPct: 0, scaleMult: 1.25, minSpendTickets: 3, cutNoSalesTickets: 1.5, scaleUpPct: 20 };
export const eco = () => ({ ...DEFAULT_ECO, ...(bizCfg('economia') || {}) });
export const prefs = () => ({ goal: 0, profitGoal: 0, adsTaxPct: 0, ...(bizCfg('prefs') || {}) });
export const hasBiz = () => bizDays().length > 0 || !!bizCfg('economia');

/** Porcentaje de la venta que se va en cobranza, IIBB y otros. */
export const varPct = (e = eco()) => (e.feePct + e.iibbPct + e.otherPct) / 100;
/** Lo que queda de una venta al precio de lista antes de publicidad (= CPA máximo). */
export const contribution = (e = eco()) => e.price * (1 - varPct(e)) - e.unitCost - e.shipCost;
/** ROAS de equilibrio: facturación sobre la contribución antes de publicidad. */
export const breakEven = (e = eco()) => { const c = contribution(e); return c > 0 ? e.price / c : null; };

/* ---------- Gastos del negocio (fijos y únicos) ---------- */
export const COST_CATS = {
  plataforma: { label: 'Plataforma (Shopify)', icon: 'store', color: '#7CFFCB' },
  apps: { label: 'Apps y herramientas', icon: 'layers', color: '#5CC8FF' },
  email: { label: 'Email (Klaviyo)', icon: 'bell', color: '#C084FC' },
  diseno: { label: 'Diseño y contenido', icon: 'palette', color: '#FF8FB8' },
  publicidad: { label: 'Otra publicidad', icon: 'target', color: '#FFB547' },
  impuestos: { label: 'Impuestos y contador', icon: 'receipt', color: '#2F7BFF' },
  otros: { label: 'Otros', icon: 'shapes', color: '#8A9AA8' },
};
export const costCat = k => COST_CATS[k] || COST_CATS.otros;

/** Dólar para pasar a pesos los gastos en USD (tarjeta, porque se pagan con tarjeta). */
export function usdRate() {
  const d = marketCache().dollars;
  return d?.tarjeta?.venta || d?.oficial?.venta || prefs().usdRate || 0;
}
export const costArs = c => (c.currency === 'USD' ? c.amount * usdRate() : c.amount);

/** Gasto fijo/único que corresponde a un día: los mensuales se reparten entre los días del mes. */
function costsOn(date, costs) {
  let v = 0;
  for (const c of costs) {
    if (c.freq === 'once') { if (c.date === date) v += costArs(c); continue; }
    if (c.date && date < c.date) continue;
    if (c.until && date > c.until) continue;
    v += costArs(c) / daysInMonth(date.slice(0, 7));
  }
  return v;
}

/** Cuánto de un gasto cae entre dos fechas (los mensuales, repartidos por día). */
export function costInPeriod(c, from, to) {
  let v = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) v += costsOn(d, [c]);
  return v;
}

/* ---------- Un día ---------- */
const sum = (arr, f) => arr.reduce((s, x) => s + (f(x) || 0), 0);
export const adSpendOf = d => Math.max(sum(d.ads || [], a => a.spend), d.adsTotal?.spend || 0);

export function dayCalc(d, e = eco(), p = prefs(), costs = bizCosts()) {
  // El neto de Shopify (net_sales) ya descuenta descuentos y devoluciones: las devoluciones se muestran aparte, no se restan de nuevo.
  const net = d.sales?.net || 0;
  const orders = d.sales?.orders || 0;
  const fees = net * e.feePct / 100;
  const iibb = net * e.iibbPct / 100;
  const other = net * e.otherPct / 100;
  const cogs = orders * (e.unitCost + e.shipCost);
  const ads = adSpendOf(d);
  const adsTax = ads * (p.adsTaxPct || 0) / 100;
  const fixed = costsOn(d.date, costs);
  const result = net - fees - iibb - other - cogs - ads - adsTax - fixed;
  return {
    date: d.date, d, net, gross: d.sales?.gross || 0, disc: d.sales?.disc || 0, refunds: d.sales?.refunds || 0, orders,
    fees, iibb, other, cogs, ads, adsTax, fixed, result,
    roas: ads > 0 ? net / ads : null,
    metaPurch: sum(d.ads || [], a => a.purch), metaValue: sum(d.ads || [], a => a.value),
    impr: sum(d.ads || [], a => a.impr), clicks: sum(d.ads || [], a => a.clicks),
    visits: d.funnel?.visits || 0, carts: d.funnel?.carts || 0, checkouts: d.funnel?.checkouts || 0,
    email: d.email?.revenue ?? null,
    coupons: (d.orders || []).filter(o => o.code).length,
  };
}

/* ---------- Períodos ---------- */
export const PERIODS = { ayer: 'Ayer', d7: '7 días', mes: 'Este mes', mesant: 'Mes pasado', d30: '30 días', todo: 'Todo' };

/** Último día cargado (el día cerrado más reciente). */
export const lastDay = () => bizDays().at(-1)?.date || null;
export const firstDay = () => bizDays()[0]?.date || null;

export function makeBizPeriod(kind, range) {
  const last = lastDay() || addDays(today(), -1);
  const first = firstDay() || last;
  let from, to = last, label;
  if (kind === 'ayer') { from = last; label = last === addDays(today(), -1) ? 'Ayer' : shortDay(last); }
  else if (kind === 'd7') { from = addDays(last, -6); label = 'Últimos 7 días'; }
  else if (kind === 'd30') { from = addDays(last, -29); label = 'Últimos 30 días'; }
  else if (kind === 'mes') { from = `${last.slice(0, 7)}-01`; label = cap(monthName(last.slice(0, 7))); }
  else if (kind === 'mesant') {
    const ym = addDays(`${last.slice(0, 7)}-01`, -1).slice(0, 7);
    from = `${ym}-01`; to = `${ym}-${pad(daysInMonth(ym))}`; label = cap(monthName(ym));
  } else if (kind === 'range' && range) { from = range.from; to = range.to; label = `${shortDay(from)} – ${shortDay(to)}`; }
  else { from = first; label = 'Desde el principio'; }
  return { kind, from, to, label, days: Math.round((parseYmd(to) - parseYmd(from)) / 86400000) + 1 };
}
export function prevBizPeriod(p) {
  const to = addDays(p.from, -1);
  return { kind: 'prev', from: addDays(to, -(p.days - 1)), to, days: p.days, label: 'período anterior' };
}
export function shortDay(s) {
  const d = parseYmd(s);
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

/* ---------- Totales de un período ---------- */
export function totals(p) {
  const e = eco(), pr = prefs(), costs = bizCosts();
  const list = bizDays().filter(d => d.date >= p.from && d.date <= p.to).map(d => dayCalc(d, e, pr, costs));
  const keys = ['net', 'gross', 'disc', 'refunds', 'orders', 'fees', 'iibb', 'other', 'cogs', 'ads', 'adsTax', 'fixed', 'result', 'metaPurch', 'metaValue', 'impr', 'clicks', 'visits', 'carts', 'checkouts', 'coupons'];
  const t = Object.fromEntries(keys.map(k => [k, sum(list, x => x[k])]));
  const emailDays = list.filter(x => x.email != null);
  t.email = emailDays.length ? sum(emailDays, x => x.email) : null;
  t.days = list;
  t.n = list.length;
  t.roas = t.ads > 0 ? t.net / t.ads : null;
  t.cpa = t.orders > 0 ? t.ads / t.orders : null;
  t.ticket = t.orders > 0 ? t.net / t.orders : null;
  t.conv = t.visits > 0 ? t.orders / t.visits : null;
  t.margin = t.net > 0 ? t.result / t.net : null;
  t.ctr = t.impr > 0 ? t.clicks / t.impr : null;
  t.cpm = t.impr > 0 ? t.ads / t.impr * 1000 : null;
  return t;
}
export const pctChange = (now, before) => (before > 0 ? (now - before) / before : null);

/* ---------- Campañas ---------- */
/** Agrupa los anuncios de un período por conjunto (o por anuncio con by='ad'). */
export function groupAds(p, by = 'adset') {
  const map = new Map();
  for (const d of bizDays()) {
    if (d.date < p.from || d.date > p.to) continue;
    for (const a of d.ads || []) {
      const key = by === 'ad' ? a.id : (a.adsetId || a.adset);
      let g = map.get(key);
      if (!g) {
        g = { key, name: by === 'ad' ? a.name : a.adset, adset: a.adset, adsetId: a.adsetId, campaign: a.campaign, status: a.status, ads: new Set(),
          spend: 0, impr: 0, clicks: 0, atc: 0, ic: 0, purch: 0, value: 0, first: d.date, last: d.date, lastSpend: null, activeDays: 0 };
        map.set(key, g);
      }
      g.ads.add(a.id);
      g.spend += a.spend; g.impr += a.impr; g.clicks += a.clicks; g.atc += a.atc; g.ic += a.ic; g.purch += a.purch; g.value += a.value;
      if (a.spend > 0) { g.activeDays++; if (d.date < g.first) g.first = d.date; }
      if (d.date >= g.last) { g.last = d.date; g.status = a.status || g.status; g.name = by === 'ad' ? a.name : a.adset; g.campaign = a.campaign; }
    }
  }
  return [...map.values()].map(g => ({
    ...g, ads: g.ads.size,
    roas: g.spend > 0 ? g.value / g.spend : null, cpa: g.purch > 0 ? g.spend / g.purch : null,
    ctr: g.impr > 0 ? g.clicks / g.impr : null, cpm: g.impr > 0 ? g.spend / g.impr * 1000 : null,
    active: isActive(g.status),
  })).sort((a, b) => b.spend - a.spend);
}
export const isActive = s => !s || s === 'ACTIVE';
export const STATUS_LABEL = { ACTIVE: 'Activo', PAUSED: 'En pausa', ADSET_PAUSED: 'Conjunto en pausa', CAMPAIGN_PAUSED: 'Campaña en pausa', ARCHIVED: 'Archivado', DELETED: 'Borrado', DISAPPROVED: 'Rechazado', WITH_ISSUES: 'Con problemas' };
export const statusLabel = s => STATUS_LABEL[s] || (s ? cap(s.toLowerCase().replace(/_/g, ' ')) : 'Activo');

export const VERDICTS = {
  escalar: { label: 'Escalar', color: '#2EF2A0' },
  mantener: { label: 'Mantener', color: '#5CC8FF' },
  esperar: { label: 'Esperar', color: '#FFC24D' },
  cortar: { label: 'Cortar', color: '#FF9A3C' },
};
/** Veredicto de un conjunto con las reglas del reporte diario (7 días). */
export function verdict(g, e = eco()) {
  const be = breakEven(e);
  if (!be || !g.active || g.spend <= 0) return null;
  const roas = g.roas || 0;
  if (roas >= be * e.scaleMult) return { k: 'escalar', why: `ROAS ${fmtRoas(roas)}, pasa la barra de ${fmtRoas(be * e.scaleMult)}: subir ${e.scaleUpPct}%` };
  if (roas >= be) return { k: 'mantener', why: `Gana plata (ROAS ${fmtRoas(roas)} contra ${fmtRoas(be)}), pero no es donde va el próximo peso` };
  if (!g.purch && g.spend >= e.cutNoSalesTickets * e.price) return { k: 'cortar', why: `Sin compras con ${fmtInt(g.spend)} gastados` };
  if (g.spend >= e.minSpendTickets * e.price) return { k: 'cortar', why: `ROAS ${fmtRoas(roas)} por debajo del equilibrio (${fmtRoas(be)}) con ${fmtInt(g.spend)} gastados` };
  return { k: 'esperar', why: `Poca data: ${fmtInt(g.spend)} gastados, el mínimo para decidir es ${fmtInt(e.minSpendTickets * e.price)}` };
}
export const fmtRoas = v => (v == null ? '—' : v.toFixed(2).replace('.', ','));
const fmtInt = v => `$ ${Math.round(v).toLocaleString('es-AR')}`;

/** Conjuntos de los últimos 7 días con su veredicto. */
export function adsetVerdicts() {
  const last = lastDay();
  if (!last) return [];
  const p = { from: addDays(last, -6), to: last };
  const e = eco();
  return groupAds(p).map(g => ({ ...g, v: verdict(g, e) }));
}

/* ---------- Objetivo del mes ---------- */
export function goalStatus() {
  const pr = prefs();
  const last = lastDay();
  if (!last || !(pr.goal > 0 || pr.profitGoal > 0)) return null;
  const ym = last.slice(0, 7);
  const t = totals({ from: `${ym}-01`, to: last });
  const dim = daysInMonth(ym);
  const done = Number(last.slice(8));
  const left = dim - done;
  const mk = (goal, sofar) => goal > 0 ? {
    goal, sofar, pct: sofar / goal,
    projected: done ? sofar / done * dim : 0,
    perDay: left > 0 ? Math.max(0, (goal - sofar) / left) : 0,
  } : null;
  return { ym, done, dim, left, sales: mk(pr.goal, t.net), profit: mk(pr.profitGoal, t.result) };
}

/* ---------- Alertas ---------- */
export function alerts() {
  const out = [];
  const days = bizDays();
  if (!days.length) return out;
  const e = eco();
  const last = days.at(-1);
  const yday = addDays(today(), -1);
  if (last.date < yday) {
    const missing = Math.round((parseYmd(yday) - parseYmd(last.date)) / 86400000);
    out.push({ level: 'warn', icon: 'clock', title: `Faltan ${missing === 1 ? 'los datos de ayer' : `${missing} días de datos`}`, text: `El último día cargado es el ${shortDay(last.date)}. El reporte de las 9:05 sube los datos solo; si la compu estuvo apagada, se completan en la próxima corrida.` });
  }
  const L = dayCalc(last);
  const prev = days.slice(-8, -1).map(d => dayCalc(d));
  if (prev.length >= 3) {
    const v = sum(prev, x => x.visits), o = sum(prev, x => x.orders);
    const avgConv = v > 0 ? o / v : 0;
    const conv = L.visits > 0 ? L.orders / L.visits : 0;
    if (L.visits >= 80 && avgConv > 0 && conv < avgConv * 0.7) out.push({ level: 'bad', icon: 'trending-down', title: 'Cayó la conversión', text: `${pct(conv)} el ${shortDay(last.date)} contra ${pct(avgConv)} de promedio en los 7 días anteriores. Revisá la landing y el checkout.` });
    if (L.visits >= 80 && avgConv > 0 && conv > avgConv * 1.4) out.push({ level: 'good', icon: 'trending-up', title: 'Subió la conversión', text: `${pct(conv)} contra ${pct(avgConv)} de promedio. Fijate qué cambió para repetirlo.` });
  }
  for (const a of last.ads || []) {
    if (isActive(a.status) && !(a.spend > 0)) out.push({ level: 'warn', icon: 'pause', title: `${a.adset} no gastó`, text: 'Está activo pero no gastó nada en el día. Revisá en el Administrador de anuncios si el anuncio está rechazado o con problemas.' });
  }
  const w = totals({ from: addDays(last.date, -6), to: last.date });
  if (w.orders >= 5 && w.metaPurch > 0) {
    const diff = Math.abs(w.metaPurch - w.orders) / w.orders;
    if (diff > 0.25) out.push({ level: 'warn', icon: 'info', title: 'Meta y Shopify no coinciden', text: `En 7 días Meta se atribuye ${w.metaPurch} compras y Shopify tiene ${w.orders} pedidos (${Math.round(diff * 100)}% de diferencia). Para la plata vale Shopify.` });
  }
  if (w.n >= 5 && w.result < 0) out.push({ level: 'bad', icon: 'triangle-alert', title: 'Perdiste plata en la semana', text: `Resultado de los últimos 7 días: −$ ${Math.round(-w.result).toLocaleString('es-AR')}. Mirá qué conjuntos cortar en Campañas.` });
  const cut = adsetVerdicts().filter(g => g.v?.k === 'cortar');
  if (cut.length) out.push({ level: 'bad', icon: 'target', title: cut.length === 1 ? `Para cortar: ${cut[0].name}` : `${cut.length} conjuntos para cortar`, text: cut.map(g => `${g.name}: ${g.v.why}`).join(' · '), go: 'bcamp' });
  if (L.orders >= 4 && L.coupons / L.orders >= 0.5) {
    const cpaMax = (L.net / L.orders) * (1 - varPct(e)) - e.unitCost - e.shipCost;
    out.push({ level: 'info', icon: 'ticket', title: 'Mucho uso de cupón', text: `${L.coupons} de ${L.orders} pedidos usaron cupón. El ticket bajó a $ ${Math.round(L.net / L.orders).toLocaleString('es-AR')} y el CPA máximo real queda en ≈ $ ${Math.round(cpaMax).toLocaleString('es-AR')}.` });
  }
  return out;
}
const pct = v => `${(v * 100).toFixed(1).replace('.', ',')}%`;

/* ---------- Días de la semana ---------- */
const WD = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export function weekdayStats(p) {
  const acc = WD.map(l => ({ l, orders: 0, net: 0, ads: 0, n: 0 }));
  for (const x of totals(p).days) {
    const w = acc[parseYmd(x.date).getDay()];
    w.orders += x.orders; w.net += x.net; w.ads += x.ads; w.n++;
  }
  // De lunes a domingo.
  return [...acc.slice(1), acc[0]].map(w => ({ ...w, avgOrders: w.n ? w.orders / w.n : 0, roas: w.ads > 0 ? w.net / w.ads : null }));
}

/** Meses con datos (para el registro y el Excel). */
export function monthsWithData() {
  return [...new Set(bizDays().map(d => d.date.slice(0, 7)))].sort();
}

/** Resumen por mes. */
export function monthlyTotals() {
  return monthsWithData().map(ym => ({ ym, ...totals({ from: `${ym}-01`, to: `${ym}-${pad(daysInMonth(ym))}` }) }));
}

/** El reporte del día más reciente que tenga uno. */
export const latestReport = () => [...bizDays()].reverse().find(d => d.report?.md) || null;
