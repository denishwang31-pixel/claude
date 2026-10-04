/* ============================================================
   앱 오류 기록 — 화면이 하얗게 비는 일을 추측 말고 기록으로 본다

   왜 필요한가 (2026-10-03 앱 주인: "이렇게 뻑날 때가 있네" — 빈 화면 캡처)
     화면을 그리다 오류가 나면 React 는 화면 전체를 내려 버린다. 지금까지는
     그걸 잡는 곳이 없어서 아무 말 없이 하얀 화면만 남았다. 휴대폰 로그를
     볼 방법이 없으니 무엇이 문제였는지도 알 수 없었다.
     → app/_layout.jsx 의 ErrorBoundary 가 잡아서 안내 화면을 띄우고, 여기로 기록을 보낸다.
     → 화면 밖(버튼 처리 등)에서 난 치명적 오류도 setGlobalHandler 로 한 번 남긴다.

   무엇을 남기나 — clientErrors/{자동 id}
     uid · 시각 · 오류 문구(400자) · 스택 앞부분(2000자) · 어디서(boundary/global) · 화면 경로 ·
     앱 버전·업데이트 id·기기 종류. 이메일 같은 것은 문구에서 가린다.
     읽는 것은 앱 관리자만(규칙). 「테니스매치 앱 관리자」 → errors 로 최근 기록을 본다.

   ⚠️ 여기서 다시 오류가 나면 안 된다 — 전부 try 로 감싸고 조용히 끝낸다.
   ⚠️ 같은 오류를 짧은 시간에 여러 번 보내지 않는다(같은 문구는 1분에 한 번).
   ============================================================ */

const MAX_MSG = 400;
const MAX_STACK = 2000;
const maskEmail = (s) => String(s || '').replace(/([A-Za-z0-9._%+-]{1,2})[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+)/g, '$1***@$2');

/** 보낼 내용 만들기 (순수 함수 — 검사가 본다) */
export function crashPayload(error, { uid = '', where = '', path = '', app = {} } = {}) {
  const e = error || {};
  const message = maskEmail(String(e.message || e || '알 수 없는 오류')).slice(0, MAX_MSG);
  const stack = maskEmail(String(e.componentStack || e.stack || '')).slice(0, MAX_STACK);
  return {
    uid: String(uid || ''),
    message,
    stack,
    where: String(where || '').slice(0, 40),
    path: String(path || '').slice(0, 120),
    app: {
      version: String(app.version || ''),
      updateId: String(app.updateId || '').slice(0, 40),
      platform: String(app.platform || ''),
      os: String(app.os || '').slice(0, 20),
    },
  };
}

const recent = new Map();     // 문구 → 마지막으로 보낸 시각
let currentPath = '';
export const setCrashPath = (p) => {
  const next = String(p || '');
  if (next !== currentPath) breadcrumb(`화면 ${next}`);
  currentPath = next;
};

/* ============================================================
   갑자기 꺼짐 감지 — 오류 기록조차 못 남기고 앱이 죽을 때

   2026-10-04: 대회 화면에서 스크롤만 하다 하얀 화면과 함께 앱이 꺼졌는데 errors 에
   아무것도 없었다. 자바스크립트 오류라면 global 처리기가 남겼을 것이라, 휴대폰(네이티브) 쪽에서
   앱이 통째로 죽은 것으로 본다. 그때는 이 파일의 어떤 코드도 돌 틈이 없다.
   그래서 '켜져 있음'을 파일에 적어 두고, 정상적으로 뒤로 가면(백그라운드) '꺼짐'으로 고친다.
   다음에 켰을 때 '켜져 있음'이 그대로면 지난번에 갑자기 죽은 것 — 마지막 화면과 마지막 동작
   (breadcrumb)을 clientErrors 에 where 'last-run' 으로 남긴다.
   ⚠️ breadcrumb 에는 화면 경로·동작 이름만 — 회원 이름 같은 개인 정보는 넣지 않는다(공개 로그로 본다).
   ============================================================ */
