/* ============================================================
   플랫폼 표준 컴포넌트 레이어

   안드로이드는 Material Design 3, iOS 는 Human Interface Guidelines 를
   따르도록 같은 이름의 컴포넌트가 플랫폼별로 다르게 그려진다.
   화면 코드는 <AppButton>, <Segmented> 처럼 한 번만 쓰면 되고
   플랫폼 분기는 전부 이 파일 안에서 끝난다.

   플랫폼별로 실제로 다른 점
     · 눌림 효과 : Android = 잉크 리플(android_ripple) / iOS = 투명도
     · 버튼      : Android = M3 filled·tonal·outlined·text, 모서리 완전 둥글게
                   iOS = 채움/연한채움/평문, 모서리 10pt
     · 선택 탭   : iOS = 진짜 UISegmentedControl(네이티브)
                   Android = M3 Segmented button(테두리 공유 + 체크 아이콘)
     · 목록      : iOS = Inset Grouped(둥근 카드 + 안쪽 구분선)
                   Android = 배경 위 평면 리스트 + 전체폭 구분선
     · 선택지    : iOS = ActionSheet / Android = M3 Bottom sheet
     · 그림자    : Android = elevation / iOS = shadow*
     · 터치 영역 : Android 48dp / iOS 44pt 최소 보장
   ============================================================ */
import React, { useState } from 'react';
import {
  View, Text, Pressable, Platform, Modal, Switch, ActionSheetIOS,
  ScrollView, StyleSheet,
} from 'react-native';
import SegmentedControlIOS from '@react-native-segmented-control/segmented-control';
import { C, R, S } from '../lib/theme';

export const isAndroid = Platform.OS === 'android';
export const isIOS = Platform.OS === 'ios';

/** 최소 터치 영역 — Material 48dp / HIG 44pt */
export const HIT = isAndroid ? 48 : 44;

