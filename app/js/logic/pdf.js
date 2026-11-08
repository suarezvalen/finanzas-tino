// Genera el reporte en PDF (con jsPDF, incluido en app/vendor para que funcione sin internet).
import { state, accounts, balance } from '../store.js';
import { saveFile } from '../ui.js';
import { curYm, monthName, cap, shortDate } from '../dates.js';
import { buildReport, prevPeriod, monthlySeries, chartMonths, change, categoryChanges, inflationFor, shortYm } from './report.js';
import { wealthAt, activeInvestments, investStats } from './wealth.js';

let loading;
function loadJsPdf() {
  if (window.jspdf) return Promise.resolve();
  loading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/jspdf.umd.min.js';
    s.onload = resolve;
    s.onerror = () => { loading = null; reject(new Error('No se pudo cargar jsPDF')); };
    document.head.append(s);
  });
  return loading;
}

const C = {
  dark: [4, 6, 10], cyan: [0, 229, 255], cyanInk: [0, 150, 180], blue: [47, 123, 255],
  text: [22, 30, 40], muted: [110, 122, 134], line: [226, 231, 236], soft: [246, 248, 250],
  pos: [14, 150, 100], neg: [210, 55, 85], grey: [150, 160, 170],
};
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const money = v => `${v < 0 ? '-' : ''}$ ${Math.round(Math.abs(v)).toLocaleString('es-AR')}`;
const pct = (p, d = 0) => `${p > 0 ? '+' : p < 0 ? '-' : ''}${Math.abs(p * 100).toFixed(d).replace('.', ',')}%`;
// Las fuentes estándar del PDF no tienen algunos símbolos: se reemplazan.
const longToday = () => new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
const clean = s => String(s ?? '').replace(/[−–—]/g, '-').replace(/[^\x20-\x7E -ÿ]/g, '');

