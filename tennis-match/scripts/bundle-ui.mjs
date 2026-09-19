/* ============================================================
   검토용 코드 묶음 만들기

   왜 있나
     디자인·UI 를 밖에서 검토받을 때, 저장소 링크만 주면 상대가 104개
     파일 중 어디를 봐야 할지 모른다. 그래서 "먼저 볼 것 → 뼈대 →
     주요 화면 → 나머지" 순으로 묶어서 읽을 수 있는 형태로 만든다.

     DESIGN.md 가 설명이고, 이쪽이 실물이다.

   왜 커밋하지 않나
     생성물이다. 원본이 바뀌면 같이 바뀌어야 하는데, 커밋해 두면 둘이
     갈라진 채로 남는다. design-review/ 는 .gitignore 에 있다.
     검토할 때마다 이 스크립트를 다시 돌리면 된다.

   쓰는 법
     node scripts/bundle-ui.mjs
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'design-review');

/* 묶음 정의. 순서가 곧 읽는 순서다. */
const GROUPS = [
  {
    file: '01-core.md',
    title: '디자인 시스템 코어',
    intro:
      '여기부터 보시면 됩니다. 모든 화면이 이 네 파일에서만 색·크기·간격을\n'
      + '가져옵니다. theme.js 를 고치면 앱 전체가 따라옵니다.',
    files: [
      'src/lib/theme.js',
      'src/components/ui.jsx',
      'src/components/Icon.jsx',
      'src/components/ScreenHeader.jsx',
      'src/components/SocialButtons.jsx',
    ],
  },
  {
    file: '02-shell.md',
    title: '뼈대 — 라우팅 · 탭 · 허브 · 데이터',
    intro:
      '화면이 어떻게 연결되고, 데이터와 권한이 어디서 내려오는지.\n'
      + 'more.jsx 가 30개 가까운 화면의 허브입니다 (DESIGN.md 9-1 참고).',
    files: [
      'app/_layout.jsx',
      'app/(tabs)/_layout.jsx',
      'app/(tabs)/more.jsx',
      'src/hooks/useClub.js',
      'src/lib/constants.js',
    ],
  },
  {
    file: '03-screens.md',
    title: '주요 화면',
    intro:
      'login.jsx 가 가장 최근에 새로 만든 화면이라 현재 기준에 가장\n'
      + '가깝습니다. match.jsx 가 가장 복잡하고, 코트에서 서서 한 손으로\n'
      + '쓰는 화면입니다.',
    files: [
      'app/login.jsx',
      'app/onboarding.jsx',
      'app/(tabs)/index.jsx',
      'app/(tabs)/schedule.jsx',
      'app/(tabs)/match.jsx',
      'app/(tabs)/rank.jsx',
      'app/(tabs)/gear.jsx',
      'app/(tabs)/tips.jsx',
      'app/join.jsx',
    ],
  },
];

/* 4번째 묶음(나머지 화면)은 손으로 적지 않는다. 화면이 계속 늘기 때문에
   목록을 손으로 관리하면 반드시 빠뜨린다. 앞에서 이미 넣은 것만 뺀다. */
const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.jsx?$/.test(name)) out.push(relative(ROOT, p));
  }
  return out;
};

const lang = (f) => (f.endsWith('.jsx') ? 'jsx' : 'js');
const lines = (s) => s.split('\n').length;

function render({ title, intro, files }, n, total) {
  const parts = [
    `# 테니스매치 검토용 코드 — ${n}/${total}. ${title}`,
    '',
    intro,
    '',
    `> 앱의 목적과 기능 연계는 \`DESIGN.md\` 를 먼저 읽어 주세요.`,
    '',
    '## 이 묶음에 든 파일',
    '',
  ];
  const present = files.filter((f) => existsSync(join(ROOT, f)));
  present.forEach((f) => {
    parts.push(`- \`${f}\` (${lines(readFileSync(join(ROOT, f), 'utf8'))}줄)`);
  });
  parts.push('', '---', '');
  present.forEach((f) => {
    parts.push(`## \`${f}\``, '', '```' + lang(f), readFileSync(join(ROOT, f), 'utf8').trimEnd(), '```', '');
  });
  return { text: parts.join('\n'), count: present.length };
}

mkdirSync(OUT, { recursive: true });

const used = new Set(GROUPS.flatMap((g) => g.files));
const rest = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'app'))]
  .filter((f) => !used.has(f))
  /* 로직 전용 파일은 뺀다 — 디자인 검토에 대진 알고리즘은 필요 없다.
     src/lib 는 계산·데이터 계층이라 통째로 제외하되, 위 묶음에서
     이름을 찍어 넣은 것(theme, constants)은 이미 들어가 있다. */
  .filter((f) => !f.startsWith('src/lib/'))
  .sort();

const all = [...GROUPS, {
  file: '04-rest.md',
  title: '나머지 화면들',
  intro:
    '[더보기] 안에 사는 화면들입니다. 전부 보실 필요는 없고, 일관성을\n'
    + '보실 때 몇 개를 표본으로 여셔도 됩니다. 초기에 만든 화면(회비·대진)과\n'
    + '최근 화면(대회 찾기) 사이에 세대 차이가 있습니다.',
  files: rest,
}];

let totalFiles = 0, totalLines = 0;
all.forEach((g, i) => {
  const { text, count } = render(g, i + 1, all.length);
  writeFileSync(join(OUT, g.file), text);
  totalFiles += count;
  totalLines += lines(text);
  console.log(`  ${g.file}  파일 ${count}개`);
});

/* 묶음을 여는 문 — 어느 것부터 읽어야 하는지 */
writeFileSync(join(OUT, '00-README.md'), [
  '# 테니스매치 — 디자인 · UI 검토 자료',
  '',
  '## 읽는 순서',
  '',
  '1. **`DESIGN.md`** (저장소 루트) — 앱의 목적, 사용자, 기능 연계,',
  '   디자인 규칙, 그리고 **우리가 약하다고 보는 곳**(9장). 이것부터.',
  '2. `01-core.md` — 디자인 토큰과 컴포넌트. 고치려면 여기를 고친다.',
  '3. `02-shell.md` — 화면이 어떻게 연결되는가.',
  '4. `03-screens.md` — 주요 화면 실물.',
  '5. `04-rest.md` — 나머지 (표본으로만 보셔도 됩니다).',
  '',
  '## 가장 도움이 되는 의견',
  '',
  '- **정보 구조** — [더보기] 하나에 30개 화면이 매달려 있습니다.',
  '- **화면 밀도** — 40~60대가 야외 코트에서 한 손으로 씁니다.',
  '- **시각적 완성도** — 브랜드·일러스트·전환 효과가 전혀 없습니다.',
  '',
  '색·타이포 체계를 통째로 바꾸는 제안도 괜찮습니다.',
  '`src/lib/theme.js` 한 파일만 고치면 모든 화면이 따라오도록 되어 있습니다.',
  '',
  '---',
  '',
  `생성: ${new Date().toISOString().slice(0, 10)} · 파일 ${totalFiles}개`,
].join('\n'));

console.log(`\n검토 묶음: 파일 ${totalFiles}개 → ${relative(ROOT, OUT)}/`);
