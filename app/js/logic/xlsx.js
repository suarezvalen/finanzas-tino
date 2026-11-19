// Generador mínimo de archivos Excel (.xlsx) sin librerías: hojas con formato, totales con fórmulas y gráficos nativos.
//
// buildXlsx({ sheets: [{ name, cols: [anchos], rows: [[celda, …], …], freeze, filter, merges, charts }] }) → Uint8Array
//   celda: null | número | texto | { v, s, f }   (s = estilo, f = fórmula sin '=')
//   estilos: head, money, int, pct, ratio, date, title, bold, tmoney, tint, tpct, tratio, note, tlabel
//   fechas: pasá 'AAAA-MM-DD' con s: 'date' (se guardan como fecha de Excel)
//   gráfico: { type: 'bar' | 'line', title, at: { col, row, w, h }, cat: { sheet, col, from, to, date }, series: [{ name, sheet, col, from, to, color }], yFmt }
//     col es el índice de columna desde 0; from/to son filas de Excel (desde 1).

const STYLE = { head: 1, money: 2, int: 3, pct: 4, ratio: 5, date: 6, title: 7, bold: 8, tmoney: 9, tint: 10, tpct: 11, tratio: 12, note: 13, tlabel: 14, sub: 15 };
const xmlEsc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
export const colName = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const ref = (c, r) => `${colName(c)}${r}`;
const qs = name => `'${String(name).replace(/'/g, "''")}'`;
export const excelDate = ymd => { const [y, m, d] = ymd.split('-').map(Number); return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000; };

function cellXml(v, c, r) {
  if (v == null || v === '') return '';
  const o = typeof v === 'object' ? v : { v };
  const s = o.s ? ` s="${STYLE[o.s] ?? 0}"` : '';
  const at = ref(c, r);
  let val = o.v;
  if (o.s === 'date' && typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) val = excelDate(val.slice(0, 10));
  if (o.f) return `<c r="${at}"${s}><f>${xmlEsc(o.f)}</f>${typeof val === 'number' && Number.isFinite(val) ? `<v>${val}</v>` : ''}</c>`;
  if (typeof val === 'number') return Number.isFinite(val) ? `<c r="${at}"${s}><v>${val}</v></c>` : '';
  if (val == null || val === '') return s ? `<c r="${at}"${s}/>` : '';
  return `<c r="${at}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(val)}</t></is></c>`;
}

