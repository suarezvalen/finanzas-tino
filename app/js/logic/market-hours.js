// Horario de BYMA, feriados y avisos de apertura/cierre. Lógica pura: la usan la app y el robot.
// Fuentes: estado en vivo de BYMA (open.bymadata.com.ar, "¿el mercado está abierto ahora?") y
// feriados nacionales (api.argentinadatos.com). El estado en vivo detecta también cierres especiales
// que no figuran en el calendario (por ejemplo, días sin actividad anunciados por BYMA).

// Horarios de negociación. Si BYMA los cambia, agregar una fila arriba con la fecha desde la que rigen.
export const HOURS = [
  { from: '2026-11-02', open: '10:30', equityClose: '18:00', fixedClose: '17:00', source: 'BYMA Comunicado 19024' },
  { from: '2000-01-01', open: '10:30', equityClose: '17:00', fixedClose: '17:00', source: 'BYMA Comunicado 18782' },
];
export const hoursFor = date => HOURS.find(h => date >= h.from);

const toMin = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const pad = n => String(n).padStart(2, '0');
const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** Fecha y hora actual en Argentina. */
export function arNow(d = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

const weekday = date => new Date(`${date}T12:00:00Z`).getUTCDay();
const addDays = (date, n) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const holidayOn = (date, holidays) => holidays.find(h => h.fecha === date) || null;
export const isTradingDay = (date, holidays) => ![0, 6].includes(weekday(date)) && !holidayOn(date, holidays);

export function nextTradingDay(date, holidays) {
  let d = addDays(date, 1);
  for (let i = 0; i < 30 && !isTradingDay(d, holidays); i++) d = addDays(d, 1);
  return d;
}

export function dayName(date, from) {
  if (date === addDays(from, 1)) return 'mañana';
  return `el ${DAYS[weekday(date)]} ${Number(date.slice(8))}/${Number(date.slice(5, 7))}`;
}

/* ---------- Datos en vivo ---------- */
async function getText(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.text();
}
/** ¿BYMA está abierto ahora? true / false, o null si no se pudo saber. */
export async function fetchMarketOpen() {
  try {
    const t = (await getText('https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/market-open')).trim();
    return t === 'true' ? true : t === 'false' ? false : null;
  } catch { return null; }
}
/** Feriados nacionales del año: [{ fecha, nombre, tipo }] */
export async function fetchHolidays(year) {
  try { return JSON.parse(await getText(`https://api.argentinadatos.com/v1/feriados/${year}`)); } catch { return []; }
}

/* ---------- Estado para mostrar en la app ---------- */
export function marketStatus({ now = arNow(), holidays = [], liveOpen = null } = {}) {
  const h = hoursFor(now.date);
  const open = toMin(h.open), close = toMin(h.equityClose), fixed = toMin(h.fixedClose);
  const hol = holidayOn(now.date, holidays);
  const next = nextTradingDay(now.date, holidays);
  const reopen = `Abre ${dayName(next, now.date)} a las ${h.open}`;
  if ([0, 6].includes(weekday(now.date))) return { state: 'closed', label: 'Cerrado (fin de semana)', sub: reopen, hours: h };
  if (hol) return { state: 'holiday', label: `Feriado: ${hol.nombre}`, sub: reopen, hours: h };
  if (now.minutes < open) return { state: 'pre', label: `Abre hoy a las ${h.open}`, sub: `Acciones y CEDEARs hasta las ${h.equityClose}; bonos y cauciones hasta las ${h.fixedClose}`, hours: h };
  if (now.minutes >= close) return { state: 'closed', label: 'Cerrado por hoy', sub: reopen, hours: h };
  if (liveOpen === false) return { state: 'closed', label: 'Hoy no hay operaciones', sub: 'BYMA informa el mercado cerrado aunque no es feriado', hours: h };
  const left = close - now.minutes;
  return {
    state: 'open', label: `Abierto · cierra a las ${h.equityClose}`,
    sub: now.minutes < fixed ? `Bonos y cauciones hasta las ${h.fixedClose}` : `Faltan ${left} min para el cierre`,
    hours: h, minutesLeft: left,
  };
}

/* ---------- Avisos de apertura y cierre (robot) ---------- */
/**
 * @returns {{ key, title, body }[]} avisos que corresponden ahora (sin los ya enviados).
 * holdsFixed: si tenés bonos/ONs, también avisa una hora antes del cierre de renta fija.
 */
export function hourEvents({ now = arNow(), holidays = [], liveOpen = null, holdsFixed = false, logged = new Set() }) {
  const out = [];
  const add = e => { if (!logged.has(e.key)) out.push(e); };
  const d = now.date, m = now.minutes;
  if ([0, 6].includes(weekday(d))) return out;
  const h = hoursFor(d);
  const open = toMin(h.open), close = toMin(h.equityClose), fixed = toMin(h.fixedClose);
  const hol = holidayOn(d, holidays);
  const next = nextTradingDay(d, holidays);

  if (hol) {
    if (m >= 7 * 60) add({ key: `mkt-holiday|${d}`, title: 'Hoy no opera la bolsa', body: `Feriado: ${hol.nombre}. BYMA vuelve a abrir ${dayName(next, d)} a las ${h.open}.` });
    return out;
  }
  const isOpen = liveOpen ?? (m >= open && m < close); // si no se pudo consultar a BYMA, se usa el horario
  if (liveOpen === true && m >= open && m < Math.min(close, open + 120)) {
    add({ key: `mkt-open|${d}`, title: 'Abrió BYMA: ya podés operar', body: `Acciones y CEDEARs hasta las ${h.equityClose}. Bonos y cauciones hasta las ${h.fixedClose}.` });
  }
  if (liveOpen === false && m >= open + 60 && m < close) {
    add({ key: `mkt-noopen|${d}`, title: 'Hoy BYMA no abrió', body: `No hay operaciones aunque no figura como feriado (puede ser un día sin actividad anunciado por el mercado). Revisá en Cocos antes de operar.` });
  }
  // Si el próximo día hábil "normal" (sin contar fines de semana) es feriado, se avisa: es el último momento para operar.
  let nb = addDays(d, 1);
  while ([0, 6].includes(weekday(nb))) nb = addDays(nb, 1);
  const nbHol = holidayOn(nb, holidays);
  const tomorrowNote = nbHol && next !== nb
    ? ` Ojo: ${nb === addDays(d, 1) ? 'mañana' : dayName(nb, d)} es feriado (${nbHol.nombre}); el mercado vuelve a abrir ${dayName(next, d)}.`
    : '';
  const leftEq = close - m;
  if (isOpen && leftEq >= 25 && leftEq <= 75) {
    add({ key: `mkt-close|${d}`, title: `Falta${leftEq > 60 ? '' : 'n'} ${leftEq >= 55 ? '1 hora' : `${leftEq} minutos`} para el cierre`, body: `Acciones y CEDEARs cierran a las ${h.equityClose}. Si tenés que hacer alguna operación, es ahora.${tomorrowNote}` });
  }
  const leftFx = fixed - m;
  if (holdsFixed && fixed < close && isOpen && leftFx >= 25 && leftFx <= 75) {
    add({ key: `mkt-close-fixed|${d}`, title: `Falta${leftFx > 60 ? '' : 'n'} ${leftFx >= 55 ? '1 hora' : `${leftFx} minutos`} para el cierre de bonos`, body: `Bonos, ONs y cauciones cierran a las ${h.fixedClose} (las acciones y CEDEARs siguen hasta las ${h.equityClose}).${tomorrowNote}` });
  }
  return out;
}

export { pad };
