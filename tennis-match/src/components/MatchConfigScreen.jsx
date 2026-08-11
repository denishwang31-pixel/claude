/* 대진 편성 기본 설정 (클럽 단위)
   - 기본 타임 유형 (혼복 / 남·여복 / 단식 / 자동)
   - 잡복 허용, NTRP 실력 매칭
   - 편성 기준 우선순위 (드래그 대신 ▲▼ 로 순서 변경 — 대진 탭의 드래그와 동일 데이터)
   여기 값은 "기본값"이고, 모임별 타임 유형은 대진 탭에서 타임마다 바꿀 수 있다. */
import React, { useState, useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { setMatchConfig, setRules } from '../lib/firestore';
import { ROUND_TYPES, DEFAULT_RULES } from '../lib/matchmaking';
import { DEFAULT_MATCH_CONFIG } from '../lib/schedule';
import { Card, SectionTitle, Chip, Btn } from './ui';
import { C } from '../lib/theme';

const Toggle = ({ on, onPress, title, desc }) => (
  <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8 }}>
    <View style={{ width: 22, height: 22, borderRadius: 6, marginTop: 1, backgroundColor: on ? C.green : '#e7e5e4', alignItems: 'center', justifyContent: 'center' }}>
      {on && <Text style={{ color: C.lime, fontWeight: '900', fontSize: 13 }}>✓</Text>}
    </View>
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 14, fontWeight: '700' }}>{title}</Text>
      <Text style={{ fontSize: 11, color: C.faint, marginTop: 2, lineHeight: 16 }}>{desc}</Text>
    </View>
  </Pressable>
);

export function MatchConfig({ clubId, matchConfig, rules, isAdmin, flash }) {
  const [cfg, setCfg] = useState({ ...DEFAULT_MATCH_CONFIG, ...(matchConfig || {}) });
  const [order, setOrder] = useState(rules || DEFAULT_RULES);
  useEffect(() => { setCfg({ ...DEFAULT_MATCH_CONFIG, ...(matchConfig || {}) }); }, [matchConfig]);
  useEffect(() => { if (rules) setOrder(rules); }, [rules]);

  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };

  const save = () => {
    setMatchConfig(clubId, cfg);
    setRules(clubId, order.map((r) => r.key));
    flash('대진 기본 설정이 저장되었습니다');
  };

  const readOnly = !isAdmin;

  return (
    <View>
      <Card>
        <Text style={{ fontSize: 12, color: C.sub, lineHeight: 18 }}>
          여기서 정한 값이 <Text style={{ fontWeight: '700' }}>모든 모임의 기본 편성 방식</Text>이 됩니다.
          특정 모임만 다르게 하고 싶으면 대진 탭에서 <Text style={{ fontWeight: '700' }}>타임별로</Text> 바꿀 수 있습니다.
        </Text>
      </Card>

      <SectionTitle>기본 타임 유형</SectionTitle>
      <Card>
        <View style={{ gap: 6 }}>
          {ROUND_TYPES.map((t) => (
            <Pressable key={t.key} disabled={readOnly}
              onPress={() => setCfg({ ...cfg, defaultRoundType: t.key })}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12,
                backgroundColor: cfg.defaultRoundType === t.key ? '#ecfccb' : '#fafaf9',
                borderWidth: cfg.defaultRoundType === t.key ? 1 : 0, borderColor: C.lime2,
              }}>
              <View style={{
                width: 20, height: 20, borderRadius: 10, borderWidth: 2,
                borderColor: cfg.defaultRoundType === t.key ? C.green : '#d6d3d1',
                alignItems: 'center', justifyContent: 'center',
              }}>
                {cfg.defaultRoundType === t.key && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.green }} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700' }}>{t.name}</Text>
                <Text style={{ fontSize: 11, color: C.faint }}>{t.desc}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </Card>

      <SectionTitle>편성 옵션</SectionTitle>
      <Card>
        <Toggle
          on={!!cfg.skillBalance}
          onPress={() => !readOnly && setCfg({ ...cfg, skillBalance: !cfg.skillBalance })}
          title="NTRP 실력 매칭"
          desc="비슷한 실력끼리 같은 코트에 배치하고, 양 팀 실력 합이 균등해지도록 팀을 나눕니다. 등급이 없는 회원은 조(A/B/C)로 대신 계산합니다."
        />
        <View style={{ height: 1, backgroundColor: '#f5f5f4' }} />
        <Toggle
          on={!!cfg.allowMixed}
          onPress={() => !readOnly && setCfg({ ...cfg, allowMixed: !cfg.allowMixed })}
          title="잡복 기본 허용"
          desc="켜면 남3여1 같은 성비도 묻지 않고 바로 편성합니다. 끄면(권장) 잡복이 필요할 때 확인창이 뜹니다."
        />
      </Card>

      <SectionTitle>편성 기준 우선순위</SectionTitle>
      <Card>
        <Text style={{ fontSize: 11, color: C.faint, marginBottom: 8 }}>
          위에 있을수록 가중치가 큽니다. ▲▼ 로 순서를 바꾸세요. (대진 탭에서 드래그로도 변경 가능)
        </Text>
        {order.map((r, i) => (
          <View key={r.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderTopColor: '#f5f5f4' }}>
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: C.lime, fontSize: 11, fontWeight: '900' }}>{i + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '700' }}>{r.name}</Text>
              <Text numberOfLines={1} style={{ fontSize: 10, color: C.faint }}>{r.desc}</Text>
            </View>
            {!readOnly && (
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <Pressable onPress={() => move(i, -1)} style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#f5f5f4', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontWeight: '900', color: i === 0 ? '#d6d3d1' : C.sub }}>▲</Text>
                </Pressable>
                <Pressable onPress={() => move(i, 1)} style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#f5f5f4', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontWeight: '900', color: i === order.length - 1 ? '#d6d3d1' : C.sub }}>▼</Text>
                </Pressable>
              </View>
            )}
          </View>
        ))}
      </Card>

      {isAdmin ? (
        <View style={{ marginTop: 16 }}><Btn full onPress={save}>기본 설정 저장</Btn></View>
      ) : (
        <Text style={{ fontSize: 11, color: C.faint, textAlign: 'center', marginTop: 12 }}>
          설정 변경은 총무·운영진만 가능합니다.
        </Text>
      )}
    </View>
  );
}
