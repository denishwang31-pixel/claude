/* ============================================================
   엑셀(.xlsx) 읽기·쓰기 — 대회 엑셀 업로드에 필요한 만큼만

   2026-10-15 앱 주인: "참석 인원·대진표를 엑셀로 업로드 — 정해진 양식 템플릿 받기 → 그대로 저장해 업로드".
   .xlsx 는 zip 안의 XML 몇 개다. 큰 라이브러리 대신 zip(fflate)과 글자 칸만 읽고 쓴다.
     · 읽기: 시트 이름 → 줄[칸] (글자·숫자). 서식·수식·날짜 계산은 안 한다(값만)
     · 쓰기: 시트 여러 개, 머리줄 굵게, 칸 너비, 머리줄 고정, 드롭다운(성별 등)
   ⚠️ 예전 형식(.xls)과 CSV 는 못 읽는다 — 엑셀에서 「Excel 통합 문서(.xlsx)」로 저장하면 된다.
   ⚠️ 휴대폰(Hermes)·서버·검사(node) 모두에서 돈다 — 기기 기능을 부르지 않는다.
   ============================================================ */
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';

/* ---------------- 공통 ---------------- */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export function xmlText(s) {
  return String(s || '')
    .replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e) => {
      if (e[0] !== '#') return ENT[e];
      const n = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : '';
    })
    /* 엑셀이 글자 안의 제어 문자를 _x000D_ 꼴로 적는다 */
    .replace(/_x([0-9a-fA-F]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}
const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

/** 'B12' → { col: 1, row: 11 } (0부터) */
export function cellRef(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(String(ref || '').toUpperCase());
  if (!m) return null;
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col: col - 1, row: Number(m[2]) - 1 };
}
export function colName(i) {
  let n = i + 1;
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
const attr = (tag, name) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? xmlText(m[1]) : null;
};
/** <t> 글자 모으기 — 읽는 법 안내(rPh, 일본어 후리가나 등)는 뺀다 */
const textOf = (xml) => xmlText((String(xml).replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').match(/<t\b[^>]*>[\s\S]*?<\/t>|<t\b[^>]*\/>/g) || [])
  .map((t) => t.replace(/^<t\b[^>]*>|<\/t>$/g, '').replace(/^<t\b[^>]*\/>$/, '')).join(''));

/* ---------------- 읽기 ---------------- */
export class XlsxError extends Error {}

/** 파일 앞 바이트로 종류 — xlsx 는 zip('PK'), 예전 xls 는 D0 CF 11 E0 */
export function fileKind(u8) {
  if (!u8 || u8.length < 4) return 'empty';
  if (u8[0] === 0x50 && u8[1] === 0x4b) return 'zip';
  if (u8[0] === 0xd0 && u8[1] === 0xcf && u8[2] === 0x11 && u8[3] === 0xe0) return 'xls';
  return 'other';
}

/**
 * xlsx → { 시트이름: [[칸, …], …] } (빈 칸은 '', 숫자는 number)
 * @throws XlsxError — 사람에게 보여 줄 문장
 */
export function readXlsx(u8) {
  const kind = fileKind(u8);
  if (kind === 'xls') throw new XlsxError('예전 엑셀 형식(.xls)입니다. 엑셀에서 「다른 이름으로 저장 → Excel 통합 문서(.xlsx)」로 저장해 올려 주세요.');
  if (kind !== 'zip') throw new XlsxError('엑셀(.xlsx) 파일이 아닙니다. 받은 양식에 적어 .xlsx 로 저장해 올려 주세요.');
  let files;
  try { files = unzipSync(u8); } catch (e) { throw new XlsxError('파일이 깨져 있어 열지 못했습니다. 엑셀에서 다시 저장해 올려 주세요.'); }
  const get = (p) => (files[p] ? strFromU8(files[p]) : null);
  const wb = get('xl/workbook.xml');
  if (!wb) throw new XlsxError('엑셀(.xlsx) 파일이 아닙니다. 받은 양식에 적어 .xlsx 로 저장해 올려 주세요.');

  /* 시트 이름 → 파일 */
  const rels = {};
  (get('xl/_rels/workbook.xml.rels') || '').replace(/<Relationship\b[^>]*>/g, (tag) => {
    const id = attr(tag, 'Id'); const target = attr(tag, 'Target');
    if (id && target) rels[id] = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    return '';
  });
  const shared = [];
  const ss = get('xl/sharedStrings.xml');
  if (ss) (ss.match(/<si\b[\s\S]*?<\/si>|<si\b[^>]*\/>/g) || []).forEach((si) => shared.push(textOf(si)));

  const out = {};
  (wb.match(/<sheet\b[^>]*>/g) || []).forEach((tag) => {
    const name = attr(tag, 'name');
    const rid = attr(tag, 'r:id') ?? (/\s[\w]+:id="([^"]*)"/.exec(tag) || [])[1];
    const xml = get(rels[rid] || '');
    if (!name || !xml) return;
    out[name] = readSheet(xml, shared);
  });
  return out;
}