const CRUMB_MAX = 25;
let crumbs = [];
let fsMod = null;
let runFile = '';
let histFile = '';
const sessionStart = Date.now();
/* 지난 실행 몇 개를 남겨 둔다 — 하얀 화면 뒤 '화면 문제 알리기'로 보낸다(아래 sendRecentSessions).
   2026-10-04: 하얀 화면이 난 실행은 정상 종료(백그라운드)로 끝나 '갑자기 꺼짐'에 안 잡혔다 —
   자바스크립트는 살아 있었다는 뜻. 그 실행의 동작 기록을 사람이 보내 줘야 볼 수 있다. */
const HIST_MAX = 8;
let writing = null;

/* ⚠️ 지난 실행 기록은 이번 실행이 처음 쓰기 '전에' 읽어 둔다.
   2026-10-04 버그: 켜자마자 이번 실행의 첫 기록(breadcrumb)이 먼저 써지면, checkLastRun 이 그걸
   '지난 실행'으로 읽었다 — 진짜 지난 실행(하얀 화면이 난 실행)은 읽기도 전에 덮어써져 사라졌다.
   그래서 '지난 실행'이 늘 첫 줄 하나뿐(시작=끝)이었고, 거짓 '갑자기 꺼짐'도 이 때문이었다.
   이제 모든 쓰기는 이 읽기가 끝난 뒤에 줄을 선다. */
let prevRun = null;
let readPrev = null;
function startReadPrev() {
  if (!readPrev) {
    readPrev = (async () => {
      try {
        const F = await loadFs();
        if (!F || !runFile) return;
        const info = await F.getInfoAsync(runFile);
        if (info?.exists) prevRun = JSON.parse(await F.readAsStringAsync(runFile));
      } catch (e) { prevRun = null; }
    })();
  }
  return readPrev;
}
const hhmmss = () => { const d = new Date(); return [d.getHours(), d.getMinutes(), d.getSeconds()].map((x) => String(x).padStart(2, '0')).join(':'); };

async function loadFs() {
  if (fsMod) return fsMod;
  try {
    fsMod = await import('expo-file-system/legacy');
    runFile = fsMod?.documentDirectory ? `${fsMod.documentDirectory}run-state.json` : '';
    histFile = fsMod?.documentDirectory ? `${fsMod.documentDirectory}run-history.json` : '';
  } catch (e) { fsMod = null; }
  return fsMod;
}
let restartMark = null;   // 스스로 다시 시작할 때 남기는 표시(아래 markRestart)
function writeRun(running) {
  const body = JSON.stringify({ running, at: Date.now(), startedAt: sessionStart, path: currentPath, crumbs, ...(restartMark || {}) });
  if (!writing) writing = startReadPrev();
  writing = writing.then(async () => {
    try {
      const F = await loadFs();
      if (F && runFile) await F.writeAsStringAsync(runFile, body);
    } catch (e) { /* 못 적어도 그대로 */ }
  });
  return writing;
}

/** 마지막 동작 남기기 — 화면 이동·버튼 처리(guard)·대진표 버튼 등 */
export function breadcrumb(text) {
  try {
    crumbs.push(`${hhmmss()} ${String(text || '').slice(0, 80)}`);
    if (crumbs.length > CRUMB_MAX) crumbs = crumbs.slice(-CRUMB_MAX);
    writeRun(true);
  } catch (e) { /* 그대로 */ }
}

/** 지금 실행의 최근 동작 기록(보낼 때 그대로 붙인다) */
export const recentCrumbs = () => crumbs.join('\n').slice(-1990);

/** 정상적으로 끝남 — 백그라운드로 갈 때, 업데이트 적용(reloadAsync) 직전에 */
let appActive = true;
export function markCleanExit() { appActive = false; return writeRun(false); }
export function markRunning() { appActive = true; lastTick = Date.now(); return writeRun(true); }

