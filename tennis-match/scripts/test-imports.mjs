/* 임포트 검증 — "그 파일이 정말 그걸 내보내는가"

   왜 필요한가
     결산 화면이 열자마자 앱이 죽었다. 원인은 Field 를 pickers 에서
     가져온 것이었는데 pickers 에는 Field 가 없다. 그러면 Field 가
     undefined 가 되고, <Field> 를 그리는 순간 React 가 던진다.

     이런 실수는 번들러가 안 잡는다. expo export 는 성공하고, 그 화면을
     실제로 열어야만 터진다. 그래서 여기서 정적으로 검사한다.

   검사 대상은 프로젝트 안의 상대경로 임포트만. node_modules 는 건드리지 않는다. */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIRS = ['src', 'app'];
const EXTS = ['.js', '.jsx', '.mjs'];

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };

/** 폴더를 훑어 소스 파일 목록을 만든다 */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXTS.includes(extname(p))) out.push(p);
  }
  return out;
}

/** 상대경로 임포트를 실제 파일로 해석 */
function resolveModule(fromFile, spec) {
  const base = resolve(dirname(fromFile), spec);
  const candidates = [
    base,
    ...EXTS.map((e) => base + e),
    ...EXTS.map((e) => join(base, `index${e}`)),
  ];
  return candidates.find((c) => existsSync(c) && statSync(c).isFile()) || null;
}

/** 그 파일이 내보내는 이름들 */
function exportsOf(file) {
  const src = readFileSync(file, 'utf8');
  const names = new Set();

  // export const A / export async function A / export function* A / export class A
  const DECL = /^\s*export\s+(?:async\s+)?(?:const|let|var|function\s*\*?|class)\s+([A-Za-z_$][\w$]*)/gm;
  for (const m of src.matchAll(DECL)) names.add(m[1]);
  // export { A, B as C }
  for (const m of src.matchAll(/^\s*export\s*\{([^}]*)\}/gm)) {
    m[1].split(',').forEach((part) => {
      const t = part.trim();
      if (!t) return;
      const as = t.split(/\s+as\s+/);
      names.add((as[1] || as[0]).trim());
    });
  }
  // export default
  if (/^\s*export\s+default/m.test(src)) names.add('default');
  // export * from './x' — 재수출은 추적하지 않고 통과시킨다
  const hasStar = /^\s*export\s+\*\s+from/m.test(src);

  return { names, hasStar };
}

/** 그 파일이 가져오는 이름들 (상대경로만) */
function importsOf(file) {
  const src = readFileSync(file, 'utf8');
  const out = [];
  for (const m of src.matchAll(/import\s+([^;]*?)\s+from\s+['"](\.[^'"]+)['"]/g)) {
    const clause = m[1].trim();
    const spec = m[2];
    const named = [];
    let hasDefault = false;

    const braces = clause.match(/\{([^}]*)\}/);
    if (braces) {
      braces[1].split(',').forEach((part) => {
        const t = part.trim();
        if (!t) return;
        named.push(t.split(/\s+as\s+/)[0].trim());
      });
    }
    const beforeBrace = clause.split('{')[0].replace(/,$/, '').trim();
    if (beforeBrace && !beforeBrace.startsWith('*')) hasDefault = true;

    out.push({ spec, named, hasDefault });
  }
  return out;
}

const files = SRC_DIRS.flatMap((d) => walk(join(ROOT, d)));
console.log(`[소스 ${files.length}개 검사]`);

let checked = 0;
for (const file of files) {
  const rel = file.slice(ROOT.length + 1);
  for (const imp of importsOf(file)) {
    const target = resolveModule(file, imp.spec);
    ok(!!target, `${rel}: '${imp.spec}' 를 찾을 수 없습니다`);
    if (!target) continue;

    const { names, hasStar } = exportsOf(target);
    const trel = target.slice(ROOT.length + 1);

    if (imp.hasDefault) {
      ok(names.has('default'), `${rel}: '${imp.spec}' 에 default export 가 없습니다`);
    }
    for (const n of imp.named) {
      checked += 1;
      ok(names.has(n) || hasStar,
        `${rel}: '${n}' 은(는) ${trel} 에 없습니다 — 화면을 열면 앱이 죽습니다`);
    }
  }
}

console.log(`[이름 ${checked}개 대조]`);

