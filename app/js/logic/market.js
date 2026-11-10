// Mercado en la app: guarda precios (también para verlos sin internet), actualiza el valor de tus
// inversiones conectadas a un ticker y corre las alertas.
import { state, investments, watchlist, alertRules, upsertMany } from '../store.js';
import { today } from '../dates.js';
import * as MC from './market-core.js';
import { evaluate } from './alerts-core.js';
import { invested } from './wealth.js';

export const MARKETS = MC.MARKETS;
export const MARKET_TO_KIND = MC.MARKET_TO_KIND;
const LS = 'ft-market';
const cache = { quotes: {}, dollars: null, riesgo: null, at: 0 };
try { Object.assign(cache, JSON.parse(localStorage.getItem(LS)) || {}); } catch { /* sin datos guardados */ }
const save = () => { try { localStorage.setItem(LS, JSON.stringify(cache)); } catch { /* lleno */ } };

const listeners = new Set();
export const onMarketChange = fn => listeners.add(fn);
const notify = () => listeners.forEach(fn => { try { fn(); } catch { /* sigue */ } });

export const marketCache = () => cache;
export const keyOf = (market, ticker) => `${market}:${String(ticker).toUpperCase()}`;
export const quoteOf = (market, ticker) => cache.quotes[keyOf(market, ticker)];

/* ---------- Posiciones (inversiones conectadas a un ticker) ---------- */
export const isLinked = i => !!(i.ticker && i.market && i.units > 0 && !i.closedAt && !i.deleted);
export const linkedHoldings = () => investments().filter(isLinked);

/** Estado de una posición: precio, valor, cuánto cambió hoy, costo promedio y ganancia. */
export function holdingStats(i) {
  const quote = quoteOf(i.market, i.ticker);
  const value = MC.positionValue(i, quote, cache.dollars);
  const inv = invested(i);
  const per100 = MC.MARKETS[i.market]?.per100 ? 100 : 1;
  // Costo promedio en la moneda en que cotiza (para comparar con el precio).
  let cost = i.units > 0 ? (inv / i.units) * per100 : null;
  if (quote?.ccy === 'USD' && cost) cost /= cache.dollars?.cripto?.venta || cache.dollars?.mep?.venta || 1;
  const dayChange = value != null && quote?.pct != null ? value - value / (1 + quote.pct / 100) : null;
  return { quote, value, invested: inv, cost, dayChange, gain: value != null ? value - inv : null, gainPct: value != null && inv > 0 ? value / inv - 1 : null };
}

/** Todo lo que hay que cotizar: posiciones, seguimiento y alertas. */
function trackedAssets() {
  const seen = new Map();
  const add = (market, ticker) => { if (market && ticker) seen.set(keyOf(market, ticker), { market, ticker: String(ticker).toUpperCase() }); };
  linkedHoldings().forEach(i => add(i.market, i.ticker));
  watchlist().forEach(w => add(w.market, w.ticker));
  alertRules().forEach(r => add(r.market, r.ticker));
  return [...seen.values()];
}

/* ---------- Actualizar ---------- */
let running = null;
export function refreshMarket({ force = false } = {}) {
  if (!force && Date.now() - cache.at < 60000) return Promise.resolve(cache);
  if (!navigator.onLine) return Promise.resolve(cache);
  running ||= (async () => {
    try {
      const [quotes, dollars, riesgo] = await Promise.all([
        MC.fetchQuotes(trackedAssets()),
        MC.fetchDollars().catch(() => cache.dollars),
        MC.fetchRiesgoPais().catch(() => cache.riesgo),
      ]);
      Object.assign(cache.quotes, quotes);
      cache.dollars = dollars || cache.dollars;
      cache.riesgo = riesgo || cache.riesgo;
      cache.at = Date.now();
      save();
      await updateValuations();
      await runAlerts();
    } finally {
      running = null;
      notify();
    }
    return cache;
  })();
  return running;
}

/** Cotiza activos sueltos (por ejemplo, al buscarlos) sin tocar lo demás. */
export async function quoteNow(assets) {
  const q = await MC.fetchQuotes(assets);
  Object.assign(cache.quotes, q);
  save();
  return q;
}

/** Guarda el valor del día de cada posición (máximo cada 30 minutos o si cambió más de 0,2%). */
async function updateValuations() {
  const t = today(), now = new Date().toISOString();
  const changes = [];
  for (const i of linkedHoldings()) {
    const v = MC.positionValue(i, quoteOf(i.market, i.ticker), cache.dollars);
    if (v == null) continue;
    const vals = [...(i.valuations || [])];
    const idx = vals.findIndex(x => x.date === t && x.auto);
    const prev = idx >= 0 ? vals[idx] : null;
    if (prev && Math.abs(v / prev.value - 1) < 0.002 && Date.now() - Date.parse(prev.at) < 30 * 60000) continue;
    const entry = { date: t, at: now, value: Math.round(v), auto: true };
    if (idx >= 0) vals[idx] = entry; else vals.push(entry);
    changes.push({ id: i.id, valuations: vals });
  }
  if (changes.length) await upsertMany('investments', changes);
}

