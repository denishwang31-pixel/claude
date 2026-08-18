/* ============================================================
   클럽 교류전 — 상대 클럽과 하나의 대회를 같이 본다

   흐름
     목록 → [＋ 교류전 개설] → 상대 클럽 검색(또는 직접 입력) → 초대
     상대 운영진이 수락 → 양쪽이 각자 출전 명단 입력
     개설한 클럽이 설정을 정하고 대진 생성 → 결과 입력

   화면을 셋으로 나눴다.
     list    우리 클럽이 낀 교류전 전부 (받은 초대가 위)
     create  초대 보내기
     detail  성사된 교류전 한 건
   ============================================================ */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Alert, Pressable } from 'react-native';
import {
  createClubMatch, updateClubMatch, subClubMatches, searchClubs,
} from '../lib/firestore';
import {
  CM_STATUS, CM_STATUS_LABEL, CM_KIND, SCORING, END_GAMES,
  normalizeConfig, describeConfig, isHost, isGuest, canManage, canRespond,
  rosterSideFor, hostFillsBothRosters, rosterGuideFor, validateInvite, diagnose,
} from '../lib/clubMatch';
import {
  generateTypedTeamMatches, blankTeamMatches, emptySlots,
  TEAM_ROUND_TYPES, teamScore, teamPlayerStats,
} from '../lib/teamMatch';
import { BUSU_KEYS } from '../lib/constants';
import { MatchGrid } from './MatchGrid';
import { AppButton, Segmented, Touchable, useOptionSheet, Fab } from './native';
import { Card, SectionTitle, Chip, Field, Btn, EmptyState, CheckRow, Divider } from './ui';
import { Label, DateField, TimeField } from './pickers';
import { Icon } from './Icon';
import { C, S, R, F } from '../lib/theme';

const rid = () => 'x' + Math.random().toString(36).slice(2, 8);
const today = () => new Date().toISOString().slice(0, 10);

const STATUS_TONE = {
  [CM_STATUS.PENDING]: 'warn',
  [CM_STATUS.ACCEPTED]: 'green',
  [CM_STATUS.DECLINED]: 'red',
  [CM_STATUS.CANCELED]: 'default',
  [CM_STATUS.DONE]: 'soft',
};

/* ============================================================
   목록
   ============================================================ */
function MatchList({ items, clubId, onOpen, onCreate, isAdmin }) {
  /* 받은 초대를 맨 위로. 답을 기다리는 쪽이 가장 급하다. */
  const sorted = useMemo(() => {
    const rank = (m) => {
      if (m.status === CM_STATUS.PENDING && isGuest(m, clubId)) return 0;
      if (m.status === CM_STATUS.ACCEPTED) return 1;
      if (m.status === CM_STATUS.PENDING) return 2;
      return 3;
    };
    return [...items].sort((a, b) => rank(a) - rank(b)
      || String(b.date || '').localeCompare(String(a.date || '')));
  }, [items, clubId]);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 96 }}>
        {sorted.map((m) => {
          const mine = isHost(m, clubId);
          const other = mine
            ? (m.guestClubName || '상대 클럽')
            : (m.hostClubName || '주최 클럽');
          const needsAnswer = m.status === CM_STATUS.PENDING && isGuest(m, clubId);
          return (
            <Card key={m.id} style={{
              marginBottom: 10,
              borderWidth: needsAnswer ? 2 : 1,
              borderColor: needsAnswer ? C.green : C.border,
            }} onPress={() => onOpen(m.id)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Chip tone={STATUS_TONE[m.status] || 'default'}>
                      {CM_STATUS_LABEL[m.status] || m.status}
                    </Chip>
                    <Chip tone="default">{mine ? '우리가 개설' : '초대받음'}</Chip>
                    {m.kind === CM_KIND.MANUAL && <Chip tone="default">미등록 클럽</Chip>}
                  </View>
                  <Text style={[F.bodyBold, { marginTop: 6 }]}>vs {other}</Text>
                  <Text style={{ fontSize: 11.5, color: C.sub, marginTop: 2 }}>
                    {m.date || '날짜 미정'}{m.place ? ` · ${m.place}` : ''}
                  </Text>
                  <Text style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>
                    {describeConfig(m.config)}
                  </Text>
                </View>
                <Icon name="forward" size={15} color={C.faint} />
              </View>
              {needsAnswer && (
                <Text style={{ fontSize: 11.5, color: C.green, fontWeight: '700', marginTop: 8 }}>
                  수락 여부를 알려 주세요 →
                </Text>
              )}
            </Card>
          );
        })}

        {sorted.length === 0 && (
          <EmptyState
            icon="🤝"
            title="교류전이 없습니다"
            body={isAdmin
              ? '앱에 등록된 클럽이면 검색해서 초대할 수 있습니다. 등록되지 않은 클럽은 이름과 선수를 직접 넣어 진행합니다.'
              : '운영진이 교류전을 개설하면 여기에 표시됩니다.'}
          />
        )}
      </ScrollView>

      {isAdmin && <Fab icon="＋" label="교류전 개설" onPress={onCreate} />}
    </View>
  );
}

