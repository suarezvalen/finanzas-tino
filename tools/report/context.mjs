// Junta todo lo que necesita el informe en un solo JSON: tu cartera con precios en vivo, dólar, riesgo país,
// estado del mercado, análisis técnico, CEDEAR caro/barato, noticias de cada activo y los avisos recientes.
// Lo usa la rutina de Claude en la nube (ver tools/report/README.md). No escribe nada.
//
// Uso: node tools/report/context.mjs [am|pm|weekly] > contexto.json
// Variables: SUPABASE_SERVICE_KEY (obligatoria), SUPABASE_URL (opcional), REPORT_USER (opcional: id de usuario).
import { fetchQuotes, fetchDollars, fetchRiesgoPais, fetchHistory, fetchLive, positionValue, cedearPremium, MARKETS } from '../../app/js/logic/market-core.js';
import { analyze } from '../../app/js/logic/analysis.js';
import { arNow, fetchMarketOpen, fetchHolidays, marketStatus, hoursFor, nextTradingDay } from '../../app/js/logic/market-hours.js';
import { fetchNews, breakingNews, newsName, classify } from '../../app/js/logic/news-core.js';
import { fetchMacro } from '../../app/js/logic/macro-core.js';
import { SYNC } from '../../app/js/constants.js';

const kind = ['am', 'pm', 'weekly'].includes(process.argv[2]) ? process.argv[2] : 'pm';
const URL_ = process.env.SUPABASE_URL || SYNC.url;
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!KEY) { console.error('Falta SUPABASE_SERVICE_KEY (variable de entorno).'); process.exit(1); }
const headers = { apikey: KEY };
if (KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${KEY}`;
const KINDS = ['investments', 'transactions', 'alerts', 'alertlog', 'meta', 'watch', 'informes'];
const r2 = (v, d = 2) => (v == null || !Number.isFinite(v) ? null : +v.toFixed(d));

async function readAll() {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${URL_}/rest/v1/records?select=user_id,kind,id,data&kind=in.(${KINDS.join(',')})&deleted=eq.false&order=user_id,kind,id&limit=1000&offset=${offset}`, { headers });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

