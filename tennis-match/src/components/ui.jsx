/* ============================================================
   공용 UI 컴포넌트

   v2에서 바뀐 점
     · Card: 두꺼운 테두리 → 옅은 그림자. 화면 배경이 회색이라 카드가 떠 보인다
     · Btn: 딥그린 배경 + 흰 글씨(예전엔 그린 위 라임이라 대비가 낮았다).
            높이를 키워 손가락으로 누르기 편하게(최소 44pt 권장치에 맞춤)
     · Chip: 크기·간격 통일, 선택 상태가 한눈에 보이도록 대비 강화
     · Field: 라벨/에러/접미사를 붙일 수 있게 확장
     · 신규: IconTile(아이콘 그리드), StatCard(숫자 요약), FilterChip(가로 필터),
             EmptyState(빈 화면), Divider, Badge, ListRow
   ============================================================ */
import React from 'react';
import { View, Text, Pressable, TextInput, ScrollView, StyleSheet } from 'react-native';
import { C, S, R, F, SHADOW, TAP } from '../lib/theme';
import { isGuestId } from '../lib/constants';
import { Icon } from './Icon';

/* ---------------- Card ---------------- */
export const Card = ({ children, style, flat, onPress }) => {
  const body = (
    <View
      style={[
        {
          /* 검토 반영: 카드는 경계선과 옅은 그늘을 함께 쓴다.
             그늘만 두면 밝은 화면에서 윤곽이 사라지고, 경계선만 두면
             납작해 보인다. 둘을 아주 약하게 겹친다. */
          backgroundColor: C.surface, borderRadius: R.lg, padding: S.lg,
          borderWidth: 1, borderColor: C.border,
        },
        flat ? null : SHADOW.sm,
        style,
      ]}>
      {children}
    </View>
  );
  return onPress
    ? <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>{body}</Pressable>
    : body;
};

/* ---------------- SectionTitle ---------------- */
export const SectionTitle = ({ children, right, hint }) => (
  <View style={{ marginTop: S.xl, marginBottom: S.sm }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={F.h3}>{children}</Text>
      {right}
    </View>
    {!!hint && <Text style={[F.caption, { marginTop: 2 }]}>{hint}</Text>}
  </View>
);

/* ---------------- Divider ---------------- */
export const Divider = ({ style }) => (
  <View style={[{ height: 1, backgroundColor: C.border }, style]} />
);

/* ---------------- Chip ---------------- */
const CHIP_TONES = {
  default: { bg: C.fill, fg: C.sub },
  green: { bg: C.green, fg: '#fff' },
  soft: { bg: C.greenSoft, fg: C.green },
  lime: { bg: C.greenSoft, fg: C.green },
  red: { bg: C.dangerBg, fg: C.danger },
  warn: { bg: C.warnBg, fg: C.warn },
  outline: { bg: 'transparent', fg: C.sub, border: C.border },
};
export const Chip = ({ children, tone = 'default', onPress, style }) => {
  const t = CHIP_TONES[tone] || CHIP_TONES.default;
  const body = (
    <View
      style={[{
        alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 12, paddingVertical: 6, borderRadius: R.pill,
        backgroundColor: t.bg, borderWidth: t.border ? 1 : 0, borderColor: t.border,
      }, style]}>
      <Text style={{ fontSize: 12.5, fontWeight: '700', color: t.fg }}>{children}</Text>
    </View>
  );
  return onPress
    ? <Pressable onPress={onPress} hitSlop={6} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>{body}</Pressable>
    : body;
};

/** 가로 스크롤 필터 칩 줄 — 게스트 게시판/목록 화면용 */
export const FilterRow = ({ children, style }) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false}
    contentContainerStyle={[{ flexDirection: 'row', gap: 6, paddingRight: S.lg }, style]}>
    {children}
  </ScrollView>
);

/* ---------------- Badge (숫자 알림) ---------------- */
export const Badge = ({ count, tone = 'danger' }) => {
  if (!count) return null;
  const bg = tone === 'danger' ? C.danger : C.green;
  return (
    <View style={{
      backgroundColor: bg, borderRadius: R.pill, minWidth: 20,
      paddingHorizontal: 6, paddingVertical: 2, alignItems: 'center',
    }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
};

/* ---------------- Btn ---------------- */
const BTN_TONES = {
  primary: { bg: C.green, fg: '#fff' },
  soft: { bg: C.greenSoft, fg: C.green },
  lime: { bg: C.greenSoft, fg: C.green },
  ghost: { bg: C.fill, fg: C.text },
  outline: { bg: 'transparent', fg: C.green, border: C.green },
  danger: { bg: C.danger, fg: '#fff' },
};
/**
 * 버튼.
 *
 * ⚠️ 높이를 줄이지 말 것 (theme.js 의 TAP 참고). 코트에서 서서 누른다.
 * @param cta  화면의 주 행동일 때. 더 높고 굵다.
 * @param icon 글자 왼쪽에 놓을 것
 */
export const Btn = ({ children, onPress, tone = 'primary', full, small, cta, disabled, icon, style }) => {
  const t = BTN_TONES[tone] || BTN_TONES.primary;
  const h = small ? TAP.small : cta ? TAP.cta : TAP.btn;
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => ([{
        backgroundColor: t.bg, borderRadius: R.md,
        flexDirection: 'row', gap: 7,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: t.border ? 1.5 : 0, borderColor: t.border,
        paddingHorizontal: small ? 14 : 20,
        minHeight: h,
        alignSelf: full ? 'stretch' : 'flex-start',
        opacity: disabled ? 0.35 : pressed ? 0.82 : 1,
      }, style])}>
      {icon}
      <Text style={{
        color: t.fg, fontWeight: '700',
        fontSize: small ? 13.5 : cta ? 16 : 15,
        letterSpacing: -0.2,
      }}>{children}</Text>
    </Pressable>
  );
};

