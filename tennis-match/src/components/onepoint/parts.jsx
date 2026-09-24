/* ============================================================
   원포인트 — 그리기 부품 (썸네일·카드·줄·선반·검색창·칩·코치 한 줄·빈 상태)

   판단은 src/lib/onepoint.js 가 한다. 여기는 받은 것을 그리기만 한다.

   ⚠️ 누르는 곳은 전부 실제 크기 48 이상. hitSlop 으로 부풀리지 않는다 —
      코트에서 땀 젖은 손으로 누르는 화면이다.
   ⚠️ 글자 굵기는 500 이상. 얇은 글씨는 햇빛 아래서 사라진다.
   ⚠️ green2·lime 은 흰 바탕 위 글자색으로 쓰지 않는다(대비 부족).
   ============================================================ */
import React, { useState } from 'react';
import { View, Text, Pressable, Image, FlatList, ScrollView, TextInput } from 'react-native';
import { Icon } from '../Icon';
import { C, R } from '../../lib/theme';
import {
  thumbUrl, videoIdOf, catOf, levelLabel, highlightParts, a11yLabel, CATEGORIES, CATEGORY_ICON,
} from '../../lib/onepoint';

export const PAD = 16;
const MAXF = 1.3;   // 글자 키움 설정을 따라가되, 카드가 무너지지 않을 만큼만

/* ---------------- 썸네일 ---------------- */
/** 썸네일이 오기 전·못 받았을 때 깔리는 코트 그림 — 시안의 빈 썸네일과 같은 모양.
    검은 네모가 줄지어 있으면 "고장났나?" 싶다. */
export function CourtBackdrop({ width, height }) {
  const line = 'rgba(143,214,184,0.35)';
  const w = width * 0.78;
  const h = height * 0.7;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width, height, backgroundColor: '#1D4A3A', alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: w, height: h, borderWidth: 1.5, borderColor: line }}>
        <View style={{ position: 'absolute', left: w / 2 - 1, top: -4, bottom: -4, width: 1.5, backgroundColor: line }} />
        <View style={{ position: 'absolute', left: 0, right: 0, top: h * 0.12, height: 1, backgroundColor: line }} />
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: h * 0.12, height: 1, backgroundColor: line }} />
        <View style={{ position: 'absolute', left: w * 0.23, top: h * 0.12, bottom: h * 0.12, width: 1, backgroundColor: line }} />
        <View style={{ position: 'absolute', right: w * 0.23, top: h * 0.12, bottom: h * 0.12, width: 1, backgroundColor: line }} />
        <View style={{ position: 'absolute', left: w * 0.23, right: w * 0.23, top: h / 2, height: 1, backgroundColor: line }} />
      </View>
    </View>
  );
}

export function VideoThumb({ v, width, height, radius = 12, watched }) {
  const [broken, setBroken] = useState(false);
  const uri = thumbUrl(videoIdOf(v));
  const d = height >= 130 ? 48 : height >= 90 ? 40 : 32;
  return (
    <View style={{ width, height, borderRadius: radius, overflow: 'hidden', backgroundColor: C.ink }}>
      <CourtBackdrop width={width} height={height} />
      {/* hqdefault 는 4:3 위아래에 검은 띠가 있다 — 16:9 칸에 cover 로 맞추면 잘려 나간다 */}
      {!!uri && !broken && (
        <Image source={{ uri }} onError={() => setBroken(true)}
          style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      )}
      {watched && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(19,42,34,0.55)' }} />
      )}
      {!watched && (
        <View style={{
          position: 'absolute', top: (height - d) / 2, left: (width - d) / 2,
          width: d, height: d, borderRadius: d / 2, backgroundColor: 'rgba(255,255,255,0.94)',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text allowFontScaling={false} style={{ color: C.ink, fontSize: d * 0.38, marginLeft: d * 0.08, fontWeight: '800' }}>▶</Text>
        </View>
      )}
      {!!v.pinned && (
        <View style={{
          position: 'absolute', top: 6, left: 6, height: 24, paddingHorizontal: 8,
          borderRadius: 6, backgroundColor: C.lime, justifyContent: 'center',
        }}>
          <Text allowFontScaling={false} style={{ color: C.ink, fontSize: 12, fontWeight: '800' }}>추천</Text>
        </View>
      )}
      {watched && (
        <View style={{
          position: 'absolute', left: 6, bottom: 6, height: 24, paddingHorizontal: 8,
          borderRadius: 6, backgroundColor: '#FFFFFF', justifyContent: 'center',
        }}>
          <Text allowFontScaling={false} style={{ color: C.ink, fontSize: 12, fontWeight: '800' }}>✓ 봤어요</Text>
        </View>
      )}
    </View>
  );
}

/* ---------------- 배지 ---------------- */
export function MetaBadge({ children, tone = 'cat' }) {
  const cat = tone === 'cat';
  return (
    <View style={{
      height: 24, paddingHorizontal: 8, borderRadius: 6, justifyContent: 'center',
      backgroundColor: cat ? C.greenSoft : C.border,
    }}>
      <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 12, fontWeight: '800', color: cat ? C.green : '#334155' }}>
        {children}
      </Text>
    </View>
  );
}

