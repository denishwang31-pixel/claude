/* ============================================================
   대진표 위 버튼 줄 · 결과 입력 창 — 청백전(2팀·3팀) · 팀 리그가 함께 쓴다

   앱 주인 요청(2026-10-04)
     "대진표 위에 [결과 입력] 버튼과 [대진표 수정] 버튼을 두고, 그 버튼을 누른 뒤에
      밑의 경기를 누르면 결과 입력이든 대진표 수정이든 가능하게"
   예전에는 경기를 누르면 점수·고치기·삭제가 한 메뉴에 섞여 있어, 고치기를 찾지 못했다.

   흐름
     · 아무것도 안 고른 채 경기를 누르면 → 위 버튼을 먼저 고르라고 알린다
     · [결과 입력]  → 경기를 누르면 아래에서 점수 창이 올라온다(양 팀 게임 수 고르기)
     · [대진표 수정] → 경기를 누르면 고치기 화면(LeagueMatchEditor). [경기 추가]·[대진 삭제]도 이때 보인다
   ⚠️ 창은 경기를 눌렀을 때 바로 하나만 연다 — 메뉴가 닫히는 중에 다른 창을 여는 일이 없게.
   ============================================================ */
import React, { useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppButton } from './native';
import { Chip } from './ui';
import { C, S, R, F } from '../lib/theme';
import { breadcrumb } from '../lib/crashReport';

export const BOARD_MODE = { NONE: null, SCORE: 'score', EDIT: 'edit' };

/**
 * 접었다 펴는 구역 — 팀 편성·대진 설정 등이 길게 이어져 대진표까지 한참 내려가야 했다
 * (2026-10-04 앱 주인 "드롭다운으로 가릴 수 있는 건 정리"). 제목 줄을 누르면 접고 편다.
 * summary 는 접혀 있을 때 제목 아래 한 줄로 보인다.
 */
export function Fold({ title, summary, open, onToggle, children }) {
  return (
    <View>
      <Pressable onPress={() => { breadcrumb(`${open ? '접기' : '펼치기'} ${title}`); onToggle?.(); }} hitSlop={6}
        style={({ pressed }) => ({
          marginTop: S.xl, marginBottom: S.sm, opacity: pressed ? 0.6 : 1,
          flexDirection: 'row', alignItems: 'center', gap: 8,
        })}>
        <View style={{ flex: 1 }}>
          <Text style={F.h3}>{title}</Text>
          {!open && !!summary && (
            <Text numberOfLines={2} style={{ fontSize: 11.5, color: C.sub, marginTop: 2 }}>{summary}</Text>
          )}
        </View>
        <View style={{
          paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.pill,
          backgroundColor: open ? C.fill : C.greenSoft,
        }}>
          <Text style={{ fontSize: 11.5, fontWeight: '800', color: open ? C.sub : C.green }}>{open ? '접기 ▲' : '펼치기 ▼'}</Text>
        </View>
      </Pressable>
      {open ? children : null}
    </View>
  );
}

/** 대진표 위 버튼 줄
 *  multi — 여러 경기 지우기 중인지. 그때 경기를 누르면 고르기만 하고, [선택한 N경기 삭제]로 지운다 */
export function BoardModeBar({
  mode, onMode, onAdd, onClearAll, hasMatches = true,
  multi = false, onMulti, pickedCount = 0, onDeletePicked,
}) {
  const btn = (key, label) => (
    <View style={{ flex: 1 }}>
      <AppButton full small variant={mode === key ? 'filled' : 'outlined'}
        onPress={() => { breadcrumb(`대진표 버튼 ${label}`); onMode(mode === key ? BOARD_MODE.NONE : key); }}>
        {mode === key ? `✓ ${label}` : label}
      </AppButton>
    </View>
  );
  return (
    <View style={{ marginBottom: S.sm }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {btn(BOARD_MODE.SCORE, '결과 입력')}
        {btn(BOARD_MODE.EDIT, '대진표 수정')}
      </View>
      <Text style={{ fontSize: 11, color: mode ? C.green2 : C.faint, marginTop: 6, lineHeight: 16 }}>
        {mode === BOARD_MODE.SCORE
          ? '경기를 누르면 점수를 넣습니다.'
          : mode === BOARD_MODE.EDIT
            ? (multi
              ? `지울 경기를 누르세요 — ${pickedCount}경기 골랐습니다. 지운 자리는 빈칸으로 남습니다.`
              : '경기를 누르면 타임·코트·선수를 고칩니다. 빈칸을 누르면 그 자리에 경기를 넣습니다.')
            : '위 버튼을 먼저 고른 뒤 경기를 누르세요.'}
      </Text>
      {mode === BOARD_MODE.EDIT && !multi && (
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
          <View style={{ flex: 1 }}>
            <AppButton full small variant="tonal" onPress={onAdd}>＋ 경기 추가</AppButton>
          </View>
          {hasMatches && !!onMulti && (
            <View style={{ flex: 1 }}>
              <AppButton full small variant="tonal" onPress={() => onMulti(true)}>골라서 삭제</AppButton>
            </View>
          )}
          {hasMatches && (
            <View style={{ flex: 1 }}>
              <AppButton full small variant="tonal" onPress={onClearAll}>전체 삭제</AppButton>
            </View>
          )}
        </View>
      )}
      {mode === BOARD_MODE.EDIT && multi && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <View style={{ flex: 1 }}>
            <AppButton full small variant="danger" disabled={!pickedCount} onPress={onDeletePicked}>
              {pickedCount ? `고른 ${pickedCount}경기 삭제` : '지울 경기를 고르세요'}
            </AppButton>
          </View>
          <AppButton small variant="outlined" onPress={() => onMulti(false)}>그만 고르기</AppButton>
        </View>
      )}
    </View>
  );
}

