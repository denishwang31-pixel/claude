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
import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Label, TimeField } from './pickers';
import { RoundMinutesPicker } from './RoundMinutesPicker';
import { Chip, Field, Btn } from './ui';
import { C } from '../lib/theme';
import {
  toMinutes, toHHMM, tournamentRoundTimes, timingRounds, TOURNAMENT_ROUND_MINUTES, normalizeEvents, EVENT_MINUTES,
} from '../lib/schedule';
import { EVENT_COLOR, eventIcon } from './MatchGrid';

/**
 * @param value    { startTime, endTime, roundMinutes } | null
 * @param onSave   (next|null) => void
 * @param onRounds (n) => void   시작·종료로 타임 수가 정해졌을 때
 */
export function RoundTimingEditor({ value, onSave, onRounds }) {
  const startTime = value?.startTime || '';
  const endTime = value?.endTime || '';
  const roundMinutes = Number(value?.roundMinutes) || TOURNAMENT_ROUND_MINUTES;
  const events = value?.events || [];
  /* 이벤트 입력 칸 — null 이면 닫힘. id 가 있으면 고치는 중 */
  const [ev, setEv] = useState(null);
  const save = (patch) => {
    const next = { startTime, endTime, roundMinutes, events, ...patch };
    onSave(next);
    const n = timingRounds(next);
    if (n) onRounds?.(n);
  };
  const n = timingRounds({ startTime, endTime, roundMinutes, events });
  const times = n ? tournamentRoundTimes({ startTime, roundMinutes, events }, n) : [];
  const last = times[times.length - 1];
  /* 나누어떨어지지 않으면 남는 시간 — 마지막 타임 뒤 몇 분이 빈다 */
  let left = 0;
  if (last) {
    let span = toMinutes(endTime) - toMinutes(startTime);
    if (span <= 0) span += 1440;
    /* 마지막 타임이 끝난 뒤 종료까지 남는 시간(이벤트로 밀린 것까지 반영) */
    let lastEnd = toMinutes(last.end) - toMinutes(startTime);
    if (lastEnd <= 0) lastEnd += 1440;
    left = Math.max(0, span - lastEnd);
  }
  const evList = normalizeEvents({ events });
  const saveEvent = () => {
    if (!ev || toMinutes(ev.startTime) == null) return;
    const item = { id: ev.id || `ev${Date.now().toString(36)}`, name: String(ev.name || '').trim() || '이벤트', startTime: ev.startTime, minutes: ev.minutes };
    const rest = events.filter((x) => x.id !== item.id);
    save({ events: [...rest, item] });
    setEv(null);
  };
  const removeEvent = (id) => save({ events: events.filter((x) => x.id !== id) });
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
        {!!(startTime || endTime) && (
          <Chip tone="outline" onPress={() => onSave(events.length ? { roundMinutes, events } : null)}>시간 지우기</Chip>
        )}
      </View>

      {/* 이벤트 — 행사·식사·시상식. 그 시간만큼 경기 타임이 뒤로 밀리고 대진표에 노란 띠로 보인다 */}
      <View style={{ marginTop: 14 }}>
        <Label hint="개회식·점심·시상식 — 그 시간엔 경기를 넣지 않습니다">이벤트</Label>
        {evList.map((e) => (
          <Pressable key={e.id}
            onPress={() => { const src = events.find((x) => x.id === e.id) || {}; setEv({ id: e.id, name: src.name || e.name, startTime: src.startTime, minutes: e.minutes }); }}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, paddingVertical: 9, paddingHorizontal: 10,
              backgroundColor: EVENT_COLOR.bg, borderLeftWidth: 4, borderLeftColor: EVENT_COLOR.bar, borderRadius: 8,
            }}>
            <Text style={{ fontSize: 14 }}>{eventIcon(e.name)}</Text>
            <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', color: EVENT_COLOR.ink }}>
              {e.name} <Text style={{ fontWeight: '600', color: EVENT_COLOR.bar }}>{toHHMM(e.start)}~{toHHMM(e.start + e.minutes)} · {e.minutes}분</Text>
            </Text>
            <Chip tone="outline" onPress={() => removeEvent(e.id)}>삭제</Chip>
          </Pressable>
        ))}
        {!ev ? (
          <Btn small tone="soft" onPress={() => setEv({ name: '', startTime: '', minutes: EVENT_MINUTES })}>＋ 이벤트 추가</Btn>
        ) : (
          <View style={{ borderWidth: 1.5, borderColor: EVENT_COLOR.bar, borderRadius: 12, padding: 12, backgroundColor: '#FFFBEB' }}>
            <Label>이벤트 이름</Label>
            <Field placeholder="예: 개회식 · 점심 식사 · 시상식" value={ev.name} onChangeText={(v) => setEv({ ...ev, name: v })} />
            <View style={{ marginTop: 10 }}>
              <Label>시작 시간</Label>
              <TimeField value={ev.startTime} placeholder="시작 시간 고르기" onChange={(v) => setEv({ ...ev, startTime: v })} />
            </View>
            <View style={{ marginTop: 10 }}>
              <Label>걸리는 시간</Label>
              <RoundMinutesPicker value={ev.minutes} onChange={(m) => setEv({ ...ev, minutes: m })} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <Btn full small disabled={toMinutes(ev.startTime) == null} onPress={saveEvent}>{ev.id ? '고친 것 저장' : '이벤트 저장'}</Btn>
              </View>
              <Btn small tone="ghost" onPress={() => setEv(null)}>취소</Btn>
            </View>
            {!startTime && (
              <Text style={{ fontSize: 11, color: C.faint, marginTop: 8 }}>대회 시작 시간을 정해야 대진표에 시각과 이벤트가 나옵니다.</Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

export default RoundTimingEditor;
