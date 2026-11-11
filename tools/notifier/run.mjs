// Robot de avisos de mercado. Corre en GitHub Actions (ver .github/workflows/avisos.yml).
// 1) Lee de Supabase tus inversiones, alertas, avisos ya enviados y dispositivos.
// 2) Busca precios (data912, Binance, dolarapi) y evalúa las mismas reglas que la app.
// 3) Manda las notificaciones nuevas al iPhone (Web Push) y guarda el aviso para no repetirlo.
// Variables: SUPABASE_URL, SUPABASE_SERVICE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT. DRY_RUN=1 para probar sin enviar.
import webpush from 'web-push';
import { fetchQuotes, fetchDollars, positionValue, MARKETS } from '../../app/js/logic/market-core.js';
import { evaluate } from '../../app/js/logic/alerts-core.js';

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, DRY_RUN } = process.env;
const dry = DRY_RUN === '1';
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) { console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_KEY'); process.exit(1); }
if (!dry) webpush.setVapidDetails(VAPID_SUBJECT || 'https://suarezvalen.github.io/finanzas-tino/', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const headers = { apikey: SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json' };
if (SUPABASE_SERVICE_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${SUPABASE_SERVICE_KEY}`;
const KINDS = ['investments', 'transactions', 'alerts', 'alertlog', 'push', 'meta'];
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
    if (!invs.length && !rules.length) continue;

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

    const logged = new Set(d.alertlog.map(a => a.id));
    const { events, ruleUpdates } = evaluate({ rules, holdings, quotes, today, logged, autoMove: settings.autoMove ?? 5 });
    console.log(`Usuario ${userId.slice(0, 8)}…: ${holdings.length} posiciones, ${rules.length} reglas, ${events.length} avisos nuevos, ${subs.length} dispositivos`);

    const out = [];
    for (const e of events) {
      console.log(`  → ${e.title} | ${e.body}`);
      for (const s of subs) {
        if (dry) continue;
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify({ title: e.title, body: e.body, tag: e.key, url: './#mercado' }), { TTL: 6 * 3600, urgency: 'high' });
        } catch (err) {
          console.log(`    no se pudo enviar (${err.statusCode || err.message})`);
          if (err.statusCode === 404 || err.statusCode === 410) { s.deleted = true; s.updatedAt = now(); out.push(toRow(userId, 'push', s)); }
        }
      }
      const t = now();
      out.push(toRow(userId, 'alertlog', { id: e.key, ...e, date: today, seen: false, source: 'robot', createdAt: t, updatedAt: t, deleted: false }));
    }
    for (const u of ruleUpdates) {
      const r = rules.find(x => x.id === u.id);
      if (r) out.push(toRow(userId, 'alerts', { ...r, ...u, updatedAt: now() }));
    }
    await writeRows(out);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