/* ---- 두 번째 검사: 임포트하지 않고 쓰는 이름 ----

   normalizeRoundMinutes 를 쓰면서 import 를 빠뜨린 적이 있다. 그러면
   그 화면을 열 때 "... is not defined" 로 죽는다. 첫 번째 검사는
   "가져온 것이 있는가"만 봤지 "쓰는 것을 가져왔는가"는 못 봤다.

   src/lib 이 내보내는 이름들을 모아 두고, 각 파일에서 그 이름을
   쓰는데 어디서도 안 가져왔으면 잡는다. */
const libNames = new Map();   // 이름 → 그 이름을 내보내는 파일
for (const f of walk(join(ROOT, 'src/lib'))) {
  for (const n of exportsOf(f).names) {
    if (n !== 'default' && !libNames.has(n)) libNames.set(n, f.slice(ROOT.length + 1));
  }
}

let scanned = 0;
for (const file of files) {
  if (file.includes(`${'/'}src${'/'}lib${'/'}`)) continue;   // 라이브러리끼리는 건너뛴다
  const rel = file.slice(ROOT.length + 1);
  const raw = readFileSync(file, 'utf8');
  /* 주석과 문자열은 실제 사용이 아니다 — 지우고 본다 */
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');

  /* 이 파일이 이미 알고 있는 이름들 — 가져왔거나, 여기서 선언했거나 */
  const known = new Set();
  for (const m of raw.matchAll(/import\s+([^;]*?)\s+from\s+['"][^'"]+['"]/g)) {
    const braces = m[1].match(/\{([^}]*)\}/);
    if (braces) {
      braces[1].split(',').forEach((part) => {
        const t = part.trim();
        if (t) known.add(t.split(/\s+as\s+/).pop().trim());
      });
    }
    const head = m[1].split('{')[0].replace(/,$/, '').trim();
    if (head) known.add(head.replace(/^\*\s+as\s+/, ''));
  }
  for (const m of src.matchAll(/(?:const|let|var|function\s*\*?|class)\s+([A-Za-z_$][\w$]*)/g)) {
    known.add(m[1]);
  }
  /* 객체 구조분해 — const { a, b } = ... , 함수 파라미터 ({ a, b }) 포함 */
  for (const m of src.matchAll(/\{([^{}]*)\}\s*(?:=[^=>]|=>|\))/g)) {
    m[1].split(',').forEach((part) => {
      const t = part.split(':').pop().split('=')[0].trim().replace(/^\.\.\./, '');
      if (/^[A-Za-z_$][\w$]*$/.test(t)) known.add(t);
    });
  }
  /* 배열 구조분해 — const [a, setA] = useState(...) */
  for (const m of src.matchAll(/(?:const|let|var)\s*\[([^\]]*)\]\s*=/g)) {
    m[1].split(',').forEach((part) => {
      const t = part.split('=')[0].trim().replace(/^\.\.\./, '');
      if (/^[A-Za-z_$][\w$]*$/.test(t)) known.add(t);
    });
  }

  for (const [name, from] of libNames) {
    if (known.has(name)) continue;
    // 식별자 단독으로 쓰였는지 (점 뒤에 붙은 속성명은 제외)
    const used = new RegExp(`(^|[^.\\w$])${name}\\s*[(<,);.\\]}]`).test(src);
    if (!used) continue;
    scanned += 1;
    ok(false, `${rel}: '${name}' 를 쓰는데 import 가 없습니다 (${from}) — 화면을 열면 앱이 죽습니다`);
  }
}
console.log('[가져오지 않고 쓰는 이름 검사]');

/* ============================================================
   선언 전에 쓰는 값 — 화면이 열리자마자 죽는다

   const 는 선언 줄보다 먼저 읽으면 예외를 던진다(TDZ). 화면 그리는
   중에 그런 일이 생기면 그 탭은 열리는 즉시 앱이 죽는다.

   실제로 겪었다: drawDiff 의 useMemo 가 matches 를 읽는데, matches 는
   그보다 100줄 아래 "화면" 구역에서 선언돼 있었다. 번들 빌드도,
   임포트 검사도 이걸 못 잡는다 — 문법은 멀쩡하기 때문이다.

   여기서는 훅의 의존성 배열만 본다. 의존성 배열은 화면을 그릴 때마다
   반드시 평가되므로, 거기 적힌 이름이 아직 선언되지 않았다면 100%
   버그다. (콜백 "안"에서 쓰는 것은 나중에 실행되므로 정상일 수 있어
   건드리지 않는다 — 헛경보를 만들지 않기 위해서다)
   ============================================================ */
