// Copiado de skills/analista-inversiones/scripts/lib/ta.mjs (la skill de análisis de Tino).
// Si se mejora allá, volver a copiar acá.
// Indicadores técnicos y estadísticas de riesgo sobre series OHLCV.
// Convenciones clásicas: RSI y ATR con suavizado de Wilder; MACD 12/26/9; Bollinger 20/2.

export const last = (a) => a[a.length - 1];

export function sma(a, n) {
  const out = Array(a.length).fill(null); let s = 0;
  for (let i = 0; i < a.length; i++) {
    s += a[i];
    if (i >= n) s -= a[i - n];
    if (i >= n - 1) out[i] = s / n;
  }
  return out;
}

export function ema(a, n) {
  const out = Array(a.length).fill(null);
  if (a.length < n) return out;
  const k = 2 / (n + 1);
  let prev = a.slice(0, n).reduce((x, y) => x + y, 0) / n;
  out[n - 1] = prev;
  for (let i = n; i < a.length; i++) { prev = a[i] * k + prev * (1 - k); out[i] = prev; }
  return out;
}

export function rsi(c, n = 14) {
  const out = Array(c.length).fill(null);
  if (c.length <= n) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; }
  g /= n; l /= n;
  out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = n + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    g = (g * (n - 1) + Math.max(d, 0)) / n;
    l = (l * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}

export function macd(c, f = 12, s = 26, sig = 9) {
  const ef = ema(c, f), es = ema(c, s);
  const line = c.map((_, i) => (ef[i] !== null && es[i] !== null ? ef[i] - es[i] : null));
  const start = line.findIndex((x) => x !== null);
  const sigArr = Array(c.length).fill(null);
  if (start >= 0) {
    const e = ema(line.slice(start), sig);
    e.forEach((v, i) => { sigArr[start + i] = v; });
  }
  const hist = line.map((v, i) => (v !== null && sigArr[i] !== null ? v - sigArr[i] : null));
  return { line, signal: sigArr, hist };
}

export function bollinger(c, n = 20, k = 2) {
  const m = sma(c, n);
  return c.map((_, i) => {
    if (m[i] === null) return null;
    const w = c.slice(i - n + 1, i + 1);
    const sd = Math.sqrt(w.reduce((s, x) => s + (x - m[i]) ** 2, 0) / n);
    return { mid: m[i], up: m[i] + k * sd, low: m[i] - k * sd };
  });
}

export function atr(b, n = 14) {
  const tr = b.map((x, i) => (i === 0 ? x.h - x.l : Math.max(x.h - x.l, Math.abs(x.h - b[i - 1].c), Math.abs(x.l - b[i - 1].c))));
  const out = Array(b.length).fill(null);
  if (b.length <= n) return out;
  let a = tr.slice(1, n + 1).reduce((s, x) => s + x, 0) / n;
  out[n] = a;
  for (let i = n + 1; i < b.length; i++) { a = (a * (n - 1) + tr[i]) / n; out[i] = a; }
  return out;
}

export function logReturns(c) {
  const r = [];
  for (let i = 1; i < c.length; i++) if (c[i - 1] > 0 && c[i] > 0) r.push(Math.log(c[i] / c[i - 1]));
  return r;
}

export function stdev(a) {
  if (a.length < 2) return null;
  const m = a.reduce((s, x) => s + x, 0) / a.length;
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}

export function annualVol(c, periodsPerYear) {
  const sd = stdev(logReturns(c));
  return sd === null ? null : sd * Math.sqrt(periodsPerYear);
}

export function maxDrawdown(bars) {
  let peak = -Infinity, peakDate = null, mdd = 0, from = null, to = null;
  for (const b of bars) {
    if (b.c > peak) { peak = b.c; peakDate = b.date; }
    const dd = b.c / peak - 1;
    if (dd < mdd) { mdd = dd; from = peakDate; to = b.date; }
  }
  return { max_drawdown: mdd, desde: from, hasta: to };
}