const GAMES = [0, 1, 2, 3, 4, 5, 6, 7];

/**
 * 점수 창 — 양 팀 게임 수를 하나씩 눌러 고르고 [저장].
 * @param target { match, title, A:{name,color}, B:{name,color} } | null
 * @param onSave (score|null) => void   null 이면 기록 지우기
 */
export function ScoreSheet({ target, onSave, onClose }) {
  const insets = useSafeAreaInsets();
  const [a, setA] = useState(null);
  const [b, setB] = useState(null);
  useEffect(() => {
    if (!target) return;
    setA(target.match?.score ? target.match.score.a : null);
    setB(target.match?.score ? target.match.score.b : null);
  }, [target]);
  /* ⚠️ 닫을 때 창을 없애지 않고 visible 만 끈다 — LeagueMatchEditor.jsx 같은 자리 주석 */
  if (!target) return <Modal visible={false} transparent animationType="slide" onRequestClose={onClose} />;

  const row = (side, value, set) => (
    <View style={{ marginTop: S.md }}>
      <Text style={{ fontSize: 13, fontWeight: '800', color: side.color || C.text }}>{side.name}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
        {GAMES.map((g) => (
          <Chip key={g} tone={value === g ? 'green' : 'outline'} onPress={() => set(g)}>{String(g)}</Chip>
        ))}
      </View>
    </View>
  );
  const ready = a !== null && b !== null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.32)', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()}>
          <View style={{
            backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
            paddingHorizontal: 20, paddingTop: 14, paddingBottom: 20 + insets.bottom,
          }}>
            <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled">
              <Text style={{ fontSize: 15, fontWeight: '800', color: C.text }}>결과 입력</Text>
              <Text style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{target.title}</Text>
              {row(target.A, a, setA)}
              {row(target.B, b, setB)}
              <Text style={{ fontSize: 12, color: C.sub, marginTop: S.md }}>
                {ready ? `${target.A.name} ${a} : ${b} ${target.B.name}` : '양 팀 게임 수를 고르세요'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: S.md }}>
                <View style={{ flex: 1 }}>
                  <AppButton full disabled={!ready} onPress={() => onSave({ a, b })}>저장</AppButton>
                </View>
                {!!target.match?.score && (
                  <AppButton variant="outlined" onPress={() => onSave(null)}>기록 지우기</AppButton>
                )}
                <AppButton variant="text" onPress={onClose}>닫기</AppButton>
              </View>
            </ScrollView>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * 내 경기 — 앱에 가입해(또는 오프라인 기록을 합쳐) 명단에 든 회원에게 자기 경기만 모아 보여 준다.
 * 대진표에서도 내 칸은 초록 테두리로 칠해진다(MatchGrid me). (2026-10-04 앱 주인)
 * @param games [{ id, round, court, type, mine:{name,color}, opp:{name,color}, score, mineIsA }]
 */
export function MyGames({ games }) {
  if (!games?.length) return null;
  /* 대회 시간을 정했으면 몇 시 경기인지도(g.time — schedule.tournamentRoundTimes) */
  return (
    <View style={{ marginBottom: S.sm, padding: 12, borderRadius: R.md, backgroundColor: C.greenSoft, borderWidth: 1.5, borderColor: C.green }}>
      <Text style={{ fontSize: 13, fontWeight: '900', color: C.green }}>내 경기 {games.length}</Text>
      {games.map((g) => {
        const my = g.score ? (g.mineIsA ? g.score.a : g.score.b) : null;
        const op = g.score ? (g.mineIsA ? g.score.b : g.score.a) : null;
        return (
          <View key={g.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <Text style={{ minWidth: 92, fontSize: 12, fontWeight: '800', color: C.text }}>
              {g.round}타임{g.time ? ` ${g.time.start}` : ''} · 코트 {g.court}
            </Text>
            <Text style={{ flex: 1, fontSize: 12, color: C.sub }} numberOfLines={1}>
              {g.type} · <Text style={{ fontWeight: '800', color: g.opp.color }}>{g.opp.name}</Text>와
            </Text>
            <Text style={{ fontSize: 12.5, fontWeight: '900', color: g.score ? (my > op ? C.green : my < op ? C.danger : C.sub) : C.faint }}>
              {g.score ? `${my}:${op} ${my > op ? '승' : my < op ? '패' : '무'}` : '대기'}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export default { BoardModeBar, ScoreSheet, BOARD_MODE, MyGames };
