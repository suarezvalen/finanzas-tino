// Formato de los archivos del negocio (uno por día, AAAA-MM-DD.json) y de economia.json.
// Lo usan la app (importar a mano) y tools/negocio/save.mjs (subida automática). Ver tools/negocio/README.md.

const num = v => (v == null || v === '' || !Number.isFinite(+v) ? 0 : +v);
const numOrNull = v => (v == null || v === '' || !Number.isFinite(+v) ? null : +v);
const str = (v, max = 300) => (v == null ? '' : String(v).slice(0, max));
const r2 = v => Math.round(v * 100) / 100;

/** Convierte un archivo de día al registro 'biz_days'. Agrega los problemas a `errors`. */
export function normalizeDay(raw, file = 'archivo', errors = []) {
  const date = raw?.fecha;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) { errors.push(`${file}: "fecha" tiene que ser AAAA-MM-DD`); return null; }
  if (raw.ventas == null) errors.push(`${file}: falta "ventas"`);
  const v = raw.ventas || {};
  const e = raw.embudo || null;
  const ads = (raw.anuncios || []).map(a => ({
    id: str(a.id, 40), name: str(a.nombre, 160), adsetId: str(a.conjunto_id, 40), adset: str(a.conjunto, 160),
    campaign: str(a.campania, 160), status: str(a.estado, 30),
    spend: r2(num(a.gasto)), impr: num(a.impresiones), clicks: num(a.clics), atc: num(a.carritos), ic: num(a.pagos),
    purch: num(a.compras), value: r2(num(a.valor)),
  })).filter(a => a.id && (a.spend > 0 || a.purch > 0 || a.status === 'ACTIVE'));
  for (const a of ads) if (!a.adset) errors.push(`${file}: al anuncio ${a.id} le falta "conjunto"`);
  return {
    id: date, date,
    sales: { gross: num(v.bruto), disc: num(v.descuentos), net: v.neto != null ? num(v.neto) : num(v.bruto) - num(v.descuentos) - num(v.devoluciones), refunds: num(v.devoluciones), orders: num(v.pedidos) },
    funnel: e ? { visits: num(e.visitas), carts: num(e.carritos), checkouts: num(e.checkouts), purchases: num(e.compras) } : null,
    ads,
    adsTotal: raw.meta ? { spend: r2(num(raw.meta.gasto)) } : null,
    email: raw.email ? { revenue: num(raw.email.ventas), orders: num(raw.email.pedidos) } : null,
    orders: (raw.pedidos || []).slice(0, 400).map(o => {
      const x = { n: str(o.nombre, 20), t: str(o.hora, 5), total: num(o.total), disc: num(o.descuento) };
      if (o.cupon) x.code = str(o.cupon, 40);
      if (num(o.devuelto)) x.refunded = num(o.devuelto);
      return x;
    }),
    report: raw.reporte?.md ? { headline: str(raw.reporte.titular, 300), md: str(raw.reporte.md, 30000) } : null,
    source: str(raw.fuente || 'reporte-diario', 60),
  };
}

/** Convierte economia.json al registro 'biz_cfg' / 'economia'. */
export function normalizeEconomia(e, errors = []) {
  const p = e?.producto || {}, pc = e?.porcentajes_sobre_precio || {}, u = e?.umbrales_de_decision || {};
  for (const k of ['precio', 'costo_unitario', 'costo_envio_al_cliente']) if (p[k] == null) errors.push(`economia.json: falta producto.${k}`);
  for (const k of ['comision_cobranza', 'iibb']) if (pc[k] == null) errors.push(`economia.json: falta porcentajes_sobre_precio.${k}`);
  return {
    id: 'economia', name: str(e?.marca || 'Mi negocio', 80), currency: str(e?.moneda || 'ARS', 3),
    product: str(p.nombre, 160), kind: str(p.tipo, 20), price: num(p.precio), unitCost: num(p.costo_unitario),
    shipCost: p.envio_lo_cobra_al_cliente ? 0 : num(p.costo_envio_al_cliente),
    feePct: num(pc.comision_cobranza), iibbPct: num(pc.iibb), otherPct: num(pc.otros),
    feeDetail: str(pc._detalle, 300),
    scaleMult: numOrNull(u.escalar_si_roas_supera_equilibrio_por) ?? 1.25,
    minSpendTickets: numOrNull(u.gasto_minimo_para_decidir_en_tickets) ?? 3,
    cutNoSalesTickets: numOrNull(u.cortar_sin_compras_a_partir_de_tickets) ?? 1.5,
    scaleUpPct: numOrNull(u.suba_de_presupuesto_sugerida_pct) ?? 20,
  };
}