function sheetXml(sh, idx, hasDrawing) {
  const rows = sh.rows.map((row, i) => {
    const r = i + 1;
    const cells = row.map((v, c) => cellXml(v, c, r)).join('');
    const ht = sh.heights?.[i] ? ` ht="${sh.heights[i]}" customHeight="1"` : '';
    return `<row r="${r}"${ht}>${cells}</row>`;
  }).join('');
  const maxCol = Math.max(1, ...sh.rows.map(r => r.length));
  const cols = (sh.cols || []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  const freeze = sh.freeze ? `<pane ${sh.freezeCols ? `xSplit="${sh.freezeCols}" ` : ''}ySplit="${sh.freeze}" topLeftCell="${ref(sh.freezeCols || 0, sh.freeze + 1)}" activePane="${sh.freezeCols ? 'bottomRight' : 'bottomLeft'}" state="frozen"/>` : '';
  const filter = sh.filter ? `<autoFilter ref="A${sh.filter}:${ref(maxCol - 1, sh.filterTo || sh.rows.length)}"/>` : '';
  const merges = sh.merges?.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"${idx === 0 ? ' tabSelected="1"' : ''}${sh.noGrid ? ' showGridLines="0"' : ''}>${freeze}</sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${rows}</sheetData>${filter}${merges}
<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>${hasDrawing ? '<drawing r:id="rId1"/>' : ''}
</worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="5"><numFmt numFmtId="164" formatCode="&quot;$ &quot;#,##0;[Red]\\-&quot;$ &quot;#,##0"/><numFmt numFmtId="165" formatCode="0.00"/><numFmt numFmtId="166" formatCode="0.0%"/><numFmt numFmtId="167" formatCode="dd/mm/yyyy"/><numFmt numFmtId="168" formatCode="#,##0"/></numFmts>
<fonts count="6"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="16"/><color rgb="FF0E3A47"/><name val="Calibri"/><family val="2"/></font><font><i/><sz val="10"/><color rgb="FF6B7280"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="12"/><color rgb="FF0E3A47"/><name val="Calibri"/><family val="2"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0E3A47"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE6F4F6"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top style="thin"><color rgb="FF0E3A47"/></top><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="16">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="168" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="168" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="166" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="165" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/* ---------- Gráficos ---------- */
function cacheFor(sheets, { sheet, col, from, to }, kind) {
  const sh = sheets.find(s => s.name === sheet);
  const pts = [];
  for (let r = from; r <= to; r++) {
    let v = sh?.rows[r - 1]?.[col];
    if (v && typeof v === 'object') v = v.s === 'date' && typeof v.v === 'string' ? excelDate(v.v) : v.v;
    pts.push(v);
  }
  const body = pts.map((v, i) => (v == null || v === '' || (kind === 'num' && !Number.isFinite(+v)) ? '' : `<c:pt idx="${i}"><c:v>${xmlEsc(v)}</c:v></c:pt>`)).join('');
  return { n: pts.length, body };
}
const range = ({ sheet, col, from, to }) => `${qs(sheet)}!$${colName(col)}$${from}:$${colName(col)}$${to}`;

function chartXml(sheets, ch) {
  const ax1 = 50010, ax2 = 50020;
  const catC = cacheFor(sheets, ch.cat, ch.cat.date ? 'num' : 'str');
  const cat = ch.cat.date
    ? `<c:cat><c:numRef><c:f>${range(ch.cat)}</c:f><c:numCache><c:formatCode>dd/mm</c:formatCode><c:ptCount val="${catC.n}"/>${catC.body}</c:numCache></c:numRef></c:cat>`
    : `<c:cat><c:strRef><c:f>${range(ch.cat)}</c:f><c:strCache><c:ptCount val="${catC.n}"/>${catC.body}</c:strCache></c:strRef></c:cat>`;
  const sers = ch.series.map((s, i) => {
    const vc = cacheFor(sheets, s, 'num');
    const color = (s.color || '0E7C8C').replace('#', '');
    const sp = ch.type === 'line'
      ? `<c:spPr><a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill>${s.dash ? '<a:prstDash val="dash"/>' : ''}<a:round/></a:ln></c:spPr><c:marker><c:symbol val="none"/></c:marker>`
      : `<c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></c:spPr><c:invertIfNegative val="0"/>`;
    return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${xmlEsc(s.name)}</c:v></c:tx>${sp}${cat}<c:val><c:numRef><c:f>${range(s)}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${vc.n}"/>${vc.body}</c:numCache></c:numRef></c:val>${ch.type === 'line' ? '<c:smooth val="0"/>' : ''}</c:ser>`;
  }).join('');
  const plot = ch.type === 'line'
    ? `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${sers}<c:marker val="1"/><c:axId val="${ax1}"/><c:axId val="${ax2}"/></c:lineChart>`
    : `<c:barChart><c:barDir val="${ch.horizontal ? 'bar' : 'col'}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${sers}<c:gapWidth val="${ch.gap ?? 60}"/><c:axId val="${ax1}"/><c:axId val="${ax2}"/></c:barChart>`;
  const txt = sz => `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}"><a:solidFill><a:srgbClr val="4B5563"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="es-AR"/></a:p></c:txPr>`;
  const catAx = `<c:catAx><c:axId val="${ax1}"/><c:scaling><c:orientation val="${ch.horizontal ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="0"/><c:axPos val="${ch.horizontal ? 'l' : 'b'}"/>${ch.cat.date ? '<c:numFmt formatCode="dd/mm" sourceLinked="0"/>' : ''}<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/><c:spPr><a:ln><a:solidFill><a:srgbClr val="D1D5DB"/></a:solidFill></a:ln></c:spPr>${txt(900)}<c:crossAx val="${ax2}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`;
  const valAx = `<c:valAx><c:axId val="${ax2}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${ch.horizontal ? 'b' : 'l'}"/><c:majorGridlines><c:spPr><a:ln><a:solidFill><a:srgbClr val="E5E7EB"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="${xmlEsc(ch.yFmt || '#,##0')}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${txt(900)}<c:crossAx val="${ax1}"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:roundedCorners val="0"/>
<c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="es-AR" sz="1200" b="1"><a:solidFill><a:srgbClr val="0E3A47"/></a:solidFill></a:rPr><a:t>${xmlEsc(ch.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>
<c:plotArea><c:layout/>${plot}${catAx}${valAx}</c:plotArea>
<c:legend><c:legendPos val="b"/><c:overlay val="0"/>${txt(900)}</c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>
<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="E5E7EB"/></a:solidFill></a:ln></c:spPr>
</c:chartSpace>`;
}

function drawingXml(charts, firstId) {
  const anchors = charts.map((ch, i) => {
    const { col, row, w = 8, h = 16 } = ch.at;
    return `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${col + w}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${row + h}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="Gráfico ${firstId + i}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId${i + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors}</xdr:wsDr>`;
}

/* ---------- Libro ---------- */
export function buildXlsx({ sheets, title = 'Libro', author = 'Finanzas Tino' }) {
  const files = [];
  const add = (name, text) => files.push({ name, data: new TextEncoder().encode(text) });
  const ct = [];
  let chartNo = 0, drawNo = 0;
  sheets.forEach((sh, i) => {
    const charts = sh.charts || [];
    add(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(sh, i, charts.length > 0));
    ct.push(`<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
    if (!charts.length) return;
    drawNo++;
    add(`xl/worksheets/_rels/sheet${i + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${drawNo}.xml"/></Relationships>`);
    add(`xl/drawings/drawing${drawNo}.xml`, drawingXml(charts, chartNo + 1));
    ct.push(`<Override PartName="/xl/drawings/drawing${drawNo}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
    const rels = charts.map((ch, k) => {
      chartNo++;
      add(`xl/charts/chart${chartNo}.xml`, chartXml(sheets, ch));
      ct.push(`<Override PartName="/xl/charts/chart${chartNo}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`);
      return `<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${chartNo}.xml"/>`;
    }).join('');
    add(`xl/drawings/_rels/drawing${drawNo}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`);
  });

  const defined = sheets.map((sh, i) => {
    if (!sh.filter) return '';
    const maxCol = Math.max(1, ...sh.rows.map(r => r.length));
    return `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${xmlEsc(qs(sh.name))}!$A$${sh.filter}:$${colName(maxCol - 1)}$${sh.filterTo || sh.rows.length}</definedName>`;
  }).join('');
  add('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr/><bookViews><workbookView activeTab="0"/></bookViews>
<sheets>${sheets.map((sh, i) => `<sheet name="${xmlEsc(sh.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${defined ? `<definedNames>${defined}</definedNames>` : ''}<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`);
  add('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  add('xl/styles.xml', STYLES);
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  add('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEsc(title)}</dc:title><dc:creator>${xmlEsc(author)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);
  add('docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>${xmlEsc(author)}</Application></Properties>`);
  add('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
  files.unshift({ name: '[Content_Types].xml', data: new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${ct.join('')}</Types>`) });
  return zip(files);
}

/* ---------- ZIP (sin compresión) ---------- */
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

function zip(files) {
  const enc = new TextEncoder();
  const d = new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, crc, true);
    h.setUint32(18, f.data.length, true); h.setUint32(22, f.data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), name, f.data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, time, true); c.setUint16(14, date, true); c.setUint32(16, crc, true); c.setUint32(20, f.data.length, true); c.setUint32(24, f.data.length, true);
    c.setUint16(28, name.length, true); c.setUint16(30, 0, true); c.setUint16(32, 0, true); c.setUint16(34, 0, true); c.setUint16(36, 0, true);
    c.setUint32(38, 0, true); c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(e.buffer)];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of all) { out.set(p, o); o += p.length; }
  return out;
}
