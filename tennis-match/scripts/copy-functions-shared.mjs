/* 서버 함수가 앱과 같은 코드를 쓰게 복사한다 — firebase deploy 의 predeploy 로 돈다.

   firebase deploy 는 functions/ 폴더만 올린다. ../src/lib 는 배포 묶음에 없다.
   대회 [지금 찾기](functions/index.js 의 onOpenSyncRequested)는 매일 02시 작업과
   똑같이 찾아야 하고, 대회 외부 공개(liveTournament)는 앱과 똑같이 순위를 매겨야 하므로, 손으로 옮겨 적은 사본 대신 배포 직전에 원본을 복사한다.
   functions/shared/ 는 생성물이라 저장소에 두지 않는다(.gitignore). */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'functions', 'shared');
export const SHARED = ['tournamentSearch.js', 'openSync.js', 'openParse.js', 'openTournament.js', 'regions.js', 'groupLeague.js', 'teamLive.js'];

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'package.json'), '{ "type": "module" }\n');
SHARED.forEach((f) => copyFileSync(join(root, 'src', 'lib', f), join(out, f)));
console.log(`functions/shared ← src/lib (${SHARED.join(', ')})`);
