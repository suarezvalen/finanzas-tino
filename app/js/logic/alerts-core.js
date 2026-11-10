// Reglas de alertas y recordatorios de compra. Lógica pura (sin navegador):
// la usa la app al abrirla y el robot de notificaciones cada 30 minutos.

export const RULE_TYPES = {
  above:     { label: 'Si sube de', short: 'Sube de', unit: 'price' },
  below:     { label: 'Si baja de', short: 'Baja de', unit: 'price' },
  move:      { label: 'Si se mueve más de', short: 'Movimiento diario', unit: 'pct' },
  cost_down: { label: 'Si cae desde mi costo', short: 'Cae desde mi costo', unit: 'pct' },
  cost_up:   { label: 'Si gana desde mi costo', short: 'Gana desde mi costo', unit: 'pct' },
  plan:      { label: 'Recordatorio de compra', short: 'Plan de compra', unit: 'plan' },
};

const nf = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
export const fmtPrice = (v, ccy = 'ARS') => (ccy === 'USD' ? `USD ${nf.format(v)}` : `$ ${v >= 1000 ? nf0.format(v) : nf.format(v)}`);
const fmtPct = p => `${Math.abs(p).toFixed(1).replace('.', ',')}%`;
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** ¿Hoy toca el recordatorio de compra? */
export function planDue(plan, dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  if (plan.frequency === 'weekly') return d.getDay() === Number(plan.weekday ?? 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return d.getDate() === Math.min(Number(plan.day || 1), last);
}
export const planText = plan => (plan.frequency === 'weekly'
  ? `todos los ${WEEKDAYS[Number(plan.weekday ?? 1)]}`
  : `el día ${plan.day || 1} de cada mes`);

/**
 * Evalúa todas las reglas.
 * @param {object} o
 * @param {object[]} o.rules   reglas guardadas ({ id, type, market, ticker, value, active, armed, plan })
 * @param {object[]} o.holdings posiciones ({ name, market, ticker, units, cost, value })
 * @param {object}   o.quotes  { 'market:TICKER': { price, pct, ccy } }
 * @param {string}   o.today   'AAAA-MM-DD' (hora local de Argentina)
 * @param {Set<string>} o.logged claves de avisos ya enviados
 * @param {number}   o.autoMove alerta automática por movimiento diario de lo que tenés (%; 0 = apagada)
 * @returns {{ events: object[], ruleUpdates: object[] }}
 */
export function evaluate({ rules, holdings, quotes, today, logged, autoMove = 5 }) {
  const events = [];
  const ruleUpdates = [];
  const q = (m, t) => quotes[`${m}:${String(t).toUpperCase()}`];
  const holdingOf = (m, t) => holdings.find(h => h.market === m && h.ticker === String(t).toUpperCase());
  const push = ev => { if (!logged.has(ev.key) && !events.some(e => e.key === ev.key)) events.push(ev); };
  const sameMoveKey = qt => `${qt.price}|${qt.pct}`; // sin rueda nueva, el mismo dato no vuelve a avisar

  for (const r of rules) {
    if (r.deleted || r.active === false) continue;
    const ticker = String(r.ticker || '').toUpperCase();
    if (r.type === 'plan') {
      if (planDue(r.plan || {}, today)) {
        const amount = r.plan?.amount ? ` por ${fmtPrice(r.plan.amount)}` : '';
        push({ key: `plan|${r.id}|${today}`, type: 'plan', ruleId: r.id, market: r.market, ticker, title: `Recordatorio: comprar ${ticker}${amount}`, body: `Tu plan de compra ${planText(r.plan || {})}.${r.note ? ` ${r.note}` : ''}` });
      }
      continue;
    }
    const qt = q(r.market, ticker);
    if (!qt) continue;
    const price = qt.price;
    const h = holdingOf(r.market, ticker);
    const armed = r.armed !== false;
    let hit = false, rearm = false, title = '', body = `Ahora está en ${fmtPrice(price, qt.ccy)}${qt.pct != null ? ` (${qt.pct >= 0 ? '+' : '−'}${fmtPct(qt.pct)} hoy)` : ''}.`;
    if (r.type === 'above') { hit = price >= r.value; rearm = price < r.value * 0.99; title = `${ticker} superó ${fmtPrice(r.value, qt.ccy)}`; }
    else if (r.type === 'below') { hit = price <= r.value; rearm = price > r.value * 1.01; title = `${ticker} bajó de ${fmtPrice(r.value, qt.ccy)}`; }
    else if (r.type === 'move') {
      if (qt.pct != null && Math.abs(qt.pct) >= r.value) {
        push({ key: `move|${r.id}|${sameMoveKey(qt)}`, type: 'move', ruleId: r.id, market: r.market, ticker, title: `${ticker} ${qt.pct >= 0 ? 'subió' : 'cayó'} ${fmtPct(qt.pct)} hoy`, body: `Está en ${fmtPrice(price, qt.ccy)}.${h ? ` Tenés ${nf.format(h.units)}.` : ''}` });
      }
      continue;
    } else if ((r.type === 'cost_down' || r.type === 'cost_up') && h?.cost) {
      const g = price / h.cost - 1;
      if (r.type === 'cost_down') { hit = g <= -r.value / 100; rearm = g > -r.value / 100 + 0.02; title = `${ticker} está ${fmtPct(g * 100)} abajo de tu costo`; }
      else { hit = g >= r.value / 100; rearm = g < r.value / 100 - 0.02; title = `${ticker} gana ${fmtPct(g * 100)} desde tu costo`; }
      body = `Tu precio promedio es ${fmtPrice(h.cost, qt.ccy)} y ahora está en ${fmtPrice(price, qt.ccy)}.`;
    } else continue;

    if (armed && hit) {
      push({ key: `rule|${r.id}|${today}`, type: r.type, ruleId: r.id, market: r.market, ticker, title, body });
      ruleUpdates.push({ id: r.id, armed: false });
    } else if (!armed && rearm) {
      ruleUpdates.push({ id: r.id, armed: true }); // volvió atrás: queda lista para avisar de nuevo
    }
  }

  // Aviso automático para lo que tenés: movimiento fuerte en el día.
  if (autoMove > 0) {
    for (const h of holdings) {
      const qt = q(h.market, h.ticker);
      if (!qt || qt.pct == null || Math.abs(qt.pct) < autoMove) continue;
      if (rules.some(r => !r.deleted && r.active !== false && r.type === 'move' && r.market === h.market && String(r.ticker).toUpperCase() === h.ticker)) continue;
      const dayValue = h.value != null ? ` Tu posición: ${fmtPrice(h.value)} (${qt.pct >= 0 ? '+' : '−'}${fmtPrice(Math.abs(h.value - h.value / (1 + qt.pct / 100))).replace('$ ', '$')} hoy).` : '';
      push({ key: `auto|${h.market}:${h.ticker}|${sameMoveKey(qt)}`, type: 'auto', market: h.market, ticker: h.ticker, title: `${h.ticker} ${qt.pct >= 0 ? 'subió' : 'cayó'} ${fmtPct(qt.pct)} hoy`, body: `Está en ${fmtPrice(qt.price, qt.ccy)}.${dayValue}` });
    }
  }
  return { events, ruleUpdates };
}
