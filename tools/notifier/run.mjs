// Robot de avisos de mercado. Corre en GitHub Actions (ver .github/workflows/avisos.yml).
// 1) Lee de Supabase tus inversiones, alertas, avisos ya enviados y dispositivos.
// 2) Busca precios (data912, Binance, dolarapi) y evalúa las mismas reglas que la app.
// 3) Manda las notificaciones nuevas al iPhone (Web Push) y guarda el aviso para no repetirlo.
// Variables: SUPABASE_URL, SUPABASE_SERVICE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT. DRY_RUN=1 para probar sin enviar.
import webpush from 'web-push';
import { fetchQuotes, fetchDollars, positionValue, MARKETS } from '../../app/js/logic/market-core.js';
import { evaluate } from '../../app/js/logic/alerts-core.js';
import { arNow, fetchMarketOpen, fetchHolidays, hourEvents, isTradingDay } from '../../app/js/logic/market-hours.js';
import { fetchNews, breakingNews, newsName, newsKey } from '../../app/js/logic/news-core.js';
import { fetchMacro, macroEvents } from '../../app/js/logic/macro-core.js';

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, DRY_RUN } = process.env;
const dry = DRY_RUN === '1';
const markOnly = process.env.MARK_ONLY === '1'; // registra los avisos como enviados sin mandarlos
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) { console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_KEY'); process.exit(1); }
if (!dry) webpush.setVapidDetails(VAPID_SUBJECT || 'https://suarezvalen.github.io/finanzas-tino/', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const headers = { apikey: SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json' };
if (SUPABASE_SERVICE_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${SUPABASE_SERVICE_KEY}`;
const KINDS = ['investments', 'transactions', 'alerts', 'alertlog', 'push', 'meta', 'watch', 'informes'];
const now = () => new Date().toISOString();
const todayAR = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' });

async function readAll() {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const url = `${SUPABASE_URL}/rest/v1/records?select=user_id,kind,id,data&kind=in.(${KINDS.join(',')})&deleted=eq.false&order=user_id,kind,id&limit=1000&offset=${offset}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

async function writeRows(rows) {
  if (!rows.length || dry) return;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/records?on_conflict=user_id,kind,id`, {
    method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`Supabase al guardar ${res.status}: ${await res.text()}`);
}

/** "Tu cartera hoy: +1,2% (+$ 9.300). Mejor: GGAL +2,1% · Peor: AAPL −0,8%." */
async function summarizeDay(invs, dollars) {
  const quotes = await fetchQuotes(invs.map(i => ({ market: i.market, ticker: String(i.ticker).toUpperCase() })));
  const rows = invs.map(i => {
    const q = quotes[`${i.market}:${String(i.ticker).toUpperCase()}`];
    const value = positionValue(i, q, dollars);
    return { ticker: String(i.ticker).toUpperCase(), pct: q?.pct, value, change: value != null && q?.pct != null ? value - value / (1 + q.pct / 100) : null };
  }).filter(r => r.change != null);
  if (!rows.length) return '';
  const change = rows.reduce((s, r) => s + r.change, 0);
  const before = rows.reduce((s, r) => s + (r.value - r.change), 0);
  const pct = before > 0 ? (change / before) * 100 : 0;
  const sign = v => (v >= 0 ? '+' : '−');
  const p = v => `${sign(v)}${Math.abs(v).toFixed(1).replace('.', ',')}%`;
  const money = v => `${sign(v)}$ ${Math.round(Math.abs(v)).toLocaleString('es-AR')}`;
  rows.sort((a, b) => b.pct - a.pct);
  const extremes = rows.length > 1 ? ` Mejor: ${rows[0].ticker} ${p(rows[0].pct)} · Peor: ${rows.at(-1).ticker} ${p(rows.at(-1).pct)}.` : '';
  return `Tu cartera hoy: ${p(pct)} (${money(change)}).${extremes}`;
}

/** Noticias importantes y nuevas de tus activos: un aviso por tema por día, como mucho 2 por activo en cada corrida, 3 por día y 5 en total. */
async function newsFor(invs, watch, alertlog, logged, cache) {
  const seen = new Set();
  const assets = [...invs, ...watch.filter(w => !w.deleted)].filter(a => {
    const k = `${a.market}:${String(a.ticker || '').toUpperCase()}`;
    if (!a.ticker || !a.market || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const since = Date.now() - 2 * 86400000;
  const out = [];
  for (const a of assets) {
    const ticker = String(a.ticker).toUpperCase();
    const name = newsName({ ...a, ticker });
    const past = alertlog.filter(x => x.type === 'news' && x.ticker === ticker && Date.parse(x.createdAt || 0) > since);
    const todays = past.filter(x => x.date === todayAR());
    if (todays.length >= 3) continue;
    if (!cache.has(name)) cache.set(name, await fetchNews(name, { days: 1 }));
    const picks = breakingNews(cache.get(name), {
      sinceHours: 6, seenTitles: past.map(x => x.newsTitle || ''), seenTags: todays.map(x => x.tags?.[0]).filter(Boolean), max: 2, about: [name, ticker],
    });
    for (const n of picks) {
      const key = newsKey(ticker, n.title);
      if (logged.has(key) || out.some(o => o.key === key)) continue;
      out.push({
        key, type: 'news', market: a.market, ticker, newsTitle: n.title, link: n.link, source: n.source, tags: n.tags, publishedAt: n.date,
        title: `${ticker} · ${n.tags[0]}${n.count > 1 ? ` (${n.count} medios)` : ''}`, body: `${n.title} — ${n.source}`,
      });
    }
  }
  return out.slice(0, 5);
}

const toRow = (user_id, kind, data) => ({ user_id, kind, id: data.id, data, updated_at: data.updatedAt, deleted: !!data.deleted });

async function main() {
  const rows = await readAll();
  const users = new Map();
  for (const r of rows) {
    if (!users.has(r.user_id)) users.set(r.user_id, Object.fromEntries(KINDS.map(k => [k, []])));
    users.get(r.user_id)[r.kind].push(r.data);
  }
  const today = todayAR();
  let dollars = null;
  try { dollars = await fetchDollars(); } catch { /* sin dólar: no se valúa cripto en pesos */ }
  // Horario de BYMA: estado en vivo + feriados (este año y el siguiente, por si es diciembre).
  const ar = arNow();
  const year = Number(ar.date.slice(0, 4));
  const [liveOpen, hol1, hol2] = await Promise.all([fetchMarketOpen(), fetchHolidays(year), fetchHolidays(year + 1)]);
  const holidays = [...hol1, ...hol2];
  // Noticias: cada 15 minutos con el mercado abierto (el robot corre cada 5) y en cada corrida fuera de horario (≈ 1 por hora).
  const busy = isTradingDay(ar.date, holidays) && ar.minutes >= 9 * 60 + 30 && ar.minutes < 19 * 60;
  const newsTime = process.env.FORCE_NEWS === '1' || !busy || ar.minutes % 15 < 5;
  // Dólar y riesgo país: solo en días hábiles, con el mercado abierto.
  let macro = null;
  if (isTradingDay(ar.date, holidays) && ar.minutes >= 10 * 60 + 45 && ar.minutes < 18 * 60 + 30) macro = await fetchMacro(dollars, ar.date).catch(() => null);
  const newsCache = new Map(); // un mismo nombre se busca una sola vez por corrida
  console.log(`BYMA ${ar.date} ${Math.floor(ar.minutes / 60)}:${String(ar.minutes % 60).padStart(2, '0')}: ${liveOpen === null ? 'sin dato' : liveOpen ? 'abierto' : 'cerrado'} · ${holidays.length} feriados`);

  for (const [userId, d] of users) {
    const subs = d.push.filter(p => !p.deleted && p.endpoint);
    // Notificación de prueba (se pide desde GitHub → Actions → Avisos de mercado → Run workflow).
    if (process.env.TEST_PUSH === '1') {
      for (const s of subs) {
        try {
          if (!dry) await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify({ title: 'Finanzas: prueba', body: '¡Las notificaciones funcionan! Te voy a avisar cuando algo se mueva.', tag: 'prueba', url: './#mercado' }), { TTL: 3600 });
          console.log(`  prueba enviada a ${s.device?.slice(0, 40) || 'un dispositivo'}`);
        } catch (err) { console.log(`  prueba no enviada (${err.statusCode || err.message})`); }
      }
    }
    const settings = d.meta.find(m => m.id === 'settings') || {};
    const invs = d.investments.filter(i => !i.deleted && i.ticker && i.market && i.units > 0 && !i.closedAt);
    const rules = d.alerts.filter(r => !r.deleted);
    const logged = new Set(d.alertlog.map(a => a.id));
    // Resumen del día para el aviso de cierre (solo si corresponde mandarlo).
    let daySummary = '';
    if (invs.length && ar.minutes >= 18 * 60 - 5 && !logged.has(`mkt-closed|${ar.date}`)) daySummary = await summarizeDay(invs, dollars);
    // Avisos de apertura y cierre del mercado (se pueden apagar en Mercado → Alertas).
    const marketEvents = subs.length && settings.marketHours !== false
      ? hourEvents({ now: ar, holidays, liveOpen, logged, daySummary, fixedAlert: settings.closeFixedAlert ?? invs.some(i => i.market === 'bond' || i.market === 'on') })
      : [];
    // Dólar y riesgo país (se pueden apagar en Mercado → Alertas).
    const macroEv = subs.length && macro && settings.macroAlerts !== false ? macroEvents(macro, { date: ar.date, logged }) : [];
    // Radar de noticias de lo que tenés (y lo que seguís en Mercado).
    const newsEv = subs.length && newsTime && settings.newsAlerts !== false ? await newsFor(invs, d.watch, d.alertlog, logged, newsCache) : [];
    // Informes nuevos (los arma la rutina en la nube): se avisa una vez.
    const reportEv = d.informes.filter(r => !r.deleted && !r.notified && r.createdAt && Date.now() - Date.parse(r.createdAt) < 12 * 3600000)
      .map(r => ({ key: `report|${r.id}`, type: 'report', reportId: r.id, title: r.pushTitle || 'Tu informe está listo', body: r.pushBody || r.headline || 'Abrí la app para leerlo.', url: `./#informe/${r.id}` }));
    if (!invs.length && !rules.length && !marketEvents.length && !macroEv.length && !newsEv.length && !reportEv.length) continue;

    const assets = [...invs, ...rules].map(x => ({ market: x.market, ticker: String(x.ticker).toUpperCase() }));
    const quotes = await fetchQuotes(assets);
    const holdings = invs.map(i => {
      const moves = d.transactions.filter(t => !t.deleted && t.link?.kind === 'investment' && t.link.id === i.id);
      const invested = (i.initialInvested || 0) + moves.reduce((s, t) => s + (t.type === 'out' ? t.amount : -t.amount), 0);
      const q = quotes[`${i.market}:${String(i.ticker).toUpperCase()}`];
      let cost = (invested / i.units) * (MARKETS[i.market]?.per100 ? 100 : 1);
      if (q?.ccy === 'USD') cost /= dollars?.cripto?.venta || dollars?.mep?.venta || 1;
      return { name: i.name, market: i.market, ticker: String(i.ticker).toUpperCase(), units: i.units, cost: invested > 0 ? cost : null, value: positionValue(i, q, dollars) };
    });

    const evaluated = evaluate({ rules, holdings, quotes, today, logged, autoMove: settings.autoMove ?? 5 });
    const { ruleUpdates } = evaluated;
    const events = [...marketEvents.map(e => ({ ...e, type: 'market' })), ...evaluated.events, ...macroEv, ...newsEv, ...reportEv];
    console.log(`Usuario ${userId.slice(0, 8)}…: ${holdings.length} posiciones, ${rules.length} reglas, ${events.length} avisos nuevos, ${subs.length} dispositivos`);

    const out = [];
    // Cada aviso se registra antes de mandarlo: si algo falla, preferimos no repetir una notificación.
    for (const e of events) {
      const t = now();
      out.push(toRow(userId, 'alertlog', { id: e.key, ...e, date: today, seen: false, source: 'robot', createdAt: t, updatedAt: t, deleted: false }));
    }
    for (const e of reportEv) {
      const r = d.informes.find(x => x.id === e.reportId);
      out.push(toRow(userId, 'informes', { ...r, notified: true, updatedAt: now() }));
    }
    for (const u of ruleUpdates) {
      const r = rules.find(x => x.id === u.id);
      if (r) out.push(toRow(userId, 'alerts', { ...r, ...u, updatedAt: now() }));
    }
    await writeRows(out);
    out.length = 0;

    for (const e of events) {
      console.log(`  → ${e.title} | ${e.body}${markOnly ? ' (solo registrado)' : ''}`);
      for (const s of subs) {
        if (dry || markOnly) continue;
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify({ title: e.title, body: e.body, tag: e.key, url: e.url || e.link || './#mercado' }), { TTL: 6 * 3600, urgency: 'high' });
        } catch (err) {
          console.log(`    no se pudo enviar (${err.statusCode || err.message})`);
          if (err.statusCode === 404 || err.statusCode === 410) { s.deleted = true; s.updatedAt = now(); out.push(toRow(userId, 'push', s)); }
        }
      }
    }
    await writeRows(out); // dispositivos que ya no existen
  }
}

main().catch(err => { console.error(err); process.exit(1); });