// Pivotes fractales: máximo/mínimo local con k velas a cada lado.
export function swings(b, k = 3) {
  const highs = [], lows = [];
  for (let i = k; i < b.length - k; i++) {
    const w = b.slice(i - k, i + k + 1);
    if (b[i].h === Math.max(...w.map((x) => x.h))) highs.push({ i, date: b[i].date, p: b[i].h });
    if (b[i].l === Math.min(...w.map((x) => x.l))) lows.push({ i, date: b[i].date, p: b[i].l });
  }
  return { highs, lows };
}

// Agrupa pivotes cercanos (tolerancia en precio) y cuenta toques: niveles más tocados = más relevantes.
export function levels(b, tol, lookback = 250) {
  const sub = b.slice(-lookback);
  const { highs, lows } = swings(sub, 3);
  const pts = [...highs, ...lows].map((x) => x.p).sort((a, c) => a - c);
  const clusters = [];
  for (const p of pts) {
    const cl = clusters[clusters.length - 1];
    // El ancho total de una zona se limita a 2×tol para que el encadenamiento no forme "niveles" gigantes.
    if (cl && p - cl.max <= tol && p - cl.min <= 2 * tol) { cl.pts.push(p); cl.max = p; }
    else clusters.push({ pts: [p], max: p, min: p });
  }
  return clusters.map((c) => ({ nivel: c.pts.reduce((s, x) => s + x, 0) / c.pts.length, toques: c.pts.length }));
}

export function fibonacci(b, lookback = 250) {
  const sub = b.slice(-lookback);
  let hi = sub[0], lo = sub[0];
  for (const x of sub) { if (x.h > hi.h) hi = x; if (x.l < lo.l) lo = x; }
  const up = hi.date > lo.date; // el máximo es posterior al mínimo: tramo alcista, retrocesos hacia abajo
  const range = hi.h - lo.l;
  const lv = [0.236, 0.382, 0.5, 0.618, 0.786];
  return {
    tramo: up ? `alcista (mínimo ${lo.date} → máximo ${hi.date})` : `bajista (máximo ${hi.date} → mínimo ${lo.date})`,
    maximo: hi.h, minimo: lo.l,
    niveles: Object.fromEntries(lv.map((f) => [String(f), up ? hi.h - range * f : lo.l + range * f])),
    lectura: up ? 'Niveles = posibles soportes en un retroceso' : 'Niveles = posibles resistencias en un rebote',
  };
}

// Divergencias RSI en los últimos `win` períodos usando los dos últimos pivotes.
export function divergences(b, r, win = 60) {
  const start = b.length - win;
  const { highs, lows } = swings(b, 3);
  const L = lows.filter((x) => x.i >= start).slice(-2);
  const H = highs.filter((x) => x.i >= start).slice(-2);
  const out = [];
  if (L.length === 2 && r[L[0].i] !== null && r[L[1].i] !== null && L[1].p < L[0].p && r[L[1].i] > r[L[0].i])
    out.push(`Divergencia ALCISTA: mínimo más bajo en precio (${L[0].date}→${L[1].date}) con RSI más alto`);
  if (H.length === 2 && r[H[0].i] !== null && r[H[1].i] !== null && H[1].p > H[0].p && r[H[1].i] < r[H[0].i])
    out.push(`Divergencia BAJISTA: máximo más alto en precio (${H[0].date}→${H[1].date}) con RSI más bajo`);
  return out;
}

export function anchoredVWAP(b, fromIdx) {
  let pv = 0, v = 0;
  for (let i = fromIdx; i < b.length; i++) {
    if (!b[i].v) continue;
    pv += ((b[i].h + b[i].l + b[i].c) / 3) * b[i].v; v += b[i].v;
  }
  return v ? pv / v : null;
}

export function pearson(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 10) return null;
  const mx = x.slice(0, n).reduce((s, a) => s + a, 0) / n, my = y.slice(0, n).reduce((s, a) => s + a, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (x[i] - mx) * (y[i] - my); dx += (x[i] - mx) ** 2; dy += (y[i] - my) ** 2; }
  return dx && dy ? num / Math.sqrt(dx * dy) : null;
}
