// Copia las librerías de terceros que usa la app a app/vendor (para que funcionen sin internet).
// Uso: npm run vendor
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'app', 'vendor');
await mkdir(out, { recursive: true });
// jsPDF (licencia MIT) para generar los reportes en PDF.
await copyFile(path.join(root, 'node_modules/jspdf/dist/jspdf.umd.min.js'), path.join(out, 'jspdf.umd.min.js'));
console.log('vendor: jspdf.umd.min.js');
