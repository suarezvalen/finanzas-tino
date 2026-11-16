// Radar de noticias: busca titulares sobre tus activos (Google News, en español e inglés) y detecta los que
// pueden mover el precio. Sin IA y sin claves: el análisis de fondo lo hace el informe diario.
// Lógica pura (la usa el robot; no depende del navegador).

/** Nombre con el que se busca cada ticker (empresa o subyacente del CEDEAR). */
export const NAMES = {
  // CEDEARs y acciones de EE.UU.
  AAPL: 'Apple', MSFT: 'Microsoft', NVDA: 'Nvidia', GOOGL: 'Alphabet Google', GOOG: 'Alphabet Google', AMZN: 'Amazon', META: 'Meta Platforms',
  TSLA: 'Tesla', MELI: 'Mercado Libre', NFLX: 'Netflix', AMD: 'AMD', INTC: 'Intel', AVGO: 'Broadcom', TSM: 'TSMC', QCOM: 'Qualcomm',
  KO: 'Coca-Cola', PEP: 'PepsiCo', MCD: "McDonald's", WMT: 'Walmart', DIS: 'Disney', DISN: 'Disney', NKE: 'Nike', SBUX: 'Starbucks',
  JPM: 'JPMorgan', BAC: 'Bank of America', GS: 'Goldman Sachs', V: 'Visa', MA: 'Mastercard', PYPL: 'PayPal', BRKB: 'Berkshire Hathaway',
  XOM: 'ExxonMobil', CVX: 'Chevron', PBR: 'Petrobras', VALE: 'Vale', BABA: 'Alibaba', JD: 'JD.com', BIDU: 'Baidu', NU: 'Nu Holdings',
  UBER: 'Uber', ABNB: 'Airbnb', SHOP: 'Shopify', SPOT: 'Spotify', PLTR: 'Palantir', COIN: 'Coinbase', MSTR: 'MicroStrategy',
  ORCL: 'Oracle', CRM: 'Salesforce', ADBE: 'Adobe', IBM: 'IBM', CSCO: 'Cisco', PFE: 'Pfizer', JNJ: 'Johnson & Johnson', LLY: 'Eli Lilly',
  MRK: 'Merck', ABBV: 'AbbVie', BA: 'Boeing', CAT: 'Caterpillar', GE: 'General Electric', F: 'Ford', GM: 'General Motors', T: 'AT&T',
  SPY: 'S&P 500', QQQ: 'Nasdaq 100', DIA: 'Dow Jones', IWM: 'Russell 2000', EEM: 'mercados emergentes', EWZ: 'Bovespa Brasil',
  GLD: 'oro precio', SLV: 'plata precio', XLE: 'sector energético Wall Street', XLF: 'sector financiero Wall Street', ARKK: 'ARK Innovation',
  // Acciones argentinas
  GGAL: 'Grupo Galicia', YPFD: 'YPF', PAMP: 'Pampa Energía', BMA: 'Banco Macro', BBAR: 'BBVA Argentina', SUPV: 'Supervielle',
  TXAR: 'Ternium Argentina', ALUA: 'Aluar', CEPU: 'Central Puerto', TGSU2: 'Transportadora de Gas del Sur', TGNO4: 'Transportadora de Gas del Norte',
  VIST: 'Vista Energy', LOMA: 'Loma Negra', CRES: 'Cresud', EDN: 'Edenor', TECO2: 'Telecom Argentina', COME: 'Comercial del Plata',
  BYMA: 'Bolsas y Mercados Argentinos', VALO: 'Grupo Valores', MIRG: 'Mirgor', TRAN: 'Transener', CVH: 'Cablevisión Holding', HARG: 'Holcim Argentina',
  METR: 'Metrogas', IRSA: 'IRSA', AGRO: 'Agrometal', MOLI: 'Molinos Río de la Plata', BHIP: 'Banco Hipotecario',
  // Bonos (noticias macro)
  AL30: 'bonos argentinos', GD30: 'bonos argentinos', AL35: 'bonos argentinos', GD35: 'bonos argentinos', AE38: 'bonos argentinos', GD41: 'bonos argentinos',
  // Cripto
  BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', BNB: 'Binance Coin', XRP: 'XRP Ripple', ADA: 'Cardano', DOGE: 'Dogecoin',
};
export const newsName = h => h.newsName || NAMES[String(h.ticker).toUpperCase()] || String(h.ticker).toUpperCase();

