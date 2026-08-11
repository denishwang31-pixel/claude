/* 대회 — 개설(예선/토너먼트/시드) · 진행 · 기록 보관 */
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import {
  addTournament, updateTournament, deleteTournament,
} from '../lib/firestore';
import {
  buildGroups, groupStandings, qualifiers, buildBracket, applyResult,
  championOf, roundName, autoTeams, orderBySeed,
} from '../lib/tournament';
import { effectiveNtrp } from '../lib/ntrp';
import { Card, SectionTitle, Chip, Btn, Field } from './ui';
import { C } from '../lib/theme';

const today = () => new Date().toISOString().slice(0, 10);

/* ---------------- 대회 개설 ---------------- */
function CreateTournament({ clubId, members, onDone, flash }) {
  const [name, setName] = useState('');
  const [date, setDate] = useState(today());
  const [useGroup, setUseGroup] = useState(true);
  const [groupCount, setGroupCount] = useState('4');
  const [advance, setAdvance] = useState('2');
  const [teamMode, setTeamMode] = useState('balanced'); // balanced | random
  const [picked, setPicked] = useState({});             // 참가 회원
  const [seeds, setSeeds] = useState({});               // entryIndex → seed no

  const pickedList = members.filter((m) => picked[m.id]);
  const teams = useMemo(() => {
    if (pickedList.length < 4) return [];
    return autoTeams(
      pickedList.map((m) => ({ id: m.id, name: m.name, ntrp: effectiveNtrp(m).value || 3 })),
      teamMode,
    );
  }, [picked, teamMode, members]);

  const create = () => {
    if (teams.length < 2) return flash('참가자는 최소 4명(2팀) 이상이어야 합니다');
    const entries = teams.map((t, i) => ({ ...t, seed: seeds[i] ? Number(seeds[i]) : null }));
    const groups = useGroup ? buildGroups(entries, Math.max(1, +groupCount)) : [];
    // 예선 미사용 → 시드 순서 그대로 토너먼트
    const bracket = useGroup ? null : buildBracket(orderBySeed(entries).map((e) => e.id));
    addTournament(clubId, {
      name: name || `${date} 클럽대회`,
      date,
      useGroupStage: useGroup,
      advancePerGroup: +advance,
      entries,
      groups,
      bracket,
      stage: useGroup ? 'group' : 'knockout',
      status: 'ongoing',
    });
    flash('대회가 개설되었습니다');
    onDone();
  };

  return (
    <View>
      <Card>
        <Text style={{ fontSize: 13, fontWeight: '700', marginBottom: 6 }}>대회 정보</Text>
        <Field placeholder="대회명 (예: 2026 봄 클럽챔피언십)" value={name} onChangeText={setName} />
        <View style={{ marginTop: 8 }}>
          <Field placeholder="날짜 (YYYY-MM-DD)" value={date} onChangeText={setDate} />
        </View>
      </Card>

      <SectionTitle>진행 방식</SectionTitle>
      <Card>
        <Pressable onPress={() => setUseGroup(!useGroup)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: useGroup ? C.green : '#e7e5e4', alignItems: 'center', justifyContent: 'center' }}>
            {useGroup && <Text style={{ color: C.lime, fontWeight: '900', fontSize: 13 }}>✓</Text>}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '700' }}>예선 조별리그 진행</Text>
            <Text style={{ fontSize: 11, color: C.faint }}>체크 해제 시 곧바로 토너먼트만 진행합니다</Text>
          </View>
        </Pressable>

        {useGroup && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>조 개수</Text>
              <Field keyboardType="number-pad" value={groupCount} onChangeText={setGroupCount} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>조별 진출 팀</Text>
              <Field keyboardType="number-pad" value={advance} onChangeText={setAdvance} />
            </View>
          </View>
        )}
      </Card>

      <SectionTitle>참가자 선택 ({pickedList.length}명)</SectionTitle>
      <Card>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {members.map((m) => (
            <Chip key={m.id} tone={picked[m.id] ? 'green' : 'outline'}
              onPress={() => setPicked({ ...picked, [m.id]: !picked[m.id] })}>
              {m.name}
            </Chip>
          ))}
        </View>
      </Card>

      <SectionTitle>팀 구성 방식</SectionTitle>
      <Card>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Chip tone={teamMode === 'balanced' ? 'green' : 'outline'} onPress={() => setTeamMode('balanced')}>NTRP 균등</Chip>
          <Chip tone={teamMode === 'random' ? 'green' : 'outline'} onPress={() => setTeamMode('random')}>무작위</Chip>
        </View>
        {teams.length > 0 && (
          <View style={{ marginTop: 10 }}>
            <Text style={{ fontSize: 11, color: C.sub, marginBottom: 6 }}>
              구성된 {teams.length}팀 — 시드를 줄 팀에 번호를 입력하세요(1이 최상위 시드, 비워도 됨)
            </Text>
            {teams.map((t, i) => (
              <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
                <Text style={{ flex: 1, fontSize: 13, fontWeight: '600' }}>{t.name}</Text>
                <Field placeholder="시드" keyboardType="number-pad" value={seeds[i] || ''}
                  onChangeText={(v) => setSeeds({ ...seeds, [i]: v })} style={{ width: 64, textAlign: 'center' }} />
              </View>
            ))}
          </View>
        )}
      </Card>

      <View style={{ marginTop: 12 }}>
        <Btn full disabled={teams.length < 2} onPress={create}>대회 개설</Btn>
      </View>
    </View>
  );
}

