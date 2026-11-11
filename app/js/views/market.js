// Pestaña Mercado: tu cartera con precios en vivo, seguimiento, dólar, riesgo país y alertas.
import { watchlist, alertRules, upsert } from '../store.js';
import { icon } from '../icons.js';
import { money, esc, signed } from '../ui.js';
import { catIc, empty, sparkline } from '../components.js';
import { MARKETS, marketCache, quoteOf, linkedHoldings, holdingStats, refreshMarket, unseenAlerts, bymaStatus } from '../logic/market.js';
import { activeInvestments, investStats, investSeries } from '../logic/wealth.js';
import { fmtPrice } from '../logic/alerts-core.js';
import { INVEST_KINDS } from '../constants.js';
import { marketIc, openPickAsset } from '../sheets/pick-asset.js';
import { openAsset, ruleText } from '../sheets/asset.js';
import { openInvestments, openInvestment, openInvestmentEdit } from '../sheets/investments.js';
import { openAlerts, openAlertLog } from '../sheets/alerts.js';
import { pushEnabled, pushSupported } from '../logic/push.js';

const pctSpan = p => (p == null ? '' : `<span class="${p >= 0 ? 'pos' : 'neg'}">${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(2).replace('.', ',')}%</span>`);
const fmtUnits = n => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 6 }).format(n);
let firstLoad = true;

