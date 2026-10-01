/* ============================================================
   공개 대회 자동 갱신 — 매일 02시(한국) GitHub Actions 에서 돈다

   찾는 방법은 src/lib/tournamentSearch.js 에 있다(앱의 [지금 찾기]와 같은 코드).
   여기서는 Claude 클라이언트·Firestore 를 만들어 넘기고 결과를 요약에 적기만 한다.

   필요한 비밀값 (GitHub Secrets — 채팅에 붙여 넣지 말 것)
     ANTHROPIC_API_KEY          Claude API 키
     ANTHROPIC_WORKSPACE_ID     (선택) 키가 워크스페이스에 속하지 않을 때만
     FIREBASE_SERVICE_ACCOUNT   이미 배포에 쓰고 있는 서비스 계정(워크플로가 파일로 넘김)
   ============================================================ */
import Anthropic from '@anthropic-ai/sdk';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { appendFileSync } from 'node:fs';
import { seoulToday } from '../src/lib/openSync.js';
import {
  DEFAULT_MODEL, clientOptions, explainApiError, runTournamentSync,
} from '../src/lib/tournamentSearch.js';

/* 바꾸려면 워크플로 환경 변수 TOURNAMENT_MODEL 로 */
const MODEL = process.env.TOURNAMENT_MODEL || DEFAULT_MODEL;
const EFFORT = process.env.TOURNAMENT_EFFORT || 'high';
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

const log = (...a) => console.log(...a);
const summary = (line) => {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
};

async function main() {
  const today = seoulToday();
  log(`대회 자동 갱신 · ${today} · ${MODEL} · ${DRY_RUN ? '시험(쓰지 않음)' : '실제 반영'}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY 시크릿이 없습니다. GitHub 저장소 Settings → Secrets 에 넣어 주세요.');
  }
  log(`워크스페이스 ID: ${process.env.ANTHROPIC_WORKSPACE_ID ? '있음' : '없음(키에 워크스페이스가 붙어 있어야 함)'}`);

  const client = new Anthropic(clientOptions(process.env));
  initializeApp();
  const db = getFirestore();
  const r = await runTournamentSync({
    client, db, FieldValue, today, dryRun: DRY_RUN, model: MODEL, effort: EFFORT, log,
  });
  const { found, upserts, deletes, skipped } = r;
  if (r.aiError) {
    /* KATO 만이라도 반영했으면 작업은 성공으로 끝내되, 눈에 띄게 남긴다 */
    console.log(`::warning::AI 찾기는 실패해서 KATO 목록(${r.katoCount}건)만 반영했습니다 — ${r.aiError}`);
    summary(`> ⚠️ AI 찾기 실패 — KATO 목록만 반영. ${r.aiError}`);
  }

  summary(`## 대회 자동 갱신 ${today}${DRY_RUN ? ' (시험)' : ''}`);
  summary(`- 모음 ${found.length} · 넣기/갱신 ${upserts.length} · 끝나서 지움 ${deletes.length} · 건너뜀 ${skipped.length}`);
  summary('');
  summary('| 대회 | 기간 | 접수 | 지역 | 링크 |');
  summary('|---|---|---|---|---|');
  upserts.forEach(({ data: t }) => summary(
    `| ${t.name} | ${t.startDate}${t.endDate ? `~${t.endDate}` : ''} | ${t.signupFrom || '?'}~${t.signupTo || '?'} | ${t.sido || '-'} | ${t.link ? '있음' : '없음'} |`,
  ));
  if (skipped.length) {
    summary('');
    summary('건너뜀');
    skipped.forEach((s) => summary(`- ${s.name}: ${s.reason}`));
  }
  upserts.forEach(({ data: t }) => log(`  + ${t.name} (${t.startDate} · 접수 ${t.signupFrom || '?'}~${t.signupTo || '?'} · 환불 ~${t.refundTo || '-'} · ${t.sido || '지역?'} · ${t.place ? '장소 있음' : '장소 없음'})`));
  skipped.forEach((s) => log(`  - ${s.name}: ${s.reason}`));
  log(DRY_RUN ? '시험 실행이라 쓰지 않았습니다.' : `반영: 넣기/갱신 ${upserts.length} · 지움 ${deletes.length}`);
}

main().catch((e) => {
  const status = e instanceof Anthropic.APIError ? ` (API ${e.status})` : '';
  const why = e instanceof Anthropic.APIError ? explainApiError(e) : (e?.message || e);
  console.error(`::error::대회 자동 갱신 실패${status}: ${why}`);
  process.exit(1);
});