/** 앱이 스스로 다시 시작하기 직전 — 왜 그랬는지 적어 둔다.
 *  pending 이면 지금 보내지 못한 것 — 다음 실행이 켜지자마자 대신 보낸다(checkLastRun). */
export function markRestart(why, pending) {
  appActive = false;
  restartMark = { restart: String(why || ''), restartAt: Date.now(), pending: !!pending };
  return writeRun(false);
}

/** 바로 전 실행이 2분 안에 스스로 다시 시작한 것이면 true — 다시 시작이 끝없이 되풀이되지 않게 */
export function restartedJustNow() {
  const at = Number(prevRun?.restartAt || 0);
  return !!prevRun?.restart && at > 0 && Date.now() - at < 2 * 60 * 1000;
}

/* ============================================================
   DB(Firestore) 라이브러리 내부 고장 — 2026-10-04 하얀 화면의 진짜 원인

   기록: 23:24:43 화면 /(tabs) → 23:24:44 오류 화면 "FIRESTORE (10.14.1) INTERNAL ASSERTION FAILED: Unexpected state".
   Firebase 라이브러리 자체의 버그다 — 구독(대회·일정 같은 화면이 데이터를 지켜보는 것)을 끊고
   곧바로 다시 걸 때 서버 응답이 엉켜 라이브러리가 스스로 멈춘다(Firebase 12.13 에서 고쳐짐 —
   firestore 4.14.1 "ca9 ... target creation race condition"). 그래서 firebase 를 12 로 올렸다.
   한 번 멈추면 그 실행 안에서는 DB 를 더 쓸 수 없다(읽기·쓰기·오류 기록까지 전부) — 화면이 하얗게 남는다.
   올린 뒤에도 같은 일이 생기면 갇혀 있지 않게, 알아차리는 즉시 앱을 다시 띄운다(app/_layout.jsx).
   ============================================================ */
export const isDbBroken = (e) => /INTERNAL ASSERTION FAILED|INTERNAL UNHANDLED ERROR|AsyncQueue is already failed/i
  .test(String(e?.message || e || ''));
/** 기록에 남길 짧은 모양 — 'FAILED:' 뒤만, 100자까지 */
export const dbBrokenText = (e) => String(e?.message || e || '').replace(/^[\s\S]*?FAILED:\s*/, '').slice(0, 100);

let dbFatalHook = null;
let dbFatalSeen = false;
/** DB 가 고장 났을 때 부를 것을 정한다(한 실행에 한 번만 부른다) */
export function setDbFatalHook(fn) { dbFatalHook = fn; }
function dbFatal(e) {
  if (dbFatalSeen) return;
  dbFatalSeen = true;
  breadcrumb(`DB 내부 오류 ${dbBrokenText(e)}`);
  try { dbFatalHook?.(e); } catch (x) { /* 그대로 */ }
}
/** 라이브러리가 고장을 '알리는' 순간을 듣는다 — 화면이 하얘지기 전에 */
export async function watchDbFatal() {
  try {
    const { onLog } = await import('firebase/app');
    onLog((ev) => { if (isDbBroken(ev?.message)) dbFatal(ev.message); }, { level: 'error' });
  } catch (e) { /* 못 들어도 아래 처리기·ErrorBoundary 가 잡는다 */ }
}
export const reportDbFatal = (e) => { if (isDbBroken(e)) dbFatal(e); return isDbBroken(e); };

