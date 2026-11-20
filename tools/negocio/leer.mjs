// Lee lo que marcaste en la app (Negocio → Análisis) para que el análisis diario lo tenga en cuenta:
// el estado de cada idea (la apliqué, funcionó, no funcionó, descartada) y los cambios que anotaste (landing, precio, anuncios…).
//
// Uso: node tools/negocio/leer.mjs [--desde AAAA-MM-DD] [--user ID]   → imprime JSON
// Usa la misma clave que save.mjs (SUPABASE_SERVICE_KEY o %USERPROFILE%\.finanzas-tino\service-key). No escribe nada.
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SYNC } from '../../app/js/constants.js';

const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const since = opt('--desde') || '1970-01-01';

const file = path.join(os.homedir(), '.finanzas-tino', 'service-key');
const KEY = process.env.SUPABASE_SERVICE_KEY?.trim() || (existsSync(file) ? (await readFile(file, 'utf8')).trim() : null);
if (!KEY) { console.error('Falta la clave de Supabase (ver tools/negocio/README.md).'); process.exit(3); }
const headers = { apikey: KEY };
if (KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${KEY}`;
const URL_ = process.env.SUPABASE_URL || SYNC.url;
const get = async q => {
  const res = await fetch(`${URL_}/rest/v1/records?${q}`, { headers });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
};

const userId = opt('--user') || process.env.REPORT_USER || (await get('select=user_id&kind=eq.biz_days&limit=1'))[0]?.user_id;
if (!userId) { console.error('No hay datos del negocio en Supabase.'); process.exit(1); }
const rows = await get(`select=id,data,deleted&kind=eq.biz_notes&user_id=eq.${encodeURIComponent(userId)}&order=updated_at.desc&limit=500`);
const notes = rows.filter(r => !r.deleted && !r.data?.deleted).map(r => r.data);

const out = {
  ideas: notes.filter(n => n.type === 'idea' && (n.date || '') >= since).map(n => ({
    idea: n.ideaId, estado: n.status, desde: n.date, comentario: n.text || undefined, actualizado: n.updatedAt,
  })),
  cambios: notes.filter(n => n.type === 'cambio' && (n.date || '') >= since).map(n => ({
    fecha: n.date, area: n.area, texto: n.text, idea: n.ideaId || undefined,
  })),
};
process.stdout.write(JSON.stringify(out, null, 1) + '\n');
