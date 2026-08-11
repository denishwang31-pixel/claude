/* 출석 — 모임별 실제 출석 체크(총무) + 회원별 출석률 통계
   RSVP(참석 "의사")와 attendance(실제 "출석")를 분리 관리한다.
   meeting.attendance = { memberId: true|false }  (미기록 = 판정 전) */
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { setAttendance, bulkSetAttendance } from '../lib/firestore';
import { RSVP } from '../lib/constants';
import { Card, SectionTitle, Chip, Btn } from './ui';
import { C } from '../lib/theme';

const today = () => new Date().toISOString().slice(0, 10);

/** 회원별 출석 통계: 지난 모임(오늘 이전, 미취소) 기준 */
export function attendanceStats(members, meetings) {
  const past = meetings.filter((m) => !m.canceled && m.date <= today());
  const stat = {};
  members.forEach((m) => { stat[m.id] = { yes: 0, no: 0, rsvpYes: 0, noShow: 0, total: 0 }; });
  past.forEach((mt) => {
    const att = mt.attendance || {};
    const rsvp = mt.rsvp || {};
    members.forEach((m) => {
      const s = stat[m.id];
      if (!s) return;
      const declared = rsvp[m.id] === RSVP.YES;
      if (declared) s.rsvpYes += 1;
      if (att[m.id] === true) { s.yes += 1; s.total += 1; }
      else if (att[m.id] === false) {
        s.no += 1; s.total += 1;
        if (declared) s.noShow += 1; // 참석한다 해놓고 안 옴
      }
    });
  });
  Object.values(stat).forEach((s) => {
    s.rate = s.total ? Math.round((s.yes / s.total) * 100) : null;
  });
  return { stat, pastCount: past.length };
}

export function Attendance({ clubId, members, meetings, isAdmin, flash }) {
  const [tab, setTab] = useState('check'); // check | stats
  const { stat } = useMemo(() => attendanceStats(members, meetings), [members, meetings]);

  // 출석 체크 대상: 오늘 이전(또는 오늘) 모임 중 최신
  const checkable = meetings.filter((m) => !m.canceled && m.date <= today()).slice(-5).reverse();
  const [openId, setOpenId] = useState(checkable[0]?.id || null);
  const mt = checkable.find((m) => m.id === openId) || checkable[0];

  const Tab = ({ v, label }) => (
    <Pressable onPress={() => setTab(v)}
      style={{ flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: 'center', backgroundColor: tab === v ? C.green : '#fff', borderWidth: tab === v ? 0 : 1, borderColor: C.border }}>
      <Text style={{ fontWeight: '700', fontSize: 13, color: tab === v ? C.lime : C.sub }}>{label}</Text>
    </Pressable>
  );

  const rows = members
    .map((m) => ({ ...m, s: stat[m.id] || { yes: 0, total: 0, rate: null, noShow: 0 } }))
    .sort((a, b) => (b.s.rate ?? -1) - (a.s.rate ?? -1) || b.s.yes - a.s.yes);

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <Tab v="check" label="출석 체크" />
        <Tab v="stats" label="출석률 통계" />
      </View>

      {tab === 'check' && (
        <View>
          {checkable.length === 0 ? (
            <Card><Text style={{ fontSize: 12, color: C.sub }}>출석을 체크할 지난 모임이 없습니다.</Text></Card>
          ) : (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {checkable.map((m) => (
                  <Chip key={m.id} tone={mt?.id === m.id ? 'green' : 'outline'} onPress={() => setOpenId(m.id)}>
                    {m.date}
                  </Chip>
                ))}
              </View>

              {mt && (
                <Card>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700' }}>{mt.date} {mt.place || ''}</Text>
                    <Text style={{ fontSize: 11, color: C.sub }}>
                      출석 {Object.values(mt.attendance || {}).filter(Boolean).length}명
                    </Text>
                  </View>

                  {isAdmin && (
                    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
                      <Btn small tone="ghost" onPress={() => {
                        const map = {};
                        members.forEach((m) => { if (mt.rsvp?.[m.id] === RSVP.YES) map[m.id] = true; });
                        bulkSetAttendance(clubId, mt.id, map);
                        flash('참석 의사자 전원 출석 처리');
                      }}>참석자 일괄 출석</Btn>
                      <Btn small tone="ghost" onPress={() => { bulkSetAttendance(clubId, mt.id, {}); flash('출석 기록 초기화'); }}>초기화</Btn>
                    </View>
                  )}

                  {members.map((m, i) => {
                    const v = mt.attendance?.[m.id];
                    const declared = mt.rsvp?.[m.id] === RSVP.YES;
                    return (
                      <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderTopColor: '#f5f5f4' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 14, fontWeight: '600' }}>{m.name}</Text>
                          {declared && <Chip tone="outline">참석 의사</Chip>}
                        </View>
                        <View style={{ flexDirection: 'row', gap: 4 }}>
                          {[[true, '출석'], [false, '결석']].map(([val, label]) => (
                            <Pressable key={label} disabled={!isAdmin}
                              onPress={() => setAttendance(clubId, mt.id, m.id, val)}
                              style={{
                                paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999,
                                backgroundColor: v === val ? (val ? C.green : '#fee2e2') : '#f5f5f4',
                                opacity: isAdmin ? 1 : 0.6,
                              }}>
                              <Text style={{ fontSize: 12, fontWeight: '700', color: v === val ? (val ? C.lime : '#b91c1c') : C.sub }}>{label}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    );
                  })}
                </Card>
              )}
            </>
          )}
        </View>
      )}

      {tab === 'stats' && (
        <View>
          <Text style={{ fontSize: 11, color: C.sub, marginBottom: 8 }}>
            지난 모임 중 출석이 기록된 건수 기준입니다. "노쇼"는 참석 의사를 밝히고 불참한 횟수입니다.
          </Text>
          <Card>
            {rows.map((m, i) => (
              <View key={m.id} style={{ paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: '#f5f5f4' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 14, fontWeight: '600' }}>{m.name}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '900', color: m.s.rate == null ? C.faint : m.s.rate >= 70 ? C.green : m.s.rate >= 40 ? '#a16207' : C.danger }}>
                    {m.s.rate == null ? '기록 없음' : `${m.s.rate}%`}
                  </Text>
                </View>
                <View style={{ height: 6, backgroundColor: '#f5f5f4', borderRadius: 999, marginTop: 6, overflow: 'hidden' }}>
                  <View style={{ height: 6, width: `${m.s.rate || 0}%`, backgroundColor: C.lime2 }} />
                </View>
                <Text style={{ fontSize: 10, color: C.faint, marginTop: 4 }}>
                  출석 {m.s.yes} · 결석 {m.s.no} (총 {m.s.total}회)
                  {m.s.noShow > 0 ? ` · 노쇼 ${m.s.noShow}회` : ''}
                </Text>
              </View>
            ))}
            {rows.length === 0 && <Text style={{ fontSize: 12, color: C.faint }}>회원이 없습니다.</Text>}
          </Card>
        </View>
      )}
    </View>
  );
}
