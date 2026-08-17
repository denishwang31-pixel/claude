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
console.log(`\n임포트 검증: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
