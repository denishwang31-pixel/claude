/* 대회 — 조별+토너먼트 · KDK · 청백전 · 팀 리그 개설 · 진행 · 기록 보관
   (클럽 교류전은 두 클럽이 같이 보는 문서라 [클럽 교류전] 화면에 따로 있다) */
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, Share } from 'react-native';
import {
  addTournament, updateTournament, deleteTournament,
} from '../lib/firestore';
import {
  buildBracket, applyResult, championOf, roundName, orderBySeed, assignSkillGroups, moveMemberToGroup,
} from '../lib/tournament';
import { generateKdk, kdkStandingsByGroup, splitKdkGroups } from '../lib/kdk';
import {
  TOURNAMENT_FORMAT, TOURNAMENT_FORMATS, BUSU_KEYS, busuToNtrp, screenRef, memberRoles, ROLES,
} from '../lib/constants';
import { effectiveNtrp } from '../lib/ntrp';
import { fillFromClub, tournamentSkill, groupsByGrade, gradeCountFor, gradeSummary, schemeOf } from '../lib/grades';
import { GradeRows } from './GradeRows';
import { GroupLeagueView } from './GroupLeagueView';
import {
  DEFAULT_RULES, RULE_LABELS, RANK_RULE_TEXT, PLAY, TEAM_MODE, GROUP_METHOD,
  buildLeague, makeGuest, leagueQualifiers, normRules,
} from '../lib/groupLeague';
import { TeamMatch } from './TeamMatchScreen';
import { TeamLeague } from './TeamLeagueScreen';
import { MatchGrid } from './MatchGrid';
import { DateField, Label } from './pickers';
import { AppButton, Touchable, Segmented, useOptionSheet } from './native';
import { TournamentSignup } from './TournamentSignup';
import { Card, SectionTitle, Chip, Btn, Field, EmptyState, Divider } from './ui';
import { C, S, R, F } from '../lib/theme';
import { todayYmd } from '../lib/today';
import { firebaseConfig } from '../../firebaseConfig';

/** 외부 공개 보기 주소 — 앱이 없는 사람도 브라우저로 대진·순위를 본다(public/live.html) */
export const liveUrl = (projectId, clubId, tid) =>
  `https://${projectId}.web.app/live?c=${encodeURIComponent(clubId)}&t=${encodeURIComponent(tid)}`;

const today = () => todayYmd();

/** 목록·상세에 보여줄 형식 요약 */
function formatLabel(t) {
  const f = TOURNAMENT_FORMATS.find((x) => x.key === t.format);
  if (t.stage === 'league') {
    const n = (t.league?.teams || []).length;
    return `🚩 팀 리그${n ? ` · ${n}팀` : ''} · ${(t.roster || []).length}명`;
  }
  if (t.stage === 'team') return `${f?.icon || ''} ${f?.label || '단체전'} · ${(t.roster || []).length}명`;
  if (t.stage === 'kdk') return `🎯 KDK · ${(t.roster || []).length}명`;
  if (t.stage === 'skillGroups' || t.mode === 'skillGroups') return `${t.skillGroups?.length || 0}개 실력 그룹`;
  return `${t.entries?.length || 0}팀 · ${t.useGroupStage ? '예선 + 토너먼트' : '토너먼트'}`;
}