/* ---------- Alertas ---------- */
export function holdingsForAlerts() {
  return linkedHoldings().map(i => {
    const s = holdingStats(i);
    return { id: i.id, name: i.name, market: i.market, ticker: i.ticker.toUpperCase(), units: i.units, cost: s.cost, value: s.value };
  });
}

/** Evalúa las reglas con los precios actuales y guarda los avisos nuevos (devuelve cuáles). */
export async function runAlerts() {
  const logged = new Set(state.alertlog.map(a => a.id));
  const { events, ruleUpdates } = evaluate({
    rules: alertRules(), holdings: holdingsForAlerts(), quotes: cache.quotes, today: today(), logged,
    autoMove: state.settings.autoMove ?? 5,
  });
  if (ruleUpdates.length) await upsertMany('alerts', ruleUpdates);
  if (events.length) {
    await upsertMany('alertlog', events.map(e => ({ id: e.key, ...e, date: today(), seen: false, source: 'app' })));
  }
  return events;
}

export const unseenAlerts = () => state.alertlog.filter(a => !a.deleted && !a.seen);

/* ---------- Históricos y búsqueda ---------- */
const histCache = new Map();
export async function history(market, ticker) {
  const k = keyOf(market, ticker);
  const hit = histCache.get(k);
  if (hit && Date.now() - hit.at < 3600000) return hit.bars;
  const bars = await MC.fetchHistory(market, ticker);
  histCache.set(k, { bars, at: Date.now() });
  return bars;
}

const POPULAR_CRYPTO = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX', 'DOT', 'LINK', 'MATIC', 'LTC', 'TRX', 'ATOM', 'UNI', 'NEAR', 'ARB', 'OP', 'SUI', 'TON', 'PEPE', 'SHIB'];
let index = null;
/** Índice de tickers de BYMA (en pesos) y cripto populares, para buscar. */
export async function symbolIndex() {
  if (index) return index;
  const out = [];
  for (const market of ['stock', 'cedear', 'bond', 'on']) {
    try {
      const live = await MC.fetchLive(market);
      const syms = Object.keys(live);
      const set = new Set(syms);
      for (const s of syms) {
        // Las especies terminadas en D o C son la versión en dólares (MEP / cable): se ofrece la de pesos.
        if (/[DC]$/.test(s) && set.has(s.slice(0, -1))) continue;
        out.push({ market, ticker: s, price: live[s].price, pct: live[s].pct, ccy: 'ARS' });
        cache.quotes[keyOf(market, s)] = { ...live[s], ccy: 'ARS' };
      }
    } catch { /* sigue con lo que haya */ }
  }
  for (const t of POPULAR_CRYPTO) out.push({ market: 'crypto', ticker: t });
  index = out;
  return out;
}

export async function searchAssets(q) {
  const term = q.trim().toUpperCase();
  if (!term) return [];
  const idx = await symbolIndex();
  const starts = idx.filter(x => x.ticker.startsWith(term));
  const contains = idx.filter(x => !x.ticker.startsWith(term) && x.ticker.includes(term));
  let res = [...starts, ...contains].slice(0, 30);
  // Cualquier cripto de Binance aunque no esté en la lista de populares.
  if (/^[A-Z0-9]{2,10}$/.test(term) && !res.some(x => x.ticker === term)) res.push({ market: 'crypto', ticker: term, guess: true });
  const cryptos = res.filter(x => x.market === 'crypto');
  if (cryptos.length) {
    try {
      const qq = await MC.fetchCrypto(cryptos.map(x => x.ticker)).catch(async () => {
        // Si un símbolo no existe Binance rechaza toda la consulta: se prueban de a uno.
        const out = {};
        for (const c of cryptos) Object.assign(out, await MC.fetchCrypto([c.ticker]).catch(() => ({})));
        return out;
      });
      res = res.filter(x => x.market !== 'crypto' || qq[x.ticker]);
      for (const x of res) if (x.market === 'crypto') { Object.assign(x, qq[x.ticker], { ccy: 'USD' }); cache.quotes[keyOf('crypto', x.ticker)] = { ...qq[x.ticker], ccy: 'USD' }; }
    } catch { res = res.filter(x => x.market !== 'crypto'); }
  }
  return res;
}
