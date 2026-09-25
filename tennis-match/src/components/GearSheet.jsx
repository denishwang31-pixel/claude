/* ============================================================
   용품 상세 — 사진·가격·판매처 + 「추천 이유」

   왜 상세를 두나
     예전엔 상품을 누르면 바로 판매처로 나갔다. 그러면 이 앱이 줄 수 있는
     것(누가, 왜 이걸 권하는지)을 보여 줄 자리가 없다. 네이버·쿠팡에도
     같은 상품은 있다 — 여기서만 볼 수 있는 건 코치와 고수들의 한마디다.

   추천 이유는 승인된 코치, 운영진이 인증한 NTRP 4.0 이상·구력 5년 이상
   회원, 앱 관리자만 쓴다(gearView.js pickEligibility · 규칙 gearPicks).
   한 사람이 한 상품에 하나 — 다시 쓰면 고쳐진다.
   ============================================================ */
import React, { useEffect, useState } from 'react';
import {
  Modal, View, Text, Pressable, ScrollView, Image, TextInput, KeyboardAvoidingView, Platform,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sellerName } from '../lib/ads';
import { gearCatOf, priceText, pickLabel, PICK_MAX_LEN } from '../lib/gearView';
import { SubHeader, MetaBadge, CourtBackdrop, PAD } from './onepoint/parts';
import { C } from '../lib/theme';
import { APP_NAME } from '../lib/constants';

const MAXF = 1.3;

