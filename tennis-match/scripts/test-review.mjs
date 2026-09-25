/* 심사용 계정 데이터 모양 (scripts/review-account.mjs) */
import { demoDocs, nextWeekday, CLUB_ID, DEMO_MEMBERS } from './review-account.mjs';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — 기대 ${JSON.stringify(b)} / 실제 ${JSON.stringify(a)}`);

const NOW = new Date('2026-09-25T03:00:00Z');   // 한국 금요일 12시
eq(nextWeekday(6, NOW), '2026-09-26', '다음 토요일');
eq(nextWeekday(3, NOW), '2026-09-30', '다음 수요일');
eq(nextWeekday(5, NOW), '2026-10-02', '오늘이 금요일이면 다음 주 금요일');

const d = demoDocs('UID1', NOW);
eq(d.user.clubId, CLUB_ID, '심사자는 시험 클럽 소속');
eq(d.owner.role, '회장', '심사자는 회장 — 운영 기능까지 보인다');
eq(d.members.length, DEMO_MEMBERS.length, '가상 회원 수');
ok(d.members.every((m) => /^demo\d\d$/.test(m.id)), '회원 id 고정 — 여러 번 돌려도 늘어나지 않는다');
ok(d.meetings.every((m) => m.data.date > '2026-09-25'), '모임은 다가오는 날짜');
ok(d.meetings.every((m) => m.data.rsvp.UID1 === 'yes' && Object.keys(m.data.rsvp).length === 9), '참석 9명(심사자 포함)');
eq(d.fee.key, '2026-09', '이번 달 회비 문서');
ok(Object.values(d.fee.data.paid).some(Boolean) && Object.values(d.fee.data.paid).some((x) => !x), '납부·미납이 섞여 있다(회비 화면이 비지 않게)');
ok(d.expenses.every((x) => x.data.date.startsWith('2026-09')), '지출도 이번 달');
ok(d.club.review === true && !('inviteCode' in d.club), '심사용 표시 · 초대코드 없음');

const src = readFileSync(new URL('./review-account.mjs', import.meta.url), 'utf8');
ok(!/console\.log\([^)]*password/i.test(src), '비밀번호를 찍지 않는다');
ok(!/publishClubDirectory|clubDirectory/.test(src), '클럽 찾기 목록에 올리지 않는다');

console.log(`\n심사용 계정 테스트: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
