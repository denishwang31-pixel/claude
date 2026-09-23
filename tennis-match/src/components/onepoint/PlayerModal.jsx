/* ============================================================
   원포인트 — 앱 안 재생 화면

   탭바 없이 화면 전체를 덮는다(모달). 닫으면 보던 목록 위치 그대로다.
   안드로이드 뒤로 = 닫기(onRequestClose).

   순서: 플레이어 → 영역·수준 → 제목 → 운영진 메모(시각 버튼) →
         봤어요·저장·유튜브 → 같은 영역 다음 영상 → 코치 한 줄
   코치는 맨 끝이다. 영상을 다 보고 "나 이거 안 되는데" 하는 순간에만
   눈에 들어오게 둔다.
   ============================================================ */
import React, { useRef } from 'react';
import { Modal, View, Text, Pressable, ScrollView, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { YouTubePlayer } from './YouTubePlayer';
import { VideoRow, MetaBadge, CoachLine, PAD } from './parts';
import { C } from '../../lib/theme';
import {
  catOf, levelLabel, parseStartAt, formatStart, videoIdOf, nextInCategory,
} from '../../lib/onepoint';

const MAXF = 1.3;

function ActionBtn({ label, on, onPress, a11y }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y || label}
      accessibilityState={on == null ? undefined : { selected: !!on }}
      style={({ pressed }) => ({
        flex: 1, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
        backgroundColor: on ? C.green : C.surface, borderWidth: 1, borderColor: on ? C.green : C.border,
        opacity: pressed ? 0.8 : 1,
      })}>
      <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 15, fontWeight: '800', color: on ? '#FFFFFF' : C.text }}>{label}</Text>
    </Pressable>
  );
}

export function PlayerModal({
  video, videos, isWatched, isSaved, onToggleWatched, onToggleSaved, onMarkWatched,
  onOpenVideo, onOpenCategory, coachCount, onGoCoach, onClose,
}) {
  const insets = useSafeAreaInsets();
  const player = useRef(null);
  const v = video;
  const cat = v ? catOf(v) : '';
  const startAt = v ? parseStartAt(v.note, v.url) : null;
  const noteStart = v ? parseStartAt(v.note) : null;   // 버튼은 메모에서 시각을 찾았을 때만
  const { next, others } = nextInCategory(videos, v);
  const watched = v ? isWatched(v.id) : false;
  const saved = v ? isSaved(v.id) : false;
  const level = v ? levelLabel(v.level) : '';

  return (
    <Modal visible={!!v} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      {!!v && (
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={{ backgroundColor: C.ink, paddingTop: insets.top }}>
            <View style={{ height: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}>
              <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="뒤로"
                style={({ pressed }) => ({
                  minHeight: 48, minWidth: 48, paddingHorizontal: 8, flexDirection: 'row',
                  alignItems: 'center', gap: 6, opacity: pressed ? 0.6 : 1,
                })}>
                <Text allowFontScaling={false} style={{ color: '#FFFFFF', fontSize: 28, lineHeight: 30, fontWeight: '500' }}>‹</Text>
                <Text maxFontSizeMultiplier={MAXF} style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '800' }}>{cat}</Text>
              </Pressable>
            </View>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
            <View style={{ alignItems: 'center', backgroundColor: '#000' }}>
              <YouTubePlayer
                key={v.id}
                ref={player}
                videoId={videoIdOf(v)}
                start={startAt || 0}
                url={v.url}
                onEnded={() => onMarkWatched(v.id)}
              />
            </View>

            <View style={{ paddingHorizontal: PAD, paddingTop: PAD, maxWidth: 900, width: '100%', alignSelf: 'center' }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <MetaBadge>{cat}</MetaBadge>
                {!!level && <MetaBadge tone="level">{level}</MetaBadge>}
              </View>
              <Text maxFontSizeMultiplier={MAXF} style={{ marginTop: 8, fontSize: 22, fontWeight: '800', color: C.text, lineHeight: 30 }}>
                {v.title}
              </Text>

              {!!v.note && (
                <View style={{ marginTop: 16, borderRadius: 16, backgroundColor: C.greenSoft, padding: PAD }}>
                  <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 13, fontWeight: '800', color: C.green }}>운영진 메모</Text>
                  <Text maxFontSizeMultiplier={MAXF} style={{ marginTop: 4, fontSize: 16, fontWeight: '700', color: C.text, lineHeight: 23 }}>{v.note}</Text>
                  {noteStart != null && (
                    <Pressable onPress={() => player.current?.seekTo(noteStart)} accessibilityRole="button"
                      style={({ pressed }) => ({
                        marginTop: 12, alignSelf: 'flex-start', minHeight: 48, paddingHorizontal: 16,
                        borderRadius: 12, borderWidth: 1.5, borderColor: C.green, backgroundColor: C.surface,
                        justifyContent: 'center', opacity: pressed ? 0.8 : 1,
                      })}>
                      <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 15, fontWeight: '800', color: C.green }}>▶ {formatStart(noteStart)}</Text>
                    </Pressable>
                  )}
                </View>
              )}

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
                <ActionBtn label={watched ? '✓ 봤어요' : '봤어요'} on={watched} a11y="봤어요" onPress={() => onToggleWatched(v.id)} />
                <ActionBtn label={saved ? '🔖 저장됨' : '🔖 저장'} on={saved} a11y="저장" onPress={() => onToggleSaved(v.id)} />
                <ActionBtn label="↗ 유튜브" a11y="유튜브에서 열기" onPress={() => Linking.openURL(v.url).catch(() => {})} />
              </View>

              {!!next && (
                <View style={{ marginTop: 24 }}>
                  <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center' }}>
                    <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 16, fontWeight: '800', color: C.text }}>{cat} 다음 영상</Text>
                    {others > 1 && (
                      <Pressable onPress={() => onOpenCategory(cat)} accessibilityRole="button"
                        style={({ pressed }) => ({ marginLeft: 'auto', minHeight: 48, justifyContent: 'center', paddingLeft: 12, opacity: pressed ? 0.6 : 1 })}>
                        <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 15, fontWeight: '800', color: C.green }}>{others - 1}개 더 ›</Text>
                      </Pressable>
                    )}
                  </View>
                  <VideoRow v={next} watched={isWatched(next.id)} showCategory={false} onPress={() => onOpenVideo(next)} />
                </View>
              )}

              <CoachLine card count={coachCount} onPress={onGoCoach} />
            </View>
          </ScrollView>
        </View>
      )}
    </Modal>
  );
}

export default PlayerModal;