/** ¿Este JSON es un día, un análisis, economia.json o una lista de días? */
export function classify(raw) {
  if (Array.isArray(raw)) return 'days';
  if (raw?.fecha && raw.titular && raw.resumen && !raw.ventas) return 'insight';
  if (raw?.fecha) return 'day';
  if (raw?.producto && raw?.porcentajes_sobre_precio) return 'economia';
  return null;
}

/* ---------- Análisis diario (analisis/AAAA-MM-DD.json) ---------- */
export const IDEA_AREAS = ['landing', 'anuncios', 'email', 'oferta', 'marketing', 'contenido', 'otro'];
export const IDEA_STATES = ['nueva', 'en_prueba', 'funciono', 'no_funciono', 'descartada'];
export const CERTAINTY = ['firme', 'probable', 'hipotesis'];
const pick = (v, list, def) => (list.includes(v) ? v : def);
const ymdOk = v => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : undefined);
const strs = (arr, n, max) => (Array.isArray(arr) ? arr.slice(0, n).map(x => str(x, max)).filter(Boolean) : []);

/** Convierte un análisis diario al registro 'biz_insights'. */
export function normalizeInsight(raw, file = 'análisis', errors = []) {
  const date = raw?.fecha;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) { errors.push(`${file}: "fecha" tiene que ser AAAA-MM-DD`); return null; }
  if (!raw.titular || !raw.resumen) errors.push(`${file}: faltan "titular" o "resumen"`);
  const learnings = (raw.aprendizajes || []).slice(0, 60).map(a => ({
    id: str(a.id, 60), text: str(a.texto, 600), evidence: str(a.evidencia, 900), certainty: pick(a.certeza, CERTAINTY, 'hipotesis'),
    since: ymdOk(a.desde), updated: ymdOk(a.actualizado), trend: pick(a.tendencia, ['nuevo', 'se_confirma', 'se_debilita', 'igual'], 'igual'),
  })).filter(a => a.id && a.text);
  const ideas = (raw.ideas || []).slice(0, 40).map(i => ({
    id: str(i.id, 60), area: pick(i.area, IDEA_AREAS, 'otro'), title: str(i.titulo, 160), why: str(i.por_que, 900), how: str(i.como, 1500),
    impact: pick(i.impacto, ['alto', 'medio', 'bajo'], 'medio'), effort: pick(i.esfuerzo, ['bajo', 'medio', 'alto'], 'medio'),
    basedOn: strs(i.basada_en, 6, 60), status: pick(i.estado, IDEA_STATES, 'nueva'), result: str(i.resultado, 900), since: ymdOk(i.desde),
  })).filter(i => i.id && i.title);
  for (const i of ideas) for (const b of i.basedOn) if (!learnings.some(l => l.id === b)) errors.push(`${file}: la idea ${i.id} se basa en ${b}, que no está en "aprendizajes"`);
  return {
    id: date, date, kind: pick(raw.tipo, ['diario', 'semanal'], 'diario'),
    headline: str(raw.titular, 220), summary: str(raw.resumen, 4000),
    numbers: (raw.numeros || []).slice(0, 8).map(n => ({ label: str(n.etiqueta, 40), value: str(n.valor, 40), change: str(n.cambio, 30), tone: pick(n.tono, ['bueno', 'malo', 'neutro'], 'neutro') })),
    why: (raw.por_que || []).slice(0, 12).map(w => ({ factor: str(w.factor, 120), detail: str(w.detalle, 700), weight: pick(w.peso, ['alto', 'medio', 'bajo'], 'medio') })).filter(w => w.factor),
    noSales: str(raw.sin_ventas, 1500) || undefined,
    learnings, ideas,
    followUp: (raw.seguimiento || []).slice(0, 12).map(f => ({ idea: str(f.idea, 60), text: str(f.texto, 700) })).filter(f => f.text),
    next: strs(raw.proximos_pasos, 8, 400),
    model: str(raw.modelo, 60) || undefined,
  };
}