/** 플랫폼별 떠 있는 정도 */
export function elevation(level = 1) {
  if (isAndroid) return { elevation: level * 2 };
  const map = {
    1: { shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
    2: { shadowOpacity: 0.09, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
    3: { shadowOpacity: 0.14, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
  };
  return { shadowColor: '#0b2e26', ...(map[level] || map[1]) };
}

/* ============================================================
   Touchable — 눌림 효과만 플랫폼에 맞춘 기본 누름 영역
   ============================================================ */
export function Touchable({
  children, onPress, onLongPress, disabled, style, rippleColor, borderless, hitSlop,
}) {
  const androidProps = isAndroid
    ? { android_ripple: { color: rippleColor || 'rgba(13,122,95,0.14)', borderless: !!borderless } }
    : {};
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      onLongPress={disabled ? undefined : onLongPress}
      disabled={disabled}
      hitSlop={hitSlop}
      {...androidProps}
      style={({ pressed }) => [
        style,
        !isAndroid && pressed ? { opacity: 0.55 } : null,
        disabled ? { opacity: 0.38 } : null,
      ]}>
      {children}
    </Pressable>
  );
}

/* ============================================================
   AppButton
   variant: filled | tonal | outlined | text | danger
   ============================================================ */
export function AppButton({
  children, onPress, variant = 'filled', full, small, disabled, icon, style,
}) {
  const height = small ? (isAndroid ? 40 : 36) : HIT;
  const radius = isAndroid ? height / 2 : R.md;   // M3 는 완전 둥글게, iOS 는 10pt 각

  const skin = {
    filled: { bg: C.green, fg: '#fff', border: null, ripple: 'rgba(255,255,255,0.22)' },
    tonal: { bg: C.greenSoft, fg: C.green, border: null, ripple: 'rgba(13,122,95,0.16)' },
    outlined: { bg: 'transparent', fg: C.green, border: C.green, ripple: 'rgba(13,122,95,0.12)' },
    text: { bg: 'transparent', fg: C.green, border: null, ripple: 'rgba(13,122,95,0.12)' },
    danger: { bg: C.danger, fg: '#fff', border: null, ripple: 'rgba(255,255,255,0.22)' },
  }[variant] || {};

  return (
    <View style={[
      { borderRadius: radius, overflow: 'hidden', alignSelf: full ? 'stretch' : 'flex-start' },
      variant === 'filled' || variant === 'danger' ? elevation(isAndroid ? 1 : 0) : null,
      style,
    ]}>
      <Touchable
        onPress={onPress}
        disabled={disabled}
        rippleColor={skin.ripple}
        style={{
          minHeight: height,
          paddingHorizontal: small ? 16 : 24,
          borderRadius: radius,
          backgroundColor: skin.bg,
          borderWidth: skin.border ? 1 : 0,
          borderColor: skin.border,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
        {!!icon && <Text style={{ fontSize: 15 }}>{icon}</Text>}
        <Text style={{
          color: skin.fg,
          fontSize: small ? 13 : 15,
          fontWeight: isAndroid ? '600' : '700',   // M3 label = medium, HIG = semibold
          letterSpacing: isAndroid ? 0.1 : -0.2,
        }}>
          {children}
        </Text>
      </Touchable>
    </View>
  );
}

/* ============================================================
   Segmented — 2~4지 선택
   iOS: 네이티브 UISegmentedControl
   Android: M3 Segmented button (테두리를 공유하고 선택 항목에 ✓)
   ============================================================ */
export function Segmented({ options, value, onChange, style }) {
  const idx = Math.max(0, options.findIndex((o) => o.key === value));

  if (isIOS) {
    return (
      <SegmentedControlIOS
        values={options.map((o) => o.label)}
        selectedIndex={idx}
        onChange={(e) => onChange(options[e.nativeEvent.selectedSegmentIndex].key)}
        style={[{ height: 32 }, style]}
        tintColor={C.surface}
        backgroundColor={C.fill}
        fontStyle={{ color: C.text }}
        activeFontStyle={{ color: C.green, fontWeight: '600' }}
      />
    );
  }

  return (
    <View style={[{
      flexDirection: 'row', borderRadius: 20, borderWidth: 1, borderColor: C.border,
      overflow: 'hidden',
    }, style]}>
      {options.map((o, i) => {
        const on = o.key === value;
        return (
          <View key={String(o.key)} style={{
            flex: 1,
            borderLeftWidth: i ? 1 : 0, borderLeftColor: C.border,
            backgroundColor: on ? C.greenSoft : 'transparent',
          }}>
            <Touchable onPress={() => onChange(o.key)}
              style={{
                minHeight: 40, flexDirection: 'row', alignItems: 'center',
                justifyContent: 'center', gap: 6, paddingHorizontal: 8,
              }}>
              {on && <Text style={{ fontSize: 13, color: C.green }}>✓</Text>}
              <Text numberOfLines={1} style={{
                fontSize: 13, fontWeight: '600', color: on ? C.green : C.sub, letterSpacing: 0.1,
              }}>
                {o.label}
              </Text>
            </Touchable>
          </View>
        );
      })}
    </View>
  );
}

/* ============================================================
   AppSwitch — RN 의 Switch 는 두 플랫폼 모두 네이티브 위젯이다.
   색만 플랫폼 관례에 맞춘다.
   ============================================================ */
export function AppSwitch({ value, onValueChange, disabled }) {
  return (
    <Switch
      value={!!value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ false: isAndroid ? '#c9cdd2' : '#e5e5ea', true: isAndroid ? C.greenSoft : C.green }}
      thumbColor={isAndroid ? (value ? C.green : '#f4f4f5') : undefined}
      ios_backgroundColor="#e5e5ea"
    />
  );
}

/* ============================================================
   OptionSheet — 선택지 고르기
   iOS: ActionSheetIOS(네이티브) / Android: M3 Bottom sheet
   ============================================================ */
export function useOptionSheet() {
  const [sheet, setSheet] = useState(null);

  const open = ({ title, options, onSelect, destructiveIndex }) => {
    if (isIOS) {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title,
          options: [...options.map((o) => o.label), '취소'],
          cancelButtonIndex: options.length,
          destructiveButtonIndex: destructiveIndex,
          userInterfaceStyle: 'light',
        },
        (i) => { if (i < options.length) onSelect(options[i]); },
      );
      return;
    }
    setSheet({ title, options, onSelect });
  };

  const node = (
    <Modal visible={!!sheet} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => setSheet(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.32)', justifyContent: 'flex-end' }}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={{
              backgroundColor: C.surface,
              borderTopLeftRadius: 28, borderTopRightRadius: 28,   // M3 bottom sheet
              paddingTop: 12, paddingBottom: 24, maxHeight: '70%',
            }}>
              {/* M3 drag handle */}
              <View style={{
                alignSelf: 'center', width: 32, height: 4, borderRadius: 2,
                backgroundColor: '#cfd3d7', marginBottom: 10,
              }} />
              {!!sheet?.title && (
                <Text style={{
                  fontSize: 15, fontWeight: '600', color: C.text,
                  paddingHorizontal: 24, paddingVertical: 10,
                }}>
                  {sheet.title}
                </Text>
              )}
              <ScrollView>
                {sheet?.options.map((o) => (
                  <Touchable key={String(o.key ?? o.label)}
                    onPress={() => { setSheet(null); sheet.onSelect(o); }}
                    style={{
                      minHeight: 56, paddingHorizontal: 24,
                      flexDirection: 'row', alignItems: 'center', gap: 12,
                    }}>
                    {!!o.icon && <Text style={{ fontSize: 18 }}>{o.icon}</Text>}
                    <Text style={{ fontSize: 16, color: o.destructive ? C.danger : C.text }}>
                      {o.label}
                    </Text>
                  </Touchable>
                ))}
              </ScrollView>
            </View>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );

  return { open, node };
}

