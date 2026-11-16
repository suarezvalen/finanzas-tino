// Alertas de dólar y riesgo país: comparan el valor de ahora con el cierre anterior.
// Lógica pura (la usa el robot; también sirve en la app). Fuentes gratis: dolarapi y argentinadatos.

const AD = 'https://api.argentinadatos.com/v1';
const getJSON = async url => {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
};

/** Último valor anterior a `date` (YYYY-MM-DD) en una serie [{fecha, ...}] ordenada. */
const before = (rows, date) => { for (let i = rows.length - 1; i >= 0; i--) if (rows[i].fecha < date) return rows[i]; return null; };

/**
 * { mep: { now, prev, pct }, ccl: {...}, riesgo: { now, prev, pct, fecha } }
 * @param {object} dollars de fetchDollars() (dolarapi, valor en vivo)
 * @param {string} date hoy en Argentina
 */
export async function fetchMacro(dollars, date) {
  const out = {};
  const [mep, ccl, rp, rpNow] = await Promise.all([
    getJSON(`${AD}/cotizaciones/dolares/bolsa`).catch(() => null),
    getJSON(`${AD}/cotizaciones/dolares/contadoconliqui`).catch(() => null),
    getJSON(`${AD}/finanzas/indices/riesgo-pais`).catch(() => null),
    getJSON(`${AD}/finanzas/indices/riesgo-pais/ultimo`).catch(() => null),
  ]);
  for (const [k, hist] of [['mep', mep], ['ccl', ccl]]) {
    const now = dollars?.[k]?.venta;
    const prev = hist && before(hist, date)?.venta;
    if (now && prev) out[k] = { now, prev, pct: (now / prev - 1) * 100 };
  }
  if (rp?.length) {
    const last = rpNow?.valor ? rpNow : rp.at(-1);
    const prev = before(rp, last.fecha);
    if (last?.valor && prev?.valor) out.riesgo = { now: last.valor, prev: prev.valor, pct: (last.valor / prev.valor - 1) * 100, fecha: last.fecha };
  }
  return out;
}

const LABEL = { mep: 'dólar MEP', ccl: 'dólar CCL', riesgo: 'riesgo país' };
// Escalones: se avisa una vez al pasar cada uno (en cada dirección) por día.
const STEPS = { mep: [2, 4, 7], ccl: [2, 4, 7], riesgo: [5, 10, 15] };
const pctTxt = v => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1).replace('.', ',')}%`;
const money = v => `$ ${Math.round(v).toLocaleString('es-AR')}`;

/** Avisos nuevos de dólar y riesgo país: [{ key, title, body, type: 'macro' }] */
export function macroEvents(macro, { date, logged = new Set() }) {
  const out = [];
  for (const k of ['mep', 'ccl', 'riesgo']) {
    const x = macro[k];
    if (!x) continue;
    const dir = x.pct >= 0 ? 'up' : 'down';
    const hit = STEPS[k].filter(s => Math.abs(x.pct) >= s).at(-1);
    if (!hit) continue;
    const day = x.fecha || date; // el riesgo país se publica con atraso: se usa su propia fecha
    const key = `macro|${k}|${day}|${dir}|${hit}`;
    if (logged.has(key)) continue;
    const isRp = k === 'riesgo';
    const value = isRp ? `${Math.round(x.now)} puntos` : money(x.now);
    const prev = isRp ? `${Math.round(x.prev)}` : money(x.prev);
    const why = isRp
      ? (dir === 'up' ? 'Sube la desconfianza en la deuda argentina: suele pesar sobre bonos y acciones locales.' : 'Baja la desconfianza en la deuda argentina: suele ayudar a bonos y acciones locales.')
      : (dir === 'up' ? 'Los CEDEARs en pesos suelen subir con el dólar; las acciones locales medidas en dólares, bajar.' : 'Los CEDEARs en pesos suelen bajar con el dólar; buen momento para revisar si conviene comprar dólares o CEDEARs.');
    out.push({
      key, type: 'macro', indicator: k,
      title: `${isRp ? 'Riesgo país' : LABEL[k][0].toUpperCase() + LABEL[k].slice(1)} ${dir === 'up' ? 'sube' : 'baja'} ${pctTxt(x.pct)}${day === date ? ' hoy' : ''}`,
      body: `Está en ${value} (cierre anterior: ${prev}). ${why}`,
    });
  }
  return out;
}
