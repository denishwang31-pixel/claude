/* ============================================================
   대회 시간 — 시작 시간 · 종료 시간 · 한 타임 길이

   2026-10-04 앱 주인: "일정 설정할 때처럼 대회도 시간, 타임당 소요시간을 설정하게 해서
   타임 아래 시간 표시" → "시작 시간 종료 시간이 있어야지".
   일정(클럽 운영 설정)과 같은 방식: 시작~종료를 한 타임 길이로 나눈 만큼이 타임 수다
   (schedule.timingRounds — 일정의 roundsFromSettings 와 같은 계산).
   고르는 즉시 저장한다 — 대회 문서(timing)에 남고 2팀·3팀 청백전이 함께 쓴다.
   타임 수가 계산되면 onRounds 로 알려 [타임 수] 칸을 맞춘다.
   시작 시간을 비워 두면 대진표에 시각을 그리지 않는다(예전 그대로).
   ============================================================ */
import React from 'react';
import { View, Text } from 'react-native';
import { Label, TimeField } from './pickers';
import { RoundMinutesPicker } from './RoundMinutesPicker';
import { Chip } from './ui';
import { C } from '../lib/theme';
import { toMinutes, tournamentRoundTimes, timingRounds, TOURNAMENT_ROUND_MINUTES } from '../lib/schedule';

/**
 * @param value    { startTime, endTime, roundMinutes } | null
 * @param onSave   (next|null) => void
 * @param onRounds (n) => void   시작·종료로 타임 수가 정해졌을 때
 */
export function RoundTimingEditor({ value, onSave, onRounds }) {
  const startTime = value?.startTime || '';
  const endTime = value?.endTime || '';
  const roundMinutes = Number(value?.roundMinutes) || TOURNAMENT_ROUND_MINUTES;
  const save = (patch) => {
    const next = { startTime, endTime, roundMinutes, ...patch };
    onSave(next);
    const n = timingRounds(next);
    if (n) onRounds?.(n);
  };
  const n = timingRounds({ startTime, endTime, roundMinutes });
  const times = n ? tournamentRoundTimes({ startTime, roundMinutes }, n) : [];
  const last = times[times.length - 1];
  /* 나누어떨어지지 않으면 남는 시간 — 마지막 타임 뒤 몇 분이 빈다 */
  let left = 0;
  if (last) {
    let span = toMinutes(endTime) - toMinutes(startTime);
    if (span <= 0) span += 1440;
    left = span - n * roundMinutes;
  }
  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Label>시작 시간</Label>
          <TimeField value={startTime} placeholder="시작" onChange={(v) => save({ startTime: v })} />
        </View>
        <View style={{ flex: 1 }}>
          <Label>종료 시간</Label>
          <TimeField value={endTime} placeholder="종료" onChange={(v) => save({ endTime: v })} />
        </View>
      </View>
      <View style={{ marginTop: 12 }}>
        <Label>한 타임 소요 시간</Label>
        <RoundMinutesPicker value={roundMinutes} onChange={(m) => save({ roundMinutes: m })} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <Text style={{ flex: 1, fontSize: 11.5, color: last ? C.green2 : C.faint, lineHeight: 17 }}>
          {last
            ? `${startTime}~${endTime} · ${roundMinutes}분씩 → ${n}타임${left ? ` (끝나기 전 ${left}분 남음)` : ''}`
            : startTime
              ? '종료 시간을 정하면 타임 수가 저절로 맞춰집니다.'
              : '정하면 대진표 타임 아래에 시각이 나옵니다.'}
        </Text>
        {!!(startTime || endTime) && <Chip tone="outline" onPress={() => onSave(null)}>시간 지우기</Chip>}
      </View>
    </View>
  );
}

export default RoundTimingEditor;
