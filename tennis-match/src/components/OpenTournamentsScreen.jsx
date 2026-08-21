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
     · 등록은 앱 운영자만. 아무나 올리면 광고판이 되고, 요강이 틀린
       대회에 헛걸음한 사람이 앱을 탓한다.
   ============================================================ */
import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, Linking, Alert } from 'react-native';
import {
  subOpenTournaments, addOpenTournament, updateOpenTournament, deleteOpenTournament,
} from '../lib/firestore';
import {
  OPEN_STATE, OPEN_STATE_LABEL, OPEN_STATE_TONE,
  openState, openStatusLine, periodText, regionText,
  visibleOpen, sortOpen, openSidos, nearbyNote, validateOpen,
} from '../lib/openTournament';
import { SIDO_LIST } from '../lib/regions';
import { DateField, Label } from './pickers';
import { Card, SectionTitle, Chip, Btn, Field, EmptyState } from './ui';
import { Icon } from './Icon';
import { C, S, R, F } from '../lib/theme';

const today = () => new Date().toISOString().slice(0, 10);
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
  const [showDone, setShowDone] = useState(false);
  const [editing, setEditing] = useState(null);   // null | 'new' | id
  const [draft, setDraft] = useState(blank());

  useEffect(() => subOpenTournaments(setAll), []);

  const sidos = useMemo(() => openSidos(all), [all]);

  /* 이 달에 뭐가 있는지 한 줄. 목록을 다 훑기 전에 "이번 달은 볼 게
     있나 없나"부터 알려 준다. */
  const near = useMemo(
    () => nearbyNote(all, { today: today(), monthKey: today().slice(0, 7), region }),
    [all, region],
  );
  const list = useMemo(() => sortOpen(
    visibleOpen(all, {
      today: today(),
      region,
      kw,
      state: showDone ? OPEN_STATE.DONE : null,
    }),
    today(),
  ), [all, region, kw, showDone]);

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
      else await updateOpenTournament(editing, payload);
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
        await deleteOpenTournament(t.id);
        flash('삭제했습니다');
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

      {!!near && (
        <Card style={{ marginTop: 10, borderColor: C.green, borderWidth: 1 }}>
          <Text style={{ fontSize: 12.5, color: C.text, fontWeight: '700' }}>{near.text}</Text>
          {near.signup > 0 && (
            <Text style={{ fontSize: 11, color: C.green2, marginTop: 3 }}>
              접수 마감일을 놓치면 그걸로 끝입니다 — 아래에서 확인하세요
            </Text>
          )}
        </Card>
      )}

      <View style={{ marginTop: 12 }}>
        <Field placeholder="대회 이름·주최로 찾기" value={kw} onChangeText={setKw} />
      </View>

      {sidos.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          <Chip tone={!region ? 'green' : 'outline'} onPress={() => setRegion(null)}>전국</Chip>
          {sidos.map((s) => (
            <Chip key={s} tone={region === s ? 'green' : 'outline'}
              onPress={() => setRegion(region === s ? null : s)}>{s}</Chip>
          ))}
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
        <Chip tone={!showDone ? 'green' : 'outline'} onPress={() => setShowDone(false)}>
          예정·접수 중
        </Chip>
        <Chip tone={showDone ? 'green' : 'outline'} onPress={() => setShowDone(true)}>
          지난 대회
        </Chip>
      </View>

      <SectionTitle right={
        <Text style={{ fontSize: 11, color: C.faint }}>{list.length}건</Text>
      }>{showDone ? '지난 대회' : '대회 목록'}</SectionTitle>

      {list.length === 0 ? (
        <EmptyState
          icon="🏆"
          title={showDone ? '지난 대회 기록이 없습니다' : '등록된 대회가 없습니다'}
          body={isAppAdmin
            ? '아래 [대회 등록]으로 요강을 옮겨 적으세요.'
            : '대회가 등록되면 여기에 표시됩니다. 지역을 바꿔서 찾아보세요.'}
        />
      ) : list.map((t) => {
        const state = openState(t, today());
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
              <Text style={{ fontSize: 11, color: C.faint }}>{periodText(t)}</Text>
            </View>

            <Text style={[F.bodyBold, { marginTop: 7, fontSize: 14.5 }]}>{t.name}</Text>
            <Text style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>
              {regionText(t)}{t.place ? ` · ${t.place}` : ''}
            </Text>
            {!!t.host && (
              <Text style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>주최 {t.host}</Text>
            )}

            <Text style={{
              fontSize: 12, marginTop: 6, fontWeight: '600',
              color: state === OPEN_STATE.SIGNUP ? C.green2
                : state === OPEN_STATE.LIVE ? C.danger : C.sub,
            }}>
              {openStatusLine(t, today())}
            </Text>

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
        요강과 일정은 주최 측 사정으로 바뀔 수 있습니다. 신청 전에 링크에서
        한 번 더 확인해 주세요.
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