/** 찾은 글자를 칠한 글. 강조할 곳이 없으면 그냥 글. */
function Marked({ text, q, style, numberOfLines }) {
  const parts = highlightParts(text, q);
  return (
    <Text numberOfLines={numberOfLines} maxFontSizeMultiplier={MAXF} style={style}>
      {parts.map((p, i) => (p.hit ? (
        <Text key={i} style={{ backgroundColor: C.greenSoft, color: C.green }}>{p.text}</Text>
      ) : p.text))}
    </Text>
  );
}

/* ---------------- 선반 카드 (세로: 썸네일 → 제목 → 메타) ---------------- */
export function VideoCard({ v, width, watched, showCategory = true, onPress, onLongPress }) {
  const h = Math.round((width * 9) / 16);
  const meta = [showCategory ? catOf(v) : '', v.coachName ? `${v.coachName} 코치` : v.note].filter(Boolean).join(' · ');
  return (
    <Pressable
      onPress={onPress} onLongPress={onLongPress} delayLongPress={400}
      accessibilityRole="button" accessibilityLabel={a11yLabel(v, watched)}
      style={({ pressed }) => ({ width, opacity: pressed ? 0.8 : 1 })}>
      <VideoThumb v={v} width={width} height={h} radius={12} watched={watched} />
      <Text numberOfLines={2} maxFontSizeMultiplier={MAXF} style={{
        marginTop: 8, fontSize: 16, fontWeight: '700', lineHeight: 22,
        color: watched ? C.sub : C.text,
      }}>{v.title}</Text>
      {!!meta && (
        <Text numberOfLines={1} maxFontSizeMultiplier={MAXF} style={{ marginTop: 2, fontSize: 13, fontWeight: '600', color: C.sub }}>
          {meta}
        </Text>
      )}
    </Pressable>
  );
}

/* ---------------- 줄 (가로: 썸네일 + 글자) — 검색 결과·모아보기·적은 클럽 ---------------- */
export function VideoRow({ v, watched, q = '', showCategory = true, onPress, onLongPress }) {
  const level = levelLabel(v.level);
  return (
    <Pressable
      onPress={onPress} onLongPress={onLongPress} delayLongPress={400}
      accessibilityRole="button" accessibilityLabel={a11yLabel(v, watched)}
      style={({ pressed }) => ({
        flexDirection: 'row', gap: 12, minHeight: 96, paddingVertical: 10,
        alignItems: 'flex-start', opacity: pressed ? 0.8 : 1,
      })}>
      <VideoThumb v={v} width={136} height={76} radius={10} watched={watched} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Marked text={v.title} q={q} numberOfLines={2} style={{
          fontSize: 16, fontWeight: '700', lineHeight: 22, color: watched ? C.sub : C.text,
        }} />
        {(showCategory || !!level || !!v.coachName) && (
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            {showCategory && <MetaBadge>{catOf(v)}</MetaBadge>}
            {!!level && <MetaBadge tone="level">{level}</MetaBadge>}
            {!!v.coachName && <MetaBadge tone="level">{v.coachName} 코치</MetaBadge>}
          </View>
        )}
        {!!v.note && (
          <Marked text={v.note} q={q} numberOfLines={1} style={{ marginTop: 4, fontSize: 13, fontWeight: '600', color: C.sub }} />
        )}
      </View>
    </Pressable>
  );
}

