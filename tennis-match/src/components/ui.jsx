/* ============================================================
   공용 UI 컴포넌트 (RN). 원본 프로토타입의 Chip/Card/Btn/Input/Avatar 이식.
   ============================================================ */
import React from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { C } from '../lib/theme';
import { isGuestId } from '../lib/constants';

/* ---------------- Card ---------------- */
export const Card = ({ children, style }) => (
  <View
    style={[
      { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 16 },
      style,
    ]}>
    {children}
  </View>
);

/* ---------------- SectionTitle ---------------- */
export const SectionTitle = ({ children, right }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 8 }}>
    <Text style={{ fontSize: 14, fontWeight: '700', color: C.ink, letterSpacing: 0.3 }}>{children}</Text>
    {right}
  </View>
);

/* ---------------- Chip ---------------- */
const CHIP_TONES = {
  default: { bg: '#e7e5e4', fg: '#44403c' },
  green: { bg: C.green, fg: C.lime },
  lime: { bg: C.lime, fg: C.ink },
  red: { bg: '#fee2e2', fg: '#b91c1c' },
  outline: { bg: 'transparent', fg: C.sub, border: '#d6d3d1' },
};
export const Chip = ({ children, tone = 'default', onPress }) => {
  const t = CHIP_TONES[tone] || CHIP_TONES.default;
  const body = (
    <View
      style={{
        alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999,
        backgroundColor: t.bg, borderWidth: t.border ? 1 : 0, borderColor: t.border,
      }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: t.fg }}>{children}</Text>
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
};

/* ---------------- Btn ---------------- */
const BTN_TONES = {
  primary: { bg: C.green, fg: C.lime },
  lime: { bg: C.lime, fg: C.ink },
  ghost: { bg: '#f5f5f4', fg: '#44403c' },
  danger: { bg: C.danger, fg: '#fff' },
};
export const Btn = ({ children, onPress, tone = 'primary', full, small, disabled }) => {
  const t = BTN_TONES[tone] || BTN_TONES.primary;
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={{
        backgroundColor: t.bg, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
        paddingHorizontal: small ? 12 : 16, paddingVertical: small ? 6 : 10,
        alignSelf: full ? 'stretch' : 'flex-start', opacity: disabled ? 0.4 : 1,
      }}>
      <Text style={{ color: t.fg, fontWeight: '700', fontSize: small ? 12 : 14 }}>{children}</Text>
    </Pressable>
  );
};

/* ---------------- Field (TextInput) ---------------- */
export const Field = ({ style, ...props }) => (
  <TextInput
    placeholderTextColor={C.faint}
    style={[
      { backgroundColor: '#f5f5f4', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: C.text },
      style,
    ]}
    {...props}
  />
);

/* ---------------- Avatar ---------------- */
export const Avatar = ({ id, nameOf, members }) => {
  const guest = isGuestId(id);
  const m = members?.find((x) => x.id === id);
  const bg = guest ? '#fef3c7' : m?.gender === 'F' ? C.femaleBg : C.maleBg;
  const fg = guest ? '#92400e' : m?.gender === 'F' ? C.female : C.male;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: fg }}>{nameOf(id)}</Text>
      {m?.grade && <Text style={{ fontSize: 11, color: fg, opacity: 0.5 }}>{m.grade}</Text>}
    </View>
  );
};
