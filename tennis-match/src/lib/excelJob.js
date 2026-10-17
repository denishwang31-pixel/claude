/* ============================================================
   엑셀 작업 링크 — 지금 깔린 앱에서도 엑셀 양식 받기·올리기 (2026-10-17)

   앱 주인: "앱 등록용 빌드 말고 지금 현재에서 적용·확인·사용하게 해 줘".
   휴대폰에서 파일을 고르고 보내는 기능은 새로 설치하는 앱에만 있다. 그래서 파일은 웹(브라우저)에서 다룬다.
     1) 앱(운영진): 양식(.xlsx)을 만들어 clubs/{c}/importJobs/{id} 에 넣고, 그 일감 링크를 보낸다(카톡 나와의 채팅 등)
     2) PC·휴대폰 브라우저에서 링크를 연다: [양식 내려받기] · 고친 파일 [올리기]
        (/excel 페이지 → /api/excel = 서버 함수 excelJob)
     3) 서버는 올린 파일을 읽어 칸 값만 일감 문서에 적는다 — 대회는 건드리지 않는다
     4) 앱이 그 값을 받아 미리 보기를 보여 주고, 운영진이 [이대로 저장]을 눌러야 대회가 바뀐다
   링크(일감 id)를 아는 사람만 쓸 수 있고 3시간 뒤에 닫힌다.
   ⚠️ import 없이 혼자 선다 — 서버(functions/shared)로 복사돼 같은 기준을 쓴다.
   ============================================================ */

export const EXCEL_JOB_HOURS = 3;
export const EXCEL_MAX_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 600;
const MAX_COLS = 20;
const MAX_CELL = 100;
const KEEP = ['안내', '참가자', '대진'];

export const excelUrl = (projectId, clubId, jobId) =>
  `https://${projectId}.web.app/excel?c=${encodeURIComponent(clubId)}&j=${encodeURIComponent(jobId)}`;

export const validId = (s) => /^[A-Za-z0-9_-]{1,64}$/.test(String(s || ''));

/** 일감이 아직 쓸 수 있나 */
export function jobOpen(job, nowMs = Date.now()) {
  if (!job) return { ok: false, message: '링크가 잘못되었거나 지워졌습니다. 앱에서 새 링크를 만들어 주세요.' };
  if (!(Number(job.expiresAt) > nowMs)) return { ok: false, message: '링크 시간이 지났습니다(3시간). 앱에서 새 링크를 만들어 주세요.' };
  return { ok: true };
}

/**
 * 올린 엑셀에서 쓸 시트만 — 참가자·대진(이름 앞뒤 공백 무시). 줄·칸·글자 수를 잘라 문서 한 개에 들어가게
 * @returns { sheets, json } | { error }
 */
export function pickImportSheets(all) {
  const norm = (s) => String(s || '').replace(/\s+/g, '');
  const out = {};
  Object.keys(all || {}).forEach((name) => {
    const k = KEEP.find((x) => x === norm(name));
    if (!k || k === '안내') return;
    out[k] = (all[name] || []).slice(0, MAX_ROWS).map((row) => (row || []).slice(0, MAX_COLS)
      .map((v) => (typeof v === 'number' || typeof v === 'boolean' ? v : String(v ?? '').slice(0, MAX_CELL))));
  });
  if (!out['참가자']) return { error: '「참가자」 시트가 없습니다. 앱에서 받은 양식에 적어 올려 주세요(시트 이름은 바꾸지 마세요).' };
  const json = JSON.stringify(out);
  if (json.length > 800000) return { error: '파일 내용이 너무 많습니다. 양식 파일인지 확인해 주세요.' };
  return { sheets: out, json };
}

/** 내려받을 파일 이름 — 브라우저용(한글은 RFC 5987 로) */
export function attachmentHeader(fileName) {
  const name = String(fileName || '대회_양식.xlsx').replace(/[\r\n"\\]/g, '');
  return `attachment; filename="court-template.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export default { EXCEL_JOB_HOURS, EXCEL_MAX_BYTES, excelUrl, validId, jobOpen, pickImportSheets, attachmentHeader };
