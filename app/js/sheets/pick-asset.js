// Buscador de activos: acciones, CEDEARs, bonos y ONs de BYMA, y cripto de Binance.
import { icon } from '../icons.js';
import { openSheet, esc } from '../ui.js';
import { sheetHead, catIc } from '../components.js';
import { MARKETS, searchAssets } from '../logic/market.js';
import { fmtPrice } from '../logic/alerts-core.js';

const SUGGESTED = [['cedear', 'SPY'], ['cedear', 'AAPL'], ['cedear', 'MELI'], ['stock', 'GGAL'], ['stock', 'YPFD'], ['stock', 'PAMP'], ['bond', 'AL30'], ['bond', 'GD30'], ['crypto', 'BTC'], ['crypto', 'ETH']];
export const marketIc = m => ({ icon: MARKETS[m]?.icon || 'shapes', color: { stock: '#7CFFCB', cedear: '#5CC8FF', bond: '#94A3FF', on: '#94A3FF', crypto: '#C084FC' }[m] || '#8A9AA8' });

export const assetRow = (x, attr = 'pick') => `<button class="item tap" data-${attr}="${x.market}|${x.ticker}">
  ${catIc(marketIc(x.market))}
  <span class="info"><b>${esc(x.ticker)}</b><small>${MARKETS[x.market]?.label || ''}</small></span>
  ${x.price != null ? `<span class="val">${fmtPrice(x.price, x.ccy)}${x.pct != null ? `<small class="sub-val ${x.pct >= 0 ? 'pos' : 'neg'}">${x.pct >= 0 ? '+' : '−'}${Math.abs(x.pct).toFixed(2).replace('.', ',')}%</small>` : ''}</span>` : ''}</button>`;

/** Abre el buscador; `onPick({ market, ticker, price, ccy })` recibe lo elegido. */
export function openPickAsset({ title = 'Buscar activo', onPick, markets } = {}) {
  let q = '', results = [], loading = false, seq = 0;
  openSheet({
    full: true,
    render(el, ctl) {
      el.innerHTML = `${sheetHead(esc(title))}
        <label class="search">${icon('search')}<input id="aq" type="search" placeholder="Ticker: GGAL, AAPL, AL30, BTC…" autocomplete="off" autocapitalize="characters" enterkeyhint="search" value="${esc(q)}"></label>
        <div id="ares"></div>
        <p class="help" style="margin:12px 4px 0">Acciones, CEDEARs, bonos y ONs de BYMA (en pesos) y cripto de Binance (en dólares). Los precios pueden tener demora.</p>`;
      const input = el.querySelector('#aq');
      const list = el.querySelector('#ares');
      const draw = () => {
        const filtered = markets ? results.filter(x => markets.includes(x.market)) : results;
        list.innerHTML = loading ? '<p class="help" style="margin:10px 4px">Buscando…</p>'
          : q ? (filtered.length ? `<div class="list">${filtered.map(x => assetRow(x)).join('')}</div>` : '<p class="help" style="margin:10px 4px">No encontré ese ticker.</p>')
          : `<div class="section-h"><h3>Populares</h3></div><div class="list">${SUGGESTED.filter(([m]) => !markets || markets.includes(m)).map(([market, ticker]) => assetRow({ market, ticker })).join('')}</div>`;
      };
      draw();
      setTimeout(() => input.focus(), 380);
      let timer;
      input.oninput = () => {
        q = input.value.trim();
        clearTimeout(timer);
        if (!q) { results = []; loading = false; return draw(); }
        loading = true; draw();
        const my = ++seq;
        timer = setTimeout(async () => {
          try { const r = await searchAssets(q); if (my === seq) results = r; } catch { if (my === seq) results = []; }
          if (my === seq) { loading = false; draw(); }
        }, 350);
      };
      el.onclick = e => {
        const b = e.target.closest('button');
        if (!b) return;
        if ('close' in b.dataset) return ctl.close();
        if (b.dataset.pick) {
          const [market, ticker] = b.dataset.pick.split('|');
          const hit = results.find(x => x.market === market && x.ticker === ticker) || { market, ticker };
          ctl.close();
          onPick?.(hit);
        }
      };
    },
  });
}
