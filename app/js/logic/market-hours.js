// Horario del mercado (BYMA, como se opera en Cocos), feriados y avisos de apertura/cierre.
// Lógica pura: la usan la app y el robot.
// Fuentes: estado en vivo de BYMA (open.bymadata.com.ar, "¿el mercado está abierto ahora?") y
// feriados nacionales (api.argentinadatos.com). El estado en vivo detecta también cierres especiales
// que no figuran en el calendario (por ejemplo, días sin actividad anunciados por BYMA).

// Horarios de negociación. Si cambian, agregar una fila arriba con la fecha desde la que rigen.
//   equityClose: acciones y CEDEARs a 24 hs.
//   fixedClose:  contado inmediato, cauciones y bonos/ONs.
// Fuentes: BYMA Comunicado 19024 y ayuda de Cocos ("Horarios de Mercado").
export const HOURS = [
  { from: '2026-11-02', open: '10:30', equityClose: '18:00', fixedClose: '17:00', source: 'BYMA Comunicado 19024 / Cocos' },
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

/** Texto corto con lo que se puede operar y hasta cuándo. */
export const scheduleText = h =>
  `Acciones y CEDEARs a 24 hs hasta las ${h.equityClose}. Contado inmediato, cauciones y bonos hasta las ${h.fixedClose}.`;

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
  if (now.minutes < open) return { state: 'pre', label: `Abre hoy a las ${h.open}`, sub: scheduleText(h), hours: h };
  if (now.minutes >= close) return { state: 'closed', label: 'Cerrado por hoy', sub: reopen, hours: h };
  if (liveOpen === false) return { state: 'closed', label: 'Hoy no hay operaciones', sub: 'BYMA informa el mercado cerrado aunque no es feriado', hours: h };
  const left = close - now.minutes;
  return {
    state: 'open', label: `Abierto · acciones y CEDEARs hasta las ${h.equityClose}`,
    sub: now.minutes < fixed
      ? `Contado inmediato, cauciones y bonos hasta las ${h.fixedClose}`
      : `Contado inmediato, cauciones y bonos ya cerraron · faltan ${left} min`,
    hours: h, minutesLeft: left,
  };
}

/* ---------- Avisos de apertura y cierre (robot) ---------- */
/**
 * @param {object} o
 * @param {boolean} [o.fixedAlert] avisar también 1 hora antes del cierre de contado inmediato, cauciones y bonos (17:00)
 * @returns {{ key, title, body }[]} avisos que corresponden ahora (sin los ya enviados)
 */
export function hourEvents({ now = arNow(), holidays = [], liveOpen = null, fixedAlert = false, holdsFixed, logged = new Set() }) {
  fixedAlert = fixedAlert || !!holdsFixed;
  const out = [];
  const add = e => { if (!logged.has(e.key)) out.push(e); };
  const d = now.date, m = now.minutes;
  if ([0, 6].includes(weekday(d))) return out;
  const h = hoursFor(d);
  const open = toMin(h.open), close = toMin(h.equityClose), fixed = toMin(h.fixedClose);
  const hol = holidayOn(d, holidays);
  const next = nextTradingDay(d, holidays);

  if (hol) {
    if (m >= 7 * 60) add({ key: `mkt-holiday|${d}`, title: 'Hoy no se opera en Cocos', body: `Feriado: ${hol.nombre}. El mercado vuelve a abrir ${dayName(next, d)} a las ${h.open}.` });
    return out;
  }
  const isOpen = liveOpen ?? (m >= open && m < close); // si no se pudo consultar a BYMA, se usa el horario
  if (liveOpen === true && m >= open && m < Math.min(close, open + 120)) {
    add({ key: `mkt-open|${d}`, title: 'Abrió el mercado: ya podés operar en Cocos', body: scheduleText(h) });
  }
  if (liveOpen === false && m >= open + 60 && m < close) {
    add({ key: `mkt-noopen|${d}`, title: 'Hoy el mercado no abrió', body: 'BYMA no tiene operaciones aunque no figura como feriado (puede ser un día sin actividad anunciado por el mercado). Revisá en Cocos antes de operar.' });
  }
  // Si el próximo día hábil "normal" (sin contar fines de semana) es feriado, se avisa: es el último momento para operar.
  let nb = addDays(d, 1);
  while ([0, 6].includes(weekday(nb))) nb = addDays(nb, 1);
  const nbHol = holidayOn(nb, holidays);
  const tomorrowNote = nbHol && next !== nb
    ? ` Ojo: ${nb === addDays(d, 1) ? 'mañana' : dayName(nb, d)} es feriado: ${nbHol.nombre}. El mercado vuelve a abrir ${dayName(next, d)}.`
    : '';
  const leftTxt = left => (left >= 55 ? 'Falta 1 hora' : `Faltan ${left} minutos`);

  // Contado inmediato, cauciones y bonos (17:00): opcional.
  const leftFx = fixed - m;
  if (fixedAlert && fixed < close && isOpen && leftFx >= 25 && leftFx <= 75) {
    add({ key: `mkt-close-fixed|${d}`, title: `${leftFx >= 55 ? 'Falta 1 hora' : `Faltan ${leftFx} minutos`}: cierran contado inmediato, cauciones y bonos`, body: `Cierran a las ${h.fixedClose}. Las acciones y CEDEARs a 24 hs siguen hasta las ${h.equityClose}.${tomorrowNote}` });
  }
  // Acciones y CEDEARs a 24 hs (18:00).
  const leftEq = close - m;
  if (isOpen && leftEq >= 25 && leftEq <= 75) {
    add({ key: `mkt-close|${d}`, title: `${leftTxt(leftEq)} para el cierre del mercado`, body: `Acciones y CEDEARs a 24 hs se operan en Cocos hasta las ${h.equityClose}. Si tenés que hacer alguna operación, es ahora.${tomorrowNote}` });
  }
  return out;
}

export { pad };
