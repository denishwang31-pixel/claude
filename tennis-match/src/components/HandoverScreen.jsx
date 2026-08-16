/* 총무 인수인계 — 동호회 총무는 1~2년마다 바뀐다.

   지금까지는 엑셀 파일 하나와 구두 설명이 인수인계의 전부였고, 그 과정에서
   회비 이력·미납 기록·회원 명단이 통째로 증발했다. 신임 총무는 처음부터
   다시 만든다.

   여기서 하는 일은 간단하다. 권한만 넘긴다. 데이터는 원래부터 클럽에
   붙어 있으므로 사람이 바뀌어도 그대로 남는다. 그게 개인 엑셀과의 차이다.

   전임 총무는 회비 권한만 내려놓고 운영진으로 남는다 — 갑자기 아무것도
   못 보게 되면 인수인계 자체가 안 된다. */
import React, { useMemo, useState } from 'react';
import { View, Text, Alert } from 'react-native';
import { ROLES, normalizeRole } from '../lib/constants';
import { handOverManager } from '../lib/firestore';
import { useOptionSheet } from './native';
import { Card, SectionTitle, Chip, Btn, StatCard } from './ui';
import { C, S, F } from '../lib/theme';

export function Handover({
  clubId, club, members, meetings = [], fees = [], history = [],
  canAppoint, me, flash,
}) {
  const [target, setTarget] = useState(null);
  const sheet = useOptionSheet();

  const active = useMemo(
    () => members.filter((m) => !m.status || m.status === '활동'), [members],
  );
  const current = useMemo(
    () => active.find((m) => normalizeRole(m.role) === ROLES.MANAGER), [active],
  );

  /* 클럽에 쌓인 기록 — "총무가 바뀌어도 남는다"를 눈으로 보여 준다 */
  const archive = useMemo(() => {
    const months = new Set(fees.map((f) => String(f.id).slice(0, 7)).filter(Boolean));
    const years = new Set(fees.map((f) => String(f.id).slice(0, 4)).filter(Boolean));
    return {
      members: active.length,
      meetings: meetings.length,
      feeMonths: months.size,
      years: years.size,
    };
  }, [active, meetings, fees]);

  const pick = () => sheet.open({
    title: '새 총무를 고르세요',
    options: active
      .filter((m) => m.id !== current?.id)
      .map((m) => ({ key: m.id, label: `${m.name} · ${normalizeRole(m.role)}` })),
    onSelect: (o) => setTarget(active.find((m) => m.id === o.key) || null),
  });

  const run = () => {
    if (!target) return flash('새 총무를 먼저 고르세요');
    const from = current?.name ? `${current.name} → ` : '';
    return Alert.alert(
      '총무 인수인계',
      `${from}${target.name}\n\n`
      + '· 회비·지출 권한이 새 총무에게 넘어갑니다\n'
      + (current ? '· 전임 총무는 운영진으로 남아 계속 도울 수 있습니다\n' : '')
      + '· 회원·회비·일정 기록은 그대로 유지됩니다',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '인수인계',
          onPress: async () => {
            await handOverManager(clubId, current?.id || null, target.id);
            flash(`${target.name} 총무로 임명되었습니다`);
            setTarget(null);
          },
        },
      ],
    );
  };

  return (
    <View>
      <Card>
        <Text style={F.bodyBold}>우리 클럽에 쌓인 기록</Text>
        <Text style={{ fontSize: 11.5, color: C.sub, marginTop: 5, lineHeight: 17 }}>
          총무가 바뀌어도 아래 기록은 클럽에 남습니다. 개인 엑셀로는 안 되는 부분입니다.
        </Text>
        <View style={{ flexDirection: 'row', gap: S.sm, marginTop: 12 }}>
          <StatCard value={archive.members} label="회원" />
          <StatCard value={archive.meetings} label="모임" />
          <StatCard value={archive.feeMonths} label="회비 기록(월)" />
        </View>
      </Card>

      <SectionTitle>현재 총무</SectionTitle>
      <Card>
        {current ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={F.bodyBold}>{current.name}</Text>
            <Chip tone="soft">총무</Chip>
            {current.id === me && <Chip tone="outline">나</Chip>}
          </View>
        ) : (
          <Text style={{ fontSize: 12, color: C.sub }}>
            지정된 총무가 없습니다. 아래에서 임명하세요.
          </Text>
        )}
      </Card>

      {canAppoint ? (
        <>
          <SectionTitle hint="회장만 인수인계할 수 있습니다">새 총무 지정</SectionTitle>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}>
                {target ? (
                  <>
                    <Text style={F.bodyBold}>{target.name}</Text>
                    <Text style={{ fontSize: 11, color: C.sub, marginTop: 3 }}>
                      현재 {normalizeRole(target.role)}
                    </Text>
                  </>
                ) : (
                  <Text style={{ fontSize: 12.5, color: C.faint }}>선택된 회원이 없습니다</Text>
                )}
              </View>
              <Btn small tone="ghost" onPress={pick}>{target ? '바꾸기' : '고르기'}</Btn>
            </View>
            <View style={{ marginTop: 12 }}>
              <Btn full disabled={!target} onPress={run}>인수인계</Btn>
            </View>
            <Text style={{ fontSize: 10.5, color: C.faint, marginTop: 10, lineHeight: 15 }}>
              전임 총무는 운영진으로 남습니다. 회비·지출은 못 보지만 일정·대진·회원은
              계속 도울 수 있어서, 인수인계 기간에 끊김이 없습니다.
            </Text>
          </Card>
        </>
      ) : (
        <Card style={{ marginTop: S.sm }}>
          <Text style={{ fontSize: 12, color: C.sub, lineHeight: 18 }}>
            인수인계는 회장만 진행할 수 있습니다.
          </Text>
        </Card>
      )}

      {history.length > 0 && (
        <>
          <SectionTitle>인수인계 이력</SectionTitle>
          <Card>
            {[...history].reverse().map((h, i) => {
              const from = members.find((m) => m.id === h.from);
              const to = members.find((m) => m.id === h.to);
              return (
                <View key={`${h.at}-${i}`} style={{
                  paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: C.border,
                }}>
                  <Text style={{ fontSize: 12.5, color: C.text }}>
                    {from?.name || '(이전 없음)'} → {to?.name || '(탈퇴)'}
                  </Text>
                  <Text style={{ fontSize: 10.5, color: C.faint, marginTop: 2 }}>
                    {String(h.at || '').slice(0, 10)}
                  </Text>
                </View>
              );
            })}
          </Card>
        </>
      )}
    </View>
  );
}
