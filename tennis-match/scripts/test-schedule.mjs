/* 클럽 운영 설정(시간·타임) 유틸 테스트 — `node scripts/test-schedule.mjs` */
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../src/lib/schedule.js', import.meta.url), 'utf8');
const S = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

ok(S.toMinutes('10:00') === 600, '10:00 → 600분');
ok(S.toMinutes('09:30') === 570, '09:30 → 570분');
ok(S.toMinutes('25:00') === null, '잘못된 시각은 null');
ok(S.toMinutes('abc') === null, '문자열은 null');
ok(S.toHHMM(600) === '10:00', '600분 → 10:00');
ok(S.toHHMM(1470) === '00:30', '자정 넘김 처리');

// 10:00~13:00, 40분 → 4타임 (180/40 = 4.5 → 4)
ok(S.roundsFromSettings({ startTime: '10:00', endTime: '13:00', roundMinutes: 40 }) === 4, '3시간/40분 = 4타임');
ok(S.roundsFromSettings({ startTime: '10:00', endTime: '13:00', roundMinutes: 30 }) === 6, '3시간/30분 = 6타임');
ok(S.roundsFromSettings({ startTime: '06:00', endTime: '09:00', roundMinutes: 60 }) === 3, '3시간/60분 = 3타임');
// 야간(자정 넘김): 22:00~01:00
ok(S.roundsFromSettings({ startTime: '22:00', endTime: '01:00', roundMinutes: 45 }) === 4, '자정 넘김 3시간/45분 = 4타임');
ok(S.roundsFromSettings({ startTime: 'bad', endTime: '13:00', roundMinutes: 40 }) === 4, '잘못된 입력은 기본 4타임');

const times = S.roundTimes({ startTime: '10:00', endTime: '13:00', roundMinutes: 40 });
ok(times.length === 4, '타임표 4개');
ok(times[0].start === '10:00' && times[0].end === '10:40', '1타임 10:00~10:40');
ok(times[3].start === '12:00' && times[3].end === '12:40', '4타임 12:00~12:40');

const desc = S.describeSettings({ startTime: '10:00', endTime: '13:00', roundMinutes: 40, courts: 3 });
ok(desc.includes('4타임') && desc.includes('3면'), `요약 문장: ${desc}`);
ok(S.DEFAULT_SETTINGS.allowMixedDefault === false, '잡복 기본값은 금지');

console.log(`\n설정 유틸 테스트: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