export async function exportReportPdf(p, real) {
  await loadJsPdf();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, H = 297, M = 14, CW = W - 2 * M;
  let y = 0;

  const r = buildReport(p, real);
  const prev = buildReport(prevPeriod(p), real);

  const font = (size, style = 'normal', color = C.text) => { doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...color); };
  const text = (s, x, yy, opts) => doc.text(clean(s), x, yy, opts);
  const fit = (s, maxW) => {
    let t = clean(s);
    if (doc.getTextWidth(t) <= maxW) return t;
    while (t.length > 1 && doc.getTextWidth(`${t}...`) > maxW) t = t.slice(0, -1);
    return `${t}...`;
  };
  const ensure = h => { if (y + h > H - 18) { doc.addPage(); y = 18; } };
  const section = title => {
    ensure(16);
    y += 4;
    doc.setFillColor(...C.cyan); doc.rect(M, y - 3.6, 1.4, 5, 'F');
    font(12, 'bold'); text(title, M + 4, y);
    y += 7;
  };

  /* Encabezado */
  doc.setFillColor(...C.dark); doc.rect(0, 0, W, 36, 'F');
  doc.setFillColor(...C.cyan); doc.rect(0, 36, W, 1.2, 'F');
  font(19, 'bold', [255, 255, 255]); text('Reporte de finanzas', M, 15);
  font(11.5, 'normal', C.cyan); text(p.longLabel, M, 23.5);
  font(8.5, 'normal', [165, 176, 188]);
  text(`${state.settings.name ? `${state.settings.name} · ` : ''}Generado el ${longToday()}${real ? ' · Montos ajustados por inflación (pesos de hoy)' : ''}`, M, 30.5);
  y = 46;

  /* Indicadores */
  const kpis = [
    ['Ingresos', money(r.income), C.pos, change(r.income, prev.income)],
    ['Gastos', money(r.expense), C.text, change(r.expense, prev.expense)],
    ['Ahorro', money(r.savings), r.savings >= 0 ? C.pos : C.neg, null],
    ['Tasa de ahorro', r.rate == null ? '-' : `${Math.round(r.rate * 100)}%`, C.text, null],
  ];
  const bw = (CW - 3 * 4) / 4;
  kpis.forEach(([label, value, color, ch], i) => {
    const x = M + i * (bw + 4);
    doc.setDrawColor(...C.line); doc.setFillColor(...C.soft); doc.roundedRect(x, y, bw, 22, 2, 2, 'FD');
    font(7.5, 'normal', C.muted); text(label.toUpperCase(), x + 3.5, y + 6);
    font(12.5, 'bold', color); text(fit(value, bw - 6), x + 3.5, y + 13.5);
    if (ch != null) { font(7.5, 'normal', C.muted); text(`${pct(ch)} vs. anterior`, x + 3.5, y + 19); }
  });
  y += 30;

  const infl = real ? inflationFor(p) : null;
  if (infl) {
    font(9, 'normal', C.muted);
    text(`Inflación del período: ${pct(infl.pct, 1)}${infl.estimated ? ' (incluye meses estimados)' : ''}. Todos los montos están en pesos de ${monthName(curYm())}.`, M, y);
    y += 7;
  }

  /* Gastos por categoría */
  if (r.byCat.length) {
    section('Gastos por categoría');
    const max = r.byCat[0].v;
    for (const a of r.byCat) {
      ensure(8);
      doc.setFillColor(...rgb(a.cat.color)); doc.roundedRect(M, y - 3.2, 3.6, 3.6, 0.8, 0.8, 'F');
      font(9.5); text(fit(a.cat.name, 52), M + 6, y);
      doc.setFillColor(...C.line); doc.roundedRect(M + 62, y - 2.6, 70, 2.6, 1.3, 1.3, 'F');
      doc.setFillColor(...rgb(a.cat.color)); doc.roundedRect(M + 62, y - 2.6, Math.max(1.5, (a.v / max) * 70), 2.6, 1.3, 1.3, 'F');
      font(8.5, 'normal', C.muted); text(`${Math.round((a.v / r.expense) * 100)}%`, M + 140, y, { align: 'right' });
      font(9.5, 'bold'); text(money(a.v), M + CW, y, { align: 'right' });
      y += 7;
    }
    doc.setDrawColor(...C.line); doc.line(M, y - 3, M + CW, y - 3);
    font(9.5, 'bold'); text('Total', M + 6, y + 2); text(money(r.expense), M + CW, y + 2, { align: 'right' });
    y += 8;
  }

  /* Cambios por categoría */
  const changes = prev.expense > 0 ? categoryChanges(r, prev).slice(0, 6) : [];
  if (changes.length) {
    section('Qué cambió vs. el período anterior');
    for (const c of changes) {
      ensure(7);
      font(9.5); text(fit(c.cat.name, 70), M + 2, y);
      font(9, 'normal', C.muted); text(`${money(c.before)}  >  ${money(c.now)}`, M + 120, y, { align: 'right' });
      font(9.5, 'bold', c.diff > 0 ? C.neg : C.pos);
      text(c.pct == null ? 'nuevo' : pct(c.pct), M + CW, y, { align: 'right' });
      y += 6.5;
    }
    y += 2;
  }

  /* Evolución mensual */
  const series = monthlySeries(chartMonths(p), real);
  section('Ingresos vs. gastos por mes');
  ensure(56);
  const chartH = 36, top = Math.max(1, ...series.flatMap(s => [s.income, s.expense]));
  const slot = CW / series.length, bwid = Math.min(6, slot / 3);
  doc.setDrawColor(...C.line); doc.line(M, y + chartH, M + CW, y + chartH);
  series.forEach((s, i) => {
    const cx = M + slot * i + slot / 2;
    const hi = (s.income / top) * chartH, he = (s.expense / top) * chartH;
    doc.setFillColor(...C.cyanInk); if (hi > 0) doc.rect(cx - bwid - 0.5, y + chartH - hi, bwid, hi, 'F');
    doc.setFillColor(...C.grey); if (he > 0) doc.rect(cx + 0.5, y + chartH - he, bwid, he, 'F');
    font(7.5, 'normal', C.muted); text(cap(shortYm(s.ym, series.length <= 6)), cx, y + chartH + 4.5, { align: 'center' });
  });
  y += chartH + 8;
  doc.setFillColor(...C.cyanInk); doc.rect(M, y - 2.4, 3, 3, 'F'); font(8, 'normal', C.muted); text('Ingresos', M + 4.5, y);
  doc.setFillColor(...C.grey); doc.rect(M + 24, y - 2.4, 3, 3, 'F'); text('Gastos', M + 28.5, y);
  y += 7;
  // tabla
  ensure(10);
  font(8, 'bold', C.muted);
  text('MES', M + 2, y); text('INGRESOS', M + 95, y, { align: 'right' }); text('GASTOS', M + 135, y, { align: 'right' }); text('AHORRO', M + CW, y, { align: 'right' });
  y += 2; doc.setDrawColor(...C.line); doc.line(M, y, M + CW, y); y += 5;
  for (const s of series) {
    ensure(6);
    font(9); text(cap(monthName(s.ym)), M + 2, y);
    text(money(s.income), M + 95, y, { align: 'right' });
    text(money(s.expense), M + 135, y, { align: 'right' });
    font(9, 'bold', s.income - s.expense >= 0 ? C.pos : C.neg); text(money(s.income - s.expense), M + CW, y, { align: 'right' });
    y += 5.8;
  }
  y += 2;

  /* Medios de pago */
  if (r.byAcc.length) {
    section('Gastos por medio de pago');
    for (const a of r.byAcc) {
      ensure(6.5);
      font(9.5); text(fit(a.acc?.name || '-', 90), M + 2, y);
      font(8.5, 'normal', C.muted); text(`${Math.round((a.v / r.expense) * 100)}%`, M + 140, y, { align: 'right' });
      font(9.5, 'bold'); text(money(a.v), M + CW, y, { align: 'right' });
      y += 6.5;
    }
    y += 2;
  }

  /* Mayores gastos */
  if (r.top.length) {
    section('Mayores gastos');
    for (const { t, v } of r.top) {
      ensure(6.5);
      const cat = r.byCat.find(c => c.id === t.categoryId)?.cat;
      font(9, 'normal', C.muted); text(shortDate(t.date), M + 2, y);
      font(9.5); text(fit(t.note || cat?.name || 'Gasto', 70), M + 24, y);
      font(9, 'normal', C.muted); text(fit(cat?.name || '', 40), M + 100, y);
      font(9.5, 'bold'); text(money(v), M + CW, y, { align: 'right' });
      y += 6.5;
    }
    y += 2;
  }

  /* Patrimonio (siempre a hoy, en pesos corrientes) */
  const w = wealthAt();
  section(`Patrimonio al ${longToday()}`);
  const rows = [
    ...accounts().map(a => [a.name, balance(a)]),
    ...(w.inv ? [['Inversiones', w.inv]] : []),
    ...(w.owed ? [['Me deben', w.owed]] : []),
    ...(w.owe ? [['Debo', -w.owe]] : []),
  ];
  for (const [name, v] of rows) {
    ensure(6.5);
    font(9.5); text(fit(name, 110), M + 2, y);
    font(9.5, 'normal', v < 0 ? C.neg : C.text); text(money(v), M + CW, y, { align: 'right' });
    y += 6.2;
  }
  ensure(10);
  doc.setDrawColor(...C.line); doc.line(M, y - 3, M + CW, y - 3);
  font(11, 'bold'); text('Patrimonio neto', M + 2, y + 2.5);
  font(11, 'bold', w.net >= 0 ? C.text : C.neg); text(money(w.net), M + CW, y + 2.5, { align: 'right' });
  y += 9;
  const invs = activeInvestments();
  if (invs.length) {
    ensure(8);
    const st = invs.map(investStats);
    const gain = st.reduce((s, x) => s + x.gain, 0), base = st.reduce((s, x) => s + x.invested, 0);
    font(9, 'normal', C.muted); text(`Ganancia de tus inversiones: ${money(gain)}${base > 0 ? ` (${pct(gain / base, 1)})` : ''}`, M + 2, y);
    y += 6;
  }

  /* Pie de página */
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    font(7.5, 'normal', C.muted);
    text('Finanzas Tino', M, H - 8);
    text(`Página ${i} de ${pages}`, W - M, H - 8, { align: 'right' });
  }

  const name = `reporte-finanzas-${p.from}_a_${p.to}${real ? '-ajustado' : ''}.pdf`;
  await saveFile(name, doc.output('blob'), 'application/pdf');
}