/* ---------------- 대회 개설 ---------------- */
function CreateTournament({ clubId, members, venues = [], onDone, flash }) {
  const [format, setFormat] = useState(TOURNAMENT_FORMAT.GROUP_BRACKET);
  const [name, setName] = useState('');
  const [date, setDate] = useState(today());
  const [courts, setCourts] = useState('2');
  const [busuLimit, setBusuLimit] = useState('');   // 참가 자격(부수 제한)
  const [useGroup, setUseGroup] = useState(true);
  const [groupCount, setGroupCount] = useState('4');
  const [advance, setAdvance] = useState('2');
  const [picked, setPicked] = useState({});             // 참가 회원
  const [seeds, setSeeds] = useState({});               // entryId → seed no (토너먼트만일 때)
  const [useSkillGroups, setUseSkillGroups] = useState(false); // NTRP 실력 그룹 사용
  const [groupSizes, setGroupSizes] = useState('8,8');         // 그룹별 정원
  const [skillGroups, setSkillGroups] = useState(null);        // 배정 결과(수동 조정 가능)
  const [pickVenue, setPickVenue] = useState('');               // 참가자 고를 때 코트장 필터
  const [pickQ, setPickQ] = useState('');                       // 이름 검색
  /* 대회 등급 — 이 대회에만. 클럽 조와 상관없이 새로 매긴다(앱 주인).
     매긴 사람은 이 대회의 팀 짜기·그룹 나누기에서 NTRP 대신 이 등급을 실력으로 쓴다. */
  const [tgrades, setTgrades] = useState({});
  const [tgScheme, setTgScheme] = useState('busu');      // 'busu'(1부~) | 'grade'(A~)
  const [tgCount, setTgCount] = useState(4);
  const [tgOpen, setTgOpen] = useState(false);
  /* 대진표 작성 기준 (조별리그) — src/lib/groupLeague.js */
  const [play, setPlay] = useState(DEFAULT_RULES.play);
  const [teamModeL, setTeamModeL] = useState(DEFAULT_RULES.teamMode);
  const [groupMethod, setGroupMethod] = useState(DEFAULT_RULES.groupMethod);
  const [games, setGames] = useState(String(DEFAULT_RULES.games));
  const [pairs, setPairs] = useState([]);            // 직접 짝짓기 [[a,b]]
  const [pairPick, setPairPick] = useState(null);
  /* 외부 참가자 — 회원이 아닌 사람(외부 대회를 우리 앱으로 운영할 때) */
  const [guests, setGuests] = useState([]);
  const [gName, setGName] = useState('');
  const [gClub, setGClub] = useState('');
  const [preview, setPreview] = useState(null);      // buildLeague 결과(미리보기 → 그대로 개설)

  const pickedList = members.filter((m) => picked[m.id]);
  /* 고른 사람의 대회 등급만 — 참가에서 뺀 사람 값은 버린다 */
  const tgKeys = schemeOf(tgScheme).keys;
  const tg = Object.fromEntries(pickedList.filter((m) => tgKeys.includes(tgrades[m.id])).map((m) => [m.id, tgrades[m.id]]));
  const hasTg = Object.keys(tg).length > 0;
  /** 이 대회에서 쓸 실력 — 대회 등급 > NTRP > 3.0 */
  const skillIn = (m) => tournamentSkill(tg[m.id], effectiveNtrp(m).value, tgScheme) ?? 3.0;
  /** 명단에 싣는 한 사람 — 대회 등급을 매겼으면 그 등급이 조·실력이 된다 */
  const rosterOf = (m) => {
    const t = tg[m.id];
    const r = {
      id: m.id, name: m.name, gender: m.gender,
      busu: (t && tgScheme === 'busu') ? t : (m.busu || ''),
      grade: (t && tgScheme === 'grade') ? t : (m.grade || ''),
      ntrp: effectiveNtrp(m).value ?? null,
    };
    if (t) { r.tgrade = t; r.ntrp = tournamentSkill(t, r.ntrp, tgScheme); }
    return r;
  };

  /* 화면에 그릴 회원 — 코트장·이름·부수로 좁힌다 */
  const shown = useMemo(() => {
    const q = pickQ.trim().toLowerCase();
    return members.filter((m) => {
      if (pickVenue && !(m.venueIds || []).includes(pickVenue)) return false;
      if (q && !String(m.name || '').toLowerCase().includes(q)) return false;
      if (busuLimit && m.busu && BUSU_KEYS.indexOf(m.busu) < BUSU_KEYS.indexOf(busuLimit)) return false;
      return true;
    });
  }, [members, pickVenue, pickQ, busuLimit]);

  /* 조별리그 참가자 — 회원 + 외부 참가자 */
  const leaguePlayers = () => [
    ...pickedList.map((m) => ({ id: m.id, name: m.name, skill: skillIn(m), ...(tg[m.id] ? { tgrade: tg[m.id] } : {}) })),
    ...guests.map((g) => ({ id: g.id, name: g.club ? `${g.name}(${g.club})` : g.name, skill: 3 })),
  ];
  const leagueRules = () => normRules({ play, teamMode: teamModeL, groupMethod, groupCount, advance, games });
  const playerCount = pickedList.length + guests.length;
  const minPlayers = play === PLAY.SINGLES ? 2 : 4;
  const makePreview = () => {
    if (playerCount < minPlayers) return flash(`참가자를 ${minPlayers}명 이상 고르세요`);
    const lg = buildLeague(leaguePlayers(), leagueRules(), { courts: Math.max(1, Number(courts) || 1), pairs });
    setPreview(lg);
    return flash(useGroup ? `${lg.entries.length}팀 · ${lg.groups.length}개 조로 짰습니다` : `${lg.entries.length}팀을 짰습니다`);
  };
  const nameOfAny = (id) => members.find((m) => m.id === id)?.name
    || (() => { const g = guests.find((x) => x.id === id); return g ? (g.club ? `${g.name}(${g.club})` : g.name) : '?'; })();
  const addGuest = () => {
    const g = makeGuest(gName, gClub);
    if (!g) return flash('외부 참가자 이름을 넣어 주세요');
    setGuests([...guests, g]); setGName(''); setPreview(null);
    return undefined;
  };
  const tapPair = (id) => {
    if (pairs.some((p) => p.includes(id))) { setPairs(pairs.filter((p) => !p.includes(id))); setPreview(null); return; }
    if (!pairPick) { setPairPick(id); return; }
    if (pairPick === id) { setPairPick(null); return; }
    setPairs([...pairs, [pairPick, id]]); setPairPick(null); setPreview(null);
  };

  const runAssign = () => {
    const sizes = groupSizes.split(',').map((v) => Number(v.trim())).filter((v) => v > 0);
    if (!sizes.length) return flash('그룹 정원을 쉼표로 입력하세요 (예: 8,8,6)');
    if (pickedList.length < 2) return flash('참가자를 먼저 선택하세요');
    const gs = assignSkillGroups(
      pickedList.map((m) => ({ id: m.id, name: m.name, gender: m.gender, ntrp: skillIn(m) })),
      sizes,
    );
    setSkillGroups(gs);
    flash(`${gs.length}개 그룹으로 자동 배정되었습니다`);
  };
  /** 대회 등급 그대로 그룹 — A그룹, B그룹 … */
  const assignByGrade = () => {
    if (!hasTg) return flash('위 대회 등급을 먼저 매기세요');
    const gs = groupsByGrade(pickedList.map((m) => m.id), tg, tgScheme);
    setSkillGroups(gs);
    return flash(`대회 등급대로 ${gs.length}개 그룹`);
  };

  const create = () => {
    const base = {
      name: name || `${date} 클럽대회`,
      date,
      format,
      courts: Math.max(1, Number(courts) || 1),
      busuLimit,
      status: 'ongoing',
      tgrades: tg,
      tgScheme,
    };

    /* 팀 리그 — 3팀 이상. 청백전과 저장 구조는 같고(roster + 편성 결과),
       화면만 다르다. stage 로 갈라 둔다. */
    if (format === TOURNAMENT_FORMAT.TEAM_LEAGUE) {
      if (pickedList.length < 6) return flash('팀 리그는 6명 이상이 필요합니다');
      addTournament(clubId, {
        ...base,
        stage: 'league',
        roster: pickedList.map(rosterOf),
        league: null,
        entries: [], groups: [], bracket: null,
      });
      flash('팀 리그가 개설되었습니다');
      return onDone();
    }

    if (format === TOURNAMENT_FORMAT.TEAM_BLUE_WHITE || format === TOURNAMENT_FORMAT.TEAM_CLUB) {
      if (pickedList.length < 4) return flash('참가자를 4명 이상 선택하세요');
      addTournament(clubId, {
        ...base,
        stage: 'team',
        roster: pickedList.map(rosterOf),
        team: null,
        entries: [], groups: [], bracket: null,
      });
      flash(format === TOURNAMENT_FORMAT.TEAM_CLUB ? '클럽 교류전이 개설되었습니다' : '청백전이 개설되었습니다');
      return onDone();
    }

    /* KDK 개인전 */
    if (format === TOURNAMENT_FORMAT.KDK) {
      if (pickedList.length < 4) return flash('KDK 는 4명 이상이 필요합니다');
      /* 대회 등급을 매겼으면 등급 순으로 세워 조를 자른다 — 같은 등급끼리 한 조가 되게 */
      const roster = (hasTg ? [...pickedList].sort((a, b) => skillIn(b) - skillIn(a)) : pickedList).map(rosterOf);
      addTournament(clubId, {
        ...base,
        stage: 'kdk',
        roster,
        matches: generateKdk(roster, Math.max(1, Number(courts) || 1)),
        entries: [], groups: [], bracket: null,
      });
      flash('KDK 대회가 개설되었습니다');
      return onDone();
    }

    if (useSkillGroups) {
      if (!skillGroups?.length) return flash('먼저 [자동 배정]을 실행하세요');
      addTournament(clubId, {
        name: name || `${date} 클럽대회`,
        date,
        mode: 'skillGroups',
        skillGroups,
        tgrades: tg,
        tgScheme,
        entries: [], groups: [], bracket: null,
        stage: 'skillGroups', status: 'ongoing',
      });
      flash('실력 그룹 대회가 개설되었습니다');
      return onDone();
    }
    if (playerCount < minPlayers) return flash(`참가자를 ${minPlayers}명 이상 고르세요`);
    /* 미리보기에서 손본 그대로 개설한다 — 없으면 기준대로 새로 짠다 */
    const lg = preview || buildLeague(leaguePlayers(), leagueRules(), { courts: Math.max(1, Number(courts) || 1), pairs });
    if (lg.entries.length < 2) return flash('팀이 2팀 이상이어야 합니다');
    const entries = lg.entries.map((e, i) => ({ ...e, seed: seeds[e.id] ? Number(seeds[e.id]) : (e.seed || null), _i: i }));
    // 예선 미사용 → 시드 순서 그대로 토너먼트
    const bracket = useGroup ? null : buildBracket(orderBySeed(entries).map((e) => e.id));
    addTournament(clubId, {
      ...base,
      useGroupStage: useGroup,
      advancePerGroup: lg.rules.advance,
      rules: lg.rules,
      guests,
      entries,
      groups: useGroup ? lg.groups : [],
      bracket,
      stage: useGroup ? 'group' : 'knockout',
    });
    flash('대회가 개설되었습니다');
    onDone();
  };

  const isTeam = format === TOURNAMENT_FORMAT.TEAM_BLUE_WHITE
    || format === TOURNAMENT_FORMAT.TEAM_CLUB
    || format === TOURNAMENT_FORMAT.TEAM_LEAGUE;
  const isKdkFormat = format === TOURNAMENT_FORMAT.KDK;
  const isBracket = !isTeam && !isKdkFormat;

  return (
    <View>
      {/* 대회 형식 */}
      <SectionTitle hint="형식에 따라 다음 화면이 달라집니다.">대회 형식</SectionTitle>
      <Card style={{ paddingVertical: 6 }}>
        {TOURNAMENT_FORMATS.map((f, i) => {
          const on = format === f.key;
          return (
            <Touchable key={f.key} onPress={() => setFormat(f.key)}
              style={{
                flexDirection: 'row', alignItems: 'flex-start', gap: 12,
                paddingVertical: 12,
                borderTopWidth: i ? 1 : 0, borderTopColor: C.border,
              }}>
              <View style={{
                width: 22, height: 22, borderRadius: 11, marginTop: 1,
                borderWidth: on ? 7 : 2, borderColor: on ? C.green : C.border,
                backgroundColor: C.surface,
              }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14.5, fontWeight: '800', color: on ? C.green : C.text }}>
                  {f.icon} {f.label}
                </Text>
                <Text style={{ fontSize: 11.5, color: C.sub, marginTop: 3, lineHeight: 17 }}>{f.desc}</Text>
              </View>
            </Touchable>
          );
        })}

        {/* 교류전을 찾아 여기까지 온 사람을 돌려보낸다.
           예전에는 대회의 한 형식이었으므로 여기서 찾는 것이 자연스럽다.
           안내 없이 없애면 "있던 게 사라졌다"가 된다. */}
        <View style={{
          borderTopWidth: 1, borderTopColor: C.border,
          paddingTop: 12, marginTop: 6,
        }}>
          <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.text }}>
            🤝 다른 클럽과 맞붙나요?
          </Text>
          <Text style={{ fontSize: 11.5, color: C.sub, marginTop: 3, lineHeight: 17 }}>
            {screenRef('clubmatch')} 화면에서 상대 클럽을 검색해 초대하세요.
            상대가 수락하면 자기 출전 명단을 직접 넣고, 대진표를 함께 봅니다.
            여기 대회는 우리 클럽 안에서만 기록됩니다.
          </Text>
        </View>
      </Card>

      <SectionTitle>대회 정보</SectionTitle>
      <Card>
        <Label>대회명</Label>
        <Field placeholder="예: 2026 봄 클럽챔피언십" value={name} onChangeText={setName} />
        <View style={{ marginTop: S.md }}>
          <Label>날짜</Label>
          <DateField value={date} onChange={setDate} />
        </View>
        <View style={{ marginTop: S.md }}>
          <Label hint="동시에 쓸 코트 수">코트</Label>
          <Field keyboardType="number-pad" value={courts} onChangeText={setCourts} suffix="면" />
        </View>
        <View style={{ marginTop: S.md }}>
          <Label hint="선택 · 참가 자격을 부수로 제한할 때">참가 자격</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
            <Chip tone={!busuLimit ? 'green' : 'outline'} onPress={() => setBusuLimit('')}>제한 없음</Chip>
            {BUSU_KEYS.filter((b) => b !== '오픈부').map((b) => (
              <Chip key={b} tone={busuLimit === b ? 'green' : 'outline'}
                onPress={() => setBusuLimit(busuLimit === b ? '' : b)}>{b} 이하</Chip>
            ))}
          </View>
        </View>
      </Card>

      {isKdkFormat && pickedList.length >= 4 && (
        <Card style={{ marginTop: S.md, backgroundColor: C.greenSoft }}>
          <Text style={{ fontSize: 12.5, color: C.green, fontWeight: '700' }}>
            지금 인원이면 {splitKdkGroups(pickedList.length).join('명 + ')}명 ·
            {' '}{splitKdkGroups(pickedList.length).length}개 조로 나뉩니다.
          </Text>
        </Card>
      )}

      {isTeam && (
        <Card style={{ marginTop: S.md, backgroundColor: C.greenSoft }}>
          <Text style={{ fontSize: 12.5, color: C.green, lineHeight: 19 }}>
            {format === TOURNAMENT_FORMAT.TEAM_CLUB
              ? '참가자를 고르면 우리 클럽 팀이 됩니다. 상대 클럽 선수는 개설 후 다음 화면에서 등록합니다.'
              : '참가자를 고르면 실력과 성별이 고르게 청팀·백팀으로 자동 분할됩니다. 개설 후 손으로 조정할 수 있습니다.'}
          </Text>
        </Card>
      )}

      {isBracket && (
      <>
      <SectionTitle hint="정한 기준대로 팀·조·시간표를 짜고, 만든 뒤에도 손으로 고칠 수 있습니다.">대진표 작성 기준</SectionTitle>
      <Card>
        {[
          ['진행', [['group', '조별리그 → 토너먼트'], ['ko', '토너먼트만']], useGroup ? 'group' : 'ko', (v) => setUseGroup(v === 'group')],
          ['경기', Object.entries(RULE_LABELS.play), play, setPlay],
          ...(play === PLAY.DOUBLES ? [['짝 짓기', Object.entries(RULE_LABELS.teamMode), teamModeL, setTeamModeL]] : []),
          ...(useGroup ? [['조 나누기', Object.entries(RULE_LABELS.groupMethod), groupMethod, setGroupMethod]] : []),
          ['한 경기', [['4', '4게임'], ['6', '6게임'], ['8', '8게임']], games, setGames],
        ].map(([label, opts, value, set]) => (
          <View key={label} style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 11.5, color: C.sub, fontWeight: '700', marginBottom: 6 }}>{label}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {opts.map(([k, l]) => (
                <Chip key={k} tone={value === k ? 'green' : 'outline'} onPress={() => { set(k); setPreview(null); }}>{l}</Chip>
              ))}
            </View>
          </View>
        ))}
        {useGroup && groupMethod === GROUP_METHOD.GRADE && !hasTg && (
          <Text style={{ fontSize: 11, color: C.warn, marginBottom: 10 }}>같은 등급끼리 나누려면 아래 「대회 등급」을 먼저 매기세요. 안 매기면 실력 고르게 나눕니다.</Text>
        )}
        {useGroup && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {groupMethod !== GROUP_METHOD.GRADE && (
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>조 개수</Text>
                <Field keyboardType="number-pad" value={groupCount} onChangeText={(v) => { setGroupCount(v); setPreview(null); }} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>조별 본선 진출</Text>
              <Field keyboardType="number-pad" value={advance} onChangeText={setAdvance} suffix="팀" />
            </View>
          </View>
        )}
        <Text style={{ fontSize: 11, color: C.faint, marginTop: 10, lineHeight: 16 }}>
          순위: {RANK_RULE_TEXT}. 조별 경기는 서로 한 번씩(풀리그), 시간표는 코트 수에 맞춰 자동으로 짭니다.
        </Text>
      </Card>
      </>
      )}

      <SectionTitle right={
        <Chip tone="soft" onPress={() => {
          const all = { ...picked };
          shown.forEach((m) => { all[m.id] = true; });
          setPicked(all);
        }}>보이는 사람 전원</Chip>
      }>참가자 선택 ({pickedList.length}명)</SectionTitle>
      <Card>
        {/* 코트장으로 먼저 좁힌다.
           회원이 200명이면 이름 칩 200개에서 사람을 찾는 것 자체가 일이다.
           대부분의 대회는 한두 코트장 사람들로 열린다. */}
        {venues.length > 0 && (
          <View style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
              <Chip tone={!pickVenue ? 'green' : 'outline'} onPress={() => setPickVenue('')}>
                전체 {members.length}
              </Chip>
              {venues.map((v) => {
                const n = members.filter((m) => (m.venueIds || []).includes(v.id)).length;
                return (
                  <Chip key={v.id} tone={pickVenue === v.id ? 'green' : 'outline'}
                    onPress={() => setPickVenue(v.id)}>
                    {v.name} {n}
                  </Chip>
                );
              })}
            </View>
          </View>
        )}

        <Field placeholder="이름으로 찾기" value={pickQ} onChangeText={setPickQ} />

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {shown.map((m) => (
            <Chip key={m.id} tone={picked[m.id] ? 'green' : 'outline'}
              onPress={() => setPicked({ ...picked, [m.id]: !picked[m.id] })}>
              {m.name}
            </Chip>
          ))}
          {shown.length === 0 && (
            <Text style={{ fontSize: 11.5, color: C.faint }}>해당하는 회원이 없습니다.</Text>
          )}
        </View>

        {/* 다른 코트장에서 고른 사람도 참가자다 — 필터를 바꿨다고
           사라지면 "아까 고른 사람이 없어졌다"가 된다 */}
        {pickedList.length > shown.filter((m) => picked[m.id]).length && (
          <Text style={{ fontSize: 10.5, color: C.faint, marginTop: 8 }}>
            지금 목록 밖에서 고른 사람 {pickedList.length - shown.filter((m) => picked[m.id]).length}명이 더 있습니다.
          </Text>
        )}
        {pickedList.length > 0 && (
          <View style={{ marginTop: 8 }}>
            <Btn small tone="ghost" onPress={() => setPicked({})}>선택 모두 지우기</Btn>
          </View>
        )}
      </Card>

      {/* 외부 참가자 — 회원이 아닌 사람. 외부 대회를 우리 앱으로 운영할 때도 이것으로 */}
      {isBracket && !useSkillGroups && (
        <>
          <SectionTitle hint="회원이 아닌 참가자 — 외부 대회를 이 앱으로 운영할 때도 씁니다">외부 참가자 ({guests.length}명)</SectionTitle>
          <Card>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Field placeholder="이름" value={gName} onChangeText={setGName} style={{ flex: 1 }} />
              <Field placeholder="소속(선택)" value={gClub} onChangeText={setGClub} style={{ flex: 1 }} />
              <Btn small onPress={addGuest}>추가</Btn>
            </View>
            {guests.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {guests.map((g) => (
                  <Chip key={g.id} tone="soft" onPress={() => { setGuests(guests.filter((x) => x.id !== g.id)); setPreview(null); }}>
                    {g.club ? `${g.name}(${g.club})` : g.name} ✕
                  </Chip>
                ))}
              </View>
            )}
          </Card>
        </>
      )}

      {/* 직접 짝짓기 — 이름 두 개를 차례로 누르면 한 팀 */}
      {isBracket && !useSkillGroups && play === PLAY.DOUBLES && teamModeL === TEAM_MODE.MANUAL && playerCount > 0 && (
        <>
          <SectionTitle hint="이름 두 개를 차례로 누르면 한 팀이 됩니다. 짝 없는 사람은 실력 균등으로 짝지어집니다.">짝 짓기 ({pairs.length}팀)</SectionTitle>
          <Card>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {[...pickedList.map((m) => m.id), ...guests.map((g) => g.id)].map((id) => {
                const pi = pairs.findIndex((p) => p.includes(id));
                return (
                  <Chip key={id} tone={pairPick === id ? 'green' : pi >= 0 ? 'soft' : 'outline'} onPress={() => tapPair(id)}>
                    {pi >= 0 ? `${pi + 1}팀 · ` : ''}{nameOfAny(id)}
                  </Chip>
                );
              })}
            </View>
          </Card>
        </>
      )}

      {/* 대회 등급 — 이 대회에만 쓰는 등급. 클럽 조와 따로 매긴다. */}
      {pickedList.length > 0 && (
        <>
          <SectionTitle right={
            <Chip tone={tgOpen ? 'green' : 'outline'} onPress={() => {
              if (!tgOpen) setTgCount(gradeCountFor(Object.values(tg)));
              setTgOpen(!tgOpen);
            }}>{tgOpen ? '접기' : '매기기'}</Chip>
          }>대회 등급 (이 대회에만)</SectionTitle>
          <Card>
            {!tgOpen && (
              <Text style={{ fontSize: 11.5, color: C.sub, lineHeight: 17 }}>
                {hasTg ? gradeSummary(pickedList, (m) => tg[m.id], tgScheme) : '매기지 않으면 NTRP(없으면 클럽 조·부수)로 팀과 그룹을 짭니다.'}
              </Text>
            )}
            {tgOpen && (
              <>
                <Segmented
                  options={[{ key: 'busu', label: '부수식 (1부~)' }, { key: 'grade', label: '조식 (A~)' }]}
                  value={tgScheme}
                  onChange={(v) => { setTgScheme(v); setTgrades({}); }}
                />
                <Text style={{ fontSize: 11, color: C.faint, lineHeight: 16, marginTop: 8 }}>
                  클럽 부수·조와 상관없이 이 대회에서만 쓰는 등급입니다({tgScheme === 'busu' ? '1부' : 'A'}가 가장 높음).
                  매긴 사람은 팀 짜기·그룹 나누기에서 이 등급을 실력으로 씁니다. 회원의 부수·조는 바뀌지 않습니다.
                  표기를 바꾸면 매긴 등급이 지워집니다.
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, marginBottom: 10 }}>
                  <Btn small tone="ghost" onPress={() => {
                    const f = fillFromClub(pickedList.map((m) => m.id), members, tgScheme);
                    setTgrades({ ...tgrades, ...f });
                    if (tgScheme === 'grade') setTgCount(gradeCountFor(Object.values(f)));
                    const what = schemeOf(tgScheme).name;
                    flash(Object.keys(f).length ? `클럽 ${what}로 ${Object.keys(f).length}명 채웠습니다` : `클럽 ${what}가 있는 참가자가 없습니다`);
                  }}>{tgScheme === 'busu' ? '클럽 부수로 채우기' : '클럽 조로 채우기'}</Btn>
                  <Btn small tone="ghost" onPress={() => setTgrades({})}>모두 지우기</Btn>
                </View>
                <GradeRows
                  people={pickedList}
                  value={tg}
                  onPick={(id, g) => setTgrades({ ...tgrades, [id]: g })}
                  count={tgCount}
                  onCount={setTgCount}
                  scheme={tgScheme}
                  note={(m) => [m.busu ? `클럽 ${m.busu}` : '', m.grade ? `${m.grade}조` : '', effectiveNtrp(m).value != null ? `NTRP ${effectiveNtrp(m).value.toFixed(1)}` : ''].filter(Boolean).join(' · ')}
                />
              </>
            )}
          </Card>
        </>
      )}

      {isBracket && (
      <>
      <SectionTitle>실력 그룹 나누기</SectionTitle>
      <Card>
        <Pressable onPress={() => setUseSkillGroups(!useSkillGroups)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: useSkillGroups ? C.green : '#e7e5e4', alignItems: 'center', justifyContent: 'center' }}>
            {useSkillGroups && <Text style={{ color: C.lime, fontWeight: '700', fontSize: 13 }}>✓</Text>}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '700' }}>수준별 그룹으로 진행</Text>
            <Text style={{ fontSize: 11, color: C.faint }}>
              실력순(대회 등급 → NTRP)으로 그룹을 나눠 그룹별로 시합합니다 (남·여 각각 실력순 배분)
            </Text>
          </View>
        </Pressable>

        {useSkillGroups && (
          <View style={{ marginTop: 12 }}>
            <Text style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>
              그룹별 정원 (쉼표로 구분 · 앞쪽이 상위 그룹)
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Field placeholder="8,8,6" value={groupSizes} onChangeText={setGroupSizes} style={{ flex: 1 }} />
              <Btn onPress={runAssign}>자동 배정</Btn>
            </View>
            {hasTg && (
              <View style={{ marginTop: 8 }}>
                <Btn small tone="ghost" onPress={assignByGrade}>대회 등급대로 나누기 ({tgScheme === 'busu' ? '1부 그룹 · 2부 그룹' : 'A그룹 · B그룹'} …)</Btn>
              </View>
            )}

            {skillGroups?.map((g, gi) => (
              <View key={g.name} style={{ marginTop: 10, backgroundColor: '#fafaf9', borderRadius: 12, padding: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 13, fontWeight: '800' }}>{g.name} ({g.memberIds.length}명)</Text>
                  {g.range && (
                    <Text style={{ fontSize: 11, color: C.green2 }}>
                      NTRP {g.range.min.toFixed(1)}~{g.range.max.toFixed(1)}
                    </Text>
                  )}
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                  {g.memberIds.map((id) => {
                    const m = members.find((x) => x.id === id);
                    if (!m) return null;
                    return (
                      <Pressable key={id}
                        onPress={() => {
                          // 탭할 때마다 다음 그룹으로 이동(운영진 수동 조정)
                          const to = (gi + 1) % skillGroups.length;
                          setSkillGroups(moveMemberToGroup(skillGroups, id, to));
                        }}
                        style={{ backgroundColor: m.gender === 'F' ? C.femaleBg : C.maleBg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: m.gender === 'F' ? C.female : C.male }}>
                          {m.name} {tg[m.id] ? schemeOf(tgScheme).label(tg[m.id]) : skillIn(m).toFixed(1)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
            {skillGroups && (
              <Text style={{ fontSize: 10, color: C.faint, marginTop: 8 }}>
                이름을 누르면 다음 그룹으로 이동합니다 (운영진 수동 조정)
              </Text>
            )}
          </View>
        )}
      </Card>

      {!useSkillGroups && (
        <>
          <SectionTitle right={
            <Chip tone="soft" onPress={makePreview}>{preview ? '다시 짜기' : '미리 짜 보기'}</Chip>
          }>대진표 미리보기</SectionTitle>
          <Card>
            {!preview && (
              <Text style={{ fontSize: 11.5, color: C.sub, lineHeight: 17 }}>
                「미리 짜 보기」로 팀·조를 확인하세요. 마음에 들 때까지 다시 짤 수 있고, 개설 뒤에도
                조 옮기기·선수 맞바꾸기·코트 정하기가 됩니다. 미리 보지 않고 개설하면 기준대로 바로 짭니다.
              </Text>
            )}
            {preview && play === PLAY.DOUBLES && preview.entries.some((e) => e.players.length < 2) && (
              <Text style={{ fontSize: 11.5, color: C.warn, marginBottom: 8, lineHeight: 17 }}>
                인원이 홀수라 혼자인 팀이 있습니다({preview.entries.filter((e) => e.players.length < 2).map((e) => e.name).join(', ')}).
                외부 참가자를 한 명 더하거나, 개설 뒤 「편성 수정」에서 짝을 고치세요.
              </Text>
            )}
            {preview && useGroup && preview.groups.map((g) => (
              <View key={g.id} style={{ marginBottom: 10, padding: 10, borderRadius: R.md, backgroundColor: C.fill }}>
                <Text style={F.bodyBold}>{g.name} · {g.entryIds.length}팀 · {g.matches.length}경기</Text>
                {g.entryIds.map((id) => (
                  <Text key={id} style={{ fontSize: 12, color: C.text, marginTop: 4 }}>· {preview.entries.find((e) => e.id === id)?.name}</Text>
                ))}
              </View>
            ))}
            {preview && !useGroup && (
              <View>
                <Text style={{ fontSize: 11, color: C.sub, marginBottom: 6 }}>
                  {preview.entries.length}팀 — 시드를 줄 팀에 번호를 넣으세요(1이 최상위, 비워도 됨)
                </Text>
                {preview.entries.map((e) => (
                  <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
                    <Text style={{ flex: 1, fontSize: 13, fontWeight: '600' }}>{e.name}</Text>
                    <Field placeholder="시드" keyboardType="number-pad" value={seeds[e.id] || ''}
                      onChangeText={(v) => setSeeds({ ...seeds, [e.id]: v })} style={{ width: 64, textAlign: 'center' }} />
                  </View>
                ))}
              </View>
            )}
          </Card>
        </>
      )}
      </>
      )}

      <View style={{ marginTop: S.lg }}>
        <AppButton full
          disabled={isBracket
            ? (useSkillGroups ? !skillGroups?.length : playerCount < minPlayers)
            : pickedList.length < 4}
          onPress={create}>
          대회 개설
        </AppButton>
      </View>
      {!isBracket && pickedList.length < 4 && (
        <Text style={{ fontSize: 11.5, color: C.faint, textAlign: 'center', marginTop: 8 }}>
          참가자를 4명 이상 선택해야 개설할 수 있습니다.
        </Text>
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
          <Text style={{ color: C.lime, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>CHAMPION</Text>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700', marginTop: 6 }}>🏆 {nameOfEntry(champion)}</Text>
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
                    <Text style={{ fontSize: 14, fontWeight: '700', color: C.green }}>{m.score.a} : {m.score.b}</Text>
                  ) : bye ? (
                    <Chip tone="default">부전승</Chip>
                  ) : isAdmin && m.a && m.b ? (
                    <Btn small tone="ghost" onPress={() => { setEdit(m.id); setSc({ a: '', b: '' }); }}>입력</Btn>
                  ) : <Text style={{ fontSize: 11, color: C.faint }}>대기</Text>}
                </View>
                {edit === m.id && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                    <Field keyboardType="number-pad" placeholder="위" value={sc.a} onChangeText={(v) => setSc({ ...sc, a: v })} style={{ flex: 1 }} />
                    <Text style={{ fontWeight: '700', color: C.faint }}>:</Text>
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

/* ---------------- 실력 그룹 대회 ---------------- */
function SkillGroupsView({ clubId, t, members, isAdmin, flash }) {
  const groups = t.skillGroups || [];
  const move = (memberId, gi) => {
    if (!isAdmin) return;
    const to = (gi + 1) % groups.length;
    updateTournament(clubId, t.id, { skillGroups: moveMemberToGroup(groups, memberId, to) });
  };
  return (
    <View>
      <Text style={{ fontSize: 11, color: C.sub, marginBottom: 8 }}>
        NTRP 기준으로 나뉜 수준별 그룹입니다. 그룹 안에서 자유롭게 시합을 진행하세요.
        {isAdmin ? ' 이름을 누르면 다음 그룹으로 이동합니다.' : ''}
      </Text>
      {groups.map((g, gi) => (
        <View key={g.name}>
          <SectionTitle right={g.range ? <Chip tone="outline">NTRP {g.range.min.toFixed(1)}~{g.range.max.toFixed(1)}</Chip> : null}>
            {g.name} ({g.memberIds.length}명)
          </SectionTitle>
          <Card>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {g.memberIds.map((id) => {
                const m = members.find((x) => x.id === id);
                if (!m) return null;
                const v = effectiveNtrp(m).value;
                return (
                  <Pressable key={id} onPress={() => move(id, gi)}
                    style={{ backgroundColor: m.gender === 'F' ? C.femaleBg : C.maleBg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: m.gender === 'F' ? C.female : C.male }}>
                      {m.name} {v != null ? v.toFixed(1) : '-'}
                    </Text>
                  </Pressable>
                );
              })}
              {g.memberIds.length === 0 && <Text style={{ fontSize: 12, color: C.faint }}>배정된 인원이 없습니다.</Text>}
            </View>
          </Card>
        </View>
      ))}
    </View>
  );
}

/* ---------------- 메인 ---------------- */
/* ---------------- KDK 대회 진행 ---------------- */
function KdkView({ clubId, t, isAdmin, flash }) {
  const roster = t.roster || [];
  const matches = t.matches || [];
  const sheet = useOptionSheet();
  const nameOf = (id) => roster.find((p) => p.id === id)?.name || '?';

  const record = (m) => {
    if (!isAdmin) return;
    sheet.open({
      title: `${m.round}타임 코트${m.court}`,
      options: [
        { key: '6:0', label: '앞팀 6:0' }, { key: '6:2', label: '앞팀 6:2' }, { key: '6:4', label: '앞팀 6:4' },
        { key: '4:6', label: '뒷팀 6:4' }, { key: '2:6', label: '뒷팀 6:2' }, { key: '0:6', label: '뒷팀 6:0' },
        { key: 'clear', label: '기록 지우기' },
      ],
      onSelect: (o) => {
        const next = matches.map((x) => {
          if (x.id !== m.id) return x;
          if (o.key === 'clear') return { ...x, score: null };
          const [a, b] = o.key.split(':').map(Number);
          return { ...x, score: { a, b } };
        });
        updateTournament(clubId, t.id, { matches: next });
      },
    });
  };

  const regen = () => {
    updateTournament(clubId, t.id, { matches: generateKdk(roster, t.courts || 1) });
    flash('대진을 다시 생성했습니다');
  };

  return (
    <View>
      <SectionTitle
        hint={isAdmin ? '경기를 누르면 스코어를 기록합니다.' : undefined}
        right={isAdmin ? <Chip tone="soft" onPress={regen}>다시 생성</Chip> : undefined}>
        대진표
      </SectionTitle>
      {matches.length ? (
        <Card style={{ padding: 10 }}>
          <MatchGrid matches={matches} nameOf={nameOf} onPressMatch={record} />
        </Card>
      ) : (
        <EmptyState icon="🎯" title="대진이 없습니다"
          body={isAdmin ? '[다시 생성]을 눌러 대진을 만드세요.' : '운영진이 편성하면 표시됩니다.'} />
      )}

      <SectionTitle hint="승수 → 득실차 순">조별 개인 순위</SectionTitle>
      {kdkStandingsByGroup(roster, matches).map(({ group, rows }) => (
        <Card key={group} style={{ marginBottom: S.sm, paddingVertical: 6 }}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: C.green, marginVertical: 6 }}>
            {String.fromCharCode(65 + group)}조
          </Text>
          {rows.map((r, i) => (
            <View key={r.id} style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.border,
            }}>
              <View style={{
                width: 22, height: 22, borderRadius: 11,
                backgroundColor: i === 0 ? C.lime : C.fill,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 10.5, fontWeight: '700', color: i === 0 ? C.ink : C.sub }}>{i + 1}</Text>
              </View>
              <Text style={[F.bodyBold, { flex: 1 }]} numberOfLines={1}>{r.name}</Text>
              <Text style={{ fontSize: 12, color: C.sub }}>{r.games}경기</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.green, width: 34, textAlign: 'right' }}>{r.wins}승</Text>
              <Text style={{
                fontSize: 11, width: 40, textAlign: 'right',
                color: r.diff > 0 ? C.green2 : r.diff < 0 ? C.danger : C.faint,
              }}>{r.diff > 0 ? '+' : ''}{r.diff}</Text>
            </View>
          ))}
        </Card>
      ))}
      {sheet.node}
    </View>
  );
}

export function Tournaments({
  clubId, members, venues = [], tournaments, isAdmin, me = '', meVal = null, flash,
  startCreate = false, startOpenId = null,
}) {
  /* 일정의 [＋ 새 모임 › 클럽 대회]로 오면 바로 개설 화면, 일정의 대회 카드로 오면 그 대회 */
  const [view, setView] = useState(startCreate && isAdmin ? 'create' : startOpenId ? 'detail' : 'list'); // list | create | detail
  const [openId, setOpenId] = useState(startOpenId || null);
  const [showGroups, setShowGroups] = useState(false);

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
        <CreateTournament clubId={clubId} members={members} venues={venues} flash={flash} onDone={() => setView('list')} />
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
          <Text style={{ fontSize: 16, fontWeight: '700' }}>{t.name}</Text>
          <Text style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>
            {t.date} · {formatLabel(t)}
            {t.busuLimit ? ` · ${t.busuLimit} 이하` : ''}
            {t.status === 'finished' ? ' · 종료' : ' · 진행 중'}
          </Text>
        </Card>

        {t.stage === 'league' ? (
          <TeamLeague
            key={t.id}
            roster={t.roster || []}
            courts={t.courts || 2}
            saved={t.league}
            isAdmin={isAdmin}
            flash={flash}
            onSave={(payload) => updateTournament(clubId, t.id, { league: payload })}
          />
        ) : t.stage === 'team' ? (
          <TeamMatch
            key={t.id}
            format={t.format}
            attendees={t.roster || []}
            courts={t.courts || 1}
            rounds={4}
            saved={t.team}
            isAdmin={isAdmin}
            flash={flash}
            onSave={(payload) => updateTournament(clubId, t.id, { team: payload })}
          />
        ) : t.stage === 'kdk' ? (
          <KdkView clubId={clubId} t={t} isAdmin={isAdmin} flash={flash} />
        ) : t.stage === 'skillGroups' ? (
          <SkillGroupsView clubId={clubId} t={t} members={members} isAdmin={isAdmin} flash={flash} />
        ) : t.stage === 'group' ? (
          <GroupLeagueView
            key={t.id} t={t} members={members} isAdmin={isAdmin} me={me} flash={flash}
            onUpdate={(patch) => updateTournament(clubId, t.id, patch)}
            onKnockout={(groups) => {
              const q = leagueQualifiers(groups, normRules(t.rules || { advance: t.advancePerGroup }).advance || 2);
              if (q.length < 2) return flash('진출 팀이 부족합니다');
              updateTournament(clubId, t.id, { groups, bracket: buildBracket(q.map((x) => x.entryId)), stage: 'knockout' });
              return flash('본선 토너먼트 대진을 만들었습니다');
            }}
          />
        ) : (
          <Knockout clubId={clubId} t={t} isAdmin={isAdmin} nameOfEntry={nameOfEntry} flash={flash} />
        )}

        {/* 본선으로 넘어간 뒤에도 예선 조별 결과·순위는 계속 볼 수 있게 */}
        {t.stage === 'knockout' && (t.groups || []).length > 0 && (
          <>
            <SectionTitle right={
              <Chip tone={showGroups ? 'green' : 'outline'} onPress={() => setShowGroups(!showGroups)}>{showGroups ? '접기' : '보기'}</Chip>
            }>예선 조별 결과</SectionTitle>
            {showGroups && <GroupLeagueView key={`${t.id}-g`} t={t} members={members} isAdmin={false} me={me} />}
          </>
        )}

        {/* 외부 공개 — 앱이 없는 외부 참가자·관중도 링크로 대진·결과·순위를 본다 */}
        {isAdmin && (t.stage === 'group' || t.stage === 'knockout') && (
          <Card style={{ marginTop: S.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={F.bodyBold}>외부 공개 링크</Text>
                <Text style={{ fontSize: 11, color: C.faint, marginTop: 2, lineHeight: 16 }}>
                  켜면 링크를 받은 누구나(앱 없이도) 대진표·결과·순위를 봅니다. 참가자 이름이 보이니 필요할 때만 켜세요.
                </Text>
              </View>
              <Chip tone={t.publicView ? 'green' : 'outline'}
                onPress={() => updateTournament(clubId, t.id, { publicView: !t.publicView })
                  .then(() => flash(t.publicView ? '외부 공개를 껐습니다' : '외부 공개를 켰습니다'))
                  .catch(() => flash('바꾸지 못했습니다'))}>
                {t.publicView ? '켜짐' : '꺼짐'}
              </Chip>
            </View>
            {t.publicView && (
              <View style={{ marginTop: 10 }}>
                <Btn small tone="ghost" onPress={() => Share.share({
                  message: `[${t.name}] 대진표·실시간 순위\n${liveUrl(firebaseConfig.projectId, clubId, t.id)}`,
                }).catch(() => {})}>링크 보내기</Btn>
              </View>
            )}
          </Card>
        )}

        {/* 참가 신청 — 모집을 열면 일정 화면에서 바로 신청할 수 있다.
           예전에는 운영진이 단톡방에서 받아 적어 명단에 넣었다. */}
        <TournamentSignup
          clubId={clubId} t={t} me={me} meVal={meVal} isAdmin={isAdmin} flash={flash}
          members={members} canReset={memberRoles(meVal || {}).includes(ROLES.PRESIDENT)}
        />

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
              {x.date} · {formatLabel(x)}
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
        <View style={{ marginBottom: S.md }}>
          <AppButton full icon="＋" onPress={() => setView('create')}>새 대회 개설</AppButton>
          <Text style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 16 }}>
            조별리그+토너먼트 · KDK 개인전 · 청백전 · 클럽 교류전 중에서 고를 수 있습니다.
          </Text>
        </View>
      )}
      {ongoing.length > 0 && <SectionTitle>진행 중</SectionTitle>}
      {ongoing.map((x) => <Row key={x.id} x={x} />)}
      {finished.length > 0 && <SectionTitle>지난 대회 기록</SectionTitle>}
      {finished.map((x) => <Row key={x.id} x={x} />)}
      {tournaments.length === 0 && (
        <EmptyState icon="🏆" title="등록된 대회가 없습니다"
          body={isAdmin
            ? '월례대회는 KDK, 팀 단위 행사는 청백전이나 클럽 교류전을 골라보세요.'
            : '운영진이 대회를 개설하면 여기에 표시됩니다.'} />
      )}
    </View>
  );
}
