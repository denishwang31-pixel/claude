/* ============================================================
   대회 참가 신청 — 모집 열기 · 신청자 명단

   왜 필요했나
     지금까지 대회 참가자는 운영진이 회원 명단에서 손으로 골랐다.
     20명짜리 월례대회는 그래도 되지만, "나가고 싶은 사람 손 들어라"를
     단톡방에서 받아 적는 일이 남는다. 그 받아 적기를 앱이 한다.

   신청과 참가는 다르다
     신청은 "나가고 싶다", 참가는 "대진에 들어간다". 둘을 같은 것으로
     만들면 정원을 넘겨 신청이 들어왔을 때 대진이 깨진다. 그래서
     신청자를 따로 받고, 운영진이 명단으로 옮긴다.

   ⚠️ 신청자를 대회 문서 안의 맵으로 둔 이유
     일정 화면이 대회마다 "몇 자리 남음"을 그려야 한다. 하위 컬렉션이면
     대회 수만큼 구독이 늘어난다. 클럽 대회 신청자는 많아야 수십 명이라
     문서 하나에 들어간다.
   ============================================================ */
import React, { useState, useMemo } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import {
  saveTournamentSignup, applyToTournament, cancelTournamentApply,
} from '../lib/firestore';
import {
  tournamentState, tournamentStatusLine, signupCount, canApply,
  T_STATE, T_STATE_LABEL, T_STATE_TONE, dateHead,
} from '../lib/agenda';
import { DateField, Label } from './pickers';
import { Card, SectionTitle, Chip, Btn, Field, CheckRow } from './ui';
import { C, S, F } from '../lib/theme';

const today = () => new Date().toISOString().slice(0, 10);
const won = (n) => `${Number(n || 0).toLocaleString()}원`;