/* ---------------- 제목 줄 (선반·목록 머리) ---------------- */
export function ShelfHeader({ title, count, onAll }) {
  return (
    <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: PAD }}>
      <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 19, fontWeight: '800', color: C.text, letterSpacing: -0.3 }}>{title}</Text>
      {count != null && (
        <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 15, fontWeight: '700', color: C.sub, marginLeft: 8 }}>{count}개</Text>
      )}
      {!!onAll && (
        <Pressable onPress={onAll} accessibilityRole="button" accessibilityLabel={`${title} 전체 보기`}
          style={({ pressed }) => ({
            marginLeft: 'auto', minHeight: 48, minWidth: 48, paddingLeft: 12,
            alignItems: 'flex-end', justifyContent: 'center', opacity: pressed ? 0.6 : 1,
          })}>
          <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 15, fontWeight: '800', color: C.green }}>전체 ›</Text>
        </Pressable>
      )}
    </View>
  );
}

/* ---------------- 선반 (제목 줄 + 가로 목록) ---------------- */
/* 다음 카드가 반쯤 걸쳐 보여야 "옆으로 넘길 수 있다"는 걸 안다. 스냅은 쓰지 않는다. */
export function VideoShelf({
  title, count, onAll, items, cardWidth, isWatched, onOpen, onLongPress, showCategory = true, onLayout,
}) {
  return (
    <View onLayout={onLayout} style={{ marginTop: 12 }}>
      <ShelfHeader title={title} count={count} onAll={onAll} />
      <FlatList
        horizontal
        data={items}
        keyExtractor={(v) => v.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: PAD }}
        ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
        renderItem={({ item }) => (
          <VideoCard v={item} width={cardWidth} watched={isWatched(item.id)} showCategory={showCategory}
            onPress={() => onOpen(item)} onLongPress={onLongPress ? () => onLongPress(item) : undefined} />
        )}
      />
    </View>
  );
}

/* ---------------- 영역별로 보기 — 4칸 격자 ----------------
   앱 주인이 보낸 시안 그대로: 그림 + 영역 이름 + 개수. 영상이 없는 영역은
   흐리게 「준비 중」. 화면을 많이 차지하지 않게 칸 높이를 낮게(56) 둔다 —
   아래 선반이 한눈에 이어져 보여야 한다. */
export function CategoryGrid({ counts, onPick, columns = 4 }) {
  const n = (c) => (counts.find((x) => x.category === c) || {}).count || 0;
  return (
    <View style={{
      marginHorizontal: PAD, marginTop: 8, borderRadius: 16, backgroundColor: C.surface,
      borderWidth: 1, borderColor: C.border, paddingHorizontal: 8, paddingTop: 10, paddingBottom: 8,
    }}>
      <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 13, fontWeight: '800', color: C.sub, marginLeft: 6, marginBottom: 6 }}>
        영역별로 보기
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {CATEGORIES.map((c) => {
          const cnt = n(c);
          const empty = cnt === 0;
          return (
            <View key={c} style={{ width: `${100 / columns}%`, padding: 3 }}>
              <Pressable
                onPress={empty ? undefined : () => onPick(c)}
                disabled={empty}
                accessibilityRole="button"
                accessibilityLabel={empty ? `${c}, 준비 중` : `${c} 영상 ${cnt}개`}
                style={({ pressed }) => ({
                  minHeight: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                  paddingVertical: 4, borderWidth: 1, borderColor: C.border,
                  backgroundColor: pressed ? C.greenSoft : C.surface,
                  opacity: empty ? 0.45 : 1,
                })}>
                <Icon name={CATEGORY_ICON[c]} size={16} color={empty ? C.faint : C.green} />
                <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={{ marginTop: 2, fontSize: 13, fontWeight: '800', color: empty ? C.faint : C.text }}>{c}</Text>
                <Text maxFontSizeMultiplier={1.2} style={{ fontSize: 11, fontWeight: '600', color: C.faint }}>
                  {empty ? '준비 중' : `${cnt}개`}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/* ---------------- 아무 카드나 담는 선반 (용품 등) ---------------- */
export function Shelf({ title, count, onAll, data, renderItem, keyOf = (x) => x.id, onLayout }) {
  return (
    <View onLayout={onLayout} style={{ marginTop: 12 }}>
      <ShelfHeader title={title} count={count} onAll={onAll} />
      <FlatList
        horizontal
        data={data}
        keyExtractor={keyOf}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: PAD }}
        ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
        renderItem={({ item }) => renderItem(item)}
      />
    </View>
  );
}

/** 한 영역만 모아 볼 때의 머리 — ‹ 이름 N개 */
export function SubHeader({ title, count, onBack, right = null }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: 8 }}>
      <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="뒤로"
        style={({ pressed }) => ({ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
        <Text allowFontScaling={false} style={{ fontSize: 30, lineHeight: 32, color: C.green, fontWeight: '500' }}>‹</Text>
      </Pressable>
      <Text numberOfLines={1} maxFontSizeMultiplier={MAXF} style={{ flexShrink: 1, fontSize: 22, fontWeight: '800', color: C.text }}>{title}</Text>
      {count != null && (
        <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 16, fontWeight: '700', color: C.sub, marginLeft: 8 }}>{count}</Text>
      )}
      <View style={{ marginLeft: 'auto', paddingRight: 8 }}>{right}</View>
    </View>
  );
}

