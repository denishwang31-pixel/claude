/* 활동지역 선택 — 시/도 → 시·군·구 2단계
   플랫폼 표준 선택지 UI(iOS ActionSheet / Android Bottom sheet)를 쓴다. */
import React from 'react';
import { View, Text } from 'react-native';
import { SIDO_LIST, gunguOf, parseRegion, regionText } from '../lib/regions';
import { Touchable, useOptionSheet, HIT } from './native';
import { C, R } from '../lib/theme';

function SelectBox({ label, value, placeholder, onPress, flex = 1 }) {
  return (
    <View style={{ flex }}>
      {!!label && (
        <Text style={{ fontSize: 11.5, fontWeight: '700', color: C.sub, marginBottom: 5 }}>{label}</Text>
      )}
      <Touchable onPress={onPress}
        style={{
          minHeight: HIT, paddingHorizontal: 14,
          backgroundColor: C.fill, borderRadius: R.md,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        }}>
        <Text style={{ fontSize: 15, color: value ? C.text : C.faint }} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Text style={{ color: C.faint, fontSize: 11 }}>▼</Text>
      </Touchable>
    </View>
  );
}

/**
 * @param value    "경기 과천시" 형태의 문자열
 * @param onChange 같은 형태의 문자열을 돌려준다
 */
export function RegionPicker({ value, onChange, labels = true }) {
  const { sido, gungu } = parseRegion(value);
  const sheet = useOptionSheet();

  const pickSido = () => sheet.open({
    title: '시 / 도',
    options: SIDO_LIST.map((s) => ({ key: s, label: s })),
    onSelect: (o) => onChange(regionText(o.key, '')),   // 시/도가 바뀌면 하위는 비운다
  });

  const pickGungu = () => {
    if (!sido) return pickSido();
    return sheet.open({
      title: `${sido} · 시 / 군 / 구`,
      options: gunguOf(sido).map((g) => ({ key: g, label: g })),
      onSelect: (o) => onChange(regionText(sido, o.key)),
    });
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <SelectBox label={labels ? '시 / 도' : ''} value={sido} placeholder="선택" onPress={pickSido} />
        <SelectBox label={labels ? '시 / 군 / 구' : ''} value={gungu} placeholder={sido ? '선택' : '시/도 먼저'}
          onPress={pickGungu} flex={1.3} />
      </View>
      {sheet.node}
    </View>
  );
}

export default RegionPicker;
