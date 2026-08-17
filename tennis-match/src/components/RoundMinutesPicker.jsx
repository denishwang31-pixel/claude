/* 한 타임(게임) 길이 고르기.

   자주 쓰는 20·30·40분은 버튼으로 바로, 그 밖의 값은 [직접 지정]에서
   5분 단위로 고른다. 클럽마다 코트 사용 시간이 달라서 45분·50분·
   1시간 15분 같은 값도 실제로 쓰인다 — 몇 개만 고를 수 있게 두면
   자기 클럽 실정에 안 맞는 값으로 타협하게 된다. */
import React from 'react';
import { View, Text } from 'react-native';
import {
  ROUND_MINUTES_PRESETS, ROUND_MINUTES_OPTIONS,
  normalizeRoundMinutes, roundMinutesLabel,
} from '../lib/constants';
import { useOptionSheet } from './native';
import { Chip } from './ui';
import { C } from '../lib/theme';

export function RoundMinutesPicker({ value, onChange, hint }) {
  const sheet = useOptionSheet();
  const current = normalizeRoundMinutes(value);
  const isPreset = ROUND_MINUTES_PRESETS.includes(current);

  const pick = () => sheet.open({
    title: '한 타임 길이 (5분 단위)',
    options: ROUND_MINUTES_OPTIONS.map((m) => ({
      key: String(m),
      label: roundMinutesLabel(m) + (m === current ? '  ✓' : ''),
    })),
    onSelect: (o) => onChange(Number(o.key)),
  });

  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {ROUND_MINUTES_PRESETS.map((m) => (
          <Chip
            key={m}
            tone={current === m ? 'green' : 'outline'}
            onPress={() => onChange(m)}
          >
            {m}분
          </Chip>
        ))}
        <Chip tone={isPreset ? 'outline' : 'green'} onPress={pick}>
          {isPreset ? '직접 지정' : `${roundMinutesLabel(current)} ▾`}
        </Chip>
      </View>
      {!!hint && (
        <Text style={{ fontSize: 11, color: C.faint, marginTop: 6, lineHeight: 16 }}>{hint}</Text>
      )}
      {sheet.node}
    </View>
  );
}