/* ============================================================
   개설 — 상대 클럽 검색 또는 직접 입력
   ============================================================ */
function CreateMatch({ clubId, clubName, me, onDone, onCancel, flash }) {
  const [kind, setKind] = useState(CM_KIND.LINKED);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState(null);      // 검색해서 고른 클럽
  const [manualName, setManualName] = useState('');
  const [date, setDate] = useState(today());
  const [place, setPlace] = useState('');
  const [note, setNote] = useState('');

  const runSearch = async () => {
    setSearching(true);
    try {
      const list = await searchClubs(q, 30);
      // 우리 클럽은 상대가 될 수 없다
      setResults(list.filter((c) => c.id !== clubId));
    } catch (e) {
      flash('클럽 검색에 실패했습니다');
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => { if (kind === CM_KIND.LINKED) runSearch(); }, [kind]);

  const submit = async () => {
    const err = validateInvite({
      kind,
      guestClubId: picked?.id,
      guestClubName: kind === CM_KIND.LINKED ? picked?.name : manualName,
      date,
    });
    if (err) return flash(err);

    const payload = {
      kind,
      hostClubId: clubId,
      hostClubName: clubName || '우리 클럽',
      guestClubId: kind === CM_KIND.LINKED ? picked.id : null,
      guestClubName: kind === CM_KIND.LINKED ? picked.name : manualName.trim(),
      date,
      place: place.trim(),
      note: note.trim(),
      status: CM_STATUS.PENDING,
      createdBy: me,
      config: normalizeConfig({}),
      hostRoster: [],
      guestRoster: [],
      matches: [],
    };

    /* 미등록 클럽은 수락해 줄 사람이 없다. 초대장을 띄워 놓고
       영원히 기다리게 하면 안 되므로 바로 진행 상태로 만든다. */
    if (kind === CM_KIND.MANUAL) payload.status = CM_STATUS.ACCEPTED;

    try {
      const ref = await createClubMatch(payload);
      flash(kind === CM_KIND.LINKED
        ? '초대를 보냈습니다. 상대 클럽이 수락하면 명단을 넣을 수 있습니다'
        : '교류전을 개설했습니다');
      return onDone(ref.id);
    } catch (e) {
      return flash('개설에 실패했습니다. 잠시 후 다시 시도하세요');
    }
  };

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <SectionTitle>상대 클럽</SectionTitle>
      <Card>
        <Segmented
          options={[
            { key: CM_KIND.LINKED, label: '앱에 등록됨' },
            { key: CM_KIND.MANUAL, label: '미등록' },
          ]}
          value={kind}
          onChange={(v) => { setKind(v); setPicked(null); }}
        />
        <Text style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 16 }}>
          {kind === CM_KIND.LINKED
            ? '검색해서 연결하면 상대 클럽 운영진에게 초대가 갑니다. 수락하면 상대가 자기 출전 명단을 직접 넣습니다.'
            : '상대가 앱을 쓰지 않는 경우입니다. 선수 명단을 우리가 직접 입력해 진행합니다.'}
        </Text>

        {kind === CM_KIND.LINKED ? (
          <View style={{ marginTop: S.md }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Field
                placeholder="클럽 이름 또는 지역"
                value={q}
                onChangeText={setQ}
                onSubmitEditing={runSearch}
                style={{ flex: 1 }}
              />
              <Btn onPress={runSearch}>검색</Btn>
            </View>

            {picked && (
              <View style={{
                marginTop: S.md, padding: 10, borderRadius: R.md,
                backgroundColor: C.greenSoft, borderWidth: 1.5, borderColor: C.green,
              }}>
                <Text style={{ fontSize: 12.5, fontWeight: '800', color: C.green }}>
                  선택: {picked.name}
                </Text>
                <Text style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>
                  {picked.region || '지역 미등록'} · 회원 {picked.memberCount || 0}명
                </Text>
              </View>
            )}

            <View style={{ marginTop: S.md, gap: 6 }}>
              {searching && <Text style={{ fontSize: 11.5, color: C.faint }}>검색 중…</Text>}
              {!searching && results.length === 0 && (
                <Text style={{ fontSize: 11.5, color: C.faint, lineHeight: 17 }}>
                  검색 결과가 없습니다. 상대 클럽이 아직 앱에 없다면
                  위에서 [미등록]을 고르세요.
                </Text>
              )}
              {results.map((c) => (
                <Touchable key={c.id} onPress={() => setPicked(c)}
                  style={{
                    padding: 10, borderRadius: R.md, borderWidth: 1,
                    borderColor: picked?.id === c.id ? C.green : C.border,
                    backgroundColor: picked?.id === c.id ? C.greenSoft : C.surface,
                  }}>
                  <Text style={{ fontSize: 13, fontWeight: '700' }}>{c.name}</Text>
                  <Text style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>
                    {c.region || '지역 미등록'} · 회원 {c.memberCount || 0}명
                    {c.maleCount || c.femaleCount ? ` (남 ${c.maleCount || 0} · 여 ${c.femaleCount || 0})` : ''}
                  </Text>
                </Touchable>
              ))}
            </View>
          </View>
        ) : (
          <View style={{ marginTop: S.md }}>
            <Label>상대 클럽 이름</Label>
            <Field placeholder="예: 한강 테니스클럽" value={manualName} onChangeText={setManualName} />
          </View>
        )}
      </Card>

      <SectionTitle>일정</SectionTitle>
      <Card>
        <Label>경기 날짜</Label>
        <DateField value={date} onChange={setDate} minDate={today()} />
        <View style={{ marginTop: S.md }}>
          <Label hint="선택">장소</Label>
          <Field placeholder="예: 염곡 테니스장" value={place} onChangeText={setPlace} />
        </View>
        <View style={{ marginTop: S.md }}>
          <Label hint="선택 · 초대장에 함께 갑니다">전하는 말</Label>
          <Field placeholder="예: 8명 정도 생각하고 있습니다" value={note} onChangeText={setNote} />
        </View>
        <Text style={{ fontSize: 11, color: C.faint, marginTop: S.md, lineHeight: 16 }}>
          코트 면수·타임 수·경기 방식은 개설한 뒤 [대진 설정]에서 정합니다.
          상대가 수락한 다음에 맞춰도 됩니다.
        </Text>
      </Card>

      <View style={{ marginTop: S.lg, gap: 8 }}>
        <AppButton full onPress={submit}>
          {kind === CM_KIND.LINKED ? '초대 보내기' : '교류전 개설'}
        </AppButton>
        <AppButton full variant="text" onPress={onCancel}>취소</AppButton>
      </View>
    </ScrollView>
  );
}

