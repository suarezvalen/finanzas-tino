// Análisis técnico de un activo a partir de su histórico diario, explicado en palabras simples.
// Es información calculada sobre datos reales: no es una recomendación de compra o venta.
import * as T from './ta.js';

const pctOf = (a, b) => (a != null && b ? a / b - 1 : null);
const fmt = (p, d = 1) => (p == null ? '—' : `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p * 100).toFixed(d).replace('.', ',')}%`);

/**
 * Los CEDEAR cambian de ratio cada tanto: el precio en pesos salta de golpe (ej. −60% en un día) sin que el activo
 * haya caído. Se ajusta el histórico anterior al salto para que los porcentajes y promedios sean reales.
 */
export function adjustRatioChanges(bars, threshold = 0.35) {
  const out = bars.map(b => ({ ...b }));
  const changes = [];
  let f = 1;
  for (let i = out.length - 1; i > 0; i--) {
    const r = bars[i].c / bars[i - 1].c;
    if (Math.abs(r - 1) > threshold) { f *= r; changes.push(bars[i].date); }
    if (f !== 1) for (const k of ['o', 'h', 'l', 'c']) out[i - 1][k] = bars[i - 1][k] * f;
  }
  return { bars: out, changes: changes.reverse() };
}

/**
 * @param {{date:string,o:number,h:number,l:number,c:number,v:number}[]} bars ascendente
 * @param {{ crypto?: boolean, cedear?: boolean, cost?: number }} [opts] cost = precio promedio de compra (si lo tenés)
 */