/* ---------- Lectura de noticias ---------- */
const decode = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim();
const tag = (it, t) => decode((it.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1] || '');
const FEEDS = [['es', 'hl=es-419&gl=AR&ceid=AR:es-419'], ['en', 'hl=en-US&gl=US&ceid=US:en']];

/** Titulares recientes sobre un nombre: [{ title, link, date (ISO), source, lang }] */
export async function fetchNews(name, { days = 1, langs = ['es', 'en'] } = {}) {
  const out = [];
  await Promise.all(FEEDS.filter(([l]) => langs.includes(l)).map(async ([lang, loc]) => {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`"${name}" when:${days}d`)}&${loc}`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (finanzas-tino)' }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) return;
      const xml = await res.text();
      for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
        const it = m[1];
        const source = tag(it, 'source');
        let title = tag(it, 'title');
        if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
        const d = new Date(tag(it, 'pubDate'));
        if (!title || Number.isNaN(+d)) continue;
        out.push({ title, link: tag(it, 'link'), date: d.toISOString(), source, lang });
      }
    } catch { /* si una fuente falla, sigue la otra */ }
  }));
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/* ---------- ¿Es importante? ---------- */
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const CATEGORIES = [
  ['Directivos', /\b(ceo|director ejecutivo|presidente ejecutivo|cfo|fundador)\b.*\b(renunci|dimit|despid|salida|deja el cargo|reemplaz|sucesor|vuelve|regres|resign|steps? down|ousted|fired|depart|exit|successor|return|comeback)|\b(renunci|resign|steps? down|ousted)\w*\b.*\b(ceo|cfo|director|chief)\b/],
  ['Escándalo', /\b(escandalo|scandal|amante|affair|acoso|harassment|denuncia|allegation|acusad|accused|misconduct)\b/],
  ['Legal', /\b(demanda (a|contra|colectiva)|demandad|lawsuit|sued|sues|juicio (contra|a)|fraude|fraud|investigan a|investigacion (contra|judicial|penal|de la sec|federal|por)|under investigation|investigations? into|probe|\bsec (charges|sues|investigat)|doj|antimonopolio|antitrust|multa|fined|sancion|sanction|imputad|indicted|arrested|detenid|allanamiento)/],
  ['Resultados', /\b(resultados|balance trimestral|ganancias trimestrales|earnings|quarterly results|guidance|proyecciones|beats? estimates|misses? estimates|supera las estimaciones|por debajo de lo esperado|profit warning|revenue)\b/],
  ['Calificación', /\b(downgrade|upgrade|rebaja (la )?(calificacion|recomendacion)|eleva (la )?(calificacion|recomendacion)|precio objetivo|price target|cuts? to (sell|neutral|hold)|raises? to (buy|overweight)|moody'?s|fitch|s&p global ratings)\b/],
  ['Fusiones', /\b(adquisicion|adquiere|compra de la empresa|fusion|merger|acquisition|acquires?|agrees? to buy|deal to buy|takeover|opa\b|oferta publica|spin-?off|escision)\b/],
  ['Quiebra o deuda', /\b(quiebra|bankruptcy|concurso preventivo|default|cesacion de pagos|reestructuracion de deuda|debt restructuring|chapter 11)\b/],
  ['Movimiento fuerte', /\b(se desplom|desplome|se hund|se dispar|se derrumb|derrumbe|vuela|vuelan|caen? (un |hasta )?\d|suben? (un |hasta )?\d|plunge|plummet|tumble|soar|surge|sink|crash|selloff|sell-off|record high|all-time high|maximo historico|minimo historico)/],
  ['Split o dividendo', /\b(stock split|split de acciones|desdoblamiento|dividendo extraordinario|special dividend|recompra de acciones|buyback|suspende (el )?dividendo|dividend cut)\b/],
  ['Regulación', /\b(prohibe|prohibicion|banned|bans (the|its)|export controls?|controles de exportacion|aranceles?|tariffs?|regulador|regulators?)\b/],
  ['Ciberataque o falla', /\b(hackeo|hack(ed)?|ciberataque|cyberattack|data breach|filtracion de datos|recall|retiro del mercado|falla masiva|outage)\b/],
];
const NOISE = /\b(descuento|reintegr|promo|cupon|beneficio con tarjeta|sorteo|horoscopo|option chain|interactive stock chart|stock price, news, quote|precio de acciones, noticias, cotizacion|\d{4} \d+[.,]\d+ (call|put)|\(\w+\d{6}[cp]\d+\)|how to buy|should you buy|is it time to buy|top \d+ stocks|stocks to buy|acciones para comprar|motley fool|new holdings in|position in|stake in .* (sold|bought|acquired|trimmed|raised)|shares (sold|bought|acquired) by|holdings (raised|lowered|trimmed) by)\b/;

// "Se dispara" o "se desploma" solo cuentan si hablan del precio en el mercado (no del precio de un producto).
const MARKET_CTX = /\b(accion|acciones|shares|stocks?|papeles|cotizacion|bolsa|wall street|merval|nasdaq|mercado|market|bitcoin|cripto|crypto|ether|token)\b|\$\d|%/;

export function classify(title) {
  const t = norm(title);
  if (NOISE.test(t)) return { important: false, tags: [] };
  const tags = CATEGORIES.filter(([l, re]) => re.test(t) && (l !== 'Movimiento fuerte' || MARKET_CTX.test(t))).map(([l]) => l);
  return { important: tags.length > 0, tags };
}

/* ---------- Agrupar la misma noticia de distintos medios ---------- */
const STOP = new Set('de la el los las del en y a que por con para un una su sus se al es lo como mas tras sobre the of to and in on for at is as by with from after its an be has it this que'.split(' '));
const words = s => new Set(norm(s).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)));
export function similar(a, b) {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / Math.min(A.size, B.size);
}
export const newsKey = (ticker, title) => `news|${ticker}|${[...words(title)].slice(0, 8).join('-')}`;

/**
 * ¿El titular habla de este activo? El nombre (o el ticker) tiene que estar en la primera parte del título:
 * si aparece recién al final suele ser una mención al pasar ("…como Nvidia y Apple").
 * @param {string[]} terms nombre y ticker; vacío = no se filtra
 */
export function isAbout(title, terms) {
  if (!terms?.length) return true;
  const t = ` ${norm(title).replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ')} `;
  const cut = Math.max(40, t.length * 0.65);
  return terms.filter(Boolean).some(term => {
    // La palabra más larga del nombre ("Grupo Galicia" → "galicia"), solo letras y números.
    const w = norm(term).replace(/[^a-z0-9 ]+/g, '').split(' ').filter(x => x.length > 1).sort((a, b) => b.length - a.length)[0];
    if (!w) return false;
    const i = t.indexOf(` ${w} `);
    return i >= 0 && i <= cut;
  });
}

/**
 * Noticias importantes y nuevas: agrupa las parecidas, descarta las ya avisadas (por título parecido)
 * y devuelve como mucho `max` por activo, de las más recientes.
 * @param {object[]} items de fetchNews
 * @param {string[]} seenTitles títulos ya avisados de ese activo (no se repite la misma noticia)
 * @param {string[]} seenTags temas ya avisados hoy de ese activo (un aviso por tema por día: "Resultados", "Legal"…)
 */
export function breakingNews(items, { sinceHours = 8, seenTitles = [], seenTags = [], max = 2, now = Date.now(), about = [] } = {}) {
  const fresh = items.filter(x => now - Date.parse(x.date) <= sinceHours * 3600000 && isAbout(x.title, about));
  const picked = [];
  for (const x of fresh) {
    const c = classify(x.title);
    if (!c.important) continue;
    if (seenTitles.some(s => similar(s, x.title) >= 0.5)) continue;
    if (seenTags.includes(c.tags[0])) continue;
    // Misma noticia en otro medio (o en otro idioma: mismo tema el mismo día) → se agrupa.
    const cluster = picked.find(p => similar(p.title, x.title) >= 0.5 || p.tags[0] === c.tags[0]);
    if (cluster) { cluster.count++; continue; }
    picked.push({ ...x, tags: c.tags, count: 1 });
  }
  // Primero lo que más medios repiten (más relevante), después lo más nuevo.
  return picked.sort((a, b) => b.count - a.count || b.date.localeCompare(a.date)).slice(0, max);
}