/* 주석과 문자열 속 글자는 코드가 아니다. 지워야 괄호 세기가 맞는다.
   줄 번호는 그대로 세야 하므로 줄바꿈만 남기고 공백으로 바꾼다. */
function blankNonCode(raw) {
  const out = raw.split('');
  let i = 0;
  const blank = (from, to) => {
    for (let k = from; k < to && k < out.length; k += 1) {
      if (out[k] !== '\n') out[k] = ' ';
    }
  };
  while (i < raw.length) {
    const c = raw[i];
    const next = raw[i + 1];
    if (c === '/' && next === '*') {
      const end = raw.indexOf('*/', i + 2);
      const stop = end === -1 ? raw.length : end + 2;
      blank(i, stop); i = stop; continue;
    }
    if (c === '/' && next === '/') {
      let end = raw.indexOf('\n', i);
      if (end === -1) end = raw.length;
      blank(i, end); i = end; continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let k = i + 1;
      while (k < raw.length) {
        if (raw[k] === '\\') { k += 2; continue; }
        if (raw[k] === c) break;
        k += 1;
      }
      blank(i, k + 1); i = k + 1; continue;
    }
    i += 1;
  }
  return out.join('');
}

console.log('[선언 전에 쓰는 값 검사]');
for (const file of files) {
  const rel = file.slice(ROOT.length + 1);
  const src = blankNonCode(readFileSync(file, 'utf8'));
  const lineOf = (idx) => src.slice(0, idx).split('\n').length; // 1부터

  /* 한 파일 안에 컴포넌트가 여럿이면 같은 이름이 서로 다른 것을 뜻한다.
     (MatchList 의 매개변수 items 와 ClubMatchScreen 의 상태 items 는 남남)
     그래서 이름을 파일 단위로 모으면 헛경보가 난다. 맨 바깥 함수마다
     구역을 나누고, 같은 구역 안에서만 선언/사용을 견준다. */
  const lineStart = [0];
  for (let k = 0; k < src.length; k += 1) if (src[k] === '\n') lineStart.push(k + 1);
  const spans = [];
  lineStart.forEach((s) => {
    if (!/^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\b|const\s+[A-Za-z_$][\w$]*\s*=)/
      .test(src.slice(s, s + 80))) return;
    const brace = src.indexOf('{', s);
    if (brace === -1) return;
    let d = 0;
    for (let k = brace; k < src.length; k += 1) {
      if (src[k] === '{') d += 1;
      else if (src[k] === '}') {
        d -= 1;
        if (d === 0) { spans.push([s, k]); return; }
      }
    }
  });
  const spanOf = (idx) => spans.find(([s, e]) => idx >= s && idx <= e) || null;

  /* 중괄호 깊이 — 어느 위치가 "함수 본문 바로 그 자리"인지 알기 위해서다.
     안쪽 함수(gen 안의 const matches 같은 것)는 다른 변수이므로 섞으면
     진짜 문제를 가린다. 그래서 본문 첫 단계에 있는 것만 센다. */
  const depth = new Int32Array(src.length + 1);
  let dcur = 0;
  for (let k = 0; k < src.length; k += 1) {
    depth[k] = dcur;
    if (src[k] === '{') dcur += 1;
    else if (src[k] === '}') dcur -= 1;
  }
  depth[src.length] = dcur;
  const bodyDepth = new Map();   // 구역 시작 → 본문 첫 단계 깊이
  spans.forEach(([s]) => {
    const brace = src.indexOf('{', s);
    if (brace !== -1) bodyDepth.set(s, depth[brace] + 1);
  });

  /* 구역별로: const/let 으로 선언된 이름 → 선언된 줄 번호.
     const x = ... 뿐 아니라 const { a } = ... / const [a, b] = ... 도 본다. */
  const declOf = new Map();      // 구역 시작 위치 → Map(이름 → 줄)
  src.split('\n').forEach((line, i) => {
    const m = /^\s*(?:const|let)\s+(?:([A-Za-z_$][\w$]*)|[[{]([^\]}]*)[\]}])\s*=/.exec(line);
    if (!m) return;
    const span = spanOf(lineStart[i]);
    if (!span) return;                         // 모듈 맨 바깥 선언은 대상이 아니다
    const at = lineStart[i] + (line.length - line.trimStart().length);
    if (depth[at] !== bodyDepth.get(span[0])) return;   // 안쪽 함수의 지역 변수
    const key = span[0];
    if (!declOf.has(key)) declOf.set(key, new Map());
    const map = declOf.get(key);
    const names = m[1] ? [m[1]] : m[2].split(',').map((s) => {
      const t = s.trim();
      return /([A-Za-z_$][\w$]*)\s*$/.exec(t.split(':').pop().split('=')[0])?.[1];
    });
    names.filter(Boolean).forEach((n) => { if (!map.has(n)) map.set(n, i + 1); });
  });

  /* 훅 호출을 찾아 괄호를 세어 끝을 잡고, 그 안 맨 뒤의 [ ... ] 를
     의존성 배열로 본다. 배열이 어느 줄에 적혔든 상관없이 잡힌다. */
  const hook = /\buse(?:Memo|Callback|Effect|LayoutEffect)\s*\(/g;
  let h;
  while ((h = hook.exec(src)) !== null) {
    const start = h.index;
    const open = h.index + h[0].length - 1;
    let bal = 0;
    let end = -1;
    const tops = [];            // 인자 단계에 바로 놓인 [ ... ] 들
    let arrOpen = -1;
    for (let k = open; k < src.length; k += 1) {
      const c = src[k];
      if (c === '(' || c === '{') bal += 1;
      else if (c === ')' || c === '}') {
        bal -= 1;
        if (bal === 0) { end = k; break; }
      } else if (c === '[') {
        if (bal === 1 && arrOpen === -1) arrOpen = k;
        bal += 1;
      } else if (c === ']') {
        bal -= 1;
        if (bal === 1 && arrOpen !== -1) { tops.push([arrOpen, k]); arrOpen = -1; }
      }
    }
    if (end === -1 || !tops.length) continue;   // 못 닫았으면 조용히 넘어간다
    const [a, b] = tops[tops.length - 1];
    if (b > end) continue;
    const span = spanOf(start);
    if (!span) continue;
    if (depth[start] !== bodyDepth.get(span[0])) continue;  // 안쪽 함수 속 훅은 대상 아님
    const declLine = declOf.get(span[0]);
    if (!declLine) continue;
    const hookLine = lineOf(start);

    /* 의존성 배열을 최상위 쉼표로 끊고, 각 조각의 첫 이름만 본다.
       meeting?.matches 면 meeting 이 읽히는 이름이다. */
    const inner = src.slice(a + 1, b);
    let d = 0;
    let buf = '';
    const parts = [];
    for (const c of inner) {
      if ('([{'.includes(c)) d += 1;
      else if (')]}'.includes(c)) d -= 1;
      if (c === ',' && d === 0) { parts.push(buf); buf = ''; continue; }
      buf += c;
    }
    parts.push(buf);

    parts.forEach((partRaw) => {
      const name = /^([A-Za-z_$][\w$]*)/.exec(partRaw.trim())?.[1];
      if (!name || !declLine.has(name)) return;   // 이 파일 밖에서 온 이름
      scanned += 1;
      ok(declLine.get(name) < hookLine,
        `${rel}:${hookLine} — '${name}' 을 선언(${declLine.get(name)}줄)보다 먼저 씁니다. `
        + '화면을 열면 그 자리에서 앱이 죽습니다');
    });
  }
}