export function analyze(rawBars, { crypto = false, cedear = false, cost = null } = {}) {
  const adj = cedear ? adjustRatioChanges(rawBars) : { bars: rawBars, changes: [] };
  const bars = adj.bars;
  const n = bars.length;
  if (n < 30) return { ok: false, notes: ['Hay menos de 30 días de historia: no alcanza para calcular indicadores confiables.'] };
  const c = bars.map(b => b.c);
  const p = T.last(c);
  const ppy = crypto ? 365 : 252;
  const back = k => (n > k ? c[n - 1 - k] : null);
  const year = bars.slice(-ppy);

  const sma50 = T.last(T.sma(c, 50)), sma200 = T.last(T.sma(c, 200)), sma20 = T.last(T.sma(c, 20));
  const sma50arr = T.sma(c, 50);
  const slope50 = sma50arr[n - 1] != null && sma50arr[n - 21] ? sma50arr[n - 1] / sma50arr[n - 21] - 1 : null;
  const rsi = T.last(T.rsi(c, 14));
  const atr = T.last(T.atr(bars, 14));
  const vol = T.annualVol(c.slice(-ppy), ppy);
  const dd = T.maxDrawdown(year);
  const hi52 = Math.max(...year.map(b => b.h)), lo52 = Math.min(...year.map(b => b.l));
  const ret = {
    w1: pctOf(p, back(crypto ? 7 : 5)), m1: pctOf(p, back(crypto ? 30 : 21)), m3: pctOf(p, back(crypto ? 90 : 63)),
    y1: pctOf(p, back(ppy)), ytd: pctOf(p, bars.find(b => b.date >= `${bars[n - 1].date.slice(0, 4)}-01-01`)?.o),
  };

  // Saltos raros de un día (posible split o ajuste del CEDEAR no reflejado en el histórico).
  const jumps = [];
  for (let i = Math.max(1, n - ppy); i < n; i++) { const r = c[i] / c[i - 1] - 1; if (Math.abs(r) > (crypto ? 0.45 : 0.35)) jumps.push(bars[i].date); }

  let trend = 'lateral';
  if (sma200 != null && sma50 != null) {
    if (sma50 > sma200 && p > sma50 && slope50 > 0) trend = 'alcista';
    else if (sma50 > sma200 && p > sma200) trend = 'alcista en corrección';
    else if (sma50 > sma200) trend = 'perdiendo fuerza';
    else if (p < sma50 && slope50 < 0) trend = 'bajista';
    else if (p >= sma200) trend = 'recuperándose';
    else trend = 'bajista con rebote';
  } else if (sma50 != null) trend = p > sma50 && slope50 > 0 ? 'alcista (corto plazo)' : p < sma50 && slope50 < 0 ? 'bajista (corto plazo)' : 'lateral';

  const TREND_TEXT = {
    'alcista': 'Tendencia alcista: el precio está por encima de sus promedios de 50 y 200 días, y el de 50 viene subiendo.',
    'alcista en corrección': 'Tendencia de fondo alcista, pero ahora está corrigiendo (bajó del promedio de 50 días).',
    'perdiendo fuerza': 'Ojo: perdió el promedio de 200 días aunque la tendencia de fondo era alcista. Puede estar cambiando.',
    'bajista': 'Tendencia bajista: el precio está por debajo de sus promedios y el de 50 días viene cayendo.',
    'recuperándose': 'Se está recuperando: volvió a superar el promedio de 200 días.',
    'bajista con rebote': 'Tendencia de fondo bajista, con un rebote de corto plazo.',
    'lateral': 'Sin una tendencia clara: se mueve de costado.',
  };

  const notes = [TREND_TEXT[trend] || `Tendencia ${trend}.`];
  if (rsi != null) {
    if (rsi >= 70) notes.push(`RSI ${Math.round(rsi)}: subió mucho y rápido (zona de "sobrecompra"). Suele haber pausas o correcciones.`);
    else if (rsi <= 30) notes.push(`RSI ${Math.round(rsi)}: cayó mucho y rápido (zona de "sobreventa"). A veces anticipa un rebote, pero no siempre.`);
    else notes.push(`RSI ${Math.round(rsi)}: en zona neutral.`);
  }
  const fromHi = pctOf(p, hi52), fromLo = pctOf(p, lo52);
  if (fromHi != null) {
    if (fromHi > -0.03) notes.push(`Está cerca de su máximo del último año (${fmt(fromHi)}).`);
    else notes.push(`Está ${fmt(fromHi)} por debajo de su máximo del último año y ${fmt(fromLo)} sobre el mínimo.`);
  }
  if (atr && p) notes.push(`En un día normal se mueve alrededor de ${fmt(atr / p).replace('+', '')} (volatilidad anual ${vol != null ? fmt(vol, 0).replace('+', '') : '—'}).`);
  if (dd?.max_drawdown < -0.2) notes.push(`En el último año llegó a caer ${fmt(dd.max_drawdown, 0)} desde un máximo: es un activo con bajones fuertes.`);
  if (cost) {
    const g = pctOf(p, cost);
    notes.push(`Tu precio promedio es ${Math.round(cost).toLocaleString('es-AR')}: vas ${fmt(g)} ${g >= 0 ? 'arriba' : 'abajo'}.`);
  }
  if (adj.changes.length) notes.push(`El CEDEAR cambió de ratio (${adj.changes.slice(-2).join(', ')}): ajusté el histórico para que las variaciones sean reales.`);
  else if (jumps.length) notes.push(`Atención: hubo saltos raros de un día (${jumps.slice(-2).join(', ')}). Si fue un split o cambio de ratio, los porcentajes anteriores a esa fecha pueden no ser confiables.`);
  if (!crypto) notes.push('Los precios de BYMA están en pesos: las variaciones incluyen el efecto del dólar y la inflación, no solo la empresa.');

  return {
    ok: true, price: p, date: bars[n - 1].date, trend, rsi, sma20, sma50, sma200, atr, vol,
    maxDrawdown: dd?.max_drawdown ?? null, hi52, lo52, fromHi, fromLo, ret, notes, jumps, ratioChanges: adj.changes, bars,
  };
}

export { fmt as fmtPct };
export const fmtPctAbs = p => fmt(p, 0).replace(/^[+−]/, '');