export function TournamentSignup({ clubId, t, me, meVal, isAdmin, onPickRoster, flash }) {
  const [editing, setEditing] = useState(false);
  const su = t?.signup || {};
  const [draft, setDraft] = useState({
    open: !!su.open,
    cap: String(su.cap || ''),
    deadline: su.deadline || '',
    fee: String(su.fee || ''),
    note: su.note || '',
  });

  const state = tournamentState(t, today());
  const applicants = useMemo(
    () => Object.entries(t?.applicants || {})
      .map(([uid, v]) => ({ uid, ...v }))
      .sort((a, b) => String(a.at || '').localeCompare(String(b.at || ''))),
    [t?.applicants],
  );
  const mine = (t?.applicants || {})[me];
  const gate = canApply(t, me, today());

  const save = async () => {
    /* 마감일이 대회 날짜보다 뒤면 "마감 전인데 이미 끝난 대회"가 된다 */
    if (draft.deadline && t?.date && draft.deadline > t.date) {
      return flash('신청 마감일이 대회 날짜보다 늦습니다');
    }
    try {
      await saveTournamentSignup(clubId, t.id, draft);
      setEditing(false);
      return flash(draft.open ? '모집을 열었습니다' : '모집 설정을 저장했습니다');
    } catch (e) {
      return flash('저장하지 못했습니다');
    }
  };

  const apply = async () => {
    if (!gate.ok) return flash(gate.reason);
    if (!meVal) return flash('프로필을 먼저 등록하세요');
    try {
      await applyToTournament(clubId, t.id, me, meVal);
      return flash('참가 신청을 보냈습니다');
    } catch (e) {
      return flash('신청하지 못했습니다');
    }
  };

  const cancel = () => Alert.alert('신청 취소', '참가 신청을 취소할까요?', [
    { text: '아니요', style: 'cancel' },
    {
      text: '취소하기',
      style: 'destructive',
      onPress: async () => {
        await cancelTournamentApply(clubId, t.id, me);
        flash('신청을 취소했습니다');
      },
    },
  ]);

  return (
    <View>
      <SectionTitle hint="신청 현황은 일정 화면에도 함께 보입니다">참가 신청</SectionTitle>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Chip tone={T_STATE_TONE[state]}>{T_STATE_LABEL[state]}</Chip>
          <Text style={{ flex: 1, fontSize: 12.5, color: C.text }}>
            {tournamentStatusLine(t, today())}
          </Text>
        </View>

        {(su.deadline || su.fee) && (
          <Text style={{ fontSize: 11.5, color: C.sub, marginTop: 7 }}>
            {su.deadline ? `신청 마감 ${dateHead(su.deadline)}` : ''}
            {su.deadline && su.fee ? ' · ' : ''}
            {su.fee ? `참가비 ${won(su.fee)}` : ''}
          </Text>
        )}
        {!!su.note && (
          <Text style={{ fontSize: 12, color: C.sub, marginTop: 6, lineHeight: 18 }}>
            {su.note}
          </Text>
        )}

        {/* 회원용 — 신청/취소 */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          {mine ? (
            <>
              <Chip tone="green">신청 완료</Chip>
              <View style={{ flex: 1 }} />
              <Btn small tone="ghost" onPress={cancel}>신청 취소</Btn>
            </>
          ) : (
            <Btn small disabled={!gate.ok} onPress={apply}>
              {gate.ok ? '참가 신청' : gate.reason}
            </Btn>
          )}
        </View>
      </Card>

      {/* 운영진용 — 모집 설정 */}
      {isAdmin && (
        <Card style={{ marginTop: 8 }}>
          {editing ? (
            <>
              <CheckRow
                checked={draft.open}
                onToggle={() => setDraft({ ...draft, open: !draft.open })}
                label="참가 신청 받기"
                hint="켜면 회원에게 일정 화면에 [참가 신청] 버튼이 보입니다"
              />

              <View style={{ marginTop: 12 }}>
                <Label hint="비워 두면 인원 제한 없이 받습니다">정원</Label>
                <Field keyboardType="number-pad" placeholder="예: 16"
                  value={draft.cap} onChangeText={(v) => setDraft({ ...draft, cap: v })} />
              </View>

              <View style={{ marginTop: 10 }}>
                <Label hint="비워 두면 대회 전날까지 받습니다">신청 마감일</Label>
                <DateField value={draft.deadline}
                  onChange={(v) => setDraft({ ...draft, deadline: v })} />
              </View>

              <View style={{ marginTop: 10 }}>
                <Label hint="안내에만 표시됩니다. 실제 수납은 [회비]의 일회성 정산에서">참가비</Label>
                <Field keyboardType="number-pad" placeholder="예: 20000"
                  value={draft.fee} onChangeText={(v) => setDraft({ ...draft, fee: v })} />
              </View>

              <View style={{ marginTop: 10 }}>
                <Label hint="준비물, 집합 시간 등">안내 문구 (선택)</Label>
                <Field placeholder="예: 09:00 집합, 공은 클럽에서 준비합니다"
                  value={draft.note} onChangeText={(v) => setDraft({ ...draft, note: v })} />
              </View>

              <View style={{ flexDirection: 'row', gap: S.sm, marginTop: 12 }}>
                <Btn small onPress={save}>저장</Btn>
                <Btn small tone="ghost" onPress={() => setEditing(false)}>취소</Btn>
              </View>
            </>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={F.bodyBold}>
                  {su.open ? '신청 받는 중' : '모집이 닫혀 있습니다'}
                </Text>
                <Text style={{ fontSize: 11.5, color: C.sub, marginTop: 3, lineHeight: 17 }}>
                  {su.open
                    ? `${su.cap ? `정원 ${su.cap}명` : '정원 제한 없음'}`
                      + `${su.deadline ? ` · ${su.deadline}까지` : ''}`
                    : '열면 회원이 일정 화면에서 바로 신청할 수 있습니다'}
                </Text>
              </View>
              <Btn small tone="ghost" onPress={() => setEditing(true)}>
                {su.open ? '수정' : '모집 열기'}
              </Btn>
            </View>
          )}
        </Card>
      )}

      {/* 신청자 명단 — 운영진만 */}
      {isAdmin && applicants.length > 0 && (
        <>
          <SectionTitle right={
            <Text style={{ fontSize: 11, color: C.faint }}>{applicants.length}명</Text>
          }>신청자</SectionTitle>
          <Card>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {applicants.map((a) => (
                <Chip key={a.uid} tone={a.gender === 'F' ? 'soft' : 'outline'}>
                  {a.name || a.uid}
                </Chip>
              ))}
            </View>
            {onPickRoster && (
              <View style={{ marginTop: 12 }}>
                <Btn small full onPress={() => onPickRoster(applicants)}>
                  신청자 {applicants.length}명을 참가 명단으로
                </Btn>
                <Text style={{ fontSize: 10.5, color: C.faint, marginTop: 8, lineHeight: 15 }}>
                  신청은 "나가고 싶다"이고 참가 명단은 "대진에 들어간다"입니다.
                  정원을 넘겨 신청이 들어왔으면 여기서 고르세요.
                </Text>
              </View>
            )}
          </Card>
        </>
      )}
    </View>
  );
}

export default TournamentSignup;
