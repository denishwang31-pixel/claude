/* ============================================================
   설치 페이지(/app)에 올릴 APK 고르기 — 배포(tennis-deploy.yml 「앱 설치 파일 가져오기」)가 부른다

   입력: `eas build:list --platform android --status finished --json` 결과 파일
   출력: 내려받을 주소 → argv[3] 파일에 한 줄 / 버전·날짜 → public/app-info.json
   고르는 법: 안드로이드 · APK · 끝난 빌드 중 preview(내부 테스트) 를 먼저, 없으면 아무 APK, 가장 최근 것.

   ⚠️ 주소는 화면(로그)에 찍지 않는다 — Actions 로그가 공개다. 파일로만 넘긴다.
   ⚠️ 고를 게 없으면 app-info.json 을 만들지 않는다 → 페이지는 "설치 파일 준비 중".
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 빌드 목록에서 하나 고른다(순수 함수 — scripts/test-league.mjs 가 본다) */
export function pickApk(list) {
  const arr = Array.isArray(list) ? list : [];
  const urlOf = (b) => b?.artifacts?.buildUrl || b?.artifacts?.applicationArchiveUrl || '';
  const ok = arr.filter((b) => String(b?.platform || '').toUpperCase() === 'ANDROID'
    && String(b?.status || 'FINISHED').toUpperCase() === 'FINISHED'
    && /\.apk(\?|$)/i.test(urlOf(b)));
  const when = (b) => Date.parse(b?.completedAt || b?.updatedAt || b?.createdAt || 0) || 0;
  ok.sort((a, b) => when(b) - when(a));
  const pick = ok.find((b) => b?.buildProfile === 'preview') || ok[0];
  if (!pick) return null;
  const t = when(pick);
  return {
    url: urlOf(pick),
    info: {
      version: String(pick.appVersion || ''),
      build: String(pick.appBuildVersion || ''),
      date: t ? new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10) : '',
      profile: String(pick.buildProfile || ''),
    },
  };
}

/** eas 가 JSON 앞뒤에 안내 글을 섞어 찍어도 배열만 꺼낸다 */
export function parseList(text) {
  const s = String(text || '');
  const i = s.indexOf('[');
  const j = s.lastIndexOf(']');
  if (i < 0 || j < i) return [];
  try { return JSON.parse(s.slice(i, j + 1)); } catch (e) { return []; }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [, , listFile, urlFile] = process.argv;
  const got = pickApk(parseList(readFileSync(listFile, 'utf8')));
  if (!got) {
    console.log('올릴 APK 를 찾지 못했습니다(끝난 안드로이드 APK 빌드 없음)');
    process.exit(2);
  }
  writeFileSync(urlFile, got.url);
  const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  mkdirSync(join(ROOT, 'public'), { recursive: true });
  writeFileSync(join(ROOT, 'public', 'app-info.json'), JSON.stringify(got.info));
  console.log(`고른 빌드: 버전 ${got.info.version} (${got.info.build}) · ${got.info.date} · ${got.info.profile}`);
}