/** 빈 상태 공용 — 그림 + 제목 + 설명 + (버튼) */
export function EmptyBlock({ badge, title, body, actionLabel, onAction, footnote, art = true }) {
  return (
    <View style={CENTER}>
      {!!badge && (
        <View style={{ height: 28, paddingHorizontal: 12, borderRadius: R.pill, backgroundColor: C.ink, justifyContent: 'center', marginBottom: 16 }}>
          <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 13, fontWeight: '800', color: C.lime }}>{badge}</Text>
        </View>
      )}
      {art && <CourtArt />}
      <Text maxFontSizeMultiplier={MAXF} style={{ marginTop: art ? 20 : 0, fontSize: 21, fontWeight: '800', color: C.text, textAlign: 'center' }}>{title}</Text>
      {!!body && (
        <Text maxFontSizeMultiplier={MAXF} style={{ marginTop: 8, fontSize: 16, fontWeight: '600', color: C.sub, textAlign: 'center', lineHeight: 23 }}>{body}</Text>
      )}
      {!!onAction && (
        <Pressable onPress={onAction} accessibilityRole="button"
          style={({ pressed }) => ({
            marginTop: 20, minHeight: 52, alignSelf: 'stretch', borderRadius: 12, backgroundColor: C.green,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? 0.85 : 1,
          })}>
          <Icon name="add" size={22} color="#FFFFFF" />
          <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 16, fontWeight: '800', color: '#FFFFFF' }}>{actionLabel}</Text>
        </Pressable>
      )}
      {!!footnote && (
        <Text maxFontSizeMultiplier={MAXF} style={{ marginTop: 12, fontSize: 14, fontWeight: '600', color: C.sub, textAlign: 'center' }}>{footnote}</Text>
      )}
    </View>
  );
}

/* ---------------- 검색창 ---------------- */
export function SearchField({
  value, onChangeText, onFocus, focused, onClear, onCancel, inputRef, onSubmit, style,
  placeholder = '영상 검색 (예: 슬라이스, 토스)', label = '영상 검색',
}) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 4 }, style]}>
      <View style={{
        flex: 1, height: 56, borderRadius: 12, backgroundColor: C.surface,
        borderWidth: focused ? 2 : 1, borderColor: focused ? C.green : C.border,
        flexDirection: 'row', alignItems: 'center', paddingLeft: 14,
      }}>
        <Icon name="search" size={20} color={focused ? C.green : C.sub} />
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          onFocus={onFocus}
          onSubmitEditing={onSubmit}
          placeholder={placeholder}
          placeholderTextColor={C.faint}
          returnKeyType="search"
          autoCorrect={false}
          maxFontSizeMultiplier={MAXF}
          accessibilityLabel={label}
          style={{ flex: 1, height: '100%', marginLeft: 8, fontSize: 16, fontWeight: '500', color: C.text }}
        />
        {!!value && (
          <Pressable onPress={onClear} accessibilityRole="button" accessibilityLabel="검색어 지우기"
            style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: C.faint, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="close" size={15} color="#FFFFFF" />
            </View>
          </Pressable>
        )}
      </View>
      {!!onCancel && (
        <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel="검색 닫기"
          style={{ minHeight: 48, minWidth: 48, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' }}>
          <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 16, fontWeight: '700', color: C.green }}>취소</Text>
        </Pressable>
      )}
    </View>
  );
}