export function GearSheet({ gear, picks, me, eligibility, onBuy, onSavePick, onDeletePick, onClose }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [broken, setBroken] = useState(false);
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const mine = (picks || []).find((p) => p.uid === me);

  useEffect(() => { setWriting(false); setText(mine?.text || ''); setBroken(false); }, [gear?.id]);

  if (!gear) return <Modal visible={false} transparent onRequestClose={onClose} />;
  const seller = sellerName(gear.link);
  const img = Math.min(width - PAD * 2, 420);

  const save = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    try { await onSavePick(text, !mine); setWriting(false); } finally { setSaving(false); }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ paddingTop: insets.top + 4, backgroundColor: C.bg }}>
          <SubHeader title={gearCatOf(gear)} onBack={onClose} />
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: PAD, paddingBottom: insets.bottom + 120 }}>
          <View style={{ width: img, height: img, alignSelf: 'center', borderRadius: 16, overflow: 'hidden', backgroundColor: C.ink }}>
            <CourtBackdrop width={img} height={img} />
            {!!gear.image && !broken && (
              <Image source={{ uri: gear.image }} onError={() => setBroken(true)}
                style={{ width: img, height: img, backgroundColor: C.surface }} resizeMode="contain" />
            )}
          </View>

          <Text maxFontSizeMultiplier={MAXF} style={{ marginTop: 16, fontSize: 22, fontWeight: '800', color: C.text, lineHeight: 30 }}>{gear.title}</Text>
          {!!priceText(gear.price) && (
            <Text maxFontSizeMultiplier={MAXF} style={{ marginTop: 4, fontSize: 20, fontWeight: '800', color: C.text }}>{priceText(gear.price)}</Text>
          )}
          {!!gear.desc && (
            <Text maxFontSizeMultiplier={MAXF} style={{ marginTop: 8, fontSize: 16, fontWeight: '600', color: C.sub, lineHeight: 23 }}>{gear.desc}</Text>
          )}

          {/* ---- 추천 이유 ---- */}
          <View style={{ marginTop: 24, flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 19, fontWeight: '800', color: C.text }}>추천 이유</Text>
            {!!picks?.length && <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 15, fontWeight: '700', color: C.sub }}>{picks.length}</Text>}
          </View>
          {(picks || []).map((p) => (
            <View key={p.id} style={{
              marginTop: 10, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, padding: PAD,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <MetaBadge>{p.kind === 'coach' ? '코치' : p.kind === 'player' ? '고수 추천' : '운영'}</MetaBadge>
                <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 14, fontWeight: '800', color: C.green }}>{pickLabel(p)}</Text>
              </View>
              <Text maxFontSizeMultiplier={MAXF} style={{ marginTop: 8, fontSize: 16, fontWeight: '600', color: C.text, lineHeight: 24 }}>{p.text}</Text>
              {(p.uid === me || eligibility?.isAppAdmin) && (
                <Pressable onPress={() => onDeletePick(p)} accessibilityRole="button"
                  style={{ marginTop: 4, alignSelf: 'flex-end', minHeight: 40, justifyContent: 'center' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.danger }}>지우기</Text>
                </Pressable>
              )}
            </View>
          ))}
          {!picks?.length && !writing && (
            <Text maxFontSizeMultiplier={MAXF} style={{ marginTop: 8, fontSize: 15, fontWeight: '600', color: C.sub }}>
              아직 추천이 없어요.
            </Text>
          )}

          {eligibility?.ok && !writing && (
            <Pressable onPress={() => { setText(mine?.text || ''); setWriting(true); }} accessibilityRole="button"
              style={({ pressed }) => ({
                marginTop: 12, minHeight: 48, borderRadius: 12, borderWidth: 1.5, borderColor: C.green,
                backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1,
              })}>
              <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 15, fontWeight: '800', color: C.green }}>
                {mine ? '내 추천 고치기' : '추천 이유 쓰기'}
              </Text>
            </Pressable>
          )}
          {eligibility?.ok && writing && (
            <View style={{ marginTop: 12, borderRadius: 16, backgroundColor: C.surface, borderWidth: 2, borderColor: C.green, padding: PAD }}>
              <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 13, fontWeight: '800', color: C.green }}>
                {eligibility.kind === 'editor' ? `「${APP_NAME} 추천」으로 보여요` : `「${pickLabel(eligibility)}」 이름으로 보여요`}
              </Text>
              <TextInput
                value={text}
                onChangeText={setText}
                multiline
                maxLength={PICK_MAX_LEN}
                placeholder="예: 스윙이 빠른 분께 권해요. 면이 안정적이라 백핸드 슬라이스가 편해요."
                placeholderTextColor={C.faint}
                style={{ marginTop: 8, minHeight: 88, fontSize: 16, fontWeight: '500', color: C.text, textAlignVertical: 'top' }}
              />
              <Text style={{ alignSelf: 'flex-end', fontSize: 12, fontWeight: '600', color: C.faint }}>{text.length}/{PICK_MAX_LEN}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <Pressable onPress={() => setWriting(false)} style={({ pressed }) => ({
                  flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: C.border,
                  alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1,
                })}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: C.text }}>취소</Text>
                </Pressable>
                <Pressable onPress={save} disabled={!text.trim() || saving} style={({ pressed }) => ({
                  flex: 2, minHeight: 48, borderRadius: 12, backgroundColor: C.green,
                  alignItems: 'center', justifyContent: 'center', opacity: !text.trim() || saving ? 0.35 : pressed ? 0.85 : 1,
                })}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFFFFF' }}>{saving ? '저장하는 중…' : '저장하기'}</Text>
                </Pressable>
              </View>
            </View>
          )}
          {!eligibility?.ok && (
            <Text maxFontSizeMultiplier={MAXF} style={{ marginTop: 12, fontSize: 13, fontWeight: '600', color: C.faint, lineHeight: 19 }}>
              {eligibility?.reason}
            </Text>
          )}
        </ScrollView>

        {/* 구매 — 늘 화면 아래에 */}
        <View style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: PAD, paddingTop: 12,
          paddingBottom: insets.bottom + 12, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.border,
        }}>
          <Pressable onPress={onBuy} disabled={!gear.link} accessibilityRole="link"
            style={({ pressed }) => ({
              minHeight: 52, borderRadius: 12, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center',
              opacity: !gear.link ? 0.35 : pressed ? 0.85 : 1,
            })}>
            <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 16, fontWeight: '800', color: '#FFFFFF' }}>
              {seller ? `${seller}에서 보기 ›` : '구매처에서 보기 ›'}
            </Text>
          </Pressable>
          <Text style={{ marginTop: 6, fontSize: 11, fontWeight: '500', color: C.faint, textAlign: 'center' }}>
            결제·배송은 판매처에서 진행됩니다
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default GearSheet;
