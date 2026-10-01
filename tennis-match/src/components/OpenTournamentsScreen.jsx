/* ============================================================
   대회 찾기 — 협회·지자체·스폰서가 여는 큰 대회

   ⚠️ [클럽 대회] 와 다른 화면이다.
      거기는 우리끼리 여는 월례대회·청백전이고, 여기는 밖에서 열리는
      대회를 모아 보는 게시판이다. 신청은 주최 측 사이트에서 한다.
      두 개를 섞으면 안 되는 이유는 src/lib/openTournament.js 머리말 참고.

   화면이 지키는 것
     · 지금 신청할 수 있는 것이 맨 위. 날짜순으로만 세우면 "이미 마감된
       다음 주 대회"가 "다음 달 접수 중인 대회"보다 위에 온다.
     · 끝난 대회는 기본으로 감춘다. 지난 요강을 찾는 사람보다 이번 달에
       나갈 대회를 찾는 사람이 훨씬 많다.
     · 등록·[지금 찾기]는 앱 운영자만. 아무나 올리면 광고판이 되고, 요강이
       틀린 대회에 헛걸음한 사람이 앱을 탓한다. 회원은 모아 둔 것 안에서 찾는다.
     · 달력이 맨 위. 처음엔 전체를 보여 주고, 날짜를 누르면 그날 열리는
       대회만. [전체 보기]로 되돌린다.
     · 카드에는 「대회 일정」「접수 일정」을 두 줄로 따로 — 한 줄에 섞으면
       대회 날짜를 접수 마감으로 잘못 읽는다.
   ============================================================ */
import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, Linking, Alert, Pressable } from 'react-native';
import {
  subOpenTournaments, addOpenTournament, updateOpenTournament, deleteOpenTournament,
  requestOpenSync, subLatestOpenSync,
} from '../lib/firestore';
import {
  OPEN_STATE, OPEN_STATE_LABEL, OPEN_STATE_TONE,
  openState, regionText, gameDates, signupDates, refundText, dayText, openCalendarItems,
  OPEN_SEARCH_BY, openOrgs, playsOn, spanDays, dayOfPeriod,
  visibleOpen, sortOpen, openSidos, nearbyNote, validateOpen, syncRunView,
} from '../lib/openTournament';
import { calendarGrid, monthLabel, shiftMonth } from '../lib/agenda';
import { SIDO_LIST } from '../lib/regions';
import { DateField, Label } from './pickers';
import { Card, SectionTitle, Chip, Btn, Field, EmptyState } from './ui';
import { Icon } from './Icon';
import { C, S, R, F } from '../lib/theme';
import { todayYmd } from '../lib/today';