/* ---------------- 가로 한 줄 칩 ---------------- */
export function CategoryChips({ items, value, onChange }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: PAD, gap: 8 }}>
      {items.map((it) => {
        const on = it.key === value;
        return (
          <Pressable key={it.key} onPress={() => onChange(it.key)}
            accessibilityRole="button" accessibilityState={{ selected: on }}
            style={({ pressed }) => ({
              height: 48, borderRadius: 24, paddingHorizontal: 16,
              flexDirection: 'row', alignItems: 'center', gap: 6,
              backgroundColor: on ? C.green : C.surface,
              borderWidth: 1, borderColor: on ? C.green : C.border,
              opacity: pressed ? 0.8 : 1,
            })}>
            <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 15, fontWeight: '700', color: on ? '#FFFFFF' : C.text }}>{it.label}</Text>
            {it.count != null && (
              <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 14, fontWeight: '700', color: on ? C.greenSoft : C.sub }}>{it.count}</Text>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/* ---------------- 코치로 이어지는 한 줄 ---------------- */
/* 광고처럼 보이면 안 된다. 채운 초록 버튼을 쓰지 않고 글자 링크만.
   놓는 곳은 두 군데뿐 — 재생 화면 맨 아래(card), 영역 모아보기 맨 끝.
   코치가 한 명도 없으면 아무것도 그리지 않는다. */
export function CoachLine({ category, count, onPress, card, coachName }) {
  if (!count && !coachName) return null;
  /* 코치가 올린 영상이면 "아무 코치"가 아니라 그 코치에게 바로 잇는다 —
     방금 본 영상의 주인이라 가장 자연스러운 다리다. */
  const lead = coachName ? `이 영상을 올린 ${coachName} 코치`
    : card ? '직접 봐 줄 사람이 필요하면' : `${category}, 직접 봐 줄 사람이 필요하면`;
  const sub = coachName ? '경력·연락처 보기' : `등록된 코치 ${count}명`;
  const link = (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel="코치 보기"
      style={({ pressed }) => ({ minHeight: 48, justifyContent: 'center', paddingLeft: 8, opacity: pressed ? 0.6 : 1 })}>
      <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 16, fontWeight: '800', color: C.green }}>코치 보기 ›</Text>
    </Pressable>
  );
  if (card) {
    return (
      <View style={{
        marginTop: 20, borderRadius: 16, borderWidth: 1, borderColor: C.border,
        backgroundColor: C.surface, paddingHorizontal: PAD, paddingVertical: 8,
        flexDirection: 'row', alignItems: 'center',
      }}>
        <View style={{ flex: 1 }}>
          <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 15, fontWeight: '600', color: C.sub }}>{lead}</Text>
          <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 13, fontWeight: '600', color: C.sub, marginTop: 2 }}>{sub}</Text>
        </View>
        {link}
      </View>
    );
  }
  return (
    <View style={{
      marginTop: 12, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 4,
      flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
    }}>
      <Text maxFontSizeMultiplier={MAXF} style={{ flexShrink: 1, fontSize: 15, fontWeight: '600', color: C.sub }}>{lead}</Text>
      <View style={{ marginLeft: 'auto' }}>{link}</View>
    </View>
  );
}

/* ---------------- 빈 상태 ---------------- */
function CourtArt() {
  return (
    <View style={{
      width: 200, height: 120, borderRadius: 12, backgroundColor: C.greenSoft,
      alignItems: 'center', justifyContent: 'center',
    }}>
      <View style={{ width: 168, height: 92, borderWidth: 2, borderColor: C.green, borderRadius: 2 }}>
        <View style={{ position: 'absolute', left: 83, top: -6, bottom: -6, width: 2, backgroundColor: C.green }} />
        <View style={{ position: 'absolute', left: 0, right: 0, top: 12, height: 1.5, backgroundColor: C.green }} />
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 12, height: 1.5, backgroundColor: C.green }} />
        <View style={{ position: 'absolute', left: 38, top: 12, bottom: 12, width: 1.5, backgroundColor: C.green }} />
        <View style={{ position: 'absolute', right: 38, top: 12, bottom: 12, width: 1.5, backgroundColor: C.green }} />
        <View style={{ position: 'absolute', left: 38, right: 38, top: 45, height: 1.5, backgroundColor: C.green }} />
      </View>
    </View>
  );
}

const CENTER = { alignItems: 'center', paddingHorizontal: 24, paddingTop: 40, paddingBottom: 24 };

