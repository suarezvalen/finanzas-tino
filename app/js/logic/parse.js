// Lee líneas copiadas de un resumen de tarjeta o del home banking y las convierte en gastos.
// Formatos típicos:  "05/11 COTO SUC 123   12.345,67"   "05-nov-26 NETFLIX.COM  C.02/06  4.999,00"
import { txs, categories } from '../store.js';
import { today, pad } from '../dates.js';
import { normalize } from '../ui.js';

const MONTHS = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };
const SKIP = /\b(su pago|pago en pesos|pago en dolares|pago minimo|saldo anterior|saldo actual|total|subtotal|limite|vencimiento|cierre|tasa|tna|tea|cft)\b/;
const AMOUNT = /-?\$?\s?-?\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|-?\$?\s?-?\d+(?:,\d{1,2})?/g;

// Palabras clave → nombre de categoría (se busca por nombre entre tus categorías).
const KEYWORDS = [
  [/coto|carrefour|jumbo|disco|\bdia\b|vea|chango|vital|makro|supermerc|autoservicio|verduler|carnicer|almacen/, 'Supermercado'],
  [/rappi|pedidos ?ya|mc ?donald|burger|starbucks|cafe|resto|parrilla|pizz|heladeria|bar\b|cerveceria|mostaza/, 'Comida y salidas'],
  [/uber|cabify|didi|ypf|shell|axion|puma|sube|peaje|ausol|estacionam|nafta|combustible/, 'Transporte'],
  [/netflix|spotify|disney|hbo|max\.com|prime video|amazon prime|youtube|apple\.com|icloud|google|paramount|crunchyroll|chatgpt|openai/, 'Suscripciones'],
  [/farmac|farmacity|osde|swiss medical|galeno|medic|odonto|clinica|laboratorio/, 'Salud'],
  [/edenor|edesur|metrogas|naturgy|aysa|personal|movistar|claro|telecentro|fibertel|flow|directv|expensas|abl|municipal/, 'Servicios'],
  [/zara|nike|adidas|dexter|falabella|indumentaria|zapater|calzado|ropa/, 'Ropa'],
  [/cine|cinemark|hoyts|teatro|ticketek|entradas|steam|playstation|xbox|nintendo/, 'Ocio'],
  [/sellos|impuesto|iva|percepcion|afip|arca|ganancias/, 'Impuestos'],
  [/mercadolibre|mercado libre|amazon|tienda/, 'Otros'],
];

function parseAmount(token) {
  const neg = token.includes('-');
  const n = Number(token.replace(/[^\d,]/g, '').replace(',', '.'));
  return { value: Math.round(n), neg };
}

function parseDate(line, fallback) {
  const t = today();
  const year = Number(t.slice(0, 4));
  const curMonth = Number(t.slice(5, 7));
  const fix = (d, m, y) => {
    if (!(d >= 1 && d <= 31 && m >= 1 && m <= 12)) return null;
    let yy = y ? (y < 100 ? 2000 + y : y) : year;
    if (!y && m > curMonth + 1) yy -= 1; // un mes "futuro" es del año pasado
    return `${yy}-${pad(m)}-${pad(d)}`;
  };
  let m = line.match(/^\s*(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/);
  if (m) return { date: fix(+m[1], +m[2], m[3] && +m[3]), rest: line.slice(m[0].length) };
  m = line.match(/^\s*(\d{1,2})[\s/.-]*([a-záéí]{3})[a-z]*\.?(?:[\s/.-]*(\d{2,4}))?\b/i);
  if (m && MONTHS[normalize(m[2]).slice(0, 3)]) return { date: fix(+m[1], MONTHS[normalize(m[2]).slice(0, 3)], m[3] && +m[3]), rest: line.slice(m[0].length) };
  return { date: fallback, rest: line, noDate: true };
}

const titleCase = s => s.toLowerCase().replace(/\s+/g, ' ').trim().replace(/(^|\s)\S/g, c => c.toUpperCase());

/** Aprende de tus movimientos anteriores qué categoría usás para cada comercio. */
function learnedCategories() {
  const map = new Map();
  for (const t of txs()) {
    if (t.type !== 'expense' || !t.note || !t.categoryId) continue;
    const key = normalize(t.note).split(/\s+/)[0];
    if (key.length < 3) continue;
    const counts = map.get(key) || {};
    counts[t.categoryId] = (counts[t.categoryId] || 0) + 1;
    map.set(key, counts);
  }
  return map;
}

export function guessCategory(desc, learned = learnedCategories()) {
  const n = normalize(desc);
  const counts = learned.get(n.split(/\s+/)[0]);
  if (counts) return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const cats = categories('expense');
  for (const [re, name] of KEYWORDS) {
    if (re.test(n)) { const c = cats.find(x => normalize(x.name) === normalize(name)); if (c) return c.id; }
  }
  return cats.find(c => normalize(c.name) === 'otros')?.id || null; // sin pista: lo elegís vos
}

/**
 * Devuelve una fila por gasto detectado:
 * { date, note, amount, categoryId, include, warning, raw }
 */
export function parseStatement(text, fallbackDate = today()) {
  const learned = learnedCategories();
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\t/g, ' ').trim();
    if (line.length < 4) continue;
    const n = normalize(line);
    const { date, rest, noDate } = parseDate(line, fallbackDate);
    const tokens = [...rest.matchAll(AMOUNT)].map(m => m[0].trim()).filter(tk => /\d/.test(tk));
    if (!tokens.length) continue;
    const amountTok = tokens[tokens.length - 1];
    const { value, neg } = parseAmount(amountTok);
    if (!value) continue;
    let desc = rest.slice(0, rest.lastIndexOf(amountTok));
    const cuota = desc.match(/\bC(?:UOTA)?\.?\s*(\d{1,2})\s*\/\s*(\d{1,2})\b/i);
    desc = desc
      .replace(/\bC(?:UOTA)?\.?\s*\d{1,2}\s*\/\s*\d{1,2}\b/i, ' ')
      .replace(/\b\d{5,}\b/g, ' ') // números de comprobante
      .replace(/[*$|_]+/g, ' ')
      .replace(/\b(ars|pesos)\b/gi, ' ');
    let note = titleCase(desc) || 'Gasto';
    if (cuota) note += ` (cuota ${+cuota[1]}/${+cuota[2]})`;
    const usd = /u\$s|usd|us\$|dolar/.test(n);
    const skip = SKIP.test(n);
    let warning = '';
    if (usd) warning = 'En dólares: revisá el monto en pesos';
    else if (neg) warning = 'Es un crédito o devolución';
    else if (skip) warning = 'Parece un pago o un total';
    else if (noDate) warning = 'Sin fecha: se usa la del resumen';
    out.push({
      date: date || fallbackDate, note: note.slice(0, 80), amount: value,
      categoryId: guessCategory(note, learned), include: !usd && !neg && !skip, warning, raw: line,
    });
  }
  return out;
}