/* ---------------- 조별리그 진행 ---------------- */
function GroupStage({ clubId, t, isAdmin, nameOfEntry, flash }) {
  const [edit, setEdit] = useState(null);
  const [sc, setSc] = useState({ a: '', b: '' });

  const saveScore = (groupId, matchId) => {
    if (sc.a === '' || sc.b === '' || sc.a === sc.b) return flash('스코어 확인 (동점 불가)');
    const groups = t.groups.map((g) => (g.id !== groupId ? g : {
      ...g,
      matches: g.matches.map((m) => (m.id === matchId ? { ...m, score: { a: +sc.a, b: +sc.b } } : m)),
    }));
    updateTournament(clubId, t.id, { groups });
    setEdit(null); setSc({ a: '', b: '' });
  };

  const allDone = t.groups.every((g) => g.matches.every((m) => m.score));

  const goKnockout = () => {
    const q = qualifiers(t.groups, t.advancePerGroup || 2);
    if (q.length < 2) return flash('진출 팀이 부족합니다');
    const bracket = buildBracket(q.map((x) => x.entryId));
    updateTournament(clubId, t.id, { bracket, stage: 'knockout' });
    flash('본선 토너먼트 대진이 생성되었습니다');
  };

  return (
    <View>
      {t.groups.map((g) => {
        const st = groupStandings(g);
        return (
          <View key={g.id}>
            <SectionTitle>{g.name}</SectionTitle>
            <Card>
              {st.map((s, i) => (
                <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 5, borderTopWidth: i ? 1 : 0, borderTopColor: '#f5f5f4' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: i < (t.advancePerGroup || 2) ? C.lime : '#f5f5f4', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 10, fontWeight: '900', color: i < (t.advancePerGroup || 2) ? C.ink : C.sub }}>{i + 1}</Text>
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '600' }}>{nameOfEntry(s.id)}</Text>
                  </View>
                  <Text style={{ fontSize: 11, color: C.sub }}>{s.w}승 {s.l}패 · 득실 {s.gf - s.ga > 0 ? '+' : ''}{s.gf - s.ga}</Text>
                </View>
              ))}
              <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: '#f5f5f4', paddingTop: 8 }}>
                {g.matches.map((m) => (
                  <View key={m.id} style={{ paddingVertical: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 12, flex: 1 }}>{nameOfEntry(m.a)} vs {nameOfEntry(m.b)}</Text>
                      {m.score ? (
                        <Text style={{ fontSize: 12, fontWeight: '900', color: C.green }}>{m.score.a} : {m.score.b}</Text>
                      ) : isAdmin ? (
                        <Btn small tone="ghost" onPress={() => { setEdit(m.id); setSc({ a: '', b: '' }); }}>입력</Btn>
                      ) : <Text style={{ fontSize: 11, color: C.faint }}>미진행</Text>}
                    </View>
                    {edit === m.id && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                        <Field keyboardType="number-pad" placeholder="A" value={sc.a} onChangeText={(v) => setSc({ ...sc, a: v })} style={{ flex: 1 }} />
                        <Text style={{ fontWeight: '900', color: C.faint }}>:</Text>
                        <Field keyboardType="number-pad" placeholder="B" value={sc.b} onChangeText={(v) => setSc({ ...sc, b: v })} style={{ flex: 1 }} />
                        <Btn small onPress={() => saveScore(g.id, m.id)}>저장</Btn>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            </Card>
          </View>
        );
      })}

      {isAdmin && (
        <View style={{ marginTop: 12 }}>
          <Btn full disabled={!allDone} onPress={goKnockout}>
            {allDone ? '예선 종료 → 본선 대진 생성' : '예선 경기를 모두 입력하세요'}
          </Btn>
        </View>
      )}
    </View>
  );
}