/* ============================================================
   app.json 이 가리키는 파일이 실제로 있는가

   왜 필요한가
     `googleServicesFile` 처럼 app.json 이 파일 경로를 가리키는 항목은,
     그 파일이 없으면 **빌드가 깨진다.** 그런데 그 사실을 EAS 서버에서
     20분 기다린 끝에 알게 된다. 여기서 1초 만에 잡는다.

     실제로 위험한 조합이 있었다: FCM 을 붙이려고 app.json 에 줄만 먼저
     넣고 google-services.json 은 나중에 받으려던 순간이다.
   ============================================================ */
console.log('[app.json 이 가리키는 파일 검사]');
{
  const appJson = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8'));
  const e = appJson.expo || {};
  const paths = [
    ['icon', e.icon],
    ['splash.image', e.splash?.image],
    ['android.googleServicesFile', e.android?.googleServicesFile],
    ['android.adaptiveIcon.foregroundImage', e.android?.adaptiveIcon?.foregroundImage],
    ['ios.googleServicesFile', e.ios?.googleServicesFile],
    ['web.favicon', e.web?.favicon],
  ].filter(([, v]) => typeof v === 'string' && v.startsWith('.'));

  for (const [key, rel] of paths) {
    scanned += 1;
    ok(existsSync(resolve(ROOT, rel)),
      `app.json 의 ${key} 가 '${rel}' 를 가리키는데 그 파일이 없습니다 — 빌드가 깨집니다`);
  }
}

console.log(`\n임포트 검증: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