/* ---------------- Field ---------------- */
/* 입력칸.

   레이아웃 속성은 바깥 껍데기로 보낸다.
     예전에는 style 을 통째로 안쪽 TextInput 에만 넘겼다. 그래서
     <Field style={{ flex: 1 }} /> 를 가로줄에 놓으면 flex 가 껍데기에
     안 붙고, 껍데기가 내용 크기로 쪼그라들어 입력칸이 거의 사라졌다.
     (클럽 검색창이 눌리지도 입력되지도 않던 이유)

   그래서 flex·width·margin 같은 배치용 속성은 껍데기가 갖고,
   글자 크기·색 같은 것만 TextInput 에 넘긴다. */
const OUTER_KEYS = [
  'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf',
  'width', 'minWidth', 'maxWidth',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'marginHorizontal', 'marginVertical',
];

export const Field = ({ style, error, suffix, onFocus, onBlur, ...props }) => {
  /* 포커스를 직접 들고 있는 이유: 검토 문서가 "포커스 시 2px 그린 테두리 +
     바깥 링"을 요구한다. RN 의 TextInput 은 그 상태를 밖으로 주지 않으므로
     여기서 잡아서 껍데기에 칠한다. 바깥 링은 두 번째 View 로 흉내 낸다 —
     RN 에는 CSS 의 box-shadow spread 가 없다. */
  const [focused, setFocused] = React.useState(false);
  const flat = StyleSheet.flatten(style) || {};
  const outer = {};
  const inner = {};
  Object.entries(flat).forEach(([k, v]) => {
    if (OUTER_KEYS.includes(k)) outer[k] = v; else inner[k] = v;
  });

  const line = error ? C.danger : focused ? C.green : C.border;
  return (
    <View style={outer}>
      <View style={{
        borderRadius: R.md + 3,
        /* 포커스 링. 평소에는 투명이라 자리만 차지한다 — 눌렀을 때
           칸이 들썩이지 않게 하려고 늘 같은 두께를 둔다. */
        borderWidth: 3,
        borderColor: focused && !error ? 'rgba(16,185,129,0.18)' : 'transparent',
      }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          backgroundColor: C.surface, borderRadius: R.md,
          borderWidth: focused || error ? 2 : 1.5, borderColor: line,
          paddingHorizontal: 14,
          minHeight: TAP.field,
        }}>
        <TextInput
          placeholderTextColor={C.faint}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          style={[{ flex: 1, paddingVertical: 12, fontSize: 16, color: C.text }, inner]}
          {...props}
        />
        {/* 접미사가 글자면 감싸 주고, 컴포넌트면 그대로 둔다.
            ⚠️ 무조건 <Text> 로 감싸면 안 된다. 비밀번호 [보기] 단추처럼
               누를 수 있는 것을 넣었을 때, Text 안의 Pressable 은
               안드로이드에서 눌리지 않는 일이 있다 — 보이기는 해서
               "왜 안 눌리지"로 한참 헤맨다. */}
        {suffix !== null && suffix !== undefined && suffix !== false && (
          typeof suffix === 'string' || typeof suffix === 'number'
            ? <Text style={{ fontSize: 13, color: C.sub, fontWeight: '600' }}>{suffix}</Text>
            : suffix
        )}
        </View>
      </View>
      {!!error && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5, marginLeft: 3 }}>
          <Icon name="alert" size={13} color={C.danger} />
          <Text style={{ fontSize: 13, color: C.danger, flex: 1 }}>{error}</Text>
        </View>
      )}
    </View>
  );
};

