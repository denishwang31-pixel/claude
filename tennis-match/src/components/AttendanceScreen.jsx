/* 출석 — 모임별 출석부(운영진) + 회원별 출석률 통계
   RSVP(참석 "의사")와 attendance(실제 "출석")를 분리 관리한다.
   출석부는 참석 투표로 미리 채우고, 운영진은 다른 사람만 고친 뒤 확정한다.
   판단은 src/lib/attendance.js (검사 scripts/test-attendance.mjs). */
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { setAttendance, updateMeeting } from '../lib/firestore';
import {
  effectiveAttendance, changedFromVote, attendanceTargets, confirmMap, attendanceCount,
  openAttendance, confirmedAttendance,
} from '../lib/attendance';
import { splitByTie, groupByVenue } from '../lib/scheduleView';
import { dowName } from '../lib/schedule';
import { RSVP } from '../lib/constants';
import { Card, SectionTitle, Chip, Btn } from './ui';
import { C } from '../lib/theme';
import { todayYmd } from '../lib/today';

const today = () => todayYmd();

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

export function Attendance({ clubId, members, meetings, isAdmin, flash, venues = [], meVal = null }) {
  const [tab, setTab] = useState('check'); // check | stats
  const { stat } = useMemo(() => attendanceStats(members, meetings), [members, meetings]);

  /* 확정 안 한 출석부만 — 확정하면 목록에서 빠진다(앱 주인).
     내 코트 먼저, 다른 코트장은 아래 목록에 접어 둔다(일정·대진과 같은 규칙). */
  const open = useMemo(() => openAttendance(meetings, today()), [meetings]);
  const { mine, other } = useMemo(
    () => splitByTie(open, meVal, venues.length),
    [open, meVal, venues.length],
  );
  const otherVenues = useMemo(() => groupByVenue(other, venues), [other, venues]);
  const [openId, setOpenId] = useState(null);
  const [otherOpen, setOtherOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);   // 확정한 출석부 목록 펼침
  const mt = open.find((m) => m.id === openId) || mine[0] || open[0] || null;
  const viewingOther = !!mt && other.some((m) => m.id === mt.id);
  const venueName = (m) => venues.find((v) => v.id === m?.venueId)?.name || m?.place || '';
  const label = (m) => `${Number(m.date.slice(5, 7))}/${Number(m.date.slice(8, 10))}(${dowName(m.date)}) ${m.time || ''}`;
  const confirmed = useMemo(() => confirmedAttendance(meetings), [meetings]);

  const Tab = ({ v, label: text }) => (
    <Pressable onPress={() => setTab(v)}
      style={{ flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: 'center', backgroundColor: tab === v ? C.green : '#fff', borderWidth: tab === v ? 0 : 1, borderColor: C.border }}>
      <Text style={{ fontWeight: '700', fontSize: 13, color: tab === v ? '#fff' : C.sub }}>{text}</Text>
    </Pressable>
  );

  const rows = members
    .map((m) => ({ ...m, s: stat[m.id] || { yes: 0, total: 0, rate: null, noShow: 0 } }))
    .sort((a, b) => (b.s.rate ?? -1) - (a.s.rate ?? -1) || b.s.yes - a.s.yes);

  const toggle = (m) => {
    if (!isAdmin || !mt) return;
    const cur = effectiveAttendance(mt, m.id).present;
    setAttendance(clubId, mt.id, m.id, !cur);
  };

  const confirm = () => {
    if (!mt) return;
    const map = confirmMap(members, mt);
    const n = Object.values(map).filter(Boolean).length;
    Alert.alert('출석 확정', `${label(mt)} ${venueName(mt)}\n출석 ${n}명 · 결석 ${Object.keys(map).length - n}명으로 확정합니다.\n확정하면 출석부 목록에서 빠지고 출석률에 반영됩니다.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '확정',
        onPress: async () => {
          try {
            await updateMeeting(clubId, mt.id, { attendance: map, attendanceConfirmed: true, attendanceConfirmedAt: new Date().toISOString() });
            setOpenId(null);
            flash?.('출석을 확정했습니다');
          } catch (e) { flash?.('확정하지 못했습니다'); }
        },
      },
    ]);
  };

  const chip = (m, on) => (
    <Pressable key={m.id} onPress={() => setOpenId(m.id)}
      style={{
        paddingHorizontal: 11, paddingVertical: 8, borderRadius: 12,
        backgroundColor: on ? C.green : '#fff', borderWidth: on ? 0 : 1, borderColor: C.border,
      }}>
      <Text style={{ fontSize: 12.5, fontWeight: '800', color: on ? '#fff' : C.ink }}>{label(m)}</Text>
      {!!venueName(m) && <Text style={{ fontSize: 10, color: on ? '#E2F3EC' : C.faint, marginTop: 1 }}>{venueName(m)}</Text>}
    </Pressable>
  );

  const targets = mt ? attendanceTargets(members, mt) : [];
  const cnt = mt ? attendanceCount(members, mt) : { yes: 0, no: 0 };

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <Tab v="check" label="출석부" />
        <Tab v="stats" label="출석률 통계" />
      </View>

      {tab === 'check' && (
        <View>
          {open.length === 0 ? (
            <Card><Text style={{ fontSize: 12.5, color: C.sub }}>확정할 출석부가 없습니다. 모임이 끝나면 여기에 나옵니다.</Text></Card>
          ) : (
            <>
              {mine.length > 0 && (
                <>
                  {venues.length > 1 && <Text style={{ fontSize: 11.5, fontWeight: '800', color: C.green, marginBottom: 5 }}>내 코트</Text>}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    {mine.map((m) => chip(m, mt?.id === m.id))}
                  </View>
                </>
              )}
              {otherVenues.length > 0 && (
                <View style={{ marginBottom: 10 }}>
                  <Pressable onPress={() => setOtherOpen(!(otherOpen || viewingOther))}
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                      paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12,
                      backgroundColor: C.fill, borderWidth: 1, borderColor: C.border,
                    }}>
                    <Text style={{ fontSize: 12.5, fontWeight: '800', color: C.sub }}>다른 코트장 출석부 · {other.length}건</Text>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: C.green }}>{otherOpen || viewingOther ? '접기 ▲' : '펼치기 ▼'}</Text>
                  </Pressable>
                  {(otherOpen || viewingOther) && otherVenues.map((g) => (
                    <View key={g.id} style={{ marginTop: 8 }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: C.text, marginBottom: 5 }}>{g.name}</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {g.items.map((m) => chip(m, mt?.id === m.id))}
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {mt && (
                <Card>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: C.text }}>{label(mt)}</Text>
                      {!!venueName(mt) && <Text style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{venueName(mt)}</Text>}
                    </View>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: C.sub }}>출석 {cnt.yes} · 결석 {cnt.no}</Text>
                  </View>
                  <Text style={{ fontSize: 11.5, color: C.faint, marginTop: 6, marginBottom: 8, lineHeight: 17 }}>
                    참석 투표로 미리 채웠습니다. {isAdmin ? '실제와 다른 사람만 눌러 고친 뒤 아래 출석 확정 버튼을 누르세요.' : '운영진이 확인해 확정합니다.'}
                  </Text>

                  {targets.map((m, i) => {
                    const e = effectiveAttendance(mt, m.id);
                    const changed = changedFromVote(mt, m.id);
                    const vote = { yes: '투표 참석', no: '투표 불참', none: '미응답' }[
                      mt.rsvp?.[m.id] === 'yes' ? 'yes' : mt.rsvp?.[m.id] === 'no' ? 'no' : 'none'];
                    return (
                      <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7, borderTopWidth: i ? 1 : 0, borderTopColor: '#f5f5f4' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: m.gender === 'F' ? C.female : C.text }}>{m.name}</Text>
                          <Text style={{ fontSize: 10.5, color: C.faint }}>{vote}</Text>
                          {changed && <Text style={{ fontSize: 10.5, fontWeight: '800', color: '#B45309' }}>고침</Text>}
                        </View>
                        <Pressable disabled={!isAdmin} onPress={() => toggle(m)} hitSlop={6}
                          style={{
                            minWidth: 64, alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
                            backgroundColor: e.present ? C.green : '#fee2e2',
                          }}>
                          <Text style={{ fontSize: 12.5, fontWeight: '800', color: e.present ? '#fff' : '#b91c1c' }}>
                            {e.present ? '출석' : '결석'}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })}
                  {targets.length === 0 && <Text style={{ fontSize: 12, color: C.faint }}>이 모임에 해당하는 회원이 없습니다.</Text>}

                  {isAdmin && targets.length > 0 && (
                    <View style={{ marginTop: 12 }}>
                      <Btn full onPress={confirm}>{`출석 확정 (출석 ${cnt.yes}명)`}</Btn>
                    </View>
                  )}
                </Card>
              )}
            </>
          )}

          {/* 잘못 확정했을 때 되돌릴 길 — 평소엔 한 줄로 접어 둔다(목록이 줄줄이 붙으면 지저분하다, 앱 주인) */}
          {isAdmin && confirmed.length > 0 && (
            <View style={{ marginTop: 14 }}>
              <Pressable onPress={() => setDoneOpen(!doneOpen)}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12,
                  backgroundColor: C.fill, borderWidth: 1, borderColor: C.border,
                }}>
                <Text style={{ fontSize: 12.5, fontWeight: '800', color: C.sub }}>확정한 출석부 · 최근 {confirmed.length}건</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: C.green }}>{doneOpen ? '접기 ▲' : '펼치기 ▼'}</Text>
              </Pressable>
              {doneOpen && (
                <View style={{ marginTop: 6, paddingHorizontal: 4 }}>
                  {confirmed.map((m, i) => (
                    <View key={m.id} style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8,
                      borderTopWidth: i ? 1 : 0, borderTopColor: '#f1f5f9',
                    }}>
                      <Text style={{ fontSize: 12.5, color: C.sub, flex: 1 }}>
                        {label(m)} {venueName(m)} · 출석 {Object.values(m.attendance || {}).filter(Boolean).length}명
                      </Text>
                      <Pressable hitSlop={8} onPress={() => { updateMeeting(clubId, m.id, { attendanceConfirmed: false }); setOpenId(m.id); setDoneOpen(false); flash?.('출석부를 다시 열었습니다'); }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: C.green }}>다시 열기</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </View>
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
                  <Text style={{ fontSize: 13, fontWeight: '700', color: m.s.rate == null ? C.faint : m.s.rate >= 70 ? C.green : m.s.rate >= 40 ? '#a16207' : C.danger }}>
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