/* ============================================================
   화면 멈춤 감지 — 앱은 살아 있는데 화면이 하얗고 뒤로가기가 안 먹을 때

   2026-10-04 앱 주인: "아무것도 안 눌렀는데 화면이 하얗게, 앱은 안 꺼지고 뒤로가기도 안 먹는다".
   뒤로가기는 자바스크립트가 처리하므로, 자바스크립트가 무언가에 묶여 멈춘 것으로 본다.
   1초마다 시계를 보고, 앞 시계와 2.5초 넘게 벌어졌으면(그동안 멈춰 있었으면) 몇 초 멈췄는지와
   마지막 동작을 where 'stall' 로 남긴다. 멈춘 채 앱을 닫으면 다음에 켤 때 'last-run' 으로 남는다.
   ⚠️ 백그라운드에서는 시계가 서므로 그동안은 세지 않는다(appActive).
   ============================================================ */
let lastTick = Date.now();
let stallTimer = null;
export function startStallWatch() {
  if (stallTimer) return;
  lastTick = Date.now();
  stallTimer = setInterval(() => {
    const now = Date.now();
    const gap = now - lastTick - 1000;
    lastTick = now;
    if (!appActive || gap < 2500) return;
    const sec = Math.round(gap / 100) / 10;
    breadcrumb(`화면 멈춤 ${sec}초`);
    reportCrash({
      message: `화면 멈춤 ${sec}초 — 화면 ${currentPath}`,
      stack: crumbs.join('\n').slice(-1990),
    }, { where: 'stall' });
  }, 1000);
}

/**
 * 사용자가 '화면 문제 알리기'를 누르면 — 지난 실행 최대 3개의 동작 기록을 보낸다(where 'user-report').
 * @returns true 면 보냄
 */
export async function sendRecentSessions() {
  try {
    const F = await loadFs();
    if (!F || !histFile) return false;
    const hi = await F.getInfoAsync(histFile);
    if (!hi?.exists) return false;
    const hist = JSON.parse(await F.readAsStringAsync(histFile)) || [];
    if (!hist.length) return false;
    const t = (ms) => { const d = new Date(Number(ms || 0)); return [d.getHours(), d.getMinutes(), d.getSeconds()].map((x) => String(x).padStart(2, '0')).join(':'); };
    /* 최근 것부터 — 보낼 수 있는 길이(2000자)를 넘으면 오래된 실행이 잘린다 */
    const text = [...hist].reverse().map((h, i) => [
      `── ${i + 1}번째 전 실행 · ${t(h.startedAt)}~${t(h.at)} · ${h.running ? '갑자기 끝남' : '정상 종료(뒤로 감)'} · 마지막 화면 ${h.path || '?'}`,
      ...(h.crumbs || []),
    ].join('\n')).join('\n');
    return await reportCrash({
      message: `사용자가 알린 화면 문제 — ${t(Date.now())}`,
      stack: text.slice(0, 1990),
    }, { where: 'user-report', path: hist[hist.length - 1]?.path || '' });
  } catch (e) {
    return false;
  }
}

/** 화면 그리기가 오래 걸렸으면 동작 기록에 남긴다(멈춤 기록과 함께 보면 무엇이 무거운지 보인다) */
export function slowRender(name, ms, extra = '') {
  if (ms >= 700) breadcrumb(`느린 그리기 ${name} ${Math.round(ms)}ms${extra ? ` ${extra}` : ''}`);
}