/* ---------------- IconTile — 기능 바로가기 ---------------- */
export const IconTile = ({ icon, label, onPress, badge, width }) => (
  <Pressable onPress={onPress}
    style={({ pressed }) => ({ width, alignItems: 'center', opacity: pressed ? 0.55 : 1 })}>
    <View style={{
      width: 50, height: 50, borderRadius: R.lg,
      backgroundColor: C.fill,
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Icon name={icon} size={22} color={C.text} />
      {!!badge && (
        <View style={{ position: 'absolute', top: -4, right: -4 }}>
          <Badge count={badge} />
        </View>
      )}
    </View>
    <Text numberOfLines={1} style={{ fontSize: 11.5, fontWeight: '500', color: C.sub, marginTop: 6 }}>
      {label}
    </Text>
  </Pressable>
);

/* ---------------- StatCard — 숫자 요약 ---------------- */
export const StatCard = ({ value, label, tone = 'default', style }) => (
  <View style={[{
    flex: 1, alignItems: 'center', paddingVertical: S.md,
    backgroundColor: tone === 'dark' ? 'rgba(255,255,255,0.10)' : C.fill,
    borderRadius: R.md,
  }, style]}>
    <Text style={{
      fontSize: 19, fontWeight: '700', letterSpacing: -0.5,
      color: tone === 'dark' ? '#fff' : C.ink,
    }}>{value}</Text>
    <Text style={{
      fontSize: 10.5, fontWeight: '600', marginTop: 2,
      color: tone === 'dark' ? 'rgba(255,255,255,0.75)' : C.sub,
    }}>{label}</Text>
  </View>
);

/* ---------------- ListRow — 메뉴 한 줄 ---------------- */
export const ListRow = ({ icon, label, sub, right, onPress, first }) => (
  <Pressable onPress={onPress}
    style={({ pressed }) => ({
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 13,
      borderTopWidth: first ? 0 : 1, borderTopColor: C.border,
      opacity: pressed ? 0.6 : 1,
    })}>
    {!!icon && (
      <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: C.fill, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={16} color={C.text} />
      </View>
    )}
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 15, fontWeight: '600', color: C.text }}>{label}</Text>
      {!!sub && <Text style={[F.caption, { marginTop: 2 }]}>{sub}</Text>}
    </View>
    {right}
    <Icon name="forward" size={16} color={C.faint} />
  </Pressable>
);

/* ---------------- EmptyState ---------------- */
export const EmptyState = ({ icon = '🎾', title, body, action }) => (
  <Card style={{ alignItems: 'center', paddingVertical: S.xxl }}>
    <Text style={{ fontSize: 34 }}>{icon}</Text>
    <Text style={[F.h3, { marginTop: S.md, textAlign: 'center' }]}>{title}</Text>
    {!!body && (
      <Text style={{ fontSize: 12.5, color: C.sub, textAlign: 'center', marginTop: 6, lineHeight: 19 }}>
        {body}
      </Text>
    )}
    {!!action && <View style={{ marginTop: S.lg, alignSelf: 'stretch' }}>{action}</View>}
  </Card>
);

/* ---------------- Avatar ---------------- */
export const Avatar = ({ id, nameOf, members }) => {
  const guest = isGuestId(id);
  const m = members?.find((x) => x.id === id);
  const bg = guest ? C.warnBg : m?.gender === 'F' ? C.femaleBg : C.maleBg;
  const fg = guest ? C.warn : m?.gender === 'F' ? C.female : C.male;
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 3,
      backgroundColor: bg, borderRadius: R.sm, paddingHorizontal: 8, paddingVertical: 5,
    }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: fg }}>{nameOf(id)}</Text>
      {m?.grade ? <Text style={{ fontSize: 11, color: fg, opacity: 0.5 }}>{m.grade}</Text> : null}
    </View>
  );
};

/* ---------------- Toggle — 복식/단식 같은 2~3지 선택 ---------------- */
export const SegmentedControl = ({ options, value, onChange, style }) => (
  <View style={[{
    flexDirection: 'row', backgroundColor: C.fill, borderRadius: R.md, padding: 3,
  }, style]}>
    {options.map((o) => {
      const on = value === o.key;
      return (
        <Pressable key={String(o.key)} onPress={() => onChange(o.key)}
          style={{
            flex: 1, alignItems: 'center', paddingVertical: 9,
            borderRadius: R.sm, backgroundColor: on ? C.surface : 'transparent',
            ...(on ? SHADOW.sm : null),
          }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: on ? C.green : C.sub }}>{o.label}</Text>
        </Pressable>
      );
    })}
  </View>
);

/* ---------------- CheckRow — 체크박스 한 줄 ---------------- */
export const CheckRow = ({ checked, onToggle, label, hint }) => (
  <Pressable onPress={onToggle}
    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'flex-start', gap: 10, opacity: pressed ? 0.6 : 1 })}>
    <View style={{
      width: 22, height: 22, borderRadius: 6, marginTop: 1,
      backgroundColor: checked ? C.green : C.fill,
      borderWidth: checked ? 0 : 1.5, borderColor: C.border,
      alignItems: 'center', justifyContent: 'center',
    }}>
      {checked && <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>✓</Text>}
    </View>
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>{label}</Text>
      {!!hint && <Text style={{ fontSize: 11.5, color: C.sub, marginTop: 3, lineHeight: 17 }}>{hint}</Text>}
    </View>
  </Pressable>
);