async function main() {
  const rows = await readAll();
  const users = new Map();
  for (const r of rows) {
    if (!users.has(r.user_id)) users.set(r.user_id, Object.fromEntries(KINDS.map(k => [k, []])));
    users.get(r.user_id)[r.kind].push(r.data);
  }
  // El usuario: el indicado, o el que tiene inversiones conectadas.
  const userId = process.env.REPORT_USER
    || [...users.entries()].sort((a, b) => b[1].investments.filter(i => i.ticker).length - a[1].investments.filter(i => i.ticker).length)[0]?.[0];
  if (!userId) throw new Error('No hay datos en Supabase.');
  const d = users.get(userId);

  const ar = arNow();
  const year = Number(ar.date.slice(0, 4));
  const [dollars, riesgo, liveOpen, hol1, hol2, cedLive] = await Promise.all([
    fetchDollars().catch(() => null), fetchRiesgoPais().catch(() => null), fetchMarketOpen(),
    fetchHolidays(year), fetchHolidays(year + 1), fetchLive('cedear').catch(() => null),
  ]);
  const holidays = [...hol1, ...hol2];
  const macro = await fetchMacro(dollars, ar.date).catch(() => ({}));

  const invs = d.investments.filter(i => !i.deleted && !i.closedAt);
  const linked = invs.filter(i => i.ticker && i.market && i.units > 0);
  const watch = d.watch.filter(w => !w.deleted && w.ticker && w.market);
  const assets = [...linked, ...watch].map(x => ({ market: x.market, ticker: String(x.ticker).toUpperCase() }));
  const quotes = await fetchQuotes(assets);

  const holdings = [];
  for (const i of linked) {
    const ticker = String(i.ticker).toUpperCase();
    const q = quotes[`${i.market}:${ticker}`];
    const moves = d.transactions.filter(t => !t.deleted && t.link?.kind === 'investment' && t.link.id === i.id);
    const invested = (i.initialInvested || 0) + moves.reduce((s, t) => s + (t.type === 'out' ? t.amount : -t.amount), 0);
    const value = positionValue(i, q, dollars);
    let a = null;
    try {
      const raw = await fetchHistory(i.market, ticker);
      const x = analyze(raw, { crypto: i.market === 'crypto', cedear: i.market === 'cedear', cost: null });
      if (x.ok) {
        const closes = x.bars.map(b => b.c);
        const ret5 = closes.length > 5 ? closes.at(-1) / closes.at(-6) - 1 : null;
        a = {
          tendencia: x.trend, rsi14: r2(x.rsi, 0), sma20: r2(x.sma20), sma50: r2(x.sma50), sma200: r2(x.sma200),
          max52: r2(x.hi52), min52: r2(x.lo52), desde_max_pct: r2(x.fromHi * 100, 1), volatilidad_anual_pct: r2(x.vol * 100, 0),
          rend_pct: { semana: r2(ret5 * 100, 1), mes: r2(x.ret.m1 * 100, 1), tres_meses: r2(x.ret.m3 * 100, 1), anio: r2(x.ret.y1 * 100, 1) },
          ultimo_cierre: x.date, notas: x.notes,
        };
      }
    } catch { /* sin histórico */ }
    holdings.push({
      nombre: i.name, ticker, mercado: MARKETS[i.market]?.label || i.market, market: i.market, cantidad: i.units,
      precio: q?.price ?? null, moneda: q?.ccy || null, var_dia_pct: q?.pct ?? null,
      valor_ars: r2(value, 0), invertido_ars: invested > 0 ? r2(invested, 0) : null,
      ganancia_ars: value != null && invested > 0 ? r2(value - invested, 0) : null,
      ganancia_pct: value != null && invested > 0 ? r2((value / invested - 1) * 100, 1) : null,
      cambio_dia_ars: value != null && q?.pct != null ? r2(value - value / (1 + q.pct / 100), 0) : null,
      cedear: i.market === 'cedear' ? cedearPremium(cedLive, ticker, dollars?.ccl?.venta) : undefined,
      tecnico: a,
    });
  }
  const total = holdings.reduce((s, h) => s + (h.valor_ars || 0), 0);
  for (const h of holdings) h.peso_pct = total ? r2((h.valor_ars || 0) / total * 100, 1) : null;
  const dayChange = holdings.reduce((s, h) => s + (h.cambio_dia_ars || 0), 0);
  // Inversiones sin ticker (plazo fijo, FCI…): último valor cargado a mano (aproximado).
  const others = invs.filter(i => !linked.includes(i)).map(i => {
    const last = (i.valuations || []).slice().sort((a, b) => a.date.localeCompare(b.date)).pop();
    return { nombre: i.name, tipo: i.kind, valor_aprox_ars: i.kind === 'plazo_fijo' ? i.capital ?? null : last?.value ?? i.initialInvested ?? null, desde: last?.date || i.startDate || null };
  });

  // Noticias: las importantes de cada activo (24 h o 7 días en la revisión semanal) y algunos titulares más.
  const days = kind === 'weekly' ? 7 : 1;
  const news = {};
  for (const x of [...holdings, ...watch.map(w => ({ ticker: String(w.ticker).toUpperCase(), market: w.market, seguimiento: true }))]) {
    const name = newsName({ ticker: x.ticker });
    const items = await fetchNews(name, { days });
    const important = breakingNews(items, { sinceHours: days * 24 + 12, max: 6, about: [name, x.ticker] });
    const latest = items.filter(n => !important.some(i => i.link === n.link)).slice(0, 6);
    news[x.ticker] = {
      buscado_como: name, seguimiento: !!x.seguimiento,
      importantes: important.map(n => ({ titulo: n.title, medio: n.source, fecha: n.date, link: n.link, temas: n.tags, medios_que_la_cubren: n.count })),
      otros_titulares: latest.map(n => ({ titulo: n.title, medio: n.source, fecha: n.date, link: n.link, temas: classify(n.title).tags })),
    };
  }
  const general = {};
  for (const q of ['Merval', 'Wall Street', 'riesgo país Argentina']) {
    general[q] = (await fetchNews(q, { days, langs: ['es'] })).slice(0, 6).map(n => ({ titulo: n.title, medio: n.source, fecha: n.date, link: n.link }));
  }

  const since = Date.now() - (kind === 'weekly' ? 7 : 1.5) * 86400000;
  const out = {
    generado: new Date().toISOString(), tipo_informe: kind, fecha_ar: ar.date,
    hora_ar: `${String(Math.floor(ar.minutes / 60)).padStart(2, '0')}:${String(ar.minutes % 60).padStart(2, '0')}`,
    mercado: { estado: marketStatus({ now: ar, holidays, liveOpen }), horario: hoursFor(ar.date), proximo_dia_habil: nextTradingDay(ar.date, holidays), feriados_proximos: holidays.filter(h => h.fecha >= ar.date).slice(0, 4) },
    dolar: dollars, variacion_dolar_y_riesgo: macro, riesgo_pais: riesgo,
    cartera: { total_con_precio_ars: r2(total, 0), cambio_dia_ars: r2(dayChange, 0), cambio_dia_pct: total - dayChange > 0 ? r2(dayChange / (total - dayChange) * 100, 2) : null, posiciones: holdings, otras_inversiones_sin_precio: others },
    seguimiento: watch.map(w => { const t = String(w.ticker).toUpperCase(); const q = quotes[`${w.market}:${t}`]; return { ticker: t, market: w.market, precio: q?.price ?? null, moneda: q?.ccy || null, var_dia_pct: q?.pct ?? null }; }),
    alertas_configuradas: d.alerts.filter(r => !r.deleted && r.active !== false).map(r => ({ tipo: r.type, ticker: r.ticker, valor: r.value, plan: r.plan, nota: r.note })),
    avisos_recientes: d.alertlog.filter(a => Date.parse(a.createdAt || 0) > since).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 25).map(a => ({ tipo: a.type, titulo: a.title, texto: a.body, fecha: a.createdAt, link: a.link })),
    informes_anteriores: d.informes.filter(r => !r.deleted).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 4)
      .map(r => ({ id: r.id, tipo: r.kind, fecha: r.date, titular: r.headline, mirada: Object.fromEntries(Object.entries(r.outlook || {}).map(([k, v]) => [k, v?.view])) })),
    noticias: news, noticias_generales: general,
    preferencias: { horizonte_que_suele_mirar: d.meta.find(m => m.id === 'settings')?.reportHorizon || 'mediano' },
    user_id: userId,
  };
  process.stdout.write(JSON.stringify(out, null, 1));
}

main().catch(err => { console.error(err); process.exit(1); });
