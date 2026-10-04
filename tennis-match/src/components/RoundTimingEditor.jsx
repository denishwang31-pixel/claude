/* ============================================================
   대회 시간 — 시작 시간 · 한 타임 길이 → 대진표 타임 아래에 시각

   2026-10-04 앱 주인: "일정 설정할 때처럼 대회도 시간, 타임당 소요시간을 설정하게 해서
   타임 아래 시간 표시". 일정(모임)과 같은 고르기(시각 고르기 · RoundMinutesPicker)를 쓴다.
   고르는 즉시 저장한다 — 코트 이름처럼 대회 문서(timing)에 남고 2팀·3팀 청백전이 함께 쓴다.
   시작 시간을 비워 두면 대진표에 시각을 그리지 않는다(예전 그대로).
   ============================================================ */
import React from 'react';
import { View, Text } from 'react-native';
import { Label, TimeField } from './pickers';
import { RoundMinutesPicker } from './RoundMinutesPicker';
import { Chip } from './ui';
import { C } from '../lib/theme';
import { tournamentRoundTimes, TOURNAMENT_ROUND_MINUTES } from '../lib/schedule';

/**
 * @param value  { startTime, roundMinutes } | null
 * @param rounds 지금 대진의 타임 수 — 미리 보기(끝나는 시각)에 쓴다
 * @param onSave (next|null) => void
 */
export function RoundTimingEditor({ value, rounds = 0, onSave }) {
  const startTime = value?.startTime || '';
  const roundMinutes = Number(value?.roundMinutes) || TOURNAMENT_ROUND_MINUTES;
  const times = tournamentRoundTimes({ startTime, roundMinutes }, rounds);
  const last = times[times.length - 1];
  return (
    <View>
      <Label hint="정하면 대진표 타임 아래에 시각이 나옵니다">시작 시간</Label>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ flex: 1 }}>
          <TimeField value={startTime} placeholder="시작 시간 고르기"
            onChange={(v) => onSave({ startTime: v, roundMinutes })} />
        </View>
        {!!startTime && <Chip tone="outline" onPress={() => onSave(null)}>지우기</Chip>}
      </View>
      <View style={{ marginTop: 12 }}>
        <Label>한 타임 소요 시간</Label>
        <RoundMinutesPicker value={roundMinutes}
          onChange={(m) => onSave({ startTime, roundMinutes: m })} />
      </View>
      {!!last && (
        <Text style={{ fontSize: 11.5, color: C.sub, marginTop: 8 }}>
          {times[0].start} 시작 · {rounds}타임 · {last.end} 끝
        </Text>
      )}
    </View>
  );
}

export default RoundTimingEditor;
