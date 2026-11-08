// Inflación mensual (IPC del INDEC) para mostrar montos en "pesos de hoy".
// Fuente: API pública de ArgentinaDatos (solo se descargan los índices; no se envía ningún dato tuyo).
import { state, saveInflation } from '../store.js';
import { addMonths, curYm } from '../dates.js';

const API = 'https://api.argentinadatos.com/v1/finanzas/indices/inflacion';
const MAX_AGE = 3 * 86400000; // se actualiza cada 3 días como máximo

export async function refreshInflation({ force = false } = {}) {
  if (!navigator.onLine) return false;
  const age = Date.now() - Date.parse(state.inflation.fetchedAt || 0);
  if (!force && age < MAX_AGE) return false;
  try {
    const res = await fetch(API, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return false;
    const values = { ...state.inflation.values };
    const manual = { ...state.inflation.manual };
    for (const { fecha, valor } of await res.json()) {
      if (typeof valor !== 'number' || !/^\d{4}-\d{2}/.test(fecha)) continue;
      const ym = fecha.slice(0, 7);
      if (ym < '2000-01') continue;
      values[ym] = valor; // el dato oficial reemplaza al cargado a mano
      delete manual[ym];
    }
    await saveInflation({ values, manual, fetchedAt: new Date().toISOString() });
    return true;
  } catch {
    return false;
  }
}

/** Último mes con dato oficial o manual. */
export function lastKnownYm() {
  return Object.keys(state.inflation.values).sort().pop() || null;
}

/** Tasa del mes. Si falta (el INDEC publica a mitad del mes siguiente), se estima con la última conocida. */
export function rateFor(ym) {
  const v = state.inflation.values;
  if (v[ym] != null) return { rate: v[ym], estimated: false };
  const prev = Object.keys(v).filter(k => k < ym).sort().pop();
  return { rate: prev ? v[prev] : 0, estimated: true };
}

export const hasInflationData = () => Object.keys(state.inflation.values).length > 0;

/** Factor para pasar pesos del mes `ym` a pesos del mes `ref` (por defecto, el actual). */
export function factorTo(ym, ref = curYm()) {
  let f = 1;
  for (let m = addMonths(ym, 1); m <= ref; m = addMonths(m, 1)) f *= 1 + rateFor(m).rate / 100;
  return f;
}

/** Inflación acumulada entre dos meses (incluidos) y si hay meses estimados. */
export function periodInflation(fromYm, toYm) {
  let f = 1, estimated = false;
  for (let m = fromYm; m <= toYm; m = addMonths(m, 1)) {
    const r = rateFor(m);
    f *= 1 + r.rate / 100;
    estimated ||= r.estimated;
  }
  return { pct: f - 1, estimated };
}
