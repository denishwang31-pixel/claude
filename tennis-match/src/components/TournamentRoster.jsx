/* ============================================================
   대회 참가자 관리 — 확정한 뒤에도 운영진이 넣고 뺀다 (청백전 2팀·3팀 · 팀 리그 · 교류전)

   2026-10-06 앱 주인: "대회 인원 확정했는데 변경이 필요해 — 모집 말고 운영진이 추가할 수 있게".
   · 클럽 회원에서 고르거나, 회원이 아니면 게스트로(이름·성별)
   · 새로 넣은 사람은 [팀 배치 현황]의 미배정에 들어간다 — 팀은 운영진이 골라 넣는다
     (교류전은 우리 클럽 쪽으로 바로)
   · 대진에 들어 있는 사람은 못 뺀다 — 대진표 수정에서 다른 사람으로 바꾼 뒤 뺀다
   계산은 lib/teamLeague.js rosterAddPatch / rosterRemovePatch.
   ============================================================ */
import React, { useMemo, useState } from 'react';
import { View, Text, Alert } from 'react-native';
import { Card, Chip, Field, Btn } from './ui';
import { Label } from './pickers';
import { Fold } from './MatchBoard';
import { C, S } from '../lib/theme';
import { effectiveNtrp } from '../lib/ntrp';
import { rosterAddPatch, rosterRemovePatch } from '../lib/teamLeague';
import { makeGuest } from '../lib/groupLeague';
import { breadcrumb, later } from '../lib/crashReport';

const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();

/** 회원 → 대회 명단 한 사람(대회 개설 때와 같은 모양 — 대회 등급을 매겼으면 그 등급으로) */
export function rosterPerson(m, t) {
  const tg = t?.tgrades?.[m.id];
  const scheme = t?.tgScheme;
  return {
    id: m.id, name: m.name, gender: m.gender || 'M',
    busu: (tg && scheme === 'busu') ? tg : (m.busu || ''),
    grade: (tg && scheme === 'grade') ? tg : (m.grade || ''),
    ntrp: effectiveNtrp(m).value ?? null,
    ...(tg ? { tgrade: tg } : {}),
  };
}

export function TournamentRoster({ t, members = [], onPatch, flash }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [guest, setGuest] = useState({ name: '', gender: 'M' });
  const roster = t?.roster || [];
  const inRoster = useMemo(() => new Set(roster.map((p) => p.id)), [roster]);
  const pickable = useMemo(() => {
    const k = norm(q);
    return (members || [])
      .filter((m) => m && m.id && !m.deleted && m.status !== '탈퇴' && !inRoster.has(m.id))
      .filter((m) => !k || norm(m.name).includes(k))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko'));
  }, [members, inRoster, q]);
  const sorted = useMemo(
    () => [...roster].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko')),
    [roster],
  );
  const where = t?.format === 'club_match' ? '우리 클럽 쪽에 넣었습니다' : '[팀 배치 현황] 미배정에 넣었습니다 — 팀을 골라 주세요';

  const add = async (people) => {
    const { patch, added } = rosterAddPatch(t, people);
    if (!patch) return flash('이미 참가자입니다');
    breadcrumb(`대회 참가자 추가 ${added.length}명`);
    try {
      await onPatch(patch);
      flash(`${added.map((p) => p.name).join(', ')} 추가 — ${where}`);
    } catch (e) {
      flash('추가하지 못했습니다. 인터넷 연결을 확인해 주세요');
    }
  };
  const addGuest = () => {
    const g = makeGuest(guest.name);
    if (!g) return flash('게스트 이름을 넣어 주세요');
    add([{ ...g, gender: guest.gender, busu: '', grade: '', ntrp: null }]);
    setGuest({ name: '', gender: guest.gender });
  };
  const remove = (p) => {
    const r = rosterRemovePatch(t, p.id);
    if (r.error === 'inGames') {
      return Alert.alert(`${p.name} 님은 대진 ${r.games}경기에 들어 있습니다`,
        '대진표 위 [대진표 수정]에서 그 경기를 다른 사람으로 바꾸거나 지운 뒤에 빼 주세요. 그대로 빼면 경기가 한쪽 사람 없이 남습니다.');
    }
    if (r.error) return undefined;
    return Alert.alert(`${p.name} 님을 참가자에서 뺄까요?`, '팀 편성에서도 빠집니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '빼기', style: 'destructive',
        onPress: () => later(async () => {
          breadcrumb('대회 참가자 빼기');
          try { await onPatch(r.patch); flash(`${p.name} 님을 뺐습니다`); } catch (e) { flash('빼지 못했습니다. 인터넷 연결을 확인해 주세요'); }
        }, '대회 참가자 빼기', () => flash('빼지 못했습니다')),
      },
    ]);
  };

  return (
    <Fold title={`참가자 관리 (${roster.length}명)`} open={open} onToggle={() => setOpen(!open)}
      summary="확정한 뒤에도 운영진이 넣고 뺍니다 — 새로 넣은 사람은 미배정으로">
      <Card>
        <Label hint="누르면 바로 참가자가 됩니다">클럽 회원에서 넣기</Label>
        <Field placeholder="이름 찾기" value={q} onChangeText={setQ} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {pickable.slice(0, 60).map((m) => (
            <Chip key={m.id} tone="outline" onPress={() => add([rosterPerson(m, t)])}>＋ {m.name}</Chip>
          ))}
          {!pickable.length && (
            <Text style={{ fontSize: 12, color: C.faint }}>{q ? `"${q}" 이름의 회원이 없습니다` : '모든 회원이 이미 참가자입니다'}</Text>
          )}
        </View>

        <View style={{ marginTop: S.lg }}>
          <Label hint="클럽 회원이 아닌 사람">게스트 넣기</Label>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ flex: 1 }}>
              <Field placeholder="게스트 이름" value={guest.name} onChangeText={(v) => setGuest({ ...guest, name: v })} />
            </View>
            {[['M', '남'], ['F', '여']].map(([g, l]) => (
              <Chip key={g} tone={guest.gender === g ? 'green' : 'outline'} onPress={() => setGuest({ ...guest, gender: g })}>{l}</Chip>
            ))}
            <Btn small onPress={addGuest}>추가</Btn>
          </View>
        </View>

        <View style={{ marginTop: S.lg }}>
          <Label hint="누르면 뺍니다(대진에 들어 있으면 먼저 바꿔야 합니다)">지금 참가자 {roster.length}명</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {sorted.map((p) => (
              <Chip key={p.id} tone="soft" onPress={() => remove(p)}>{p.name}{p.guest ? ' (게스트)' : ''} ✕</Chip>
            ))}
          </View>
        </View>
      </Card>
    </Fold>
  );
}

export default TournamentRoster;
