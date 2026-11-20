// Sube los datos del negocio (un archivo JSON por día) a Supabase para que aparezcan en la pestaña Negocio de la app.
// Los arma el reporte diario de las 9:05 (skill reporte-diario) en una carpeta local, un AAAA-MM-DD.json por día.
//
// Uso:
//   node tools/negocio/save.mjs <carpeta o archivos .json> [--economia ruta/economia.json] [--user ID] [--todo] [--probar]
//
//   Sin --todo sube solo los días nuevos o que cambiaron desde la última vez (lo anota en <carpeta>/.subidos.json).
//   --probar valida y muestra qué subiría, sin tocar la nube.
//
// La clave: variable de entorno SUPABASE_SERVICE_KEY, o el archivo %USERPROFILE%\.finanzas-tino\service-key
// (fuera de OneDrive y fuera del repositorio). Es la clave secreta de Supabase: no la pegues en ningún otro lado.
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SYNC } from '../../app/js/constants.js';
import { normalizeDay, normalizeEconomia, normalizeInsight, classify } from '../../app/js/logic/biz-format.js';

const args = process.argv.slice(2);
const flag = n => args.includes(n);
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const positional = args.filter((a, i) => !a.startsWith('--') && !['--economia', '--user'].includes(args[i - 1]));
const DRY = flag('--probar');

if (!positional.length) {
  console.error('Uso: node tools/negocio/save.mjs <carpeta o archivos .json> [--economia economia.json] [--user ID] [--todo] [--probar]');
  process.exit(1);
}

const URL_ = process.env.SUPABASE_URL || SYNC.url;
async function readKey() {
  if (process.env.SUPABASE_SERVICE_KEY) return process.env.SUPABASE_SERVICE_KEY.trim();
  const file = path.join(os.homedir(), '.finanzas-tino', 'service-key');
  if (existsSync(file)) return (await readFile(file, 'utf8')).trim();
  return null;
}

/* ---------- Validación ---------- */
const errors = [];

/* ---------- Archivos ---------- */
async function listFiles() {
  const out = [];
  for (const p of positional) {
    const s = await stat(p).catch(() => null);
    if (!s) { errors.push(`No existe: ${p}`); continue; }
    if (s.isDirectory()) {
      for (const f of (await readdir(p)).sort()) if (/^\d{4}-\d{2}-\d{2}\.json$/.test(f)) out.push(path.join(p, f));
      // Los análisis diarios viven en la subcarpeta analisis/ (uno por día, mismo nombre).
      const sub = path.join(p, 'analisis');
      if (existsSync(sub)) for (const f of (await readdir(sub)).sort()) if (/^\d{4}-\d{2}-\d{2}\.json$/.test(f)) out.push(path.join(sub, f));
    } else out.push(p);
  }
  return out;
}

const files = await listFiles();
const dir = positional.length === 1 && (await stat(positional[0]).catch(() => null))?.isDirectory() ? positional[0] : null;
const stateFile = dir ? path.join(dir, '.subidos.json') : null;
const sent = stateFile && existsSync(stateFile) ? JSON.parse(await readFile(stateFile, 'utf8')) : {};

const days = [];
const insights = [];
for (const f of files) {
  const s = await stat(f);
  const name = dir ? path.relative(dir, f).split(path.sep).join('/') : path.basename(f);
  if (!flag('--todo') && sent[name] && sent[name] >= s.mtimeMs) continue;
  let raw;
  try { raw = JSON.parse(await readFile(f, 'utf8')); } catch (e) { errors.push(`${name}: no es un JSON válido (${e.message})`); continue; }
  if (classify(raw) === 'insight') {
    const x = normalizeInsight(raw, name, errors);
    if (x) insights.push({ name, mtime: s.mtimeMs, d: x });
    continue;
  }
  const d = normalizeDay(raw, name, errors);
  if (d) days.push({ name, mtime: s.mtimeMs, d });
}

const ecoPath = opt('--economia');
const economia = ecoPath ? normalizeEconomia(JSON.parse(await readFile(ecoPath, 'utf8')), errors) : null;

if (errors.length) { console.error('Hay errores, no subo nada:\n- ' + errors.join('\n- ')); process.exit(2); }
if (!days.length && !insights.length && !economia) { console.log('No hay días nuevos para subir.'); process.exit(0); }

if (DRY) {
  for (const { d } of days) console.log(`${d.date}: $${d.sales.net} en ${d.sales.orders} pedidos · ${d.ads.length} anuncios con gasto $${Math.round(d.ads.reduce((s, a) => s + a.spend, 0))}${d.report ? ' · con reporte' : ''}`);
  for (const { d } of insights) console.log(`análisis ${d.date}: ${d.headline} · ${d.learnings.length} aprendizajes · ${d.ideas.length} ideas`);
  if (economia) console.log(`economía: precio $${economia.price}, cobranza ${economia.feePct}%, IIBB ${economia.iibbPct}%`);
  console.log(`(prueba: no se subió nada)`);
  process.exit(0);
}

/* ---------- Subida ---------- */
const KEY = await readKey();
if (!KEY) {
  console.error('Falta la clave de Supabase. Guardala en %USERPROFILE%\\.finanzas-tino\\service-key (ver tools/negocio/README.md).\nLos archivos quedan en la carpeta y se suben la próxima vez.');
  process.exit(3);
}
const headers = { apikey: KEY, 'Content-Type': 'application/json' };
if (KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${KEY}`;

async function api(p, init = {}) {
  const res = await fetch(URL_ + p, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

let userId = opt('--user') || process.env.REPORT_USER;
if (!userId) {
  // El dueño de los datos: el usuario que ya tiene el negocio cargado, o el de las finanzas personales.
  userId = (await api('/rest/v1/records?select=user_id&kind=eq.biz_cfg&limit=1'))[0]?.user_id
    || (await api('/rest/v1/records?select=user_id&kind=eq.accounts&limit=1'))[0]?.user_id;
}
if (!userId) { console.error('No sé a qué usuario guardarlo (pasá --user).'); process.exit(1); }

const t = new Date().toISOString();
const rows = [];
for (const { d } of days) {
  const rec = { ...d, importedAt: t, createdAt: t, updatedAt: t, deleted: false };
  rows.push({ user_id: userId, kind: 'biz_days', id: d.id, data: rec, updated_at: t, deleted: false });
}
for (const { d } of insights) {
  const rec = { ...d, importedAt: t, createdAt: t, updatedAt: t, deleted: false };
  rows.push({ user_id: userId, kind: 'biz_insights', id: d.id, data: rec, updated_at: t, deleted: false });
}
if (economia) rows.push({ user_id: userId, kind: 'biz_cfg', id: 'economia', data: { ...economia, createdAt: t, updatedAt: t, deleted: false }, updated_at: t, deleted: false });

for (let i = 0; i < rows.length; i += 200) {
  await api('/rest/v1/records?on_conflict=user_id,kind,id', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows.slice(i, i + 200)),
  });
}
if (stateFile) {
  for (const { name, mtime } of [...days, ...insights]) sent[name] = mtime;
  await writeFile(stateFile, JSON.stringify(sent, null, 1));
}
const last = days.map(x => x.d.date).sort().pop();
console.log(`Listo: ${days.length} día${days.length === 1 ? '' : 's'}${last ? ` (el último, ${last})` : ''}${insights.length ? `, ${insights.length} análisis` : ''}${economia ? ' y la economía' : ''}. La app los baja al abrirse.`);
