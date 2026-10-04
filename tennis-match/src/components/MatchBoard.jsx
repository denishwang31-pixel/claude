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
import { C, S, R } from '../lib/theme';

export const BOARD_MODE = { NONE: null, SCORE: 'score', EDIT: 'edit' };

/** 대진표 위 버튼 줄 */
export function BoardModeBar({ mode, onMode, onAdd, onClearAll, hasMatches = true }) {
  const btn = (key, label) => (
    <View style={{ flex: 1 }}>
      <AppButton full small variant={mode === key ? 'filled' : 'outlined'}
        onPress={() => onMode(mode === key ? BOARD_MODE.NONE : key)}>
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
            ? '경기를 누르면 타임·코트·선수를 고칩니다.'
            : '위 버튼을 먼저 고른 뒤 경기를 누르세요.'}
      </Text>
      {mode === BOARD_MODE.EDIT && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <View style={{ flex: 1 }}>
            <AppButton full small variant="tonal" onPress={onAdd}>＋ 경기 추가</AppButton>
          </View>
          {hasMatches && (
            <View style={{ flex: 1 }}>
              <AppButton full small variant="tonal" onPress={onClearAll}>대진 삭제</AppButton>
            </View>
          )}
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
  if (!target) return null;

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

export default { BoardModeBar, ScoreSheet, BOARD_MODE };
