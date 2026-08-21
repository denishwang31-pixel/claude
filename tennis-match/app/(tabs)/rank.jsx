/* 랭킹 — 클럽 랭킹 / 내 커리어(케미·H2H) / 시즌 결산 */
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '../_layout';
import { useBottomPad } from '../../src/hooks/useBottomPad';
import { useClub } from '../../src/hooks/useClub';
import { useBackHandler } from '../../src/hooks/useBackHandler';
import { computeStats } from '../../src/lib/matchmaking';
import { loadMeetingsRange } from '../../src/lib/firestore';
import { mergeMeetings, WINDOW_MONTHS } from '../../src/lib/meetingWindow';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Card, SectionTitle, Btn, Chip } from '../../src/components/ui';
import { C } from '../../src/lib/theme';

export default function Rank() {
  const { clubId, me, viewMode } = useApp();
  const bottomPad = useBottomPad();
  const router = useRouter();
  const {
    club, members, meetings: recent, meetingsFrom, meVal, nameOf,
  } = useClub(clubId, me, { viewMode });

  /* ---------- 랭킹은 "전체 기록"이어야 한다 ----------
     앱이 실시간으로 들고 있는 모임은 최근 1년치뿐이다(useClub 참고).
     그대로 쓰면 "클럽 랭킹"이라고 적어 놓고 최근 1년만 세게 된다.
     숫자가 멀쩡히 떠 있어서 아무도 잘렸다는 것을 모른다.

     그래서 두 가지를 한다.
       1. 안 불러왔을 때는 제목에 "최근 1년"이라고 적는다
       2. [전체 기록 불러오기]로 예전 것을 한 번만 읽어 합친다
     예전 경기는 이미 끝난 것이라 실시간일 이유가 없다. */
  const [older, setOlder] = useState(null);      // null = 아직 안 불러옴
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState('');

  const meetings = useMemo(
    () => (older ? mergeMeetings(recent, older) : recent),
    [recent, older],
  );

  const loadAll = async () => {
    if (loading || older) return;
    setLoading(true);
    setLoadErr('');
    try {
      /* 클럽이 생기기 전으로 넉넉히 잡는다 — 시작일을 따로 저장하지 않는다 */
      const list = await loadMeetingsRange(clubId, '2000-01-01', meetingsFrom);
      setOlder(list);
    } catch (e) {
      /* older 는 null 로 둔다 — 빈 배열을 넣으면 "전체 기록"이라고 표시된
         채로 예전 경기가 하나도 없는 것이 된다. 실패는 실패로 보여야 한다. */
      setLoadErr('예전 기록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요');
    } finally {
      setLoading(false);
    }
  };

  /* 더보기에서 들어온 화면이므로 뒤로가기는 더보기로 */
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/more'));
  useBackHandler(() => { goBack(); return true; });
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
      <Text style={{ fontWeight: '700', fontSize: 13, color: view === v ? '#fff' : C.sub }}>{label}</Text>
    </Pressable>
  );

  const StatBox = ({ v, label, dark }) => (
    <View style={{ flex: 1, backgroundColor: dark ? C.green : '#f5f5f4', borderRadius: 12, padding: 10, alignItems: 'center' }}>
      <Text style={{ fontSize: 18, fontWeight: '700', color: dark ? C.lime : C.text }}>{v}</Text>
      <Text style={{ fontSize: 10, color: dark ? '#BFE3D3' : C.sub }}>{label}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="랭킹·기록" subtitle={club?.name} onBack={goBack} backLabel="더보기" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomPad }}>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          <Tab v="rank" label="클럽 랭킹" />
          <Tab v="me" label="내 커리어" />
          <Tab v="wrap" label="시즌 결산" />
        </View>

        {/* 무엇을 세고 있는지 밝힌다. 시즌 결산은 올해만 세므로 해당 없다. */}
        {view !== 'wrap' && (
          <Card flat style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Chip tone={older ? 'green' : 'outline'}>
                {older ? '전체 기록' : `최근 ${WINDOW_MONTHS}개월`}
              </Chip>
              <Text style={{ flex: 1, fontSize: 11, color: C.sub, lineHeight: 16 }}>
                {older
                  ? `${meetings.length}건을 모두 세었습니다`
                  : `${meetingsFrom} 이후 ${meetings.length}건만 세고 있습니다`}
              </Text>
              {!older && (
                <Btn small tone="ghost" disabled={loading} onPress={loadAll}>
                  {loading ? '불러오는 중' : '전체 불러오기'}
                </Btn>
              )}
            </View>
            {!!loadErr && (
              <Text style={{ fontSize: 11, color: C.danger, marginTop: 8 }}>{loadErr}</Text>
            )}
          </Card>
        )}

        {view === 'rank' && (
          <Card>
            {rows.map((s, i) => (
              <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: '#f5f5f4' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: i < 3 ? C.lime : '#f5f5f4', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: i < 3 ? C.ink : C.sub }}>{i + 1}</Text>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '700' }}>{nameOf(s.id)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: C.green }}>{s.wins}승 {s.games - s.wins}패</Text>
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
              <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700', marginTop: 4 }}>
                {meVal?.name} <Text style={{ fontSize: 13, color: '#BFE3D3' }}>{meVal?.grade}조 · {meVal?.gender === 'M' ? '남' : '여'}</Text>
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
            <Text style={{ color: C.lime, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>{year} SEASON WRAPPED</Text>
            <Text style={{ color: '#fff', fontSize: 28, fontWeight: '700', marginTop: 8 }}>{meVal?.name}</Text>
            <Text style={{ color: '#BFE3D3', fontSize: 11, marginTop: 4 }}>{club?.name || '테니스클럽'}</Text>
            <View style={{ width: '100%', marginTop: 20, gap: 8 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <StatBox dark v={myYear?.games || 0} label="올해 경기 수" />
                <StatBox dark v={myYear?.games ? Math.round(myYear.wins / myYear.games * 100) + '%' : '-'} label="시즌 승률" />
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1, backgroundColor: C.green, borderRadius: 12, padding: 10 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: C.lime }}>{bestP ? nameOf(bestP.pid) : '-'}</Text>
                  <Text style={{ fontSize: 10, color: '#BFE3D3' }}>최고 케미{bestP ? ` (${Math.round(bestP.wr * 100)}%)` : ''}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: C.green, borderRadius: 12, padding: 10 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: C.lime }}>{rival ? nameOf(rival.pid) : '-'}</Text>
                  <Text style={{ fontSize: 10, color: '#BFE3D3' }}>최대 라이벌{rival ? ` (${rival.g}회)` : ''}</Text>
                </View>
              </View>
            </View>
            <Text style={{ color: '#8FD6B8', fontSize: 10, marginTop: 20 }}>이 카드를 캡처해 카톡방에 자랑하세요 🏆</Text>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}