export function MemberEmpty({ onGear }) {
  return (
    <View style={CENTER}>
      <CourtArt />
      <Text maxFontSizeMultiplier={MAXF} style={{ marginTop: 20, fontSize: 21, fontWeight: '800', color: C.text }}>아직 올라온 영상이 없어요</Text>
      <Text maxFontSizeMultiplier={MAXF} style={{ marginTop: 8, fontSize: 16, fontWeight: '600', color: C.sub, textAlign: 'center' }}>
        코치들이 좋은 영상을 모으고 있어요.
      </Text>
      {!!onGear && (
        <Pressable onPress={onGear} accessibilityRole="link"
          style={({ pressed }) => ({ marginTop: 12, minHeight: 48, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
          <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 16, fontWeight: '800', color: C.green }}>그동안 용품 둘러보기 ›</Text>
        </Pressable>
      )}
    </View>
  );
}

export function AdminEmpty({ onAdd, role = '앱 관리자로 보는 중' }) {
  return (
    <View style={CENTER}>
      <View style={{ height: 28, paddingHorizontal: 12, borderRadius: R.pill, backgroundColor: C.ink, justifyContent: 'center' }}>
        <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 13, fontWeight: '800', color: C.lime }}>{role}</Text>
      </View>
      <Text maxFontSizeMultiplier={MAXF} style={{ marginTop: 20, fontSize: 22, fontWeight: '800', color: C.text }}>첫 영상을 올려 볼까요?</Text>
      <Text maxFontSizeMultiplier={MAXF} style={{ marginTop: 8, fontSize: 16, fontWeight: '600', color: C.sub, textAlign: 'center', lineHeight: 23 }}>
        유튜브 주소만 붙여 넣으면{'\n'}썸네일과 제목은 알아서 채워져요.
      </Text>
      <Pressable onPress={onAdd} accessibilityRole="button" accessibilityLabel="영상 등록"
        style={({ pressed }) => ({
          marginTop: 20, minHeight: 52, alignSelf: 'stretch', borderRadius: 12, backgroundColor: C.green,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? 0.85 : 1,
        })}>
        <Icon name="add" size={22} color="#FFFFFF" />
        <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 16, fontWeight: '800', color: '#FFFFFF' }}>영상 등록하기</Text>
      </Pressable>
      <Text maxFontSizeMultiplier={MAXF} style={{ marginTop: 12, fontSize: 14, fontWeight: '600', color: C.sub }}>
        회원에게는 ‘아직 영상이 없어요’로 보여요
      </Text>
    </View>
  );
}

/** 앱 관리자에게만 — 예전에 클럽 운영진이 이 클럽에만 올린 영상 옮기기 */
export function LegacyBanner({ count, moving, onMove }) {
  return (
    <View style={{
      marginHorizontal: PAD, marginTop: 8, borderRadius: 16, backgroundColor: C.warnBg,
      borderWidth: 1, borderColor: '#FDE68A', padding: PAD,
    }}>
      <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 15, fontWeight: '800', color: C.text }}>
        이 클럽에만 올라가 있던 영상 {count}개
      </Text>
      <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 14, fontWeight: '600', color: C.sub, marginTop: 4, lineHeight: 20 }}>
        이제 영상은 앱 전체가 같이 봐요. 옮기면 모든 클럽 회원에게 보이고, 예전 자리에서는 지워져요.
      </Text>
      <Pressable onPress={onMove} disabled={moving} accessibilityRole="button"
        style={({ pressed }) => ({
          marginTop: 12, minHeight: 48, borderRadius: 12, backgroundColor: C.green,
          alignItems: 'center', justifyContent: 'center', opacity: moving ? 0.5 : pressed ? 0.85 : 1,
        })}>
        <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 15, fontWeight: '800', color: '#FFFFFF' }}>
          {moving ? '옮기는 중…' : '앱 전체로 옮기기'}
        </Text>
      </Pressable>
    </View>
  );
}

/** 결과 없음 — 비슷한 말 칩 */
export function NoResults({ q, suggestions, onPick }) {
  return (
    <View style={CENTER}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="search" size={30} color={C.green} />
      </View>
      <Text maxFontSizeMultiplier={MAXF} style={{ marginTop: 16, fontSize: 21, fontWeight: '800', color: C.text, textAlign: 'center' }}>
        ‘{q}’ 영상은 아직 없어요
      </Text>
      <Text maxFontSizeMultiplier={MAXF} style={{ marginTop: 6, fontSize: 16, fontWeight: '600', color: C.sub }}>비슷한 말로 찾아보세요</Text>
      {suggestions.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          {suggestions.map((s) => (
            <WordChip key={s.kind + (s.category || s.word)} onPress={() => onPick(s)}
              label={s.kind === 'category' ? s.category : s.word} count={s.kind === 'category' ? s.count : null} />
          ))}
        </View>
      )}
    </View>
  );
}

export function WordChip({ label, count, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={({ pressed }) => ({
        height: 48, borderRadius: 24, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, opacity: pressed ? 0.8 : 1,
      })}>
      <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 15, fontWeight: '700', color: C.text }}>{label}</Text>
      {count != null && <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 14, fontWeight: '700', color: C.sub }}>{count}</Text>}
    </Pressable>
  );
}
