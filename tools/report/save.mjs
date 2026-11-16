// Guarda un informe en Supabase (tipo de dato 'informes') para que aparezca en la app y el robot avise.
// Uso: node tools/report/save.mjs informe.json [--user ID]
// El JSON sigue el formato de tools/report/README.md. Se valida antes de guardar.
import { readFile } from 'node:fs/promises';
import { SYNC } from '../../app/js/constants.js';

const URL_ = process.env.SUPABASE_URL || SYNC.url;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const file = process.argv[2];
if (!KEY || !file) { console.error('Uso: SUPABASE_SERVICE_KEY=… node tools/report/save.mjs informe.json [--user ID]'); process.exit(1); }
const headers = { apikey: KEY, 'Content-Type': 'application/json' };
if (KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${KEY}`;

const VIEWS = ['alcista', 'neutral', 'bajista'];
const HZ = ['corto', 'mediano', 'largo'];
const errors = [];
const need = (cond, msg) => { if (!cond) errors.push(msg); };
const str = (v, max = 4000) => (v == null ? undefined : String(v).slice(0, max));
const url = v => (typeof v === 'string' && /^https?:\/\//.test(v) ? v.slice(0, 2000) : undefined);
const num = v => (v == null || v === '' || !Number.isFinite(+v) ? undefined : +v);

function clean(r) {
  need(['am', 'pm', 'weekly'].includes(r.kind), 'kind debe ser am, pm o weekly');
  need(/^\d{4}-\d{2}-\d{2}$/.test(r.date || ''), 'date debe ser AAAA-MM-DD');
  need(r.headline && r.summary, 'faltan headline o summary');
  const horizon = h => (h ? { view: VIEWS.includes(h.view) ? h.view : undefined, text: str(h.text, 1500), action: str(h.action, 600), actions: Array.isArray(h.actions) ? h.actions.slice(0, 6).map(x => str(x, 400)) : undefined } : undefined);
  need(r.outlook && HZ.every(h => r.outlook[h]?.text), 'outlook necesita corto, mediano y largo con text');
  for (const a of r.assets || []) need(a.ticker && HZ.every(h => a.horizons?.[h]?.text), `el activo ${a.ticker || '?'} necesita horizons corto, mediano y largo`);
  return {
    kind: r.kind, date: r.date, title: str(r.title, 120), headline: str(r.headline, 220), summary: str(r.summary),
    pushTitle: str(r.pushTitle, 80), pushBody: str(r.pushBody, 220), model: str(r.model, 60),
    portfolio: r.portfolio ? { changePct: num(r.portfolio.changePct), changeArs: num(r.portfolio.changeArs), text: str(r.portfolio.text, 2000) } : undefined,
    outlook: r.outlook ? Object.fromEntries(HZ.map(h => [h, horizon(r.outlook[h])])) : undefined,
    macro: (r.macro || []).slice(0, 8).map(m => ({ label: str(m.label, 40), value: str(m.value, 40), change: typeof m.change === 'number' ? m.change : str(m.change, 40) })),
    macroText: str(r.macroText, 2000),
    news: (r.news || []).slice(0, 10).map(n => ({ title: str(n.title, 300), link: url(n.link), source: str(n.source, 80), ticker: str(n.ticker, 12), impact: ['alta', 'media', 'baja'].includes(n.impact) ? n.impact : undefined, why: str(n.why, 600) })),
    assets: (r.assets || []).slice(0, 30).map(a => ({
      ticker: str(a.ticker, 12), name: str(a.name, 80), market: str(a.market, 12), pct: num(a.pct), why: str(a.why, 1500),
      news: (a.news || []).slice(0, 4).map(n => ({ title: str(n.title, 300), link: url(n.link), source: str(n.source, 80) })),
      technical: str(a.technical, 500), premium: str(a.premium, 300),
      horizons: a.horizons ? Object.fromEntries(HZ.map(h => [h, horizon(a.horizons[h])])) : undefined,
    })),
    calendar: (r.calendar || []).slice(0, 12).map(c => ({ date: str(c.date, 30), ticker: str(c.ticker, 12), event: str(c.event, 160), note: str(c.note, 300) })),
    ideas: (r.ideas || []).slice(0, 6).map(x => str(x, 400)),
    risks: (r.risks || []).slice(0, 6).map(x => str(x, 400)),
    sources: (r.sources || []).slice(0, 20).map(s => ({ label: str(s.label, 80), link: url(s.link) })).filter(s => s.label || s.link),
    disclaimer: str(r.disclaimer, 600),
  };
}

const raw = JSON.parse(await readFile(file, 'utf8'));
const data = JSON.parse(JSON.stringify(clean(raw))); // saca los undefined
if (errors.length) { console.error('El informe no es válido:\n- ' + errors.join('\n- ')); process.exit(2); }

const ui = process.argv.indexOf('--user');
let userId = ui > 0 ? process.argv[ui + 1] : process.env.REPORT_USER || raw.user_id;
if (!userId) {
  const res = await fetch(`${URL_}/rest/v1/records?select=user_id&kind=eq.investments&limit=1`, { headers });
  userId = (await res.json())[0]?.user_id;
}
if (!userId) { console.error('No sé a qué usuario guardarlo (pasá --user).'); process.exit(1); }

const t = new Date().toISOString();
const id = `${data.date}-${data.kind}`;
const rec = { id, ...data, notified: false, seen: false, createdAt: t, updatedAt: t, deleted: false };
const res = await fetch(`${URL_}/rest/v1/records?on_conflict=user_id,kind,id`, {
  method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify([{ user_id: userId, kind: 'informes', id, data: rec, updated_at: t, deleted: false }]),
});
if (!res.ok) { console.error(`Supabase ${res.status}: ${await res.text()}`); process.exit(1); }
console.log(`Informe guardado: ${id} (${data.assets.length} activos, ${data.news.length} noticias). El robot avisa al iPhone en los próximos minutos.`);