/** 앱을 켤 때 — 지난번이 갑자기 끝났으면 로그인된 뒤에 한 번 남긴다 */
export async function checkLastRun() {
  try {
    const F = await loadFs();
    if (!F || !runFile) return;
    await startReadPrev();
    /* 혹시라도 이번 실행 것이면(시작 시각이 같다) 지난 실행이 아니다 */
    const last = prevRun && Number(prevRun.startedAt) !== sessionStart ? prevRun : null;
    /* 지난 실행을 기록 묶음에 더해 둔다(최근 8개) */
    if (last && histFile) {
      let hist = [];
      try {
        const hi = await F.getInfoAsync(histFile);
        if (hi?.exists) hist = JSON.parse(await F.readAsStringAsync(histFile)) || [];
      } catch (e) { hist = []; }
      /* ⚠️ 켜자마자 닫은 실행(업데이트 받느라 껐다 켜기)은 담지 않는다 — 그런 실행 셋이
         정작 하얀 화면 난 실행을 밀어냈다(2026-10-04 '화면 문제 알리기'에 짧은 실행만 셋) */
      const livedMs = Number(last.at || 0) - Number(last.startedAt || last.at || 0);
      const trivial = livedMs < 20000 && (last.crumbs || []).length <= 2;
      if (!trivial) hist = [...(Array.isArray(hist) ? hist : []), last].slice(-HIST_MAX);
      try { await F.writeAsStringAsync(histFile, JSON.stringify(hist)); } catch (e) { /* 그대로 */ }
    }
    await writeRun(true);
    /* 지난 실행이 스스로 다시 시작했는데 그때 못 보낸 기록 — 지금 보낸다 */
    if (last?.restart && last.pending) {
      await whenSignedIn(() => reportCrash({
        message: `자동 다시 시작(지난 실행): ${last.restart}`,
        stack: (last.crumbs || []).join('\n').slice(-1990),
      }, { where: 'recover', path: last.path || '' }));
      return;
    }
    if (!last?.running) return;
    /* ⚠️ 켜자마자(20초 안) 닫은 실행은 세지 않는다 — 업데이트를 받으려고 껐다 켜는 일이 잦다.
       그때는 시작 기록 하나뿐이라, 이걸 '갑자기 꺼짐'으로 올리면 거짓 경보만 쌓였다(2026-10-04 6건). */
    const lived = Number(last.at || 0) - Number(last.startedAt || last.at || 0);
    if (lived < 20000 && (last.crumbs || []).length <= 2) return;
    if (Date.now() - Number(last.at || 0) > 3 * 24 * 3600 * 1000) return;
    const when = new Date(Number(last.at || 0) + 9 * 3600 * 1000).toISOString().slice(5, 16).replace('T', ' ');
    const err = {
      message: `앱이 갑자기 꺼짐(지난 실행 · ${when} KST) — 마지막 화면 ${last.path || '?'}`,
      stack: (last.crumbs || []).join('\n').slice(-1990),   // 넘치면 오래된 것부터 버린다 — 마지막 동작이 중요하다
    };
    await whenSignedIn(() => reportCrash(err, { where: 'last-run', path: last.path || '' }));
  } catch (e) { /* 그대로 */ }
}

/* 켜자마자는 로그인 전이다 — 로그인될 때까지 잠깐씩 기다렸다가 보낸다(최대 1분) */
async function whenSignedIn(fn) {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((r) => setTimeout(r, 3000));
    const { auth } = await import('../../firebaseConfig');
    if (auth?.currentUser?.uid) { await fn(); return; }
  }
}

async function appInfo() {
  const out = { version: '', updateId: '', platform: '', os: '' };
  try {
    const RN = await import('react-native');
    out.platform = RN.Platform?.OS || '';
    out.os = String(RN.Platform?.Version ?? '');
  } catch (e) { /* 없으면 빈칸 */ }
  try {
    const Constants = (await import('expo-constants')).default;
    out.version = Constants?.expoConfig?.version || '';
  } catch (e) { /* 없으면 빈칸 */ }
  try {
    const U = await import('expo-updates');
    out.updateId = U.updateId || '';
  } catch (e) { /* 없으면 빈칸 */ }
  return out;
}

/** 오류 하나 보내기 — 실패해도 아무 일 없다 */
export async function reportCrash(error, { where = '', path = null } = {}) {
  try {
    const key = String(error?.message || error || '').slice(0, 120);
    const now = Date.now();
    if (recent.has(key) && now - recent.get(key) < 60 * 1000) return;
    recent.set(key, now);
    const [{ auth, db }, { collection, addDoc, serverTimestamp }] = await Promise.all([
      import('../../firebaseConfig'),
      import('firebase/firestore'),
    ]);
    const uid = auth?.currentUser?.uid;
    if (!uid) return;                       // 규칙상 로그인한 사람만 남길 수 있다
    const body = crashPayload(error, { uid, where, path: path ?? currentPath, app: await appInfo() });
    await addDoc(collection(db, 'clientErrors'), { ...body, at: serverTimestamp() });
    return true;
  } catch (e) {
    /* 기록이 실패해도 앱은 그대로 */
    return false;
  }
}

