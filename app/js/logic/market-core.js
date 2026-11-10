// Datos de mercado desde fuentes públicas y gratuitas (sin claves):
//   data912.com  → precios de BYMA (acciones argentinas, CEDEARs, bonos, ONs) e históricos
//   Binance      → cripto (precio en USDT)
//   dolarapi.com → dólar oficial, MEP, CCL, blue y cripto
//   argentinadatos → riesgo país
// Este archivo no usa nada del navegador: lo usa la app y también el robot de notificaciones (Node).

const D912 = 'https://data912.com';

export const MARKETS = {
  stock:  { label: 'Acción argentina', short: 'Acción', live: 'arg_stocks', hist: 'stocks', icon: 'trending-up' },
  cedear: { label: 'CEDEAR', short: 'CEDEAR', live: 'arg_cedears', hist: 'cedears', icon: 'globe' },
  bond:   { label: 'Bono', short: 'Bono', live: 'arg_bonds', hist: 'bonds', icon: 'scroll-text', per100: true },
  on:     { label: 'Obligación negociable', short: 'ON', live: 'arg_corp', hist: 'bonds', icon: 'scroll-text', per100: true },
  crypto: { label: 'Cripto', short: 'Cripto', icon: 'bitcoin', usd: true },
};

/** Tipo de inversión de la app que corresponde a cada mercado. */
export const MARKET_TO_KIND = { stock: 'acciones', cedear: 'cedears', bond: 'bonos', on: 'bonos', crypto: 'cripto' };

async function getJSON(url, timeout = 15000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`${res.status} en ${new URL(url).host}`);
  return res.json();
}

/** Lista en vivo de un mercado de BYMA: { SIMBOLO: { price, pct, bid, ask, vol } } */
export async function fetchLive(market) {
  const m = MARKETS[market];
  const rows = await getJSON(`${D912}/live/${m.live}`);
  const out = {};
  for (const x of rows) {
    if (!x?.symbol || !Number.isFinite(x.c) || x.c <= 0) continue;
    out[x.symbol] = { price: x.c, pct: Number.isFinite(x.pct_change) ? x.pct_change : null, bid: x.px_bid || null, ask: x.px_ask || null, vol: x.v || 0 };
  }
  return out;
}

/** Precios de cripto en USDT: { BTC: { price, pct } } */
export async function fetchCrypto(symbols) {
  if (!symbols.length) return {};
  const pairs = symbols.map(s => `${s.toUpperCase()}USDT`);
  const rows = await getJSON(`https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(pairs))}`);
  const out = {};
  for (const r of rows) out[r.symbol.replace(/USDT$/, '')] = { price: +r.lastPrice, pct: +r.priceChangePercent };
  return out;
}

/** Cotizaciones del dólar: { mep, ccl, blue, oficial, cripto, tarjeta } con { compra, venta } */
export async function fetchDollars() {
  const rows = await getJSON('https://dolarapi.com/v1/dolares');
  const map = { bolsa: 'mep', contadoconliqui: 'ccl', blue: 'blue', oficial: 'oficial', cripto: 'cripto', tarjeta: 'tarjeta', mayorista: 'mayorista' };
  const out = {};
  for (const r of rows) if (map[r.casa]) out[map[r.casa]] = { compra: r.compra, venta: r.venta, at: r.fechaActualizacion };
  return out;
}

export async function fetchRiesgoPais() {
  const r = await getJSON('https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais/ultimo');
  return { valor: r.valor, fecha: r.fecha };
}

/**
 * Cotización de una lista de activos [{ market, ticker }].
 * Devuelve { 'market:TICKER': { price, pct, ccy } } (ccy 'ARS' o 'USD').
 */
export async function fetchQuotes(assets) {
  const out = {};
  const byMarket = {};
  for (const a of assets) (byMarket[a.market] ||= new Set()).add(a.ticker.toUpperCase());
  await Promise.all(Object.entries(byMarket).map(async ([market, set]) => {
    try {
      if (market === 'crypto') {
        const q = await fetchCrypto([...set]);
        for (const [t, v] of Object.entries(q)) out[`crypto:${t}`] = { ...v, ccy: 'USD' };
      } else {
        const live = await fetchLive(market);
        for (const t of set) if (live[t]) out[`${market}:${t}`] = { ...live[t], ccy: 'ARS' };
      }
    } catch { /* si una fuente falla, las demás siguen */ }
  }));
  return out;
}

/** Histórico diario [{ date, o, h, l, c, v }] ascendente. */
export async function fetchHistory(market, ticker) {
  const t = ticker.toUpperCase();
  if (market === 'crypto') {
    const k = await getJSON(`https://api.binance.com/api/v3/klines?symbol=${t}USDT&interval=1d&limit=1000`);
    return k.map(b => ({ date: new Date(b[0]).toISOString().slice(0, 10), o: +b[1], h: +b[2], l: +b[3], c: +b[4], v: +b[5] }));
  }
  const h = await getJSON(`${D912}/historical/${MARKETS[market].hist}/${encodeURIComponent(t)}`, 20000);
  return (Array.isArray(h) ? h : []).map(b => ({ date: b.date, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v })).filter(b => Number.isFinite(b.c) && b.c > 0);
}

/** Valor en pesos de una posición: unidades × precio (bonos cotizan cada 100 nominales; cripto en USD). */
export function positionValue({ market, units }, quote, dollars) {
  if (!quote || !units) return null;
  let v = units * quote.price;
  if (MARKETS[market]?.per100) v /= 100;
  if (quote.ccy === 'USD') {
    const fx = dollars?.cripto?.venta || dollars?.mep?.venta;
    if (!fx) return null;
    v *= fx;
  }
  return v;
}
