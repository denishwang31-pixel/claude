/* 클럽 운영 설정 — 코트 면수 / 운영 시간 / 타임 길이 / 잡복 기본값 / 회비
   여기서 정한 값이 새 모임 등록의 기본값이 된다. */
import React, { useState, useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { updateClubSettings } from '../lib/firestore';
import {
  DEFAULT_SETTINGS, roundsFromSettings, roundTimes, toMinutes,
} from '../lib/schedule';
import { Card, SectionTitle, Chip, Btn, Field } from './ui';
import { C } from '../lib/theme';

export function ClubSettings({ clubId, club, isAdmin, flash }) {
  const [s, setS] = useState({ ...DEFAULT_SETTINGS, ...(club?.settings || {}) });
  useEffect(() => { setS({ ...DEFAULT_SETTINGS, ...(club?.settings || {}) }); }, [club?.id]);

  const startOk = toMinutes(s.startTime) != null;
  const endOk = toMinutes(s.endTime) != null;
  const rounds = startOk && endOk ? roundsFromSettings(s) : 0;
  const times = rounds ? roundTimes(s, rounds) : [];

  const save = () => {
    if (!startOk || !endOk) return flash('시간 형식을 확인하세요 (예: 10:00)');
    const courts = Math.max(1, Math.min(20, Number(s.courts) || 1));
    const roundMinutes = Math.max(10, Math.min(180, Number(s.roundMinutes) || 40));
    updateClubSettings(clubId, { ...s, courts, roundMinutes });
    flash('클럽 설정이 저장되었습니다');
  };

  const set = (k, v) => setS({ ...s, [k]: v });

  if (!isAdmin) {
    return (
      <View>
        <Card>
          <Text style={{ fontSize: 13, fontWeight: '700', marginBottom: 8 }}>현재 클럽 운영 설정</Text>
          <Text style={{ fontSize: 13, color: C.sub }}>운영 시간: {s.startTime} ~ {s.endTime}</Text>
          <Text style={{ fontSize: 13, color: C.sub, marginTop: 2 }}>코트: {s.courts}면 · 한 타임 {s.roundMinutes}분</Text>
          <Text style={{ fontSize: 13, color: C.green2, marginTop: 6, fontWeight: '700' }}>→ 총 {rounds}타임 진행</Text>
          <Text style={{ fontSize: 11, color: C.faint, marginTop: 8 }}>설정 변경은 총무·운영진만 가능합니다.</Text>
        </Card>
      </View>
    );
  }

  return (
    <View>
      <Card>
        <Text style={{ fontSize: 12, color: C.sub, lineHeight: 18 }}>
          클럽이 정기적으로 확보한 코트와 운동 시간을 설정하세요. 여기서 정한 값이
          <Text style={{ fontWeight: '700' }}> 새 모임 등록의 기본값</Text>이 되고, 타임(라운드) 수가 자동 계산됩니다.
          모임마다 다르면 모임 등록 화면에서 개별 수정할 수 있습니다.
        </Text>
      </Card>

      <SectionTitle>코트 면수</SectionTitle>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable onPress={() => set('courts', Math.max(1, (Number(s.courts) || 1) - 1))}
            style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#f5f5f4', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: C.sub }}>−</Text>
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 28, fontWeight: '900', color: C.ink }}>{s.courts}<Text style={{ fontSize: 14, color: C.sub }}>면</Text></Text>
          </View>
          <Pressable onPress={() => set('courts', Math.min(20, (Number(s.courts) || 1) + 1))}
            style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.lime, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: C.ink }}>＋</Text>
          </Pressable>
        </View>
        <Text style={{ fontSize: 11, color: C.faint, marginTop: 8, textAlign: 'center' }}>
          한 면당 4명이 동시에 경기합니다 (복식 기준)
        </Text>
      </Card>

      <SectionTitle>운영 시간</SectionTitle>
      <Card>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>시작</Text>
            <Field placeholder="10:00" value={s.startTime} onChangeText={(v) => set('startTime', v)} />
          </View>
          <Text style={{ fontSize: 16, color: C.faint, paddingBottom: 10 }}>~</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>종료</Text>
            <Field placeholder="13:00" value={s.endTime} onChangeText={(v) => set('endTime', v)} />
          </View>
        </View>
        {(!startOk || !endOk) && (
          <Text style={{ fontSize: 11, color: C.danger, marginTop: 6 }}>24시간 형식으로 입력하세요 (예: 09:30, 18:00)</Text>
        )}

        <Text style={{ fontSize: 11, color: C.sub, marginTop: 12, marginBottom: 6 }}>한 타임(게임) 길이</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {[20, 30, 40, 45, 60].map((v) => (
            <Chip key={v} tone={Number(s.roundMinutes) === v ? 'green' : 'outline'} onPress={() => set('roundMinutes', v)}>{v}분</Chip>
          ))}
        </View>
      </Card>

      {rounds > 0 && (
        <>
          <SectionTitle>자동 계산된 타임표</SectionTitle>
          <Card style={{ backgroundColor: C.ink, borderColor: C.green }}>
            <Text style={{ color: C.lime, fontSize: 13, fontWeight: '900' }}>총 {rounds}타임 · 코트 {s.courts}면</Text>
            <Text style={{ color: '#6ee7b7', fontSize: 11, marginTop: 2 }}>
              한 타임에 최대 {s.courts * 4}명 출전 · 전체 {rounds * s.courts}경기
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {times.map((t) => (
                <View key={t.round} style={{ backgroundColor: C.green, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={{ color: C.lime, fontSize: 11, fontWeight: '700' }}>{t.round}타임 {t.start}~{t.end}</Text>
                </View>
              ))}
            </View>
          </Card>
        </>
      )}

      <SectionTitle>대진 편성 기본값</SectionTitle>
      <Card>
        <Pressable onPress={() => set('allowMixedDefault', !s.allowMixedDefault)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: s.allowMixedDefault ? C.green : '#e7e5e4', alignItems: 'center', justifyContent: 'center' }}>
            {s.allowMixedDefault && <Text style={{ color: C.lime, fontWeight: '900', fontSize: 13 }}>✓</Text>}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '700' }}>잡복 기본 허용</Text>
            <Text style={{ fontSize: 11, color: C.faint }}>
              체크하면 남3여1 같은 성비도 자동 편성합니다. 해제하면 남복·여복·혼복만 편성하고,
              불가능할 때 확인창이 뜹니다(권장)
            </Text>
          </View>
        </Pressable>
      </Card>

      <SectionTitle>회비</SectionTitle>
      <Card>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>월 회비(원)</Text>
            <Field keyboardType="number-pad" value={String(s.feeAmount ?? '')} onChangeText={(v) => set('feeAmount', Number(v) || 0)} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>게스트비(원)</Text>
            <Field keyboardType="number-pad" value={String(s.guestFee ?? '')} onChangeText={(v) => set('guestFee', Number(v) || 0)} />
          </View>
        </View>
        <View style={{ marginTop: 8 }}>
          <Text style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>송금 링크 (선택)</Text>
          <Field placeholder="https://…" value={s.payLink || ''} onChangeText={(v) => set('payLink', v)} />
        </View>
      </Card>

      <View style={{ marginTop: 16 }}>
        <Btn full onPress={save}>설정 저장</Btn>
      </View>
    </View>
  );
}