function timeAgo(ms) {
  if (!ms) return 'sin datos';
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 1 ? 'recién' : m < 60 ? `hace ${m} min` : new Date(ms).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

export function renderMarket(el) {
  const cache = marketCache();
  const holdings = linkedHoldings().map(i => ({ i, ...holdingStats(i) })).sort((a, b) => (b.value || 0) - (a.value || 0));
  const others = activeInvestments().filter(i => !linkedHoldings().includes(i)).map(i => ({ i, ...investStats(i) }));
  const totalLinked = holdings.reduce((s, h) => s + (h.value || 0), 0);
  const dayChange = holdings.reduce((s, h) => s + (h.dayChange || 0), 0);
  const gain = holdings.reduce((s, h) => s + (h.gain || 0), 0);
  const othersTotal = others.reduce((s, x) => s + x.value, 0);
  const total = totalLinked + othersTotal;
  const dayPct = totalLinked - dayChange > 0 ? dayChange / (totalLinked - dayChange) : 0;
  const watch = watchlist();
  const unseen = unseenAlerts().length;
  const rules = alertRules().filter(r => r.active !== false);
  const d = cache.dollars || {};
  const st = bymaStatus();

  el.innerHTML = `
    <header class="top"><h1 class="page-title">Mercado</h1>
      <button class="icon-btn" data-refresh aria-label="Actualizar">${icon('refresh-cw')}</button>
      <button class="icon-btn" data-log aria-label="Avisos">${icon('bell')}${unseen ? `<span class="dot-count">${unseen}</span>` : ''}</button></header>

    <button class="mkt-status ${st.state}" data-hours><i></i><span><b>BYMA: ${esc(st.label)}</b><small>${esc(st.sub || '')}</small></span></button>

    <div class="fx-strip">
      ${[['MEP', d.mep], ['CCL', d.ccl], ['Blue', d.blue], ['Oficial', d.oficial], ['Cripto', d.cripto]].map(([l, x]) =>
        `<div class="fx"><small>${l}</small><b>${x?.venta ? `$ ${Math.round(x.venta).toLocaleString('es-AR')}` : '—'}</b></div>`).join('')}
      <div class="fx"><small>Riesgo país</small><b>${cache.riesgo?.valor ?? '—'}</b></div>
    </div>

    <section class="card hero">
      <div class="label">Tus inversiones</div>
      <div class="amount" style="font-size:32px;margin-top:6px">${money(total)}</div>
      ${holdings.length ? `<div class="net" style="margin-bottom:8px"><span>Hoy ${pctSpan(dayPct * 100)} <b class="${dayChange >= 0 ? 'pos' : 'neg'}">${signed(dayChange)}</b></span>${sparkline(investSeries(6))}</div>
        <div class="row">
          <div class="pill"><small>Con precio en vivo</small><b>${money(totalLinked)}</b></div>
          <div class="pill"><small>Ganancia</small><b class="${gain >= 0 ? 'pos' : 'neg'}">${signed(gain)}</b></div>
        </div>` : ''}
      <p class="help" style="margin-top:10px">Precios ${timeAgo(cache.at)}. Fuente: BYMA (data912), Binance y dolarapi.</p>
    </section>

    <div class="section-h"><h3>Mi cartera</h3><button data-newinv>Agregar</button></div>
    ${holdings.length ? `<div class="list">${holdings.map(h => `<button class="item tap" data-asset="${h.i.market}|${h.i.ticker}">
        ${catIc(marketIc(h.i.market))}
        <span class="info"><b>${esc(h.i.ticker)}</b><small>${fmtUnits(h.i.units)} · ${h.quote ? fmtPrice(h.quote.price, h.quote.ccy) : 'sin precio'} ${pctSpan(h.quote?.pct)}</small></span>
        <span class="val">${h.value != null ? money(h.value) : '—'}<small class="sub-val ${(h.gainPct || 0) >= 0 ? 'pos' : 'neg'}">${h.gainPct != null ? `${h.gainPct >= 0 ? '+' : '−'}${Math.abs(h.gainPct * 100).toFixed(1).replace('.', ',')}% total` : ''}</small></span></button>`).join('')}</div>`
      : `<button class="card card-cta" data-newinv><span class="cta-ic">${icon('chart-line')}</span><span class="info"><b>Conectá tus inversiones con el mercado</b><small>Cargá el ticker y la cantidad (ej. 100 GGAL) y te muestro cómo les va en vivo</small></span>${icon('chevron-right', 'chev')}</button>`}
    ${others.length ? `<div class="list" style="margin-top:10px">${others.map(x => `<button class="item tap" data-inv="${x.i.id}">${catIc(INVEST_KINDS[x.i.kind] || INVEST_KINDS.otro)}
        <span class="info"><b>${esc(x.i.name)}</b><small>${(INVEST_KINDS[x.i.kind] || INVEST_KINDS.otro).label}${['acciones', 'cedears', 'bonos', 'cripto'].includes(x.i.kind) ? ' · <span class="acc-c">conectar con ticker</span>' : ''}</small></span>
        <span class="val">${money(x.value)}</span></button>`).join('')}</div>` : ''}
    <button class="btn ghost" data-allinv style="margin-top:6px">${icon('trending-up')}Ver todas mis inversiones</button>

    <div class="section-h"><h3>Seguimiento</h3><button data-watchadd>Agregar</button></div>
    ${watch.length ? `<div class="list">${watch.map(w => { const q = quoteOf(w.market, w.ticker); return `<button class="item tap" data-asset="${w.market}|${w.ticker}">
        ${catIc(marketIc(w.market))}<span class="info"><b>${esc(w.ticker)}</b><small>${MARKETS[w.market]?.label || ''}</small></span>
        <span class="val">${q ? fmtPrice(q.price, q.ccy) : '—'}<small class="sub-val">${pctSpan(q?.pct)}</small></span></button>`; }).join('')}</div>`
      : '<p class="help" style="margin:0 4px">Sumá acciones, CEDEARs o cripto que te interesen para ver cómo se mueven.</p>'}

    <div class="section-h"><h3>Alertas</h3><button data-alerts>Configurar</button></div>
    ${rules.length ? `<div class="list">${rules.slice(0, 4).map(r => `<button class="item tap" data-alerts>${catIc({ icon: r.type === 'plan' ? 'calendar-clock' : 'bell', color: r.type === 'plan' ? '#2EF2A0' : '#00E5FF' })}
        <span class="info"><b>${esc(ruleText(r, quoteOf(r.market, r.ticker)?.ccy))}</b><small>${r.armed === false ? 'Ya avisó' : 'Activa'}</small></span></button>`).join('')}</div>`
      : `<button class="card card-cta" data-alerts><span class="cta-ic">${icon('bell-ring')}</span><span class="info"><b>Alertas y recordatorios de compra</b><small>Te aviso si algo sube o baja de un precio, se mueve fuerte o te toca comprar</small></span>${icon('chevron-right', 'chev')}</button>`}
    ${pushSupported() === 'ok' && !pushEnabled() ? `<button class="switch-row" data-alerts style="margin-top:10px">${icon('bell-ring')}<span class="info"><b>Activá las notificaciones</b><small>Para enterarte aunque la app esté cerrada</small></span>${icon('chevron-right', 'chev')}</button>` : ''}
    <p class="foot">La información es orientativa y puede tener demora. No es una recomendación de inversión.</p>`;

  el.onclick = async e => {
    const b = e.target.closest('button');
    if (!b) return;
    const ds = b.dataset;
    if ('refresh' in ds) { b.classList.add('spin'); await refreshMarket({ force: true }).catch(() => {}); return; }
    if ('log' in ds) return openAlertLog();
    if ('hours' in ds) return openAlerts();
    if (ds.asset) { const [market, ticker] = ds.asset.split('|'); return openAsset({ market, ticker }); }
    if (ds.inv) return openInvestment(ds.inv);
    if ('allinv' in ds) return openInvestments();
    if ('alerts' in ds) return openAlerts();
    if ('newinv' in ds) return openPickAsset({ title: 'Agregar a mi cartera', onPick: a => openInvestmentEdit(null, { market: a.market, ticker: a.ticker }) });
    if ('watchadd' in ds) {
      return openPickAsset({
        title: 'Seguir un activo',
        onPick: async a => {
          if (!watchlist().some(w => w.market === a.market && w.ticker === a.ticker)) await upsert('watch', { market: a.market, ticker: a.ticker });
          refreshMarket({ force: true }).catch(() => {});
          openAsset(a);
        },
      });
    }
  };

  if (firstLoad || Date.now() - cache.at > 60000) { firstLoad = false; refreshMarket().catch(() => {}); }
}

