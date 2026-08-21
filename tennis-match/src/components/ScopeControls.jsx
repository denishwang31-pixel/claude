/* ============================================================
   전체 ↔ 코트장 — 두 층을 같은 모양으로 보여 주는 조각들

   왜 한 파일에 모아 두나
     같은 설정이 두 군데에 나온다. [설정]에서는 "전체" 층을,
     [코트장 관리]에서는 코트장 층을 본다. 두 화면이 각자 그리면
     한쪽만 고쳐져서 "설정에서는 켰는데 코트장에서는 안 보인다"가 된다.

   이 조각들이 지키는 한 가지
     물려받은 값과 따로 정한 값이 화면에서 구별되어야 한다. 겉보기에
     똑같으면 "여기 30,000원이라 적혀 있는데 왜 안 바뀌지"가 된다.
     그래서 물려받은 줄에는 항상 "전체 설정을 따름"이 붙는다.
   ============================================================ */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import {
  FROM, FROM_LABEL, NOTIFY_KINDS, notifyRule, notifyOverrideCount,
  FEE_SCOPE_OPTS, feeScopeOf, feeRule, billingScopes, scopeSummary,
} from '../lib/scope';
import { Card, SectionTitle, Chip, Btn, Field } from './ui';
import { Label } from './pickers';
import { C, S, R, F } from '../lib/theme';

const won = (n) => `${Number(n || 0).toLocaleString()}원`;

/* ---------------- 물려받음 표시 ---------------- */

export const FromTag = ({ from }) => {
  if (from === FROM.VENUE) {
    return <Chip tone="green">따로 정함</Chip>;
  }
  return (
    <Text style={{ fontSize: 10.5, color: C.faint }}>
      {FROM_LABEL[from] || ''}
    </Text>
  );
};

/* ---------------- 켜기/끄기 한 줄 ----------------
   RN 의 Switch 를 쓰지 않는 이유: 안드로이드에서 색을 맞추기 어렵고,
   "물려받음" 이라는 제3의 상태를 옆에 붙일 자리가 없다. */
function Toggle({ on, disabled, onPress }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} hitSlop={8}
      style={{
        width: 46, height: 27, borderRadius: 14, padding: 3,
        backgroundColor: on ? C.green : C.border,
        opacity: disabled ? 0.45 : 1,
        justifyContent: 'center',
        alignItems: on ? 'flex-end' : 'flex-start',
      }}>
      <View style={{
        width: 21, height: 21, borderRadius: 11, backgroundColor: '#fff',
      }} />
    </Pressable>
  );
}

/* ============================================================
   알림 종류 — 전체 층과 코트장 층이 같은 화면을 쓴다
   ============================================================ */

/**
 * @param club     클럽 문서
 * @param venue    코트장 문서. null 이면 "전체" 층을 편집하는 것.
 * @param onChange (key, value|null) — null 은 "따로 정하지 않음(위층 따름)"
 * @param readOnly 권한이 없으면 보기만
 */