/** 화면 밖에서 난 치명적 오류도 한 번 남긴다 — 원래 처리기는 그대로 부른다.
    ⚠️ 원래 처리기는 앱을 바로 내린다. 그 전에 기록이 서버에 닿을 틈을 준다(최대 2초).
       2026-10-04: 3팀 청백전 [대진 다시 작성]에서 앱이 꺼졌는데 기록이 남지 않았다 —
       기록을 보내는 중에 앱이 먼저 내려간 것으로 본다. */
let installed = false;
export function installCrashHandler() {
  if (installed) return;
  installed = true;
  try {
    const EU = global.ErrorUtils;
    if (!EU?.setGlobalHandler) return;
    const prev = EU.getGlobalHandler?.();
    EU.setGlobalHandler((error, isFatal) => {
      const pass = () => { if (typeof prev === 'function') prev(error, isFatal); };
      if (!isFatal) { pass(); return; }
      /* DB 라이브러리 고장이면 앱을 내리지 않고 다시 띄운다(setDbFatalHook) */
      if (dbFatalHook && isDbBroken(error)) { dbFatal(error); return; }
      breadcrumb(`치명적 오류 ${String(error?.message || '').slice(0, 60)}`);
      let done = false;
      const once = () => { if (!done) { done = true; pass(); } };
      reportCrash(error, { where: 'global' }).then(once, once);
      setTimeout(once, 2000);
    });
  } catch (e) { /* 없으면 넘어간다 */ }
}

/**
 * 버튼·알림창 처리를 감싼다 — 그 안에서 오류가 나도 앱이 꺼지지 않게.
 * 화면을 그리는 중의 오류는 ErrorBoundary 가 잡지만, 버튼을 누른 뒤의 오류는
 * 잡는 곳이 없어 곧장 앱이 내려간다. 여기서 받아 기록하고(where 로 어디서 났는지),
 * onFail 로 화면에 짧게 알린다.
 */
export function guard(fn, where, onFail) {
  return (...args) => {
    breadcrumb(`동작 ${where}`);
    const fail = (e) => {
      reportCrash(e, { where });
      try { onFail?.(e); } catch (x) { /* 알리기가 실패해도 그대로 */ }
    };
    try {
      const r = fn(...args);
      if (r && typeof r.then === 'function') return r.then(undefined, (e) => { fail(e); return undefined; });
      return r;
    } catch (e) {
      fail(e);
      return undefined;
    }
  };
}

/**
 * 알림창 버튼을 누른 뒤 또 알림창을 띄울 때 — 앞 창이 닫힐 틈을 두고 연다.
 * ⚠️ 안드로이드는 닫히는 중인 창 위에 곧바로 새 창을 열면 앱이 통째로 꺼질 수 있다
 *    (선택 시트·알림창 모두). 그래서 한 박자 늦게, 그리고 guard 로 감싸서 연다.
 */
export const ALERT_GAP_MS = 350;
export function later(fn, where = 'later', onFail) {
  setTimeout(guard(fn, where, onFail), ALERT_GAP_MS);
}

export default {
  isDbBroken, dbBrokenText, setDbFatalHook, watchDbFatal, reportDbFatal, markRestart, restartedJustNow,
  crashPayload, reportCrash, installCrashHandler, setCrashPath, guard, later,
  breadcrumb, markCleanExit, markRunning, checkLastRun, startStallWatch, slowRender, sendRecentSessions, recentCrumbs,
};
