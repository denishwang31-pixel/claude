/* ---------------- 회비 관리 (FIX-02, 원본 Fees 이식) ----------------
   월별 납부 현황 + CSV/텍스트 붙여넣기 이름 매칭 + 미납 리마인드.
   입금 알림 자동매칭(안드로이드 네이티브)은 PHASE 4/2차 — 여기선 수동+반자동. */
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { setFeePaid } from '../lib/firestore';
import { Card, SectionTitle, Btn } from './ui';
import { C } from '../lib/theme';

const monthKeyNow = () => new Date().toISOString().slice(0, 7);

export function Fees({ clubId, club, members, fee, feeMonth, setFeeMonth, isAdmin, flash }) {
  const [paste, setPaste] = useState('');
  const amount = fee.amount || club?.settings?.feeAmount || 30000;
  const active = members.filter((m) => m.status === '활동');
  const paidMap = fee.paid || {};

  const togglePaid = (id) => {
    if (!isAdmin) return;
    const next = { ...paidMap, [id]: !paidMap[id] };
    setFeePaid(clubId, feeMonth, next, amount);
  };

  const runMatch = () => {
    let hit = 0;
    const next = { ...paidMap };
    active.forEach((m) => { if (m.name && paste.includes(m.name)) { next[m.id] = true; hit++; } });
    setFeePaid(clubId, feeMonth, next, amount);
    setPaste('');
    flash(`${hit}명 입금자명 매칭 완료`);
  };

  const paidN = active.filter((m) => paidMap[m.id]).length;
  const pct = active.length ? Math.round((paidN / active.length) * 100) : 0;

  return (
    <View>
      <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {[-1, 0].map((off) => {
            const d = new Date(); d.setMonth(d.getMonth() + off);
            const mk = d.toISOString().slice(0, 7);
            return (
              <Pressable key={mk} onPress={() => setFeeMonth(mk)}
                style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: feeMonth === mk ? C.green : '#f5f5f4' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: feeMonth === mk ? C.lime : C.sub }}>{mk}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={{ fontSize: 14, fontWeight: '900', color: C.green }}>{paidN}/{active.length} 납부</Text>
      </Card>
      <View style={{ height: 8, backgroundColor: '#e7e5e4', borderRadius: 999, marginTop: 8, overflow: 'hidden' }}>
        <View style={{ height: 8, width: `${pct}%`, backgroundColor: C.lime2 }} />
      </View>

      {isAdmin && (
        <>
          <SectionTitle>자동/반자동 처리</SectionTitle>
          <Card>
            <Text style={{ fontSize: 11, color: C.faint, marginBottom: 8 }}>
              은행 거래내역(입금자명 포함) 텍스트/CSV를 붙여넣으면 회원 이름을 자동 매칭합니다.
              (안드로이드 입금 알림 자동 감지는 PHASE 4/2차 네이티브 모듈)
            </Text>
            <TextInput
              value={paste} onChangeText={setPaste} multiline
              placeholder="예: 홍길동 30,000원 입금 / 김철수 30000 …"
              placeholderTextColor={C.faint}
              style={{ backgroundColor: '#f5f5f4', borderRadius: 12, padding: 12, fontSize: 13, height: 80, textAlignVertical: 'top', color: C.text }}
            />
            <View style={{ marginTop: 8 }}>
              <Btn full tone="ghost" disabled={!paste} onPress={runMatch}>붙여넣기 일괄 매칭</Btn>
            </View>
          </Card>
        </>
      )}

      <SectionTitle>{feeMonth} 납부 현황 (월 {amount.toLocaleString()}원)</SectionTitle>
      <Card>
        {active.map((m, i) => (
          <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: '#f5f5f4' }}>
            <Text style={{ fontSize: 14, fontWeight: '600' }}>{m.name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {!paidMap[m.id] && club?.settings?.payLink ? (
                <Text style={{ fontSize: 11, color: C.green2 }}>송금 링크</Text>
              ) : null}
              <Pressable onPress={() => togglePaid(m.id)}
                style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, backgroundColor: paidMap[m.id] ? C.green : '#fee2e2' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: paidMap[m.id] ? C.lime : '#b91c1c' }}>{paidMap[m.id] ? '납부' : '미납'}</Text>
              </Pressable>
            </View>
          </View>
        ))}
        {active.length === 0 && <Text style={{ fontSize: 12, color: C.faint }}>활동 회원이 없습니다.</Text>}
      </Card>

      {isAdmin && (
        <View style={{ marginTop: 8 }}>
          <Btn full tone="ghost" onPress={() => flash('미납자에게 리마인드 푸시 발송 (PHASE 3 연동 지점)')}>미납자 리마인드 발송</Btn>
        </View>
      )}
    </View>
  );
}

export { monthKeyNow };
