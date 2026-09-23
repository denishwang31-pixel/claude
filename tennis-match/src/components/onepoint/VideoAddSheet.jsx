/* ============================================================
   원포인트 — 운영진 영상 등록·수정 시트

   유튜브 주소를 붙여 넣으면 바로 확인하고, oEmbed 로 제목을 채워 준다
   (API 키 없이 된다). 운영진이 할 일은 영역 하나 고르는 것뿐이다.

   ⚠️ oEmbed 가 401/404 를 주면 "앱 안에서 안 될 수 있다"고 알리되
      등록은 막지 않는다 — 그래도 유튜브로는 열린다.
   ⚠️ 같은 영상(같은 videoId)은 두 번 못 올린다. 주소 모양이 달라도
      (youtu.be / watch?v= / shorts) 같은 영상이면 막는다.
   ============================================================ */
import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, Pressable, ScrollView, KeyboardAvoidingView, Platform, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Field } from '../ui';
import { AppSwitch } from '../native';
import { Icon } from '../Icon';
import { VideoThumb } from './parts';
import { C } from '../../lib/theme';
import {
  CATEGORIES, LEVELS, catOf, checkDraft, tipDoc, oembedUrl,
} from '../../lib/onepoint';

const MAXF = 1.3;
const BLANK = { url: '', title: '', category: '', level: '', note: '', pinned: false };

const Label = ({ children }) => (
  <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 15, fontWeight: '800', color: C.text, marginTop: 20, marginBottom: 8 }}>{children}</Text>
);

function Pick({ label, on, onPress, style }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={({ pressed }) => ([{
        minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8,
        backgroundColor: on ? C.green : C.surface, borderWidth: 1, borderColor: on ? C.green : C.border,
        opacity: pressed ? 0.8 : 1,
      }, style])}>
      <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 15, fontWeight: '700', color: on ? '#FFFFFF' : C.text }}>{label}</Text>
    </Pressable>
  );
}

/**
 * @param editing  고칠 영상(없으면 새로 등록)
 * @param initialCategory 새로 등록할 때 미리 골라 둘 영역
 * @param onSubmit (doc, editing) => Promise — 저장. 실패하면 던진다.
 */
