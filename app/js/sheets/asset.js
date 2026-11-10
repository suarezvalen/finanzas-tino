// Detalle de un activo: gráfico, análisis en palabras, tu posición, alertas y compra/venta.
import { watchlist, alertRules, accounts, upsert, remove, getInvestment } from '../store.js';
import { icon } from '../icons.js';
import { openSheet, toast, esc, money, amountInput, parseAmount, fmtNum, mark, ensureVisible } from '../ui.js';
import { sheetHead, catIc, accChips, empty } from '../components.js';
import { today, shortDate } from '../dates.js';
import { MARKETS, quoteOf, history, linkedHoldings, holdingStats, refreshMarket, quoteNow, marketCache, onMarketChange } from '../logic/market.js';
import { analyze, fmtPctAbs } from '../logic/analysis.js';
import { fmtPrice, RULE_TYPES, planText } from '../logic/alerts-core.js';
import { positionValue } from '../logic/market-core.js';
import { marketIc } from './pick-asset.js';

const RANGES = [['1M', 22], ['3M', 66], ['6M', 130], ['1A', 252], ['5A', 1260]];
const parseUnits = s => Number(String(s).replace(/\./g, '').replace(',', '.')) || 0;
const fmtUnits = n => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 8 }).format(n);
const pct = (p, d = 1) => (p == null ? '—' : `${p >= 0 ? '+' : '−'}${Math.abs(p * 100).toFixed(d).replace('.', ',')}%`);
const holdingOf = (market, ticker) => linkedHoldings().find(i => i.market === market && i.ticker.toUpperCase() === ticker);

function chart(bars, { cost } = {}) {
  if (bars.length < 2) return '';
  const W = 340, H = 150, pad = 6;
  const c = bars.map(b => b.c);
  let min = Math.min(...c), max = Math.max(...c);
  if (cost && cost > 0) { min = Math.min(min, cost); max = Math.max(max, cost); }
  const span = max - min || 1;
  const x = i => (i / (bars.length - 1)) * W;
  const y = v => pad + (1 - (v - min) / span) * (H - 2 * pad);
  const pts = c.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const up = c[c.length - 1] >= c[0];
  const col = up ? '#2EF2A0' : '#FF5C7A';
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="cg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".28"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
    <polygon points="0,${H} ${pts} ${W},${H}" fill="url(#cg)"/>
    ${cost ? `<line x1="0" x2="${W}" y1="${y(cost)}" y2="${y(cost)}" stroke="#FFC24D" stroke-dasharray="4 4" stroke-width="1"/>` : ''}
    <polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}

