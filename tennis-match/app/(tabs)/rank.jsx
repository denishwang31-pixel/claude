/* 랭킹 — 클럽 랭킹 / 내 커리어(케미·H2H) / 시즌 결산 */
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../_layout';
import { useClub } from '../../src/hooks/useClub';
import { computeStats } from '../../src/lib/matchmaking';
import { Card, SectionTitle } from '../../src/components/ui';
import { C } from '../../src/lib/theme';

export default function Rank() {
  const { clubId, me } = useApp();
  const insets = useSafeAreaInsets();
  const { club, members, meetings, meVal, nameOf } = useClub(clubId, me);
  const [view, setView] = useState('rank');

  const year = new Date().getFullYear();
  const { stats } = useMemo(() => computeStats(members, meetings), [members, meetings]);
  // FIX-08: 시즌 결산은 올해 모임만 집계
  const { stats: yearStats } = useMemo(
    () => computeStats(members, meetings.filter((m) => (m.date || '').startsWith(String(year)))),
    [members, meetings, year],
  );
  const my = stats[me];
  const myYear = yearStats[me];

  const rows = Object.entries(stats).filter(([id]) => !id.startsWith('g:'))
    .map(([id, s]) => ({ id, ...s, wr: s.games ? s.wins / s.games : 0 }))
    .sort((a, b) => b.wins - a.wins || b.wr - a.wr);
  const chem = my ? Object.entries(my.partners).map(([pid, v]) => ({ pid, ...v, wr: v.w / v.g })).sort((a, b) => b.wr - a.wr) : [];
  const h2h = my ? Object.entries(my.opps).map(([pid, v]) => ({ pid, ...v, wr: v.w / v.g })).sort((a, b) => b.g - a.g) : [];
  // 시즌 결산용(올해)
  const yearChem = myYear ? Object.entries(myYear.partners).map(([pid, v]) => ({ pid, ...v, wr: v.w / v.g })).sort((a, b) => b.wr - a.wr) : [];
  const yearH2h = myYear ? Object.entries(myYear.opps).map(([pid, v]) => ({ pid, ...v, wr: v.w / v.g })).sort((a, b) => b.g - a.g) : [];
  const bestP = yearChem[0], rival = yearH2h[0];

  const Tab = ({ v, label }) => (
    <Pressable onPress={() => setView(v)}
      style={{ flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: 'center', backgroundColor: view === v ? C.green : '#fff', borderWidth: view === v ? 0 : 1, borderColor: C.border }}>
      <Text style={{ fontWeight: '700', fontSize: 13, color: view === v ? C.lime : C.sub }}>{label}</Text>
    </Pressable>
  );

  const StatBox = ({ v, label, dark }) => (
    <View style={{ flex: 1, backgroundColor: dark ? C.green : '#f5f5f4', borderRadius: 12, padding: 10, alignItems: 'center' }}>
      <Text style={{ fontSize: 18, fontWeight: '900', color: dark ? C.lime : C.text }}>{v}</Text>
      <Text style={{ fontSize: 10, color: dark ? '#6ee7b7' : C.sub }}>{label}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          <Tab v="rank" label="클럽 랭킹" />
          <Tab v="me" label="내 커리어" />
          <Tab v="wrap" label="시즌 결산" />
        </View>

        {view === 'rank' && (
          <Card>
            {rows.map((s, i) => (
              <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: '#f5f5f4' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: i < 3 ? C.lime : '#f5f5f4', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 11, fontWeight: '900', color: i < 3 ? C.ink : C.sub }}>{i + 1}</Text>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '700' }}>{nameOf(s.id)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 14, fontWeight: '900', color: C.green }}>{s.wins}승 {s.games - s.wins}패</Text>
                  <Text style={{ fontSize: 10, color: C.faint }}>승률 {Math.round(s.wr * 100)}%</Text>
                </View>
              </View>
            ))}
            {rows.length === 0 && <Text style={{ fontSize: 12, color: C.faint, paddingVertical: 12 }}>스코어가 입력되면 랭킹이 자동 집계됩니다.</Text>}
          </Card>
        )}

        {view === 'me' && (
          <View>
            <Card style={{ backgroundColor: C.ink, borderColor: C.green }}>
              <Text style={{ color: C.lime, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>MY CAREER</Text>
              <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 4 }}>
                {meVal?.name} <Text style={{ fontSize: 13, color: '#6ee7b7' }}>{meVal?.grade}조 · {meVal?.gender === 'M' ? '남' : '여'}</Text>
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <StatBox dark v={my?.games || 0} label="경기" />
                <StatBox dark v={my?.wins || 0} label="승" />
                <StatBox dark v={my?.games ? Math.round(my.wins / my.games * 100) + '%' : '-'} label="승률" />
              </View>
            </Card>

            <SectionTitle>파트너 케미 지수</SectionTitle>
            <Card>
              {chem.map((c) => (
                <View key={c.pid} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', width: 70 }}>{nameOf(c.pid)}</Text>
                  <View style={{ flex: 1, height: 8, backgroundColor: '#f5f5f4', borderRadius: 999, overflow: 'hidden' }}>
                    <View style={{ height: 8, width: `${c.wr * 100}%`, backgroundColor: C.lime2, borderRadius: 999 }} />
                  </View>
                  <Text style={{ fontSize: 11, color: C.sub, width: 80, textAlign: 'right' }}>{c.w}승/{c.g}전 {Math.round(c.wr * 100)}%</Text>
                </View>
              ))}
              {chem.length === 0 && <Text style={{ fontSize: 12, color: C.faint, paddingVertical: 8 }}>아직 파트너 기록이 없습니다.</Text>}
            </Card>

            <SectionTitle>상대 전적 (H2H)</SectionTitle>
            <Card>
              {h2h.map((c) => (
                <View key={c.pid} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600' }}>vs {nameOf(c.pid)}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: C.green }}>{c.w}승 {c.g - c.w}패</Text>
                </View>
              ))}
              {h2h.length === 0 && <Text style={{ fontSize: 12, color: C.faint, paddingVertical: 8 }}>아직 상대 기록이 없습니다.</Text>}
            </Card>
          </View>
        )}

        {view === 'wrap' && (
          <Card style={{ backgroundColor: C.ink, borderColor: C.green, paddingVertical: 32, alignItems: 'center' }}>
            <Text style={{ color: C.lime, fontSize: 11, fontWeight: '900', letterSpacing: 1 }}>{year} SEASON WRAPPED</Text>
            <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900', marginTop: 8 }}>{meVal?.name}</Text>
            <Text style={{ color: '#6ee7b7', fontSize: 11, marginTop: 4 }}>{club?.name || '테니스클럽'}</Text>
            <View style={{ width: '100%', marginTop: 20, gap: 8 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <StatBox dark v={myYear?.games || 0} label="올해 경기 수" />
                <StatBox dark v={myYear?.games ? Math.round(myYear.wins / myYear.games * 100) + '%' : '-'} label="시즌 승률" />
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1, backgroundColor: C.green, borderRadius: 12, padding: 10 }}>
                  <Text style={{ fontSize: 15, fontWeight: '900', color: C.lime }}>{bestP ? nameOf(bestP.pid) : '-'}</Text>
                  <Text style={{ fontSize: 10, color: '#6ee7b7' }}>최고 케미{bestP ? ` (${Math.round(bestP.wr * 100)}%)` : ''}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: C.green, borderRadius: 12, padding: 10 }}>
                  <Text style={{ fontSize: 15, fontWeight: '900', color: C.lime }}>{rival ? nameOf(rival.pid) : '-'}</Text>
                  <Text style={{ fontSize: 10, color: '#6ee7b7' }}>최대 라이벌{rival ? ` (${rival.g}회)` : ''}</Text>
                </View>
              </View>
            </View>
            <Text style={{ color: '#34d399', fontSize: 10, marginTop: 20 }}>이 카드를 캡처해 카톡방에 자랑하세요 🏆</Text>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}