/* ============================================================
   명단 편집 — 자기 클럽 자리만
   ============================================================ */
function RosterEditor({ title, roster, members, editable, external, onChange, flash }) {
  const [manual, setManual] = useState({ name: '', gender: 'M', busu: '' });
  const has = (id) => roster.some((p) => p.id === id);

  const toggle = (m) => {
    if (has(m.id)) onChange(roster.filter((p) => p.id !== m.id));
    else {
      onChange([...roster, {
        id: m.id, name: m.name, gender: m.gender === 'F' ? 'F' : 'M',
        busu: m.busu || '', grade: m.grade || '',
      }]);
    }
  };

  const addManual = () => {
    if (!manual.name.trim()) return flash('선수 이름을 입력하세요');
    onChange([...roster, {
      id: `opp:${rid()}`,
      name: manual.name.trim(),
      gender: manual.gender,
      busu: manual.busu,
      external: true,
    }]);
    return setManual({ name: '', gender: 'M', busu: '' });
  };

  const m = roster.filter((p) => p.gender !== 'F').length;
  const f = roster.filter((p) => p.gender === 'F').length;

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={[F.bodyBold, { flex: 1 }]}>{title}</Text>
        <Chip tone={roster.length ? 'green' : 'default'}>
          {roster.length}명 (남 {m} · 여 {f})
        </Chip>
      </View>

      {roster.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: S.md }}>
          {roster.map((p) => (
            <Touchable key={p.id}
              onPress={() => editable && onChange(roster.filter((x) => x.id !== p.id))}
              style={{
                paddingHorizontal: 9, paddingVertical: 6, borderRadius: R.sm,
                backgroundColor: p.gender === 'F' ? C.femaleBg : C.maleBg,
                flexDirection: 'row', alignItems: 'center', gap: 4,
              }}>
              <Text style={{
                fontSize: 12, fontWeight: '700',
                color: p.gender === 'F' ? C.female : C.male,
              }}>
                {p.name}{p.busu ? ` ${p.busu}` : ''}
              </Text>
              {editable && <Text style={{ fontSize: 11, color: C.faint }}>✕</Text>}
            </Touchable>
          ))}
        </View>
      )}

      {editable && !external && (
        <View style={{ marginTop: S.md, borderTopWidth: 1, borderTopColor: C.border, paddingTop: S.md }}>
          <Text style={{ fontSize: 11, color: C.faint, marginBottom: 6 }}>
            회원을 눌러 넣고 뺍니다.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
            {members.map((mem) => (
              <Chip key={mem.id} tone={has(mem.id) ? 'green' : 'outline'}
                onPress={() => toggle(mem)}>
                {mem.name}{mem.gender === 'F' ? ' 여' : ' 남'}
              </Chip>
            ))}
          </View>
        </View>
      )}

      {editable && external && (
        <View style={{ marginTop: S.md, borderTopWidth: 1, borderTopColor: C.border, paddingTop: S.md }}>
          <Text style={{ fontSize: 11, color: C.faint, marginBottom: 8, lineHeight: 16 }}>
            상대 클럽이 앱에 없어 우리가 대신 넣습니다.
          </Text>
          <Field placeholder="선수 이름" value={manual.name}
            onChangeText={(v) => setManual({ ...manual, name: v })} />
          <View style={{ flexDirection: 'row', gap: S.sm, marginTop: S.sm, alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <Label>성별</Label>
              <Segmented
                options={[{ key: 'M', label: '남' }, { key: 'F', label: '여' }]}
                value={manual.gender}
                onChange={(v) => setManual({ ...manual, gender: v })}
              />
            </View>
          </View>
          <View style={{ marginTop: S.sm }}>
            <Label hint="선택">부수</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
              {BUSU_KEYS.map((b) => (
                <Chip key={b} tone={manual.busu === b ? 'green' : 'outline'}
                  onPress={() => setManual({ ...manual, busu: manual.busu === b ? '' : b })}>{b}</Chip>
              ))}
            </View>
          </View>
          <View style={{ marginTop: S.md }}>
            <AppButton full variant="tonal" icon="＋" onPress={addManual}>선수 추가</AppButton>
          </View>
        </View>
      )}
    </Card>
  );
}