const today = () => todayYmd();
/* 지금 시각 'HH:MM' — 접수 시작·마감 시각이 적힌 대회는 그 시각에 상태가 바뀐다 */
const nowHm = () => { const n = new Date(); return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`; };
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const won = (n) => `${Number(n || 0).toLocaleString()}원`;

const blank = () => ({
  name: '', host: '', org: '',
  sido: '', gungu: '', place: '',
  startDate: '', endDate: '',
  signupFrom: '', signupTo: '',
  divisions: '', fee: '', link: '', note: '',
});

export function OpenTournaments({ me, isAppAdmin, flash }) {
  const [all, setAll] = useState([]);
  const [region, setRegion] = useState(null);
  const [kw, setKw] = useState('');
  const [by, setBy] = useState('all');              // 찾는 기준 — OPEN_SEARCH_BY
  const [date, setDate] = useState('');             // '' = 전체 보기
  const [monthKey, setMonthKey] = useState(() => today().slice(0, 7));
  const [showDone, setShowDone] = useState(false);
  const [editing, setEditing] = useState(null);   // null | 'new' | id
  const [draft, setDraft] = useState(blank());

  useEffect(() => subOpenTournaments(setAll), []);

  /* [지금 찾기] — 매일 02시 갱신을 기다리지 않고 한 번 더 찾는다(앱 관리자만) */
  const [syncRun, setSyncRun] = useState(null);
  const [asking, setAsking] = useState(false);
  useEffect(() => (isAppAdmin ? subLatestOpenSync(setSyncRun) : undefined), [isAppAdmin]);
  const sync = syncRunView(syncRun);
  const findNow = () => Alert.alert(
    '지금 대회 찾기',
    '협회·대회 사이트와 웹 검색으로 접수 중·예정 대회를 지금 찾아 목록에 반영합니다. 2~5분 걸리고, 누를 때마다 Anthropic API 비용이 듭니다(결과 줄에 대략의 비용 표시). KATO 대회는 매일 새벽 무료로 갱신되니, 꼭 필요할 때만 눌러 주세요.',
    [
      { text: '취소', style: 'cancel' },
      {
        text: '찾기',
        onPress: async () => {
          setAsking(true);
          try { await requestOpenSync(me); } catch (e) { flash(`요청하지 못했습니다: ${e?.message || e}`); }
          setAsking(false);
        },
      },
    ],
  );

  const sidos = useMemo(() => openSidos(all), [all]);
  const orgs = useMemo(() => openOrgs(all), [all]);
  const pickBy = (k) => {
    setBy(k);
    /* 지역 칩은 「지역」 기준에서만 보인다 — 숨은 채로 걸러지지 않게 비운다 */
    if (k !== 'region') setRegion(null);
  };

  /* 이 달에 뭐가 있는지 한 줄. 목록을 다 훑기 전에 "이번 달은 볼 게
     있나 없나"부터 알려 준다. */
  const near = useMemo(
    () => nearbyNote(all, { today: today(), monthKey: today().slice(0, 7), region }),
    [all, region],
  );
  /* 날짜만 빼고 거른 것 — 달력 점은 이것으로 찍는다(검색·지역이 달력에도 걸린다) */
  const filtered = useMemo(() => visibleOpen(all, {
    today: today(), region, kw, by, past: showDone && !!isAppAdmin,
  }), [all, region, kw, by, showDone, isAppAdmin]);
  const list = useMemo(() => sortOpen(
    date ? filtered.filter((t) => playsOn(t, date)) : filtered,
    today(),
  ).sort((a, b) => (date ? dayOfPeriod(a, date) - dayOfPeriod(b, date) : 0)), [filtered, date, showDone, isAppAdmin]);
  const weeks = useMemo(
    () => calendarGrid(monthKey, openCalendarItems(filtered), today()),
    [monthKey, filtered],
  );
  /* 고른 날 열리는 대회들의 기간 — 달력에 옅은 띠로(고른 때만, 그래서 복잡해지지 않는다) */
  const span = useMemo(() => spanDays(filtered, date), [filtered, date]);
  /* 그날 접수가 끝나는 대회 — 날짜를 눌렀을 때 아래에 따로 한 줄 */
  const closingOn = useMemo(
    () => (date ? filtered.filter((t) => String(t.signupTo || '').slice(0, 10) === date) : []),
    [filtered, date],
  );
  const hint = (OPEN_SEARCH_BY.find((x) => x.key === by) || OPEN_SEARCH_BY[0]).hint;

  const openLink = (t) => {
    const url = String(t.link || '').trim();
    if (!url) return flash('이 대회는 등록된 신청 링크가 없습니다');
    return Linking.openURL(url);
  };

  const startEdit = (t) => {
    setEditing(t ? t.id : 'new');
    setDraft(t ? {
      ...blank(),
      ...t,
      fee: t.fee ? String(t.fee) : '',
      divisions: Array.isArray(t.divisions) ? t.divisions.join(', ') : (t.divisions || ''),
    } : blank());
  };

  const save = async () => {
    const err = validateOpen(draft);
    if (err) return flash(err);
    const payload = {
      name: draft.name.trim(),
      host: draft.host.trim(),
      org: draft.org.trim(),
      sido: draft.sido || '',
      gungu: draft.gungu.trim(),
      place: draft.place.trim(),
      startDate: draft.startDate,
      endDate: draft.endDate || '',
      signupFrom: draft.signupFrom || '',
      signupTo: draft.signupTo || '',
      /* 종별은 쉼표로 받아 배열로 굽는다 — 나중에 "남복만 보기" 같은
         필터를 붙일 때 문자열이면 다시 갈라야 한다 */
      divisions: draft.divisions.split(',').map((x) => x.trim()).filter(Boolean),
      fee: Math.max(0, Number(draft.fee) || 0),
      link: draft.link.trim(),
      note: draft.note.trim(),
    };
    try {
      if (editing === 'new') await addOpenTournament(payload, me);
      /* 자동으로 모은 대회를 고치면 잠근다 — 밤마다 도는 갱신이 되돌리지 않게 */
      else await updateOpenTournament(editing, draft.source === 'auto' ? { ...payload, locked: true } : payload);
      setEditing(null); setDraft(blank());
      return flash(editing === 'new' ? '대회를 등록했습니다' : '수정했습니다');
    } catch (e) {
      return flash('저장하지 못했습니다');
    }
  };

  const remove = (t) => Alert.alert('대회 삭제', `${t.name} 을(를) 목록에서 지울까요?`, [
    { text: '취소', style: 'cancel' },
    {
      text: '삭제',
      style: 'destructive',
      onPress: async () => {
        /* 자동으로 모은 대회는 지워도 다음 날 새벽에 다시 모인다.
           그래서 지우지 않고 숨긴 채 잠근다(자동 갱신이 건드리지 않는다). */
        if (t.source === 'auto') await updateOpenTournament(t.id, { hidden: true, locked: true });
        else await deleteOpenTournament(t.id);
        flash('목록에서 뺐습니다');
      },
    },
  ]);

  /* ---------------- 등록·수정 폼 (앱 운영자) ---------------- */
  if (editing) {
    return (
      <View>
        <SectionTitle hint="요강을 보고 그대로 옮겨 적으세요">
          {editing === 'new' ? '대회 등록' : '대회 수정'}
        </SectionTitle>
        <Card>
          <Label>대회 이름</Label>
          <Field placeholder="예: 2026 던롭 X-OPEN 전국오픈테니스대회"
            value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} />

          <Label hint="협회·지자체·기업 등">주최</Label>
          <Field placeholder="예: (사)한국테니스발전협의회"
            value={draft.host} onChangeText={(v) => setDraft({ ...draft, host: v })} />

          <Label hint="선택 — 목록에 배지로 뜹니다">주관·약칭</Label>
          <Field placeholder="예: KATO"
            value={draft.org} onChangeText={(v) => setDraft({ ...draft, org: v })} />

          <Label>지역</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {SIDO_LIST.map((s) => (
              <Chip key={s} tone={draft.sido === s ? 'green' : 'outline'}
                onPress={() => setDraft({ ...draft, sido: s })}>{s}</Chip>
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <View style={{ flex: 1 }}>
              <Label>시·군·구</Label>
              <Field placeholder="송파구"
                value={draft.gungu} onChangeText={(v) => setDraft({ ...draft, gungu: v })} />
            </View>
            <View style={{ flex: 2 }}>
              <Label>경기장</Label>
              <Field placeholder="올림픽공원 테니스장"
                value={draft.place} onChangeText={(v) => setDraft({ ...draft, place: v })} />
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <View style={{ flex: 1 }}>
              <Label>대회 시작일</Label>
              <DateField value={draft.startDate}
                onChange={(v) => setDraft({ ...draft, startDate: v })} />
            </View>
            <View style={{ flex: 1 }}>
              <Label hint="하루면 비워 두세요">종료일</Label>
              <DateField value={draft.endDate}
                onChange={(v) => setDraft({ ...draft, endDate: v })} />
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <View style={{ flex: 1 }}>
              <Label hint="모르면 비워 두세요">접수 시작</Label>
              <DateField value={draft.signupFrom}
                onChange={(v) => setDraft({ ...draft, signupFrom: v })} />
            </View>
            <View style={{ flex: 1 }}>
              <Label hint="이 날짜가 제일 중요합니다">접수 마감</Label>
              <DateField value={draft.signupTo}
                onChange={(v) => setDraft({ ...draft, signupTo: v })} />
            </View>
          </View>

          <Label hint="쉼표로 구분 — 예: 남복 개나리, 여복 국화">종별</Label>
          <Field placeholder="남복 개나리, 여복 국화, 혼복"
            value={draft.divisions} onChangeText={(v) => setDraft({ ...draft, divisions: v })} />

          <Label hint="1팀 또는 1인 기준">참가비</Label>
          <Field keyboardType="number-pad" placeholder="40000" suffix="원"
            value={draft.fee} onChangeText={(v) => setDraft({ ...draft, fee: v })} />

          <Label hint="요강·신청 페이지 주소">신청 링크</Label>
          <Field placeholder="https://..." autoCapitalize="none"
            value={draft.link} onChangeText={(v) => setDraft({ ...draft, link: v })} />

          <Label hint="선택">한 줄 안내</Label>
          <Field placeholder="예: 선착순 128팀, 부수 제한 있음"
            value={draft.note} onChangeText={(v) => setDraft({ ...draft, note: v })} />

          <View style={{ flexDirection: 'row', gap: S.sm, marginTop: 14 }}>
            <Btn onPress={save}>저장</Btn>
            <Btn tone="ghost" onPress={() => { setEditing(null); setDraft(blank()); }}>취소</Btn>
          </View>
        </Card>
      </View>
    );
  }

  /* ---------------- 목록 ---------------- */
  return (
    <View>
      <Card style={{ backgroundColor: C.fill }}>
        <Text style={{ fontSize: 12, color: C.sub, lineHeight: 18 }}>
          협회·지자체·기업이 여는 대회입니다. 신청은 각 대회의 주최 측에서
          받으며, 이 앱은 일정과 요강 링크만 모아 보여 줍니다.
          {'\n'}
          <Text style={{ fontWeight: '700' }}>우리 클럽이 여는 대회는 [클럽 대회]에 있습니다.</Text>
        </Text>
      </Card>

      {/* 달력 — 처음엔 전체, 날짜를 누르면 그날 열리는 대회만 */}
      <Card style={{ marginTop: 10, paddingHorizontal: 6, paddingVertical: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, marginBottom: 8 }}>
          <Pressable onPress={() => setMonthKey(shiftMonth(monthKey, -1))} hitSlop={10}
            accessibilityLabel="이전 달" style={{ paddingHorizontal: 6 }}>
            <Text style={{ fontSize: 18, color: C.sub }}>‹</Text>
          </Pressable>
          <Text style={[F.h3, { minWidth: 96, textAlign: 'center' }]}>{monthLabel(monthKey)}</Text>
          <Pressable onPress={() => setMonthKey(shiftMonth(monthKey, 1))} hitSlop={10}
            accessibilityLabel="다음 달" style={{ paddingHorizontal: 6 }}>
            <Text style={{ fontSize: 18, color: C.sub }}>›</Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          <Chip tone={!date ? 'green' : 'outline'}
            onPress={() => { setDate(''); setMonthKey(today().slice(0, 7)); }}>전체 보기</Chip>
        </View>

        <View style={{ flexDirection: 'row' }}>
          {WEEK.map((w, i) => (
            <Text key={w} style={{
              flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', marginBottom: 4,
              color: i === 0 ? C.danger : i === 6 ? C.info : C.faint,
            }}>{w}</Text>
          ))}
        </View>
        {weeks.map((week, wi) => (
          <View key={wi} style={{ flexDirection: 'row' }}>
            {week.map((cell, ci) => {
              if (cell.blank) return <View key={`b${ci}`} style={{ flex: 1, height: 42 }} />;
              const on = date === cell.date;
              const starts = cell.items.filter((it) => it.kind === 'game').length;
              const deadline = cell.items.some((it) => it.kind === 'deadline');
              /* 기간 띠 — 앞뒤 칸도 띠면 이어 붙이고, 끝이면 둥글게 */
              const inSpan = span.has(cell.date);
              const prev = week[ci - 1]; const next = week[ci + 1];
              const joinL = inSpan && prev && !prev.blank && span.has(prev.date);
              const joinR = inSpan && next && !next.blank && span.has(next.date);
              return (
                <Pressable key={cell.date} onPress={() => setDate(on ? '' : cell.date)}
                  accessibilityLabel={`${dayText(cell.date)}${starts ? `, 대회 ${starts}개 시작` : ''}${deadline ? ', 접수 마감' : ''}`}
                  style={{ flex: 1, height: 46, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 3 }}>
                  {inSpan && (
                    <View style={{
                      position: 'absolute', top: 3, height: 26, left: joinL ? 0 : 3, right: joinR ? 0 : 3,
                      backgroundColor: C.greenSoft,
                      borderTopLeftRadius: joinL ? 0 : 13, borderBottomLeftRadius: joinL ? 0 : 13,
                      borderTopRightRadius: joinR ? 0 : 13, borderBottomRightRadius: joinR ? 0 : 13,
                    }} />
                  )}
                  <View style={{
                    width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: on ? C.green : 'transparent',
                    borderWidth: cell.today && !on ? 1.5 : 0, borderColor: C.green,
                  }}>
                    <Text style={{
                      fontSize: 12.5, fontWeight: cell.today || on ? '800' : '500',
                      color: on ? '#fff' : cell.today ? C.green : cell.past ? C.faint
                        : ci === 0 ? C.danger : ci === 6 ? C.info : C.text,
                    }}>{cell.day}</Text>
                  </View>
                  {/* 시작일 표시 — 1개는 점, 여러 개는 숫자 */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, height: 12, marginTop: 2 }}>
                    {starts === 1 && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.green }} />}
                    {starts > 1 && (
                      <View style={{ minWidth: 14, height: 12, borderRadius: 6, paddingHorizontal: 3, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 8.5, fontWeight: '800', color: '#fff' }}>{starts}</Text>
                      </View>
                    )}
                    {deadline && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.danger }} />}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
        <View style={{
          flexDirection: 'row', gap: 14, marginTop: 8, paddingTop: 8,
          borderTopWidth: 1, borderTopColor: C.border, justifyContent: 'center',
        }}>
          {[[C.green, '대회 시작(숫자=개수)'], [C.danger, '접수 마감일']].map(([c, l]) => (
            <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c }} />
              <Text style={{ fontSize: 10.5, color: C.faint }}>{l}</Text>
            </View>
          ))}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 14, height: 6, borderRadius: 3, backgroundColor: C.greenSoft, borderWidth: 1, borderColor: C.lime2 }} />
            <Text style={{ fontSize: 10.5, color: C.faint }}>날짜를 누르면 대회 기간</Text>
          </View>
        </View>
      </Card>

      {!!near && !date && (
        <Card style={{ marginTop: 10, borderColor: C.green, borderWidth: 1 }}>
          <Text style={{ fontSize: 12.5, color: C.text, fontWeight: '700' }}>{near.text}</Text>
          {near.signup > 0 && (
            <Text style={{ fontSize: 11.5, color: C.green2, marginTop: 3, lineHeight: 16 }}>
              신청 전에 접수 마감일을 꼭 확인하세요. 대회마다 접수 일정을 아래에 적어 두었습니다.
            </Text>
          )}
        </Card>
      )}

      {/* 찾기 — 기준을 고르고 검색 */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
        {OPEN_SEARCH_BY.map((x) => (
          <Chip key={x.key} tone={by === x.key ? 'green' : 'outline'} onPress={() => pickBy(x.key)}>
            {x.label}
          </Chip>
        ))}
      </View>
      <View style={{ marginTop: 8 }}>
        <Field placeholder={hint} value={kw} onChangeText={setKw} />
      </View>
      {by === 'region' && sidos.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          <Chip tone={!region ? 'green' : 'outline'} onPress={() => setRegion(null)}>전국</Chip>
          {sidos.map((x) => (
            <Chip key={x} tone={region === x ? 'green' : 'outline'}
              onPress={() => setRegion(region === x ? null : x)}>{x}</Chip>
          ))}
        </View>
      )}
      {by === 'host' && orgs.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {orgs.map((o) => (
            <Chip key={o} tone={kw === o ? 'green' : 'outline'}
              onPress={() => setKw(kw === o ? '' : o)}>{o}</Chip>
          ))}
        </View>
      )}

      {isAppAdmin && (
        <Card style={{ marginTop: 10, paddingVertical: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={F.bodyBold}>자동 갱신 · 매일 새벽 2시</Text>
              <Text style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>
                앱 관리자에게만 보입니다 · KATO 는 매일, AI 찾기는 매주 월요일 · 버튼은 누를 때마다 비용
              </Text>
            </View>
            <Btn small tone="primary" disabled={sync.busy || asking} onPress={findNow}>
              {sync.busy || asking ? '찾는 중…' : '지금 찾기'}
            </Btn>
          </View>
          {!!sync.text && (
            <Text style={{
              fontSize: 11.5, marginTop: 8, lineHeight: 16,
              color: sync.tone === 'danger' ? C.danger : sync.tone === 'green' ? C.green2 : C.faint,
            }}>{sync.text}</Text>
          )}
        </Card>
      )}

      {/* 마감된 대회는 목록에서 사라진다. 정리할 사람(앱 관리자)만 따로 본다. */}
      {isAppAdmin && (
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
          <Chip tone={!showDone ? 'green' : 'outline'} onPress={() => setShowDone(false)}>
            접수 중·예정
          </Chip>
          <Chip tone={showDone ? 'green' : 'outline'} onPress={() => setShowDone(true)}>
            마감·지난 대회
          </Chip>
        </View>
      )}

      <SectionTitle right={
        <Text style={{ fontSize: 11, color: C.faint }}>{list.length}건</Text>
      }>{date ? `${dayText(date)} 열리는 대회`
        : showDone && isAppAdmin ? '마감·지난 대회' : '접수 중·접수 예정 대회'}</SectionTitle>

      {closingOn.length > 0 && (
        <Card style={{ marginBottom: 10, backgroundColor: C.dangerBg, borderColor: C.dangerBg }}>
          <Text style={{ fontSize: 12, color: C.danger, fontWeight: '700' }}>
            이날 접수 마감 {closingOn.length}건
          </Text>
          <Text style={{ fontSize: 11.5, color: C.text, marginTop: 3, lineHeight: 17 }}>
            {closingOn.map((t) => t.name).join('\n')}
          </Text>
        </Card>
      )}

      {list.length === 0 ? (
        <EmptyState
          icon="🏆"
          title={date ? '이 날 열리는 대회가 없습니다'
            : showDone && isAppAdmin ? '마감·지난 대회가 없습니다'
              : kw || region ? '찾는 조건에 맞는 대회가 없습니다'
                : '지금 접수 중이거나 곧 접수하는 대회가 없습니다'}
          body={date ? '달력 오른쪽 위 「전체 보기」를 누르면 모든 대회를 봅니다.'
            : kw || region ? '검색어를 줄이거나 찾는 기준을 바꿔 보세요.'
              : isAppAdmin
                ? '위 지금 찾기 버튼으로 바로 찾거나, 아래 [대회 등록]으로 요강을 옮겨 적으세요.'
                : '대회가 올라오면 여기에 표시됩니다.'}
        />
      ) : list.map((t) => {
        const state = openState(t, today(), nowHm());
        const sg = signupDates(t, today());
        const signupColor = state === OPEN_STATE.SIGNUP ? C.green2 : state === OPEN_STATE.CLOSED ? C.faint : C.text;
        return (
          <Card key={t.id} style={{
            marginBottom: 10,
            borderColor: state === OPEN_STATE.SIGNUP ? C.green
              : state === OPEN_STATE.LIVE ? C.danger : C.border,
            borderWidth: state === OPEN_STATE.SIGNUP || state === OPEN_STATE.LIVE ? 1.5 : 1,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Chip tone={OPEN_STATE_TONE[state]}>{OPEN_STATE_LABEL[state]}</Chip>
              {!!t.org && <Chip tone="soft">{t.org}</Chip>}
              {!!sg.dday && state === OPEN_STATE.SIGNUP && <Chip tone="red">{sg.dday}</Chip>}
              {!!date && dayOfPeriod(t, date) === 1 && <Chip tone="green">이날 시작</Chip>}
              {!!date && dayOfPeriod(t, date) > 1 && <Chip tone="outline">{`진행 ${dayOfPeriod(t, date)}일째`}</Chip>}
            </View>

            <Text style={[F.bodyBold, { marginTop: 7, fontSize: 14.5 }]}>{t.name}</Text>
            <Text style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>
              {regionText(t)}{t.place ? ` · ${t.place}` : ''}
            </Text>
            {!!t.host && (
              <Text style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>주최 {t.host}</Text>
            )}

            {/* 일정 두 줄 — 대회 일정 / 접수 일정 */}
            <View style={{ marginTop: 9, padding: 10, borderRadius: R.md, backgroundColor: C.fill, gap: 6 }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Text style={{ width: 54, fontSize: 11.5, color: C.faint, fontWeight: '700' }}>대회 일정</Text>
                <Text style={{ flex: 1, fontSize: 12.5, color: C.text, fontWeight: '600' }}>{gameDates(t)}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Text style={{ width: 54, fontSize: 11.5, color: C.faint, fontWeight: '700' }}>접수 일정</Text>
                <Text style={{ flex: 1, fontSize: 12.5, color: signupColor, fontWeight: '600' }}>
                  {state === OPEN_STATE.CLOSED ? `${sg.text} (마감됨)` : sg.text}
                </Text>
              </View>
              {!!refundText(t) && (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Text style={{ width: 54, fontSize: 11.5, color: C.faint, fontWeight: '700' }}>취소·환불</Text>
                  <Text style={{ flex: 1, fontSize: 12, color: C.sub }}>{refundText(t)}</Text>
                </View>
              )}
            </View>

            {isAppAdmin && t.source === 'auto' && (
              <Text style={{ fontSize: 10.5, color: C.faint, marginTop: 6 }}>
                {t.locked ? '자동 수집 · 고친 뒤 잠김(자동 갱신이 덮어쓰지 않음)' : '자동 수집 · 매일 새벽 2시 갱신'}
              </Text>
            )}

            {(t.divisions?.length > 0 || t.fee > 0) && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                {(t.divisions || []).map((dv) => <Chip key={dv} tone="outline">{dv}</Chip>)}
                {t.fee > 0 && <Chip tone="default">참가비 {won(t.fee)}</Chip>}
              </View>
            )}

            {!!t.note && (
              <Text style={{ fontSize: 11.5, color: C.sub, marginTop: 7, lineHeight: 17 }}>
                {t.note}
              </Text>
            )}

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 11 }}>
              {!!t.link && (
                <Btn small
                  tone={state === OPEN_STATE.SIGNUP ? 'primary' : 'outline'}
                  onPress={() => openLink(t)}>
                  {state === OPEN_STATE.SIGNUP ? '신청하러 가기' : '요강 보기'}
                </Btn>
              )}
              <View style={{ flex: 1 }} />
              {isAppAdmin && (
                <>
                  <Btn small tone="ghost" onPress={() => startEdit(t)}>수정</Btn>
                  <Btn small tone="ghost" onPress={() => remove(t)}>삭제</Btn>
                </>
              )}
            </View>
          </Card>
        );
      })}

      <Text style={{ fontSize: 10.5, color: C.faint, marginTop: 12, lineHeight: 16 }}>
        접수 마감일이 지난 대회는 목록에서 자동으로 빠집니다. 목록은 매일
        새벽 2시에 협회·대회 사이트를 보고 갱신합니다. 요강과 일정은 주최 측
        사정으로 바뀔 수 있으니 신청 전에 링크에서 한 번 더 확인해 주세요.
      </Text>

      {isAppAdmin && (
        <View style={{ marginTop: 14 }}>
          <Btn full onPress={() => startEdit(null)}>＋ 대회 등록</Btn>
        </View>
      )}
    </View>
  );
}

export default OpenTournaments;
