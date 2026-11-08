// Genera app/js/icons-data.js con solo los íconos de Lucide que usa la app.
// Uso: npm run icons
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const { CATEGORY_ICONS, ACCOUNT_TYPES, INVEST_KINDS, GOAL_ICONS } = await import(pathToFileURL(path.join(root, 'app/js/constants.js')).href);

const UI_ICONS = [
  'house', 'list', 'plus', 'chart-pie', 'layout-grid', 'eye', 'eye-off', 'search', 'x', 'check',
  'delete', 'chevron-left', 'chevron-right', 'arrow-up-right', 'arrow-down-left', 'arrow-left-right',
  'trash-2', 'settings', 'download', 'upload', 'tags', 'circle-check', 'calendar', 'archive',
  'archive-restore', 'target', 'gauge', 'repeat', 'shield-check', 'file-spreadsheet', 'bell-ring',
  'cloud', 'share', 'square-plus', 'triangle-alert', 'info', 'layers', 'credit-card', 'hand-coins',
  'trending-up', 'sparkles', 'chevron-down', 'wallet', 'pencil', 'bell', 'calendar-clock', 'skip-forward', 'pause', 'play',
  'handshake', 'refresh-cw', 'arrow-down-to-line', 'arrow-up-from-line', 'minus', 'user', 'flag', 'circle-dollar-sign',
];

const names = [...new Set([
  ...UI_ICONS, ...CATEGORY_ICONS, ...GOAL_ICONS,
  ...Object.values(ACCOUNT_TYPES).map(t => t.icon), ...Object.values(INVEST_KINDS).map(t => t.icon),
])].sort();
const dir = path.join(root, 'node_modules/lucide-static/icons');
const out = {};
const missing = [];
for (const n of names) {
  try {
    const svg = await readFile(path.join(dir, `${n}.svg`), 'utf8');
    const start = svg.indexOf('>', svg.indexOf('<svg')) + 1;
    out[n] = svg.slice(start, svg.lastIndexOf('</svg>')).replace(/\s*\n\s*/g, '').trim();
  } catch {
    missing.push(n);
  }
}
if (missing.length) {
  console.error('Faltan estos íconos en lucide-static:', missing.join(', '));
  process.exit(1);
}
const pkg = JSON.parse(await readFile(path.join(root, 'node_modules/lucide-static/package.json'), 'utf8'));
const js = `// Generado por tools/build-icons.mjs — no editar a mano.
// Íconos de Lucide v${pkg.version} (licencia ISC, https://lucide.dev)
export const ICONS = ${JSON.stringify(out, null, 1)};
`;
await writeFile(path.join(root, 'app/js/icons-data.js'), js);
console.log(`icons-data.js: ${names.length} íconos`);