export function VideoAddSheet({ visible, editing, initialCategory, videos, onSubmit, onClose }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [f, setF] = useState(BLANK);
  const [titleTouched, setTitleTouched] = useState(false);
  const [embed, setEmbed] = useState('idle');   // idle | loading | ok | blocked
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const lastFetched = useRef('');
  const lastStatus = useRef('idle');   // 같은 주소를 다시 붙여 넣으면 결과를 그대로 되살린다

  /* 열 때마다 새로 채운다 */
  useEffect(() => {
    if (!visible) return;
    setF(editing ? {
      url: editing.url || '', title: editing.title || '', category: catOf(editing),
      level: editing.level || '', note: editing.note || '', pinned: !!editing.pinned,
    } : { ...BLANK, category: initialCategory || '' });
    setTitleTouched(!!editing);
    setEmbed('idle');
    setErr('');
    setSaving(false);
    lastFetched.current = editing ? String(editing.url || '').trim() : '';
    lastStatus.current = 'idle';
  }, [visible, editing, initialCategory]);

  const chk = checkDraft(f, videos, editing?.id || null);

  /* 주소가 유튜브로 읽히면 제목을 불러온다 */
  useEffect(() => {
    if (!visible || !chk.videoId) { setEmbed('idle'); return undefined; }
    const url = f.url.trim();
    if (url === lastFetched.current) { setEmbed(lastStatus.current); return undefined; }
    let dead = false;
    setEmbed('loading');
    const t = setTimeout(async () => {
      try {
        const res = await fetch(oembedUrl(url));
        if (dead) return;
        if (!res.ok) {
          const st = res.status === 401 || res.status === 403 || res.status === 404 ? 'blocked' : 'idle';
          lastFetched.current = url; lastStatus.current = st;
          setEmbed(st);
          return;
        }
        const j = await res.json();
        if (dead) return;
        lastFetched.current = url; lastStatus.current = 'ok';
        setEmbed('ok');
        if (j && j.title) setF((p) => (titleTouched && p.title.trim() ? p : { ...p, title: String(j.title).slice(0, 80) }));
      } catch (e) {
        if (!dead) setEmbed('idle');   // 인터넷 문제 — 제목만 못 채운다
      }
    }, 350);
    return () => { dead = true; clearTimeout(t); };
  }, [visible, chk.videoId, f.url, titleTouched]);

  const set = (k) => (val) => setF((p) => ({ ...p, [k]: val }));

  const submit = async () => {
    if (!chk.ok || saving) return;
    setSaving(true);
    setErr('');
    try {
      await onSubmit(tipDoc(f, chk.videoId), editing || null);
    } catch (e) {
      setErr('저장하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.');
      setSaving(false);
    }
  };

  /* 수정하면서 주소를 안 바꿨으면 제목을 다시 불러오지 않는다 — 안내도 없다 */
  const sameAsSaved = !!editing && f.url.trim() === String(editing.url || '').trim();
  const urlMsg = chk.urlError ? '유튜브 주소가 아닌 것 같아요'
    : chk.dup ? `이미 올라온 영상이에요 · ${catOf(chk.dup)}` : '';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="닫기" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{
            height: Math.round(height * 0.9), backgroundColor: C.bg,
            borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden',
            width: '100%', maxWidth: 720, alignSelf: 'center',
          }}>
            <View style={{ alignItems: 'center', paddingTop: 10 }}>
              <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: C.border }} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 8, minHeight: 56 }}>
              <Text maxFontSizeMultiplier={MAXF} style={{ flex: 1, fontSize: 20, fontWeight: '800', color: C.text }}>
                {editing ? '영상 수정' : '영상 등록'}
              </Text>
              <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="닫기"
                style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="close" size={24} color={C.sub} />
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
              <Label>유튜브 주소</Label>
              <Field
                value={f.url}
                onChangeText={set('url')}
                placeholder="https://youtu.be/..."
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                error={urlMsg || undefined}
                suffix={chk.videoId && !chk.dup ? <Text style={{ fontSize: 18, fontWeight: '800', color: C.green }}>✓</Text> : null}
              />

              {!!chk.videoId && !chk.dup && !sameAsSaved && (
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 12, alignItems: 'center' }}>
                  <VideoThumb v={{ videoId: chk.videoId }} width={112} height={63} radius={10} />
                  <Text maxFontSizeMultiplier={MAXF} style={{
                    flex: 1, fontSize: 13, fontWeight: '800', lineHeight: 19,
                    color: embed === 'blocked' ? C.warn : embed === 'ok' ? C.green : C.sub,
                  }}>
                    {embed === 'loading' ? '제목을 불러오는 중…'
                      : embed === 'ok' ? '불러왔어요 · 제목은 고칠 수 있어요'
                        : embed === 'blocked' ? '앱 안에서 재생이 안 되는 영상일 수 있어요. 그래도 등록하면 유튜브로 열려요.'
                          : '제목을 직접 적어 주세요'}
                  </Text>
                </View>
              )}

              <Label>제목</Label>
              <Field
                value={f.title}
                onChangeText={(val) => { setTitleTouched(true); set('title')(val); }}
                placeholder="예: 포핸드 스윙 궤도 교정"
                maxLength={80}
              />

              <Label>영역</Label>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {CATEGORIES.map((c) => (
                  <Pick key={c} label={c} on={f.category === c} onPress={() => set('category')(c)}
                    style={{ width: '22.8%', flexGrow: 1 }} />
                ))}
              </View>

              <View style={{
                marginTop: 16, minHeight: 56, borderRadius: 12, borderWidth: 1, borderColor: C.border,
                backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
              }}>
                <Text maxFontSizeMultiplier={MAXF} style={{ flex: 1, fontSize: 15, fontWeight: '700', color: C.text }}>추천으로 맨 앞에 두기</Text>
                <AppSwitch value={f.pinned} onValueChange={set('pinned')} />
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: C.border }} />
                <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 13, fontWeight: '600', color: C.sub }}>여기부터는 선택 — 안 해도 돼요</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: C.border }} />
              </View>

              <Label>수준</Label>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {LEVELS.map((l) => (
                  <Pick key={l.key} label={l.label} on={f.level === l.key} style={{ flex: 1 }}
                    onPress={() => set('level')(f.level === l.key ? '' : l.key)} />
                ))}
              </View>

              <Label>메모</Label>
              <Field value={f.note} onChangeText={set('note')} placeholder="예: 3분부터 핵심" maxLength={120} />
              {!!err && <Text style={{ marginTop: 12, fontSize: 14, fontWeight: '600', color: C.danger }}>{err}</Text>}
            </ScrollView>

            <View style={{
              paddingHorizontal: 20, paddingTop: 12, paddingBottom: insets.bottom + 12,
              borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.surface,
            }}>
              <Pressable onPress={submit} disabled={!chk.ok || saving} accessibilityRole="button"
                accessibilityState={{ disabled: !chk.ok || saving }}
                style={({ pressed }) => ({
                  minHeight: 52, borderRadius: 12, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center',
                  opacity: !chk.ok || saving ? 0.35 : pressed ? 0.85 : 1,
                })}>
                <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 16, fontWeight: '800', color: '#FFFFFF' }}>
                  {saving ? '저장하는 중…' : editing ? '저장하기' : '등록하기'}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export default VideoAddSheet;
