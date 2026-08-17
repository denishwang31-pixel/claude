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

/* ---- 한 타임 길이 — 5분 단위 지정 ---- */
{
  const {
    ROUND_MINUTES_PRESETS, ROUND_MINUTES_OPTIONS, ROUND_MINUTES_STEP,
    normalizeRoundMinutes, roundMinutesLabel,
  } = await import('../src/lib/constants.js');

  console.log('\n[한 타임 길이]');
  ok(ROUND_MINUTES_PRESETS.join() === '20,30,40', '기본 버튼은 20·30·40분');
  ok(ROUND_MINUTES_OPTIONS.every((v, i, a) => i === 0 || v - a[i - 1] === ROUND_MINUTES_STEP),
    '선택지가 5분 간격');
  ok(ROUND_MINUTES_OPTIONS[0] === 10, '10분부터');
  ok(ROUND_MINUTES_OPTIONS[ROUND_MINUTES_OPTIONS.length - 1] === 120, '120분까지');
  ok(ROUND_MINUTES_OPTIONS.includes(45) && ROUND_MINUTES_OPTIONS.includes(50),
    '45·50분 같은 값도 고를 수 있다');

  ok(normalizeRoundMinutes(43) === 45, '5분 단위로 보정 (43 → 45)');
  ok(normalizeRoundMinutes(42) === 40, '5분 단위로 보정 (42 → 40)');
  ok(normalizeRoundMinutes(5) === 10, '최솟값 아래는 10분으로');
  ok(normalizeRoundMinutes(999) === 120, '최댓값 위는 120분으로');
  ok(normalizeRoundMinutes('40') === 40, '문자열도 처리');
  ok(normalizeRoundMinutes(undefined) === 40, '값이 없으면 기본 40분');
  ok(normalizeRoundMinutes(null) === 40, 'null 도 기본값');

  ok(roundMinutesLabel(40) === '40분', '한 시간 미만은 분으로');
  ok(roundMinutesLabel(60) === '1시간', '정시는 시간만');
  ok(roundMinutesLabel(75) === '1시간 15분', '시간 + 분');
  ok(roundMinutesLabel(120) === '2시간', '2시간');
}

console.log(`\n설정 유틸 테스트: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