/* ---------------- 토너먼트 진행 ---------------- */
function Knockout({ clubId, t, isAdmin, nameOfEntry, flash }) {
  const [edit, setEdit] = useState(null);
  const [sc, setSc] = useState({ a: '', b: '' });
  const bracket = t.bracket;
  if (!bracket?.rounds?.length) return <Card><Text style={{ color: C.sub }}>본선 대진이 아직 없습니다.</Text></Card>;

  const champion = championOf(bracket);

  const save = (matchId) => {
    if (sc.a === '' || sc.b === '' || sc.a === sc.b) return flash('스코어 확인 (동점 불가)');
    const next = applyResult(bracket, matchId, +sc.a, +sc.b);
    const done = championOf(next);
    updateTournament(clubId, t.id, {
      bracket: next,
      ...(done ? { status: 'finished', championId: done } : {}),
    });
    setEdit(null); setSc({ a: '', b: '' });
    if (done) flash(`🏆 우승: ${nameOfEntry(done)}`);
  };

  return (
    <View>
      {champion && (
        <Card style={{ backgroundColor: C.ink, borderColor: C.green, alignItems: 'center', paddingVertical: 20 }}>
          <Text style={{ color: C.lime, fontSize: 11, fontWeight: '900', letterSpacing: 1 }}>CHAMPION</Text>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 6 }}>🏆 {nameOfEntry(champion)}</Text>
        </Card>
      )}
      {bracket.rounds.map((round, ri) => (
        <View key={ri}>
          <SectionTitle>{roundName(ri, bracket.rounds.length)}</SectionTitle>
          {round.matches.map((m) => {
            const bye = (m.a && !m.b) || (!m.a && m.b);
            return (
              <Card key={m.id} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: m.winner === m.a ? '900' : '600', color: m.winner === m.a ? C.green : C.text }}>
                      {m.a ? nameOfEntry(m.a) : '—'}
                    </Text>
                    <Text style={{ fontSize: 13, fontWeight: m.winner === m.b ? '900' : '600', color: m.winner === m.b ? C.green : C.text, marginTop: 2 }}>
                      {m.b ? nameOfEntry(m.b) : '—'}
                    </Text>
                  </View>
                  {m.score ? (
                    <Text style={{ fontSize: 14, fontWeight: '900', color: C.green }}>{m.score.a} : {m.score.b}</Text>
                  ) : bye ? (
                    <Chip tone="default">부전승</Chip>
                  ) : isAdmin && m.a && m.b ? (
                    <Btn small tone="ghost" onPress={() => { setEdit(m.id); setSc({ a: '', b: '' }); }}>입력</Btn>
                  ) : <Text style={{ fontSize: 11, color: C.faint }}>대기</Text>}
                </View>
                {edit === m.id && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                    <Field keyboardType="number-pad" placeholder="위" value={sc.a} onChangeText={(v) => setSc({ ...sc, a: v })} style={{ flex: 1 }} />
                    <Text style={{ fontWeight: '900', color: C.faint }}>:</Text>
                    <Field keyboardType="number-pad" placeholder="아래" value={sc.b} onChangeText={(v) => setSc({ ...sc, b: v })} style={{ flex: 1 }} />
                    <Btn small onPress={() => save(m.id)}>저장</Btn>
                  </View>
                )}
              </Card>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/* ---------------- 메인 ---------------- */
export function Tournaments({ clubId, members, tournaments, isAdmin, flash }) {
  const [view, setView] = useState('list'); // list | create | detail
  const [openId, setOpenId] = useState(null);

  const t = tournaments.find((x) => x.id === openId);
  const nameOfEntry = (entryId) => {
    if (!entryId) return '—';
    const e = t?.entries?.find((x) => x.id === entryId);
    return e ? e.name : '?';
  };

  if (view === 'create') {
    return (
      <View>
        <Pressable onPress={() => setView('list')}><Text style={{ color: C.green2, fontSize: 13, marginBottom: 8 }}>‹ 목록으로</Text></Pressable>
        <CreateTournament clubId={clubId} members={members} flash={flash} onDone={() => setView('list')} />
      </View>
    );
  }

  if (view === 'detail' && t) {
    return (
      <View>
        <Pressable onPress={() => { setView('list'); setOpenId(null); }}>
          <Text style={{ color: C.green2, fontSize: 13, marginBottom: 8 }}>‹ 목록으로</Text>
        </Pressable>
        <Card>
          <Text style={{ fontSize: 16, fontWeight: '900' }}>{t.name}</Text>
          <Text style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>
            {t.date} · {t.entries?.length || 0}팀 · {t.useGroupStage ? '예선 + 토너먼트' : '토너먼트'}
            {t.status === 'finished' ? ' · 종료' : ' · 진행 중'}
          </Text>
        </Card>

        {t.stage === 'group' ? (
          <GroupStage clubId={clubId} t={t} isAdmin={isAdmin} nameOfEntry={nameOfEntry} flash={flash} />
        ) : (
          <Knockout clubId={clubId} t={t} isAdmin={isAdmin} nameOfEntry={nameOfEntry} flash={flash} />
        )}

        {isAdmin && (
          <View style={{ marginTop: 20, alignItems: 'center' }}>
            <Pressable onPress={() => { deleteTournament(clubId, t.id); setView('list'); flash('대회 삭제됨'); }}>
              <Text style={{ color: C.danger, fontSize: 12 }}>대회 삭제</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  const ongoing = tournaments.filter((x) => x.status !== 'finished');
  const finished = tournaments.filter((x) => x.status === 'finished');
  const Row = ({ x }) => (
    <Card key={x.id} style={{ marginBottom: 8 }}>
      <Pressable onPress={() => { setOpenId(x.id); setView('detail'); }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '700' }}>{x.name}</Text>
            <Text style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>
              {x.date} · {x.entries?.length || 0}팀
              {x.championId ? ` · 🏆 ${x.entries?.find((e) => e.id === x.championId)?.name || ''}` : ''}
            </Text>
          </View>
          <Chip tone={x.status === 'finished' ? 'default' : 'lime'}>{x.status === 'finished' ? '종료' : '진행중'}</Chip>
        </View>
      </Pressable>
    </Card>
  );

  return (
    <View>
      {isAdmin && (
        <View style={{ marginBottom: 12 }}>
          <Btn full onPress={() => setView('create')}>+ 새 대회 개설</Btn>
        </View>
      )}
      {ongoing.length > 0 && <SectionTitle>진행 중</SectionTitle>}
      {ongoing.map((x) => <Row key={x.id} x={x} />)}
      {finished.length > 0 && <SectionTitle>지난 대회 기록</SectionTitle>}
      {finished.map((x) => <Row key={x.id} x={x} />)}
      {tournaments.length === 0 && (
        <Card><Text style={{ fontSize: 12, color: C.sub }}>등록된 대회가 없습니다.{isAdmin ? ' 위 버튼으로 개설하세요.' : ''}</Text></Card>
      )}
    </View>
  );
}