export function NotifyPrefs({ club, venue = null, onChange, readOnly = false }) {
  const level = venue ? venue.name || '이 코트장' : '전체';

  return (
    <View>
      <Card style={{ backgroundColor: C.fill }}>
        <Text style={{ fontSize: 11.5, color: C.sub, lineHeight: 18 }}>
          {venue ? (
            <>
              여기서 바꾼 것만 <Text style={{ fontWeight: '700' }}>{level}</Text>에 적용됩니다.
              건드리지 않은 항목은 전체 설정을 그대로 따릅니다.
            </>
          ) : (
            <>
              클럽 전체 기준입니다. 코트장마다 다르게 하려면
              <Text style={{ fontWeight: '700' }}> [코트장 관리]</Text>에서 그 코트장만 바꾸세요.
            </>
          )}
        </Text>
      </Card>

      {NOTIFY_KINDS.map((k) => {
        const rule = notifyRule(club, venue, k.key);
        const mine = rule.from === FROM.VENUE;
        return (
          <Card key={k.key} style={{ marginTop: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={F.bodyBold}>{k.label}</Text>
                  <Chip tone="soft">{k.audience === 'club' ? '클럽 전체' : '코트장별'}</Chip>
                  {k.force && <Chip tone="warn">항상 켜짐</Chip>}
                </View>
                <Text style={{ fontSize: 11.5, color: C.sub, marginTop: 4, lineHeight: 17 }}>
                  {k.desc}
                </Text>
                {venue && k.audience === 'club' && (
                  <Text style={{ fontSize: 10.5, color: C.faint, marginTop: 4 }}>
                    클럽 전체에 나가는 알림이라 코트장별로 나눌 수 없습니다
                  </Text>
                )}
                {venue && k.audience !== 'club' && !k.force && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <FromTag from={rule.from} />
                    {mine && !readOnly && (
                      <Pressable onPress={() => onChange && onChange(k.key, null)} hitSlop={6}>
                        <Text style={{ fontSize: 10.5, color: C.green2, fontWeight: '700' }}>
                          전체 설정으로 되돌리기
                        </Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
              <Toggle
                on={rule.on}
                disabled={readOnly || k.force || (!!venue && k.audience === 'club')}
                onPress={() => onChange && onChange(k.key, !rule.on)}
              />
            </View>
          </Card>
        );
      })}
    </View>
  );
}

/* ============================================================
   회비 — 청구 단위 고르기
   ============================================================ */

/** 클럽 설정: 회비를 클럽 하나로 걷을지, 코트장마다 걷을지 */
export function FeeScopeChooser({ club, venues = [], onChange, readOnly = false }) {
  const cur = feeScopeOf(club);
  const scopes = billingScopes(club, venues);

  return (
    <View>
      {FEE_SCOPE_OPTS.map((o) => {
        const on = cur === o.key;
        return (
          <Card key={o.key}
            style={{
              marginTop: 8,
              borderColor: on ? C.green : C.border,
              borderWidth: on ? 1.5 : 1,
            }}
            onPress={readOnly ? undefined : () => onChange && onChange(o.key)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{
                width: 20, height: 20, borderRadius: 10,
                borderWidth: on ? 6 : 1.5,
                borderColor: on ? C.green : C.border,
              }} />
              <View style={{ flex: 1 }}>
                <Text style={F.bodyBold}>{o.label}</Text>
                <Text style={{ fontSize: 11.5, color: C.sub, marginTop: 3, lineHeight: 17 }}>
                  {o.hint}
                </Text>
              </View>
            </View>
          </Card>
        );
      })}

      {venues.length === 0 && (
        <Text style={{ fontSize: 11, color: C.warn, marginTop: 8, lineHeight: 16 }}>
          등록된 코트장이 없습니다. 코트장마다로 골라도 지금은 전체 하나로 걷습니다.
        </Text>
      )}

      <SectionTitle hint="지금 설정으로 걷게 되는 모습">청구 단위 {scopes.length}개</SectionTitle>
      {scopes.map((s) => (
        <View key={s.id || 'all'}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border,
          }}>
          <Text style={{ flex: 1, fontSize: 12.5, color: C.text }}>{scopeSummary(s)}</Text>
          <FromTag from={s.from.amount} />
        </View>
      ))}
    </View>
  );
}

/** 지금 어느 청구 단위를 보고 있는가 — 총무 화면 맨 위 */
export function BillingScopeTabs({ scopes, value, onChange }) {
  if (!scopes || scopes.length < 2) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: S.md }}>
      {scopes.map((s) => (
        <Chip key={s.id || 'all'} tone={value === s.id ? 'green' : 'outline'}
          onPress={() => onChange(s.id)}>
          {s.name} · {won(s.amount)}
        </Chip>
      ))}
    </View>
  );
}

/* ============================================================
   코트장만 다르게 — 회비 세 칸
   ============================================================ */

/**
 * @param draft  { feeAmount, feeDueDay, feeAccount } — 빈 문자열이면 "물려받음"
 * @param setDraft
 */
export function VenueFeeOverride({ club, draft, setDraft }) {
  const inherited = feeRule(club, null);
  const set = (k) => (v) => setDraft({ ...draft, [k]: v });

  const row = (key, label, hint, placeholder, keyboard) => {
    const mine = draft[key] !== '' && draft[key] !== undefined && draft[key] !== null;
    return (
      <View style={{ marginTop: 10 }} key={key}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Label hint={hint}>{label}</Label>
          </View>
          {mine ? (
            <Pressable onPress={() => setDraft({ ...draft, [key]: '' })} hitSlop={6}>
              <Text style={{ fontSize: 10.5, color: C.green2, fontWeight: '700' }}>
                전체 설정으로
              </Text>
            </Pressable>
          ) : (
            <Text style={{ fontSize: 10.5, color: C.faint }}>전체 설정을 따름</Text>
          )}
        </View>
        <Field
          placeholder={placeholder}
          keyboardType={keyboard}
          value={String(draft[key] ?? '')}
          onChangeText={set(key)}
        />
      </View>
    );
  };

  return (
    <View>
      <Text style={{ fontSize: 11.5, color: C.sub, lineHeight: 18 }}>
        비워 두면 전체 설정을 그대로 씁니다. 지금 전체는{' '}
        <Text style={{ fontWeight: '700' }}>{won(inherited.amount)} · 매월 {inherited.dueDay}일</Text>
        입니다.
      </Text>
      {row('feeAmount', '회비', '이 코트장만 다른 금액일 때', String(inherited.amount), 'number-pad')}
      {row('feeDueDay', '납부일', '매월 며칠까지', String(inherited.dueDay), 'number-pad')}
      {row('feeAccount', '입금 계좌', '이 코트장 전용 계좌가 있을 때',
        inherited.account || '예: 신한 110-123-456789 (홍길동)')}
    </View>
  );
}

/** 코트장 목록에 붙는 요약 배지 — "이 코트장은 뭔가 다르다"를 한눈에 */
export function VenueOverrideBadges({ club, venue }) {
  const fee = feeRule(club, venue);
  const feeOwn = fee.from.amount === FROM.VENUE || fee.from.dueDay === FROM.VENUE;
  const n = notifyOverrideCount(club, venue);
  if (!feeOwn && !n) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
      {feeOwn && <Chip tone="soft">회비 {won(fee.amount)}</Chip>}
      {n > 0 && <Chip tone="soft">알림 {n}개 따로</Chip>}
    </View>
  );
}

export default {
  FromTag, NotifyPrefs, FeeScopeChooser, BillingScopeTabs,
  VenueFeeOverride, VenueOverrideBadges,
};