/** Detalle de un activo. */
export function openAsset({ market, ticker }) {
  ticker = ticker.toUpperCase();
  const S = { range: '1A', bars: null, a: null, error: '' };
  const crypto = market === 'crypto';
  let closed = false;

  const ctl = openSheet({
    full: true,
    live: true,
    onClose: () => { closed = true; },
    render(el) {
      const q = quoteOf(market, ticker);
      const h = holdingOf(market, ticker);
      const hs = h ? holdingStats(h) : null;
      const watching = watchlist().some(w => w.market === market && w.ticker === ticker);
      const rules = alertRules().filter(r => r.market === market && String(r.ticker).toUpperCase() === ticker);
      const n = RANGES.find(r => r[0] === S.range)[1];
      const bars = S.a?.bars?.slice(-n) || [];
      const a = S.a;
      const rangeRet = bars.length > 1 ? bars[bars.length - 1].c / bars[0].c - 1 : null;

      el.innerHTML = `
        <div class="grab"></div>
        <div class="sheet-head"><div class="row" style="align-items:center;gap:10px">${catIc(marketIc(market))}<div><h2>${esc(ticker)}</h2><small class="muted-s">${MARKETS[market]?.label || ''}</small></div></div>
          <button class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button></div>
        <section class="card hero">
          <div class="amount" style="font-size:30px">${q ? fmtPrice(q.price, q.ccy) : '—'}</div>
          <div style="font-size:13.5px;margin-top:2px">${q?.pct != null ? `<span class="${q.pct >= 0 ? 'pos' : 'neg'}">${q.pct >= 0 ? '▲' : '▼'} ${Math.abs(q.pct).toFixed(2).replace('.', ',')}% hoy</span>` : ''}
            ${rangeRet != null ? `<span class="muted-s"> · ${pct(rangeRet)} en ${S.range}</span>` : ''}</div>
          <div class="chart-wrap">${S.error ? `<p class="help">${esc(S.error)}</p>` : bars.length ? chart(bars, { cost: hs?.cost }) : '<p class="help">Cargando gráfico…</p>'}</div>
          <div class="seg range-seg">${RANGES.map(([k]) => `<button data-range="${k}" class="${S.range === k ? 'on' : ''}">${k}</button>`).join('')}</div>
          ${hs?.cost ? '<p class="help" style="margin-top:8px"><span class="legend-dash"></span> Tu precio promedio</p>' : ''}
        </section>

        ${h ? `<section class="card">
          <div class="label">Tu posición</div>
          <div class="rows">
            <div><span>Cantidad</span><b>${fmtUnits(h.units)}${MARKETS[market]?.per100 ? ' VN' : ''}</b></div>
            <div><span>Precio promedio</span><b>${hs.cost ? fmtPrice(hs.cost, q?.ccy) : '—'}</b></div>
            <div><span>Valor actual</span><b>${hs.value != null ? money(hs.value) : '—'}</b></div>
            <div><span>Ganancia</span><b class="${(hs.gain || 0) >= 0 ? 'pos' : 'neg'}">${hs.gain != null ? `${hs.gain >= 0 ? '+' : '−'}${money(Math.abs(hs.gain))} (${pct(hs.gainPct)})` : '—'}</b></div>
            ${hs.dayChange != null ? `<div><span>Hoy</span><b class="${hs.dayChange >= 0 ? 'pos' : 'neg'}">${hs.dayChange >= 0 ? '+' : '−'}${money(Math.abs(hs.dayChange))}</b></div>` : ''}
          </div>
          <div class="row" style="margin-top:14px"><button class="btn primary" data-buy>${icon('plus')}Comprar</button><button class="btn" data-sell>${icon('minus')}Vender</button></div>
        </section>` : `<button class="btn primary" data-add style="margin-bottom:14px">${icon('plus')}Agregar a mi cartera</button>`}

        <section class="card">
          <div class="label">Análisis</div>
          ${a?.ok ? `
            <div class="kpis mini">
              ${[['1 semana', a.ret.w1], ['1 mes', a.ret.m1], ['3 meses', a.ret.m3], ['1 año', a.ret.y1]].map(([l, v]) => `<div class="kpi"><small>${l}</small><b class="${v == null ? '' : v >= 0 ? 'pos' : 'neg'}">${pct(v)}</b></div>`).join('')}
            </div>
            <div class="rows" style="margin-top:4px">
              <div><span>Tendencia</span><b>${esc(a.trend)}</b></div>
              <div><span>RSI (14)</span><b>${a.rsi != null ? Math.round(a.rsi) : '—'}</b></div>
              <div><span>Máximo / mínimo del año</span><b>${fmtPrice(a.hi52, q?.ccy)} / ${fmtPrice(a.lo52, q?.ccy)}</b></div>
              <div><span>Volatilidad anual</span><b>${a.vol != null ? fmtPctAbs(a.vol) : '—'}</b></div>
            </div>
            <ul class="notes">${a.notes.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`
          : S.error ? '<p class="help">Sin histórico para analizar.</p>' : '<p class="help">Calculando…</p>'}
          <button class="btn" data-analyst style="margin-top:12px">${icon('sparkles')}Pedir análisis completo a mi analista</button>
          <p class="help">Es información calculada con datos reales, no una recomendación de compra o venta.</p>
        </section>

        <div class="section-h"><h3>Alertas</h3><button data-newalert>Nueva</button></div>
        ${rules.length ? `<div class="list">${rules.map(r => `<button class="item tap" data-rule="${r.id}">${catIc({ icon: r.type === 'plan' ? 'calendar-clock' : 'bell', color: r.active === false ? '#4A5866' : '#00E5FF' })}
          <span class="info"><b>${esc(ruleText(r, q?.ccy))}</b><small>${r.active === false ? 'Pausada' : r.armed === false ? 'Ya avisó · se reactiva si vuelve atrás' : 'Activa'}</small></span>${icon('chevron-right', 'chev')}</button>`).join('')}</div>`
          : '<p class="help" style="margin:0 4px">Te aviso si sube o baja de un precio, si se mueve mucho en el día o cuando te toca comprar.</p>'}

        <button class="btn" data-watch style="margin-top:16px">${icon(watching ? 'eye-off' : 'eye')}${watching ? 'Dejar de seguir' : 'Seguir en Mercado'}</button>
        <p class="help" style="margin:10px 4px 0">Fuente: ${crypto ? 'Binance' : 'BYMA vía data912'}. ${q ? '' : 'Sin cotización por ahora.'}</p>`;

      el.onclick = async e => {
        const b = e.target.closest('button');
        if (!b) return;
        const d = b.dataset;
        if ('close' in d) return ctl.close();
        if (d.range) { S.range = d.range; return ctl.refresh(); }
        if ('buy' in d) return openTrade({ inv: h, side: 'buy' });
        if ('sell' in d) return openTrade({ inv: h, side: 'sell' });
        if ('add' in d) { const { openInvestmentEdit } = await import('./investments.js'); return openInvestmentEdit(null, { market, ticker }); }
        if ('newalert' in d) { const { openAlertEdit } = await import('./alerts.js'); return openAlertEdit(null, { market, ticker }); }
        if (d.rule) { const { openAlertEdit } = await import('./alerts.js'); return openAlertEdit(d.rule); }
        if ('watch' in d) {
          const w = watchlist().find(x => x.market === market && x.ticker === ticker);
          if (w) { await remove('watch', w.id); toast(`Dejaste de seguir ${ticker}`, { icon: 'eye-off' }); }
          else { await upsert('watch', { market, ticker }); toast(`Siguiendo ${ticker}`, { icon: 'eye' }); refreshMarket({ force: true }); }
          return;
        }
        if ('analyst' in d) {
          const pos = h ? ` Tengo ${fmtUnits(h.units)} con precio promedio ${hs.cost ? fmtPrice(hs.cost, q?.ccy) : '—'}.` : '';
          const text = `ACTIVO ${ticker} (${MARKETS[market]?.label}, ${crypto ? 'Binance' : 'Cocos'}).${pos} Precio actual ${q ? fmtPrice(q.price, q.ccy) : '—'}. Analizalo y decime escenarios, riesgos y qué haría con esta posición.`;
          try { await navigator.clipboard.writeText(text); toast('Copiado: pegalo en Claude con tu skill de inversiones', { icon: 'sparkles' }); }
          catch { prompt('Copiá este texto y pegalo en Claude:', text); }
        }
      };
    },
  });

  onMarketChange(() => { if (!closed) ctl.refresh(); });
  (async () => {
    if (!quoteOf(market, ticker)) await quoteNow([{ market, ticker }]).catch(() => {});
    try {
      const raw = await history(market, ticker);
      const h = holdingOf(market, ticker);
      S.a = analyze(raw, { crypto, cedear: market === 'cedear', cost: h ? holdingStats(h).cost : null });
      if (!S.a.ok) S.error = S.a.notes[0];
    } catch { S.error = 'No pude traer el histórico. ¿Tenés internet?'; }
    if (!closed) ctl.refresh();
  })();
  return ctl;
}

export function ruleText(r, ccy = 'ARS') {
  const t = RULE_TYPES[r.type];
  if (r.type === 'plan') return `Comprar ${r.ticker}${r.plan?.amount ? ` por ${fmtPrice(r.plan.amount)}` : ''} ${planText(r.plan || {})}`;
  if (t.unit === 'price') return `${r.ticker}: ${t.short.toLowerCase()} ${fmtPrice(r.value, r.market === 'crypto' ? 'USD' : ccy)}`;
  return `${r.ticker}: ${t.short.toLowerCase()} ${String(r.value).replace('.', ',')}%`;
}

/* ---------- Comprar / vender ---------- */
export function openTrade({ inv, side }) {
  const i = getInvestment(inv.id);
  const q = quoteOf(i.market, i.ticker);
  const per100 = MARKETS[i.market]?.per100;
  const fx = marketCache().dollars?.cripto?.venta || marketCache().dollars?.mep?.venta || 0;
  const accs = accounts().filter(a => a.type !== 'credit');
  const F = { units: '', price: q ? String(q.price).replace('.', ',') : '', total: '', moved: true, accountId: accs.find(a => a.type === 'bank')?.id || accs[0]?.id, date: today() };
  const buy = side === 'buy';

  const ctl = openSheet({
    render(el) {
      el.innerHTML = `${sheetHead(`${buy ? 'Comprar' : 'Vender'} ${esc(i.ticker)}`)}
        <div class="row">
          <div class="field" style="flex:1"><label for="tu">Cantidad${per100 ? ' (VN)' : ''}</label><input class="input" id="tu" inputmode="decimal" autocomplete="off" placeholder="0" value="${F.units}"></div>
          <div class="field" style="flex:1"><label for="tp">Precio${q?.ccy === 'USD' ? ' (USD)' : ''}${per100 ? ' c/100' : ''}</label><input class="input" id="tp" inputmode="decimal" autocomplete="off" value="${F.price}"></div>
        </div>
        <div class="field"><label for="tt">Total en pesos${buy ? ' (con comisiones)' : ' (lo que te quedó)'}</label><input class="input input-big" id="tt" inputmode="numeric" autocomplete="off" placeholder="$ 0" value="${F.total}">
          <p class="help">${!buy ? `Tenés ${fmtUnits(i.units)}.` : 'Se calcula solo con cantidad × precio; corregilo si pagaste comisiones.'}</p></div>
        <button class="switch-row" data-moved><span class="info"><b>${buy ? 'La plata sale de una cuenta' : 'La plata entra en una cuenta'}</b><small>Apagalo si fue con plata que no está en la app (por ejemplo, dólares en el broker).</small></span><span class="switch ${F.moved ? 'on' : ''}"></span></button>
        ${F.moved ? `<div class="field" style="margin-top:12px"><label>${buy ? 'Desde' : 'Hacia'}</label>${accChips(accs, F.accountId)}</div>` : ''}
        <div class="field" style="margin-top:12px"><label>Fecha</label><label class="date-pill" style="height:44px">${icon('calendar')}<span id="tdl">${shortDate(F.date)}</span><input type="date" id="td" value="${F.date}"></label></div>
        <button class="btn primary" data-save>${buy ? 'Registrar compra' : 'Registrar venta'}</button>`;
      ensureVisible(el.querySelector('#g-acc'));
      const total = el.querySelector('#tt');
      const recalc = () => {
        const u = parseUnits(F.units), p = parseUnits(F.price);
        if (!u || !p) return;
        let t = u * p / (per100 ? 100 : 1);
        if (q?.ccy === 'USD') t *= fx;
        F.total = fmtNum(t);
        total.value = F.total;
      };
      el.querySelector('#tu').oninput = e => { e.target.value = e.target.value.replace(/[^\d.,]/g, ''); F.units = e.target.value; recalc(); };
      el.querySelector('#tp').oninput = e => { e.target.value = e.target.value.replace(/[^\d.,]/g, ''); F.price = e.target.value; recalc(); };
      amountInput(total, v => { F.total = v; });
      const td = el.querySelector('#td');
      td.onchange = () => { F.date = td.value || today(); el.querySelector('#tdl').textContent = shortDate(F.date); };
      td.onclick = () => { try { td.showPicker?.(); } catch { /* selector nativo */ } };
      el.onclick = async e => {
        const b = e.target.closest('button');
        if (!b) return;
        const d = b.dataset;
        if ('close' in d) return ctl.close();
        if ('moved' in d) { F.moved = !F.moved; return ctl.refresh(); }
        if (d.acc) { F.accountId = d.acc; return mark(el.querySelector('#g-acc'), b); }
        if ('save' in d) {
          const u = parseUnits(F.units), t = parseAmount(F.total);
          if (!u || !t) { toast('Completá cantidad y total', { icon: 'info' }); return; }
          if (!buy && u > i.units + 1e-9) { toast(`Tenés ${fmtUnits(i.units)}: no podés vender más`, { icon: 'info' }); return; }
          const units = buy ? i.units + u : Math.max(0, i.units - u);
          if (F.moved) {
            await upsert('transactions', {
              type: buy ? 'out' : 'in', amount: t, date: F.date, note: `${buy ? 'Compra' : 'Venta'} ${fmtUnits(u)} ${i.ticker}`, accountId: F.accountId,
              link: { kind: 'investment', id: i.id, role: buy ? 'contribution' : 'withdrawal', units: u },
            });
          }
          const patch = { id: i.id, units };
          if (!F.moved) patch.initialInvested = (i.initialInvested || 0) + (buy ? t : -t);
          // El valor se recalcula con el precio actual para que no se cuente dos veces el aporte.
          const v = positionValue({ ...i, units }, q, marketCache().dollars);
          if (v != null) patch.valuations = [...(i.valuations || []).filter(x => !(x.date === today() && x.auto)), { date: today(), at: new Date(Date.now() + 1000).toISOString(), value: Math.round(v), auto: true }];
          await upsert('investments', patch);
          ctl.close();
          toast(buy ? 'Compra registrada' : 'Venta registrada');
          if (!buy && units === 0 && confirm(`Vendiste todo ${i.ticker}. ¿Marcarla como finalizada?`)) await upsert('investments', { id: i.id, closedAt: F.date });
        }
      };
    },
  });
}