function readSheet(xml, shared) {
  const rows = [];
  const data = (/<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/.exec(xml) || [])[1] || '';
  let nextRow = 0;
  (data.match(/<row\b[^>]*\/>|<row\b[^>]*>[\s\S]*?<\/row>/g) || []).forEach((rowXml) => {
    const rAttr = Number(attr(rowXml.slice(0, rowXml.indexOf('>') + 1), 'r'));
    const r = Number.isFinite(rAttr) && rAttr > 0 ? rAttr - 1 : nextRow;
    nextRow = r + 1;
    const row = [];
    let nextCol = 0;
    (rowXml.match(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g) || []).forEach((c) => {
      const open = c.slice(0, c.indexOf('>') + 1);
      const ref = cellRef(attr(open, 'r'));
      const col = ref ? ref.col : nextCol;
      nextCol = col + 1;
      const t = attr(open, 't');
      const v = (/<v>([\s\S]*?)<\/v>/.exec(c) || [])[1];
      let val = '';
      if (t === 's') val = shared[Number(v)] ?? '';
      else if (t === 'inlineStr') val = textOf((/<is>([\s\S]*?)<\/is>/.exec(c) || [])[1] || '');
      else if (t === 'str' || t === 'e') val = xmlText(v ?? '');
      else if (t === 'b') val = v === '1';
      else if (v != null && v !== '') { const n = Number(v); val = Number.isFinite(n) ? n : xmlText(v); }
      row[col] = val;
    });
    for (let i = 0; i < row.length; i += 1) if (row[i] === undefined) row[i] = '';
    rows[r] = row;
  });
  for (let i = 0; i < rows.length; i += 1) if (!rows[i]) rows[i] = [];
  return rows;
}

/* ---------------- 쓰기 ---------------- */
/**
 * sheets: [{ name, rows: [[칸…]…], widths?: [글자 수…], header?: true(첫 줄 굵게·고정),
 *            lists?: [{ col, values:[…], from?: 2, to?: 500, strict?: true }] }]
 * @returns Uint8Array (.xlsx)
 */
export function writeXlsx(sheets) {
  const list = (sheets || []).filter((s) => s && s.name);
  const files = {
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http:\/\/schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + list.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')
      + '</Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http:\/\/schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http:\/\/schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + '</Relationships>'),
    'xl/workbook.xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<workbook xmlns="http:\/\/schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http:\/\/schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + '<sheets>' + list.map((s, i) => `<sheet name="${esc(String(s.name).slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets>'
      + '</workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http:\/\/schemas.openxmlformats.org/package/2006/relationships">'
      + list.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http:\/\/schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('')
      + '<Relationship Id="rId' + (list.length + 1) + '" Type="http:\/\/schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
      + '</Relationships>'),
    /* 서식 0 = 보통, 1 = 머리줄(굵게·회색 바탕·테두리), 2 = 안내(줄바꿈) */
    'xl/styles.xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<styleSheet xmlns="http:\/\/schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<fonts count="2"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><sz val="11"/><name val="맑은 고딕"/></font></fonts>'
      + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
      + '<fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/><bgColor indexed="64"/></patternFill></fill></fills>'
      + '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'
      + '<border><left/><right/><top/><bottom style="thin"><color rgb="FF94A3B8"/></bottom><diagonal/></border></borders>'
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
      + '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>'
      + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs>'
      + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
      + '</styleSheet>'),
  };
  list.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s)); });
  return zipSync(files, { level: 6 });
}

function sheetXml({ rows = [], widths = [], header = false, wrap = false, lists = [] }) {
  const cols = widths.length
    ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.max(4, Number(w) || 10)}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const view = header
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  const body = rows.map((row, r) => {
    const style = header && r === 0 ? ' s="1"' : wrap ? ' s="2"' : '';
    const cells = (row || []).map((v, c) => {
      if (v === '' || v == null) return style ? `<c r="${colName(c)}${r + 1}"${style}/>` : '';
      const ref = `${colName(c)}${r + 1}`;
      if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${style}><v>${v}</v></c>`;
      return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    }).join('');
    return `<row r="${r + 1}">${cells}</row>`;
  }).join('');
  const dv = (lists || []).filter((l) => l && (l.values || []).length);
  const dvXml = dv.length
    ? `<dataValidations count="${dv.length}">${dv.map((l) => {
      const range = `${colName(l.col)}${l.from || 2}:${colName(l.col)}${l.to || 500}`;
      const f = `"${l.values.map((x) => String(x).replace(/[",]/g, '')).join(',')}"`;
      return `<dataValidation type="list" allowBlank="1" showErrorMessage="1"${l.strict ? '' : ' errorStyle="warning"'} sqref="${range}"><formula1>${esc(f)}</formula1></dataValidation>`;
    }).join('')}</dataValidations>`
    : '';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http:\/\/schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http:\/\/schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + view + '<sheetFormatPr defaultRowHeight="16.5"/>' + cols + `<sheetData>${body}</sheetData>` + dvXml
    + '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>'
    + '</worksheet>';
}

/* ---------------- base64 (휴대폰 파일 읽기·쓰기) ---------------- */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function base64ToBytes(s) {
  const clean = String(s || '').replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0; let buf = 0; let bits = 0;
  for (let i = 0; i < clean.length; i += 1) {
    buf = (buf << 6) | B64.indexOf(clean[i]);
    bits += 6;
    if (bits >= 8) { bits -= 8; out[o] = (buf >> bits) & 0xff; o += 1; }
  }
  return out.subarray(0, o);
}
export function bytesToBase64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 3) {
    const a = u8[i]; const b = u8[i + 1]; const c = u8[i + 2];
    s += B64[a >> 2] + B64[((a & 3) << 4) | ((b ?? 0) >> 4)]
      + (b === undefined ? '=' : B64[((b & 15) << 2) | ((c ?? 0) >> 6)])
      + (c === undefined ? '=' : B64[c & 63]);
  }
  return s;
}

export default { readXlsx, writeXlsx, fileKind, base64ToBytes, bytesToBase64, cellRef, colName, xmlText, XlsxError };
