/* 원포인트 — 포핸드/백핸드/발리 등 영역별 유튜브 레슨 영상 모음.
   영상은 링크로 등록하고, 누르면 유튜브 앱/브라우저로 열립니다. */
import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Image, Linking } from 'react-native';
import { useApp } from '../_layout';
import { useBottomPad } from '../../src/hooks/useBottomPad';
import { useClub } from '../../src/hooks/useClub';
import { useBackHandler } from '../../src/hooks/useBackHandler';
import { subTips, addTip, deleteTip } from '../../src/lib/firestore';
import { TIP_CATEGORIES } from '../../src/lib/constants';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Label } from '../../src/components/pickers';
import { Card, SectionTitle, Chip, Btn, Field } from '../../src/components/ui';
import { C } from '../../src/lib/theme';

/** 유튜브 URL에서 영상 ID 추출 (watch?v=, youtu.be/, shorts/ 지원) */
export function youtubeId(url = '') {
  const s = String(url);
  const m = s.match(/(?:youtu\.be\/|v=|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}
const thumbOf = (url) => {
  const id = youtubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
};

export default function Tips() {
  const { clubId, me, viewMode } = useApp();
  const bottomPad = useBottomPad();
  const { isAdmin } = useClub(clubId, me, { viewMode });

  const [items, setItems] = useState([]);
  const [cat, setCat] = useState(null);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState(null);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2000); };
  const [f, setF] = useState({ title: '', category: TIP_CATEGORIES[0], url: '', note: '' });

  useEffect(() => {
    if (!clubId) return undefined;
    return subTips(clubId, setItems);
  }, [clubId]);

  const list = useMemo(() => items.filter((x) => !cat || x.category === cat), [items, cat]);
  const open = (url) => { if (url) Linking.openURL(url).catch(() => flash('링크를 열 수 없습니다')); };

  /* 안드로이드 뒤로 = 등록 폼 → 카테고리 필터 순으로 되돌린다 */
  useBackHandler(() => {
    if (adding) { setAdding(false); return true; }
    if (cat) { setCat(null); return true; }
    return false;
  });

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader
        title="원포인트"
        subtitle="영역별 레슨 영상 모음"
        onBack={adding ? () => setAdding(false) : undefined}
        backLabel="원포인트"
      />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomPad }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <Chip tone={!cat ? 'green' : 'outline'} onPress={() => setCat(null)}>전체</Chip>
          {TIP_CATEGORIES.map((c) => (
            <Chip key={c} tone={cat === c ? 'green' : 'outline'} onPress={() => setCat(c)}>{c}</Chip>
          ))}
        </View>

        <View style={{ marginTop: 12 }}>
          {list.map((it) => {
            const thumb = thumbOf(it.url);
            return (
              <Pressable key={it.id} onPress={() => open(it.url)}>
                <Card style={{ marginBottom: 10, padding: 0, overflow: 'hidden' }}>
                  <View style={{ position: 'relative' }}>
                    {thumb ? (
                      <Image source={{ uri: thumb }} style={{ width: '100%', height: 170 }} resizeMode="cover" />
                    ) : (
                      <View style={{ width: '100%', height: 100, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 30 }}>▶️</Text>
                      </View>
                    )}
                    <View style={{
                      position: 'absolute', top: '50%', left: '50%', marginLeft: -22, marginTop: -22,
                      width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ fontSize: 18, color: '#fff' }}>▶</Text>
                    </View>
                  </View>
                  <View style={{ padding: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Chip tone="lime">{it.category}</Chip>
                      {isAdmin && (
                        <Pressable onPress={() => { deleteTip(clubId, it.id); flash('삭제됨'); }} style={{ marginLeft: 'auto' }}>
                          <Text style={{ fontSize: 12, color: C.danger }}>삭제</Text>
                        </Pressable>
                      )}
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: '800', marginTop: 6 }}>{it.title}</Text>
                    {!!it.note && <Text style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>{it.note}</Text>}
                  </View>
                </Card>
              </Pressable>
            );
          })}
          {list.length === 0 && (
            <Card><Text style={{ fontSize: 12, color: C.sub }}>
              {cat ? `${cat} 영상이 없습니다.` : '등록된 영상이 없습니다.'}
              {isAdmin ? ' 아래에서 추가하세요.' : ''}
            </Text></Card>
          )}
        </View>

        {isAdmin && (
          <>
            <SectionTitle right={
              <Chip tone={adding ? 'green' : 'outline'} onPress={() => setAdding(!adding)}>{adding ? '닫기' : '+ 추가'}</Chip>
            }>영상 등록</SectionTitle>
            {adding && (
              <Card>
                <Label>영역</Label>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {TIP_CATEGORIES.map((c) => (
                    <Chip key={c} tone={f.category === c ? 'green' : 'outline'} onPress={() => setF({ ...f, category: c })}>{c}</Chip>
                  ))}
                </View>
                <Label>제목</Label>
                <Field placeholder="예: 포핸드 스윙 궤도 교정" value={f.title} onChangeText={(v) => setF({ ...f, title: v })} />
                <View style={{ marginTop: 8 }}>
                  <Label hint="youtube.com/watch?v=... 또는 youtu.be/...">유튜브 링크</Label>
                  <Field placeholder="https://youtu.be/..." autoCapitalize="none" value={f.url} onChangeText={(v) => setF({ ...f, url: v })} />
                  {!!f.url && !youtubeId(f.url) && (
                    <Text style={{ fontSize: 11, color: C.danger, marginTop: 4 }}>유튜브 주소 형식이 아닙니다(미리보기 없이 등록됩니다)</Text>
                  )}
                </View>
                <View style={{ marginTop: 8 }}>
                  <Label hint="선택">메모</Label>
                  <Field placeholder="예: 3분부터 핵심" value={f.note} onChangeText={(v) => setF({ ...f, note: v })} />
                </View>
                <View style={{ marginTop: 12 }}>
                  <Btn full disabled={!f.title || !f.url} onPress={() => {
                    addTip(clubId, f);
                    setF({ title: '', category: TIP_CATEGORIES[0], url: '', note: '' });
                    flash('영상이 등록되었습니다');
                  }}>등록</Btn>
                </View>
              </Card>
            )}
          </>
        )}
      </ScrollView>

      {toast && (
        <View style={{ position: 'absolute', bottom: 20, alignSelf: 'center', backgroundColor: C.ink, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 }}>
          <Text style={{ color: C.lime, fontSize: 12, fontWeight: '700' }}>{toast}</Text>
        </View>
      )}
    </View>
  );
}