/* ============================================================
   상세
   ============================================================ */
function MatchDetail({
  match: m, clubId, me, members, isAdmin, onBack, flash,
}) {
  const cfg = normalizeConfig(m.config);
  const host = isHost(m, clubId);
  const manage = canManage(m, clubId, isAdmin);
  const respond = canRespond(m, clubId, isAdmin);
  const side = rosterSideFor(m, clubId, isAdmin);
  const bothMine = hostFillsBothRosters(m) && host;
  const guide = rosterGuideFor(m, clubId, isAdmin);

  const [draft, setDraft] = useState(cfg);
  const [picking, setPicking] = useState(null);   // 수동 편성 중인 칸
  const sheet = useOptionSheet();

  const hostRoster = m.hostRoster || [];
  const guestRoster = m.guestRoster || [];
  const matches = m.matches || [];

  const nameOf = useMemo(() => {
    const map = {};
    [...hostRoster, ...guestRoster].forEach((p) => { map[p.id] = p.name; });
    return (id) => map[id] || '?';
  }, [hostRoster, guestRoster]);

  const genderOf = useMemo(() => {
    const map = {};
    [...hostRoster, ...guestRoster].forEach((p) => { map[p.id] = p.gender; });
    return (id) => map[id] || '';
  }, [hostRoster, guestRoster]);

  const score = useMemo(() => teamScore(matches), [matches]);
  const mvp = useMemo(
    () => teamPlayerStats([...hostRoster, ...guestRoster], matches)
      .filter((r) => r.games > 0).slice(0, 3),
    [hostRoster, guestRoster, matches],
  );
  const check = useMemo(
    () => diagnose(hostRoster, guestRoster, draft),
    [hostRoster, guestRoster, draft],
  );

  const save = (patch) => updateClubMatch(m.id, patch).catch(() => flash('저장에 실패했습니다'));

  const answer = (accepted) => {
    Alert.alert(
      accepted ? '교류전 수락' : '교류전 거절',
      accepted
        ? `${m.hostClubName}과의 ${m.date} 교류전을 수락합니다.\n수락하면 우리 출전 명단을 넣을 수 있습니다.`
        : `${m.hostClubName}의 초대를 거절합니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: accepted ? '수락' : '거절',
          style: accepted ? 'default' : 'destructive',
          onPress: () => {
            save({
              status: accepted ? CM_STATUS.ACCEPTED : CM_STATUS.DECLINED,
              respondedBy: me,
              respondedAt: new Date(),
            });
            flash(accepted ? '수락했습니다' : '거절했습니다');
          },
        },
      ],
    );
  };

  const setRoundType = (r, key) =>
    setDraft({ ...draft, roundTypes: { ...draft.roundTypes, [r]: key } });

  const saveConfig = () => {
    save({ config: normalizeConfig(draft) });
    flash('대진 설정을 저장했습니다');
  };

  const autoDraw = () => {
    if (hostRoster.length < 2 || guestRoster.length < 2) {
      return flash('양 클럽 모두 2명 이상 필요합니다');
    }
    const { matches: ms, shortages } = generateTypedTeamMatches(hostRoster, guestRoster, {
      courts: draft.courts, rounds: draft.rounds, roundTypes: draft.roundTypes,
    });
    if (!ms.length) return flash('편성 가능한 구성이 없습니다. 명단과 타임 유형을 확인하세요');
    save({ config: normalizeConfig(draft), matches: ms });
    if (shortages.length) {
      Alert.alert('일부 코트를 채우지 못했습니다',
        `${ms.length}경기를 만들었습니다.\n\n`
        + `${shortages.slice(0, 6).map((s) => `${s.round}타임 ${s.court}코트 ${s.type} — ${s.side === 'A' ? m.hostClubName : m.guestClubName} 인원 부족`).join('\n')}`
        + `${shortages.length > 6 ? `\n외 ${shortages.length - 6}건` : ''}`);
      return undefined;
    }
    return flash(`${ms.length}경기를 편성했습니다`);
  };

  const manualDraw = () => {
    const blanks = blankTeamMatches({
      courts: draft.courts, rounds: draft.rounds, roundTypes: draft.roundTypes,
    });
    save({ config: normalizeConfig({ ...draft, autoDraw: false }), matches: blanks });
    flash('빈 대진표를 만들었습니다. 칸을 눌러 선수를 넣으세요');
  };

  /* 수동 편성 — 칸을 눌러 그 자리에 나갈 선수를 고른다 */
  const fillSlot = (mt, which) => {
    const roster = which === 'A' ? hostRoster : guestRoster;
    const cap = mt.typeKey === 'SG' ? 1 : 2;
    const cur = (which === 'A' ? mt.teamA : mt.teamB) || [];
    // 같은 타임에 이미 나가는 사람은 뺀다 — 한 사람이 두 코트에 설 수 없다
    const busy = new Set(matches
      .filter((x) => x.round === mt.round && x.id !== mt.id)
      .flatMap((x) => [...(x.teamA || []), ...(x.teamB || [])]));

    sheet.open({
      title: `${mt.round}타임 코트${mt.court} · ${mt.type}`,
      options: [
        ...roster
          .filter((p) => !busy.has(p.id))
          .map((p) => ({
            key: p.id,
            label: `${cur.includes(p.id) ? '✓ ' : ''}${p.name} (${p.gender === 'F' ? '여' : '남'})`,
          })),
        { key: '__clear', label: '이 칸 비우기', destructive: true },
      ],
      onSelect: (o) => {
        const next = matches.map((x) => {
          if (x.id !== mt.id) return x;
          const list = which === 'A' ? [...(x.teamA || [])] : [...(x.teamB || [])];
          let out;
          if (o.key === '__clear') out = [];
          else if (list.includes(o.key)) out = list.filter((id) => id !== o.key);
          else if (list.length >= cap) out = [...list.slice(1), o.key];  // 가장 오래된 것을 밀어낸다
          else out = [...list, o.key];
          return which === 'A' ? { ...x, teamA: out } : { ...x, teamB: out };
        });
        save({ matches: next });
      },
    });
  };

  const editScore = (mt) => {
    if (!manage) return;
    const win = cfg.endGames;
    const lose = Math.max(0, win - 2);
    sheet.open({
      title: `${mt.round}타임 코트${mt.court}`,
      options: [
        { key: 'a', label: `${m.hostClubName} 승 (${win}:${lose})` },
        { key: 'b', label: `${m.guestClubName} 승 (${lose}:${win})` },
        { key: 'clear', label: '기록 지우기', destructive: true },
      ],
      onSelect: (o) => {
        const next = matches.map((x) => {
          if (x.id !== mt.id) return x;
          if (o.key === 'clear') return { ...x, score: null };
          return { ...x, score: o.key === 'a' ? { a: win, b: lose } : { a: lose, b: win } };
        });
        save({ matches: next });
      },
    });
  };

  const blanks = emptySlots(matches);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Pressable onPress={onBack} style={{ paddingVertical: 8, marginBottom: 4 }}>
        <Text style={{ fontSize: 13, color: C.green, fontWeight: '700' }}>‹ 교류전 목록</Text>
      </Pressable>

      {/* 점수판 */}
      <Card style={{ backgroundColor: C.ink }}>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
          <Chip tone={STATUS_TONE[m.status] || 'default'}>
            {CM_STATUS_LABEL[m.status] || m.status}
          </Chip>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: S.md }}>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12, fontWeight: '700' }}>
              {m.hostClubName}
            </Text>
            <Text style={{ color: score.winner === 'A' ? C.lime : '#fff', fontSize: 40, fontWeight: '700' }}>
              {score.a}
            </Text>
          </View>
          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 18, fontWeight: '700' }}>:</Text>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12, fontWeight: '700' }}>
              {m.guestClubName}
            </Text>
            <Text style={{ color: score.winner === 'B' ? C.lime : '#fff', fontSize: 40, fontWeight: '700' }}>
              {score.b}
            </Text>
          </View>
        </View>
        <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, textAlign: 'center', marginTop: 6 }}>
          {m.date}{m.place ? ` · ${m.place}` : ''} · {score.played}/{score.total}경기
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10.5, textAlign: 'center', marginTop: 3 }}>
          운영: {m.hostClubName}
        </Text>
      </Card>

      {/* 초대 응답 */}
      {respond && (
        <>
          <SectionTitle>초대</SectionTitle>
          <Card style={{ borderColor: C.green, borderWidth: 1.5 }}>
            <Text style={{ fontSize: 13, lineHeight: 20 }}>
              <Text style={{ fontWeight: '800' }}>{m.hostClubName}</Text>이(가)
              {' '}{m.date} 교류전에 초대했습니다.
            </Text>
            {!!m.note && (
              <Text style={{ fontSize: 12, color: C.sub, marginTop: 6, lineHeight: 18 }}>
                “{m.note}”
              </Text>
            )}
            <Text style={{ fontSize: 11.5, color: C.faint, marginTop: 8 }}>
              {describeConfig(m.config)}
            </Text>
            <Text style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 16 }}>
              대진표 작성과 결과 입력은 개설한 {m.hostClubName}이 맡습니다.
              우리는 출전 명단을 넣습니다.
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: S.lg }}>
              <View style={{ flex: 1 }}>
                <AppButton full onPress={() => answer(true)}>수락</AppButton>
              </View>
              <View style={{ flex: 1 }}>
                <AppButton full variant="text" onPress={() => answer(false)}>거절</AppButton>
              </View>
            </View>
          </Card>
        </>
      )}

      {!!guide && !respond && (
        <Card style={{ marginTop: S.md }}>
          <Text style={{ fontSize: 12, color: C.sub, lineHeight: 18 }}>{guide}</Text>
        </Card>
      )}

      {/* 명단 */}
      <SectionTitle hint={m.status === CM_STATUS.ACCEPTED
        ? '각 클럽이 자기 명단을 넣습니다.' : undefined}>출전 명단</SectionTitle>
      <View style={{ gap: 10 }}>
        <RosterEditor
          title={`${m.hostClubName} (주최)`}
          roster={hostRoster}
          members={members}
          editable={side === 'host'}
          external={false}
          onChange={(v) => save({ hostRoster: v })}
          flash={flash}
        />
        <RosterEditor
          title={m.guestClubName}
          roster={guestRoster}
          members={members}
          editable={side === 'guest' || bothMine}
          external={bothMine}
          onChange={(v) => save({ guestRoster: v })}
          flash={flash}
        />
      </View>

      {/* 대진 설정 — 개설한 클럽만 */}
      {manage && (
        <>
          <SectionTitle>대진 설정</SectionTitle>
          <Card>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Label>시작 시간</Label>
                <TimeField value={draft.startTime} onChange={(v) => setDraft({ ...draft, startTime: v })} />
              </View>
              <View style={{ flex: 1 }}>
                <Label>코트 면수</Label>
                <Field keyboardType="number-pad" suffix="면"
                  value={String(draft.courts)}
                  onChangeText={(v) => setDraft({ ...draft, courts: v })} />
              </View>
            </View>

            <View style={{ marginTop: S.md }}>
              <Label hint="몇 타임을 돌릴지">타임 수</Label>
              <Field keyboardType="number-pad" suffix="타임"
                value={String(draft.rounds)}
                onChangeText={(v) => setDraft({ ...draft, rounds: v })} />
            </View>

            <Divider style={{ marginVertical: S.md }} />

            <Label hint="한 경기를 무엇으로 끊을지">경기 방식</Label>
            <Segmented
              options={[
                { key: SCORING.GAMES, label: '게임 수' },
                { key: SCORING.TIME, label: '시간제' },
              ]}
              value={draft.scoring}
              onChange={(v) => setDraft({ ...draft, scoring: v })}
            />
            {draft.scoring === SCORING.GAMES ? (
              <View style={{ marginTop: S.md }}>
                <Label>몇 게임</Label>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {END_GAMES.map((g) => (
                    <Chip key={g} tone={draft.endGames === g ? 'green' : 'outline'}
                      onPress={() => setDraft({ ...draft, endGames: g })}>{g}게임</Chip>
                  ))}
                </View>
              </View>
            ) : (
              <View style={{ marginTop: S.md }}>
                <Label>타임당 시간</Label>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {[20, 25, 30, 40, 50, 60].map((v) => (
                    <Chip key={v} tone={draft.roundMinutes === v ? 'green' : 'outline'}
                      onPress={() => setDraft({ ...draft, roundMinutes: v })}>{v}분</Chip>
                  ))}
                </View>
              </View>
            )}

            <Divider style={{ marginVertical: S.md }} />

            <Label hint="타임마다 어떤 경기를 할지">타임별 경기 유형</Label>
            <View style={{ gap: 6 }}>
              {Array.from({ length: Math.max(1, Math.min(20, Number(draft.rounds) || 1)) }, (_, i) => i + 1)
                .map((r) => {
                  const cur = draft.roundTypes[r] || draft.roundTypes[String(r)] || 'MX';
                  return (
                    <View key={r} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ width: 42, fontSize: 12, fontWeight: '700', color: C.sub }}>
                        {r}타임
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, flex: 1 }}>
                        {TEAM_ROUND_TYPES.map((t) => (
                          <Chip key={t.key} tone={cur === t.key ? 'green' : 'outline'}
                            onPress={() => setRoundType(r, t.key)}>{t.name}</Chip>
                        ))}
                      </View>
                    </View>
                  );
                })}
            </View>

            {/* 눌러 보기 전에 부족한 것을 알려 준다 */}
            {!check.ok && (
              <View style={{
                marginTop: S.md, padding: 10, borderRadius: R.md,
                backgroundColor: C.warnBg,
              }}>
                <Text style={{ fontSize: 11.5, fontWeight: '800', color: C.warn }}>
                  인원이 모자란 타임이 있습니다
                </Text>
                {check.problems.slice(0, 5).map((p) => (
                  <Text key={p} style={{ fontSize: 11, color: C.warn, marginTop: 3 }}>· {p}</Text>
                ))}
                <Text style={{ fontSize: 10.5, color: C.warn, marginTop: 5 }}>
                  주최 {check.host.M}남 {check.host.F}여 · 상대 {check.guest.M}남 {check.guest.F}여
                </Text>
              </View>
            )}

            <View style={{ marginTop: S.lg, gap: 8 }}>
              <AppButton full onPress={autoDraw}>대진 자동 작성</AppButton>
              <AppButton full variant="tonal" onPress={manualDraw}>
                빈 대진표 만들고 직접 넣기
              </AppButton>
              <AppButton full variant="text" onPress={saveConfig}>설정만 저장</AppButton>
            </View>
            <Text style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 16 }}>
              자동 작성은 타임별 유형을 지키면서 출전 횟수를 고르게 나눕니다.
              직접 넣기는 칸을 눌러 나갈 선수를 고릅니다.
            </Text>
          </Card>
        </>
      )}

      {/* 대진표 */}
      {matches.length > 0 && (
        <>
          <SectionTitle hint={manage ? '경기를 누르면 결과를 기록합니다.' : undefined}>
            대진표
          </SectionTitle>
          <Card style={{ padding: 10 }}>
            <MatchGrid matches={matches} nameOf={nameOf} genderOf={genderOf} onPressMatch={editScore} />
          </Card>

          {/* 수동 편성 — 비어 있는 칸 채우기 */}
          {manage && blanks.length > 0 && (
            <Card style={{ marginTop: S.md, borderColor: C.warn, borderWidth: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: C.warn }}>
                아직 선수를 넣지 않은 칸 {blanks.length}개
              </Text>
              <Text style={{ fontSize: 11, color: C.sub, marginTop: 4, lineHeight: 16 }}>
                아래에서 칸을 눌러 나갈 선수를 고르세요.
              </Text>
              <View style={{ gap: 6, marginTop: S.md }}>
                {matches.map((mt) => (
                  <View key={mt.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ width: 78, fontSize: 11, color: C.sub }}>
                      {mt.round}타임 {mt.court}코트
                    </Text>
                    <Chip tone="default">{mt.type}</Chip>
                    <Btn small tone={(mt.teamA || []).length ? 'ghost' : 'primary'}
                      onPress={() => fillSlot(mt, 'A')}>
                      {(mt.teamA || []).map(nameOf).join('·') || '주최 선택'}
                    </Btn>
                    <Btn small tone={(mt.teamB || []).length ? 'ghost' : 'primary'}
                      onPress={() => fillSlot(mt, 'B')}>
                      {(mt.teamB || []).map(nameOf).join('·') || '상대 선택'}
                    </Btn>
                  </View>
                ))}
              </View>
            </Card>
          )}

          {mvp.length > 0 && (
            <>
              <SectionTitle>오늘의 MVP</SectionTitle>
              <Card style={{ paddingVertical: 6 }}>
                {mvp.map((r, i) => (
                  <View key={r.id} style={{
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    paddingVertical: 9, borderTopWidth: i ? 1 : 0, borderTopColor: C.border,
                  }}>
                    <Text style={{ fontSize: 16 }}>{['🥇', '🥈', '🥉'][i]}</Text>
                    <Text style={[F.bodyBold, { flex: 1 }]}>{r.name}</Text>
                    <Text style={{ fontSize: 12, color: C.sub }}>{r.games}경기</Text>
                    <Text style={{ fontSize: 13.5, fontWeight: '700', color: C.green }}>{r.wins}승</Text>
                  </View>
                ))}
              </Card>
            </>
          )}
        </>
      )}

      {/* 주최 클럽의 마무리 */}
      {manage && m.status === CM_STATUS.ACCEPTED && matches.length > 0 && (
        <View style={{ marginTop: S.lg }}>
          <AppButton full variant="tonal" onPress={() => {
            save({ status: CM_STATUS.DONE });
            flash('교류전을 종료했습니다');
          }}>교류전 종료</AppButton>
        </View>
      )}

      {sheet.node}
    </ScrollView>
  );
}

/* ============================================================
   바깥 껍데기
   ============================================================ */
export function ClubMatchScreen({ clubId, clubName, me, members, isAdmin, flash }) {
  const [items, setItems] = useState([]);
  const [view, setView] = useState('list');       // list | create | detail
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    if (!clubId) return undefined;
    const un = subClubMatches(clubId, setItems);
    return () => un && un();
  }, [clubId]);

  const current = useMemo(
    () => items.find((x) => x.id === openId) || null,
    [items, openId],
  );

  if (view === 'create') {
    return (
      <CreateMatch
        clubId={clubId} clubName={clubName} me={me} flash={flash}
        onCancel={() => setView('list')}
        onDone={(id) => { setOpenId(id); setView('detail'); }}
      />
    );
  }

  if (view === 'detail' && current) {
    return (
      <MatchDetail
        match={current} clubId={clubId} me={me} members={members}
        isAdmin={isAdmin} flash={flash}
        onBack={() => { setView('list'); setOpenId(null); }}
      />
    );
  }

  return (
    <MatchList
      items={items} clubId={clubId} isAdmin={isAdmin}
      onOpen={(id) => { setOpenId(id); setView('detail'); }}
      onCreate={() => setView('create')}
    />
  );
}

export default ClubMatchScreen;
