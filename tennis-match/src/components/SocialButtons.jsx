/* ============================================================
   소셜 로그인 버튼 줄

   ⚠️ 준비된 제공자만 그린다. 목록이 비면 이 컴포넌트는 아무것도
      그리지 않는다(구분선까지 포함해서). 눌러도 아무 일이 없는 버튼은
      "앱이 고장 났다"로 읽히고, 그 인상은 되돌리기 어렵다.

   각 사의 공식 색을 쓰는 이유는 src/lib/social.js 머리말 참고.
   로고가 아이콘 세트에 없는 카카오·네이버는 형태로 대신한다.
   ============================================================ */
import React from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PROVIDER_LABEL, PROVIDER_STYLE, enabledProviders } from '../lib/social';
import { LIVE_SOCIAL_CONFIG } from '../lib/socialConfig';
import { C, S, R } from '../lib/theme';

/** 버튼 왼쪽 표시. 크기를 맞춰 글자가 가운데에서 흔들리지 않게 한다. */
const Mark = ({ kind, color }) => {
  const box = { width: 20, alignItems: 'center' };
  if (kind === 'letterN') {
    /* 네이버 로고는 글자 N 그 자체다. 아이콘 세트에 없어서 글자로 쓴다. */
    return (
      <View style={box}>
        <Text style={{ fontSize: 16, fontWeight: '800', color }}>N</Text>
      </View>
    );
  }
  const glyph = kind === 'bubble' ? 'chatbubble'
    : kind === 'google' ? 'logo-google'
      : kind === 'apple' ? 'logo-apple' : 'log-in-outline';
  return (
    <View style={box}>
      <Ionicons name={glyph} size={17} color={color} />
    </View>
  );
};

/** "또는" 구분선 — 소셜 버튼이 하나라도 있을 때만 쓴다 */
export const OrDivider = ({ label = '또는', style }) => (
  <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10 }, style]}>
    <View style={{ flex: 1, height: 1, backgroundColor: C.border }} />
    <Text style={{ fontSize: 11.5, fontWeight: '600', color: C.faint }}>{label}</Text>
    <View style={{ flex: 1, height: 1, backgroundColor: C.border }} />
  </View>
);

export const SocialButton = ({ provider, onPress, disabled }) => {
  const st = PROVIDER_STYLE[provider] || {};
  return (
    <Pressable
      onPress={disabled ? undefined : () => onPress?.(provider)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={PROVIDER_LABEL[provider]}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 8,
        minHeight: 48, borderRadius: R.md, paddingHorizontal: 16,
        backgroundColor: st.bg,
        borderWidth: st.border ? 1 : 0, borderColor: st.border,
        opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
      })}>
      <Mark kind={st.mark} color={st.fg} />
      <Text style={{ fontSize: 14.5, fontWeight: '700', color: st.fg }}>
        {PROVIDER_LABEL[provider]}
      </Text>
    </Pressable>
  );
};

/**
 * 준비된 소셜 버튼 전부.
 *
 * @param divider 위에 "또는" 줄을 붙일지. 버튼이 없으면 이것도 안 나온다.
 */
export const SocialButtons = ({
  onPress, disabled, config = LIVE_SOCIAL_CONFIG, divider = true, style,
}) => {
  /* Platform.OS 를 그대로 넘긴다 — 애플 버튼은 iOS 에서만 나온다.
     웹에서 열었을 때는 'web' 이라 어느 것도 안 나오는데, 이 앱은
     스토어 앱이라 그 경우를 따로 다루지 않는다. */
  const list = enabledProviders(config, Platform.OS);
  if (!list.length) return null;
  return (
    <View style={style}>
      {divider && <OrDivider style={{ marginBottom: S.lg }} />}
      <View style={{ gap: 8 }}>
        {list.map((p) => (
          <SocialButton key={p} provider={p} onPress={onPress} disabled={disabled} />
        ))}
      </View>
    </View>
  );
};

export default SocialButtons;
