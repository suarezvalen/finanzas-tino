// Paneles del sector Negocio: gastos, detalle de un conjunto y de un día, informe diario, objetivo, Excel e importación.
import { bizDays, bizCosts, upsert, upsertMany, remove, state } from '../store.js';
import { icon } from '../icons.js';
import { openSheet, esc, money, signed, toast, amountInput, parseAmount, fmtNum, saveFile, mark } from '../ui.js';
import { sheetHead, catIc, empty } from '../components.js';
import { today, addDays, monthName, cap, pad, daysInMonth } from '../dates.js';
import {
  eco, prefs, breakEven, contribution, groupAds, adsetVerdicts, VERDICTS, fmtRoas, statusLabel, COST_CATS, costCat, usdRate,
  dayCalc, shortDay, makeBizPeriod, totals, lastDay, firstDay, monthsWithData,
} from '../logic/biz.js';
import { normalizeDay, normalizeEconomia, classify } from '../logic/biz-format.js';

const pct = (v, d = 1) => (v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(d).replace('.', ',')}%`);
const roasCls = (r, be) => (r == null || !be ? '' : r >= be ? 'pos' : 'neg');
const savePrefs = patch => upsert('biz_cfg', { ...prefs(), ...patch, id: 'prefs' });

/* ---------- Gasto del negocio ---------- */
export function openBizCost(id) {
  const ex = id ? bizCosts().find(c => c.id === id) : null;
  const F = {
    name: ex?.name || '', cat: ex?.cat || 'apps', freq: ex?.freq || 'monthly', currency: ex?.currency || 'ARS',
    amount: ex?.amount ? (ex.currency === 'USD' ? String(ex.amount).replace('.', ',') : fmtNum(ex.amount)) : '',
    date: ex?.date || (ex ? '' : `${today().slice(0, 7)}-01`), until: ex?.until || '', note: ex?.note || '',
  };
  const SUGGEST = [['Plan de Shopify', 'plataforma', 'USD'], ['Klaviyo', 'email', 'USD'], ['Apps de Shopify', 'apps', 'USD'], ['Dominio', 'plataforma', 'ARS'], ['Canva', 'diseno', 'ARS'], ['ChatGPT / IA', 'apps', 'USD'], ['Monotributo', 'impuestos', 'ARS']];
  openSheet({
    full: true,
    render(el, ctl) {
      el.innerHTML = `${sheetHead(ex ? 'Editar gasto' : 'Nuevo gasto del negocio')}
        ${ex ? '' : `<div class="chips wrap" style="margin:-4px 0 14px">${SUGGEST.map(([n, c, cur]) => `<button class="chip" data-sug="${esc(n)}|${c}|${cur}">${esc(n)}</button>`).join('')}</div>`}
        <div class="field"><label for="cn">Nombre</label><input class="input" id="cn" maxlength="40" autocomplete="off" placeholder="Ej: Plan de Shopify" value="${esc(F.name)}"></div>
        <div class="field"><label>¿Cada cuánto?</label><div class="seg"><button data-freq="monthly" class="${F.freq === 'monthly' ? 'on' : ''}">Todos los meses</button><button data-freq="once" class="${F.freq === 'once' ? 'on' : ''}">Una sola vez</button></div></div>
        <div class="field"><label for="ca">Monto</label>
          <div class="row"><input class="input" id="ca" inputmode="${F.currency === 'USD' ? 'decimal' : 'numeric'}" autocomplete="off" placeholder="${F.currency === 'USD' ? 'US$ 0' : '$ 0'}" value="${esc(F.amount)}" style="flex:1">
          <div class="seg" style="flex:0 0 130px"><button data-cur="ARS" class="${F.currency === 'ARS' ? 'on' : ''}">Pesos</button><button data-cur="USD" class="${F.currency === 'USD' ? 'on' : ''}">Dólares</button></div></div>
          ${F.currency === 'USD' ? `<p class="help">${usdRate() ? `Se pasa a pesos con el dólar tarjeta del día (hoy $ ${Math.round(usdRate()).toLocaleString('es-AR')}).` : 'Se pasa a pesos con el dólar tarjeta cuando haya internet.'}</p>` : ''}</div>
        <div class="field"><label>${F.freq === 'once' ? 'Fecha' : 'Desde'}</label>
          <label class="date-pill" style="height:48px;width:100%;justify-content:center">${icon('calendar')}<span>${F.date ? shortDay(F.date) : 'Elegí la fecha'}</span><input type="date" id="cd" value="${F.date}"></label></div>
        ${F.freq === 'monthly' ? `<div class="field"><label>Hasta (opcional)</label>
          <label class="date-pill" style="height:48px;width:100%;justify-content:center">${icon('calendar')}<span>${F.until ? shortDay(F.until) : 'Sigue vigente'}</span><input type="date" id="cu" value="${F.until}"></label>
          ${F.until ? '<button class="link" data-nountil style="margin-top:8px">Sigue vigente</button>' : ''}<p class="help">Si lo diste de baja, poné hasta cuándo lo pagaste.</p></div>` : ''}
        <div class="field"><label>Categoría</label><div class="chips wrap" id="ccat">${Object.entries(COST_CATS).map(([k, c]) => `<button class="chip ${F.cat === k ? 'on' : ''}" data-cat="${k}">${icon(c.icon)}${c.label}</button>`).join('')}</div></div>
        <p class="help" style="margin:-4px 2px 16px">Este gasto va solo al negocio: no aparece en tus movimientos ni en tus saldos personales.</p>
        <button class="btn primary" data-save>${ex ? 'Guardar cambios' : 'Agregar gasto'}</button>
        ${ex ? `<button class="btn danger" data-del style="margin-top:10px">${icon('trash-2')}Borrar gasto</button>` : ''}`;
      el.querySelector('#cn').oninput = e => { F.name = e.target.value; };
      const ca = el.querySelector('#ca');
      if (F.currency === 'ARS') amountInput(ca, v => { F.amount = v; });
      else ca.oninput = () => { F.amount = ca.value.replace(/[^\d,.]/g, ''); };
      for (const [sel, key] of [['#cd', 'date'], ['#cu', 'until']]) {
        const inp = el.querySelector(sel);
        if (!inp) continue;
        inp.onchange = () => { F[key] = inp.value; ctl.refresh(); };
        inp.onclick = () => { try { inp.showPicker?.(); } catch { /* selector nativo */ } };
      }
      el.onclick = async e => {
        const b = e.target.closest('button');
        if (!b) return;
        const d = b.dataset;
        if ('close' in d) return ctl.close();
        if (d.sug) { const [n, c, cur] = d.sug.split('|'); Object.assign(F, { name: n, cat: c, currency: cur, amount: '' }); return ctl.refresh(); }
        if (d.freq) { F.freq = d.freq; if (d.freq === 'once' && !F.date) F.date = today(); return ctl.refresh(); }
        if (d.cur) { F.currency = d.cur; F.amount = ''; return ctl.refresh(); }
        if (d.cat) { F.cat = d.cat; return mark(el.querySelector('#ccat'), b); }
        if ('nountil' in d) { F.until = ''; return ctl.refresh(); }
        if ('del' in d) {
          if (!confirm(`¿Borrar "${ex.name}"? Deja de contar en el resultado de todos los días.`)) return;
          await remove('biz_costs', ex.id);
          toast('Gasto borrado', { icon: 'trash-2' });
          return ctl.close();
        }
        if ('save' in d) {
          const amount = F.currency === 'USD' ? Number(String(F.amount).replace(/\./g, '').replace(',', '.')) || 0 : parseAmount(F.amount);
          if (!F.name.trim()) { toast('Ponele un nombre', { icon: 'info' }); return; }
          if (!(amount > 0)) { toast('Poné el monto', { icon: 'info' }); return; }
          if (F.freq === 'once' && !F.date) { toast('Elegí la fecha', { icon: 'info' }); return; }
          if (F.until && F.date && F.until < F.date) { toast('"Hasta" no puede ser antes de "Desde"', { icon: 'info' }); return; }
          await upsert('biz_costs', { id: ex?.id, name: F.name.trim(), cat: F.cat, freq: F.freq, currency: F.currency, amount, date: F.date || null, until: F.freq === 'monthly' ? F.until || null : null });
          toast(ex ? 'Gasto actualizado' : 'Gasto agregado');
          ctl.close();
        }
      };
    },
  });
}

/* ---------- Detalle de un conjunto ---------- */
export function openAdset(key) {
  openSheet({
    full: true, live: true,
    render(el, ctl) {
      const be = breakEven();
      const all = groupAds(makeBizPeriod('todo')).find(g => g.key === key);
      if (!all) { el.innerHTML = `${sheetHead('Conjunto')}${empty('target', 'Sin datos', 'Este conjunto no tiene gasto cargado.')}`; el.onclick = e => e.target.closest('[data-close]') && ctl.close(); return; }
      const v7 = adsetVerdicts().find(g => g.key === key);
      const days = bizDays().map(d => ({ date: d.date, a: (d.ads || []).filter(a => (a.adsetId || a.adset) === key) })).filter(x => x.a.length)
        .map(x => ({ date: x.date, spend: sum(x.a, 'spend'), purch: sum(x.a, 'purch'), value: sum(x.a, 'value'), impr: sum(x.a, 'impr'), clicks: sum(x.a, 'clicks'), atc: sum(x.a, 'atc'), ic: sum(x.a, 'ic') })).reverse();
      const ads = groupAds(makeBizPeriod('todo'), 'ad').filter(a => (a.adsetId || a.adset) === key);
      const V = v7?.v ? VERDICTS[v7.v.k] : null;
      const top = Math.max(1, ...days.map(x => x.spend));
      el.innerHTML = `${sheetHead(esc(all.name))}
        <p class="help" style="margin:-8px 2px 12px">${esc(all.campaign || '')} · ${statusLabel(all.status)}</p>
        ${V ? `<section class="card verdict-card" style="--c:${V.color}"><div class="label">Últimos 7 días</div><b class="vbig">${V.label}</b><p class="help" style="margin-top:4px">${esc(v7.v.why)}</p>
          <div class="row" style="margin-top:10px"><div class="pill"><small>Gasto</small><b>${money(v7.spend)}</b></div><div class="pill"><small>Compras</small><b>${v7.purch}</b></div><div class="pill"><small>ROAS</small><b class="${roasCls(v7.roas, be)}">${fmtRoas(v7.roas)}</b></div></div></section>` : ''}
        <div class="kpis">
          <div class="kpi"><small>Gasto total</small><b>${money(all.spend)}</b><span>${all.activeDays} días con gasto</span></div>
          <div class="kpi"><small>Compras</small><b>${all.purch}</b><span>${all.cpa ? `${money(all.cpa)} c/u` : 'sin compras'}</span></div>
          <div class="kpi"><small>ROAS</small><b class="${roasCls(all.roas, be)}">${fmtRoas(all.roas)}</b><span>equilibrio ${fmtRoas(be)}</span></div>
          <div class="kpi"><small>CTR · CPM</small><b>${pct(all.ctr, 2)}</b><span>CPM ${all.cpm ? money(all.cpm) : '—'}</span></div>
        </div>
        <div class="section-h"><h3>Día por día</h3><small class="muted-s">desde el ${shortDay(all.first)}</small></div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Día</th><th>Gasto</th><th></th><th>Compras</th><th>ROAS</th><th>Carritos</th><th>CTR</th></tr></thead>
          <tbody>${days.map(x => `<tr><td>${shortDay(x.date)}</td><td>${money(x.spend)}</td><td class="mini-bar"><i style="width:${(x.spend / top) * 100}%"></i></td><td>${x.purch}</td>
            <td class="${roasCls(x.spend ? x.value / x.spend : null, be)}">${x.spend ? fmtRoas(x.value / x.spend) : '—'}</td><td>${x.atc}</td><td>${x.impr ? pct(x.clicks / x.impr, 2) : '—'}</td></tr>`).join('')}</tbody></table></div>
        ${ads.length > 1 ? `<div class="section-h"><h3>Anuncios del conjunto</h3></div><div class="list">${ads.map(a => `<div class="item"><span class="info"><b>${esc(a.name)}</b><small>${a.purch} compras · ${money(a.spend)} · ${statusLabel(a.status)}</small></span><span class="val ${roasCls(a.roas, be)}">${fmtRoas(a.roas)}</span></div>`).join('')}</div>` : ''}
        <p class="foot">Compras y ROAS según Meta.</p>`;
      el.onclick = e => { if (e.target.closest('[data-close]')) ctl.close(); };
    },
  });
}
const sum = (arr, k) => arr.reduce((s, x) => s + (x[k] || 0), 0);

/* ---------- Detalle de un día ---------- */
export function openDayDetail(date) {
  const d = bizDays().find(x => x.date === date);
  if (!d) return;
  openSheet({
    full: true,
    render(el, ctl) {
      const be = breakEven();
      const x = dayCalc(d);
      const line = (l, v, cls = '') => `<div class="item"><span class="info"><b>${l}</b></span><span class="val ${cls}">${v}</span></div>`;
      el.innerHTML = `${sheetHead(cap(new Date(date + 'T12:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })))}
        <section class="card hero sm"><div class="label">Resultado del día</div><div class="amount ${x.result >= 0 ? '' : 'neg'}">${signed(x.result)}</div>
          <p class="help">${x.orders} pedidos · ROAS ${fmtRoas(x.roas)} ${x.roas != null && be ? (x.roas >= be ? '<span class="pos">sobre el equilibrio</span>' : '<span class="neg">bajo el equilibrio</span>') : ''}</p></section>
        <div class="list">
          ${line('Facturación neta', money(x.net), 'pos')}
          ${x.disc ? line('Descuentos (cupones)', '−' + money(x.disc)) : ''}
          ${line('Publicidad (Meta)', '−' + money(x.ads))}
          ${x.adsTax ? line('Impuestos sobre publicidad', '−' + money(x.adsTax)) : ''}
          ${line('Comisión de cobranza', '−' + money(x.fees))}
          ${line('Ingresos brutos', '−' + money(x.iibb))}
          ${x.other ? line('Otros', '−' + money(x.other)) : ''}
          ${x.cogs ? line('Producto y envío', '−' + money(x.cogs)) : ''}
          ${x.fixed ? line('Gastos fijos (parte del día)', '−' + money(x.fixed)) : ''}
          ${line('<b>Resultado</b>', signed(x.result), x.result >= 0 ? 'pos' : 'neg')}
        </div>
        ${x.visits ? `<p class="hint">${x.visits} visitas → ${x.carts} carritos → ${x.checkouts} llegaron al pago → ${x.orders} compras (${pct(x.orders / x.visits)}).</p>` : ''}
        ${(d.ads || []).length ? `<div class="section-h"><h3>Anuncios</h3></div><div class="list">${[...d.ads].sort((a, b) => b.spend - a.spend).map(a => `<button class="item tap" data-adset="${esc(a.adsetId || a.adset)}">
          <span class="info"><b>${esc(a.adset)}</b><small>${a.purch} compras · ${a.clicks} clics · ${a.atc} carritos</small></span>
          <span class="val">${money(a.spend)}<small class="sub-val ${roasCls(a.spend ? a.value / a.spend : null, be)}">ROAS ${a.spend ? fmtRoas(a.value / a.spend) : '—'}</small></span></button>`).join('')}</div>` : ''}
        ${(d.orders || []).length ? `<div class="section-h"><h3>Pedidos</h3></div><div class="list">${d.orders.map(o => `<div class="item"><span class="info"><b>${esc(o.n)}${o.code ? `<span class="tag">${esc(o.code)}</span>` : ''}</b><small>${esc(o.t || '')}</small></span><span class="val">${money(o.total)}</span></div>`).join('')}</div>` : ''}
        ${d.report?.md ? `<button class="btn" data-rep style="margin-top:14px">${icon('file-text')}Leer el informe de este día</button>` : ''}`;
      el.onclick = e => {
        const b = e.target.closest('button');
        if (!b) return;
        if ('close' in b.dataset) return ctl.close();
        if (b.dataset.adset) return openAdset(b.dataset.adset);
        if ('rep' in b.dataset) return openBizReport(d.id);
      };
    },
  });
}

/* ---------- Informe diario (markdown) ---------- */
export function openBizReport(id) {
  const d = bizDays().find(x => x.id === id);
  if (!d?.report?.md) return;
  const days = bizDays().filter(x => x.report?.md);
  openSheet({
    full: true,
    render(el, ctl) {
      const i = days.findIndex(x => x.id === id);
      el.innerHTML = `${sheetHead('Informe del día')}
        <div class="month-sw"><button data-nav="-1" ${i <= 0 ? 'disabled' : ''} aria-label="Anterior">${icon('chevron-left')}</button><b>${cap(new Date(d.date + 'T12:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }))}</b><button data-nav="1" ${i >= days.length - 1 ? 'disabled' : ''} aria-label="Siguiente">${icon('chevron-right')}</button></div>
        <article class="md">${markdown(d.report.md)}</article>`;
      el.onclick = e => {
        const b = e.target.closest('button');
        if (!b) return;
        if ('close' in b.dataset) return ctl.close();
        if (b.dataset.nav) { const n = days[i + Number(b.dataset.nav)]; if (n) { ctl.close(); openBizReport(n.id); } }
      };
    },
  });
}

/** Markdown simple: títulos, negritas, listas, tablas y separadores. */
export function markdown(md) {
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,;:]|$)/g, '$1<i>$2</i>');
  const lines = md.replace(/\r/g, '').split('\n');
  let html = '', list = null, para = [];
  const flush = () => {
    if (para.length) { html += `<p>${inline(para.join(' '))}</p>`; para = []; }
    if (list) { html += `</${list}>`; list = null; }
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*\|/.test(l)) {
      flush();
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
      i--;
      const cells = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const body = rows.filter(r => !/^\s*\|[\s:|-]+\|\s*$/.test(r));
      html += `<div class="tbl-wrap"><table class="tbl"><thead><tr>${cells(body[0]).map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.slice(1).map(r => `<tr>${cells(r).map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      continue;
    }
    const h = l.match(/^(#{1,4})\s+(.*)/);
    if (h) { flush(); const n = Math.min(4, h[1].length + 1); html += `<h${n}>${inline(h[2])}</h${n}>`; continue; }
    if (/^\s*-{3,}\s*$/.test(l)) { flush(); html += '<hr>'; continue; }
    const li = l.match(/^\s*(?:[-*]|\d+\.)\s+(.*)/);
    if (li) {
      if (para.length) { html += `<p>${inline(para.join(' '))}</p>`; para = []; }
      const kind = /^\s*\d+\./.test(l) ? 'ol' : 'ul';
      if (list !== kind) { if (list) html += `</${list}>`; html += `<${kind}>`; list = kind; }
      html += `<li>${inline(li[1])}</li>`;
      continue;
    }
    if (!l.trim()) { flush(); continue; }
    if (list && /^\s{2,}/.test(l)) { html = html.replace(/<\/li>$/, ` ${inline(l.trim())}</li>`); continue; }
    if (list) { html += `</${list}>`; list = null; }
    para.push(l.trim());
  }
  flush();
  return html;
}

/* ---------- Objetivo e impuestos ---------- */
export function openGoalEdit({ focus } = {}) {
  const pr = prefs();
  const F = { goal: pr.goal ? fmtNum(pr.goal) : '', profitGoal: pr.profitGoal ? fmtNum(pr.profitGoal) : '', tax: pr.adsTaxPct ? String(pr.adsTaxPct).replace('.', ',') : '' };
  openSheet({
    full: true,
    render(el, ctl) {
      const last = lastDay();
      const ym = (last || today()).slice(0, 7);
      const t = totals({ from: `${ym}-01`, to: `${ym}-${pad(daysInMonth(ym))}` });
      el.innerHTML = `${sheetHead('Objetivos y ajustes')}
        <div class="field"><label for="gg">Facturación que querés en el mes</label><input class="input" id="gg" inputmode="numeric" autocomplete="off" placeholder="$ 0" value="${F.goal}">
          <p class="help">En ${monthName(ym, { month: 'long' })} vas ${money(t.net)}.</p></div>
        <div class="field"><label for="gp">Ganancia que querés en el mes (opcional)</label><input class="input" id="gp" inputmode="numeric" autocomplete="off" placeholder="$ 0" value="${F.profitGoal}">
          <p class="help">Resultado después de publicidad, comisiones, impuestos y gastos fijos. Vas ${signed(t.result)}.</p></div>
        <div class="field"><label for="gx">Impuestos sobre la publicidad (%)</label><input class="input" id="gx" inputmode="decimal" autocomplete="off" placeholder="0" value="${F.tax}">
          <p class="help">Si Meta te cobra IVA y percepciones encima del gasto, poné el total acá (por ejemplo 21 si solo es IVA). Lo ves en la factura de Meta: lo que te debitan dividido el gasto. Si pagás con tarjeta en dólares, sumá también el recargo de la tarjeta.</p></div>
        <button class="btn primary" data-save>Guardar</button>`;
      amountInput(el.querySelector('#gg'), v => { F.goal = v; });
      amountInput(el.querySelector('#gp'), v => { F.profitGoal = v; });
      const gx = el.querySelector('#gx');
      gx.oninput = () => { F.tax = gx.value.replace(/[^\d,.]/g, ''); };
      if (focus === 'tax') setTimeout(() => gx.focus(), 350);
      el.onclick = async e => {
        const b = e.target.closest('button');
        if (!b) return;
        if ('close' in b.dataset) return ctl.close();
        if ('save' in b.dataset) {
          const tax = Number(String(F.tax).replace(',', '.')) || 0;
          if (tax < 0 || tax > 100) { toast('El porcentaje tiene que estar entre 0 y 100', { icon: 'info' }); return; }
          await savePrefs({ goal: parseAmount(F.goal), profitGoal: parseAmount(F.profitGoal), adsTaxPct: tax });
          toast('Guardado');
          ctl.close();
        }
      };
    },
  });
}

/* ---------- Ranking completo de creativos ---------- */
export function openCreatives() {
  openSheet({
    full: true,
    render(el, ctl) {
      const be = breakEven();
      const ads = groupAds(makeBizPeriod('todo'), 'ad').sort((a, b) => b.purch - a.purch || (b.roas || 0) - (a.roas || 0));
      el.innerHTML = `${sheetHead('Todos los creativos')}
        <p class="help" style="margin:-8px 2px 12px">Desde el ${shortDay(firstDay())}. Ordenados por ventas.</p>
        <div class="tbl-wrap"><table class="tbl sticky1">
          <thead><tr><th>Anuncio</th><th>Ventas</th><th>Costo/venta</th><th>ROAS</th><th>Gasto</th><th>CTR</th><th>Días</th><th>Estado</th></tr></thead>
          <tbody>${ads.map(a => `<tr><td class="name">${esc(a.name)}<small>${esc(a.adset)}</small></td><td>${a.purch}</td><td>${a.cpa ? money(a.cpa) : '—'}</td><td class="${roasCls(a.roas, be)}">${fmtRoas(a.roas)}</td><td>${money(a.spend)}</td><td>${pct(a.ctr, 2)}</td><td>${a.activeDays}</td><td>${statusLabel(a.status)}</td></tr>`).join('')}</tbody>
        </table></div>`;
      el.onclick = e => { if (e.target.closest('[data-close]')) ctl.close(); };
    },
  });
}

/* ---------- Excel ---------- */
export function openBizExport(period, month) {
  const months = monthsWithData();
  const ym = month || months.at(-1);
  openSheet({
    render(el, ctl) {
      const opts = [
        ['period', period.label, `${shortDay(period.from)} al ${shortDay(period.to)}`],
        ym ? ['month', cap(monthName(ym)), 'El mes que estás mirando en Registro'] : null,
        ['all', 'Todo el historial', firstDay() ? `Desde el ${shortDay(firstDay())}` : ''],
      ].filter(Boolean);
      el.innerHTML = `${sheetHead('Descargar Excel')}
        <p class="help" style="margin:-6px 2px 14px">Resumen con gráficos, registro diario, campañas día por día, conjuntos con veredicto, ranking de creativos, pedidos, gastos y la economía del producto.</p>
        <div class="list">${opts.map(([k, l, s]) => `<button class="item tap" data-x="${k}">${catIc({ icon: 'file-spreadsheet', color: '#2EF2A0' })}<span class="info"><b>${esc(l)}</b><small>${esc(s)}</small></span>${icon('download', 'chev')}</button>`).join('')}</div>`;
      el.onclick = async e => {
        const b = e.target.closest('button');
        if (!b) return;
        if ('close' in b.dataset) return ctl.close();
        const k = b.dataset.x;
        if (!k) return;
        const p = k === 'period' ? period : k === 'month'
          ? { kind: 'month', from: `${ym}-01`, to: `${ym}-${pad(daysInMonth(ym))}`, label: cap(monthName(ym)) }
          : makeBizPeriod('todo');
        if (k === 'month') { p.to = p.to > (lastDay() || p.to) ? lastDay() : p.to; p.days = 0; }
        b.disabled = true;
        b.querySelector('small').textContent = 'Armando el archivo…';
        try {
          const { businessWorkbook, workbookName } = await import('../logic/biz-excel.js');
          const bytes = businessWorkbook(p);
          await saveFile(workbookName(p), bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          ctl.close();
        } catch (err) {
          console.error(err);
          toast('No se pudo armar el Excel', { icon: 'triangle-alert' });
          b.disabled = false;
        }
      };
    },
  });
}

/* ---------- Importar a mano ---------- */
export function openBizImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.multiple = true;
  input.onchange = async () => {
    const errors = [];
    const days = [];
    let economia = null;
    for (const f of input.files) {
      let raw;
      try { raw = JSON.parse(await f.text()); } catch { errors.push(`${f.name}: no es un JSON válido`); continue; }
      const kind = classify(raw);
      if (kind === 'economia') economia = normalizeEconomia(raw, errors);
      else if (kind === 'day') { const d = normalizeDay(raw, f.name, errors); if (d) days.push(d); }
      else if (kind === 'days') for (const r of raw) { const d = normalizeDay(r, f.name, errors); if (d) days.push(d); }
      else errors.push(`${f.name}: no parece un archivo del negocio`);
    }
    if (errors.length) { alert('No se pudo importar:\n\n' + errors.slice(0, 8).join('\n')); return; }
    if (days.length) await upsertMany('biz_days', days.map(d => ({ ...d, importedAt: new Date().toISOString() })));
    if (economia) await upsert('biz_cfg', economia);
    toast(`${days.length ? `${days.length} día${days.length === 1 ? '' : 's'}` : ''}${days.length && economia ? ' y ' : ''}${economia ? 'la economía' : ''} importado${days.length > 1 ? 's' : ''}`, { icon: 'upload' });
  };
  input.click();
}

export { state };