/* ============================================================
   Fab — Material 3 FAB / iOS 원형 버튼
   ============================================================ */
export function Fab({ icon = '+', label, onPress, bottom = 24, right = 20 }) {
  const extended = !!label;
  return (
    <View style={[{
      position: 'absolute', right, bottom,
      borderRadius: isAndroid ? 16 : 28,        // M3 FAB = 16dp, iOS = 원형
      overflow: 'hidden',
    }, elevation(3)]}>
      <Touchable onPress={onPress} rippleColor="rgba(255,255,255,0.24)"
        style={{
          backgroundColor: C.green,
          minWidth: 56, minHeight: 56,
          paddingHorizontal: extended ? 20 : 0,
          borderRadius: isAndroid ? 16 : 28,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
        <Text style={{ color: '#fff', fontSize: 24, lineHeight: 28, fontWeight: '400' }}>{icon}</Text>
        {extended && (
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>{label}</Text>
        )}
      </Touchable>
    </View>
  );
}

/* ============================================================
   ListSection / ListItem
   iOS: Inset Grouped(둥근 카드, 안쪽 구분선, 오른쪽 셰브론)
   Android: 평면 리스트(전체폭 구분선, 셰브론 없음)
   ============================================================ */
export function ListSection({ header, footer, children, style }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={style}>
      {!!header && (
        <Text style={{
          fontSize: isIOS ? 13 : 14,
          fontWeight: isIOS ? '400' : '700',
          color: isIOS ? C.sub : C.green,
          textTransform: isIOS ? 'uppercase' : 'none',
          letterSpacing: isIOS ? 0.4 : 0.1,
          paddingHorizontal: isIOS ? 16 : 4,
          marginBottom: isIOS ? 6 : 8,
          marginTop: S.lg,
        }}>
          {header}
        </Text>
      )}
      <View style={[
        isIOS
          ? { backgroundColor: C.surface, borderRadius: 10, overflow: 'hidden' }
          : { backgroundColor: C.surface, borderRadius: 12, overflow: 'hidden' },
        elevation(1),
      ]}>
        {items.map((child, i) => (
          <View key={child.key || i}>
            {i > 0 && (
              <View style={{
                height: StyleSheet.hairlineWidth, backgroundColor: C.border,
                marginLeft: isIOS ? 16 : 0,     // iOS 는 안쪽 들여쓴 구분선
              }} />
            )}
            {child}
          </View>
        ))}
      </View>
      {!!footer && (
        <Text style={{ fontSize: 12, color: C.faint, paddingHorizontal: 16, marginTop: 6, lineHeight: 17 }}>
          {footer}
        </Text>
      )}
    </View>
  );
}

export function ListItem({ icon, title, subtitle, value, right, onPress, badge, destructive }) {
  const chevron = isIOS && onPress;
  return (
    <Touchable onPress={onPress} disabled={!onPress}
      style={{
        minHeight: subtitle ? (isAndroid ? 72 : 60) : HIT + 4,
        paddingHorizontal: 16, paddingVertical: 10,
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: C.surface,
      }}>
      {!!icon && <Text style={{ fontSize: 19, width: 26, textAlign: 'center' }}>{icon}</Text>}
      <View style={{ flex: 1 }}>
        <Text style={{
          fontSize: isAndroid ? 16 : 17,
          fontWeight: isAndroid ? '500' : '400',
          color: destructive ? C.danger : C.text,
        }}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={{ fontSize: isAndroid ? 14 : 13, color: C.sub, marginTop: 2 }}>{subtitle}</Text>
        )}
      </View>
      {!!badge && badge}
      {!!value && <Text style={{ fontSize: 15, color: C.sub }}>{value}</Text>}
      {right}
      {chevron && <Text style={{ color: '#c7c7cc', fontSize: 17, fontWeight: '600' }}>›</Text>}
    </Touchable>
  );
}
