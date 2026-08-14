/* 용품 — 카테고리별 테니스 용품 소개/광고. 누르면 판매처로 이동.
   앱 관리자(appAdmins/{uid})만 등록·삭제하고, 운영진 포함 모든 회원은 둘러보기·링크 이동만 합니다.
   용품 데이터는 클럽이 아니라 앱 전체가 공유하는 루트 컬렉션(gear)에 저장됩니다. */
import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, Image, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../_layout';
import { useClub } from '../../src/hooks/useClub';
import { subGear, addGear, deleteGear } from '../../src/lib/firestore';
import { GEAR_CATEGORIES } from '../../src/lib/constants';
import { Label } from '../../src/components/pickers';
import { Card, SectionTitle, Chip, Btn, Field } from '../../src/components/ui';
import { C } from '../../src/lib/theme';

export default function Gear() {
  const { clubId, me, viewMode, isAppAdmin } = useApp();
  const insets = useSafeAreaInsets();
  useClub(clubId, me, { viewMode }); // 클럽 컨텍스트 유지(광고는 앱 공통)

  const [items, setItems] = useState([]);
  const [cat, setCat] = useState(null);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState(null);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2000); };
  const [f, setF] = useState({ title: '', category: GEAR_CATEGORIES[0], price: '', image: '', link: '', desc: '' });

  React.useEffect(() => subGear(setItems), []);

  const list = useMemo(
    () => items.filter((x) => !cat || x.category === cat),
    [items, cat],
  );

  const open = (url) => { if (url) Linking.openURL(url).catch(() => flash('링크를 열 수 없습니다')); };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ backgroundColor: C.ink, paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16 }}>
        <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>🛍 용품</Text>
        <Text style={{ color: '#6ee7b7', fontSize: 11, marginTop: 2 }}>
          라켓·의류·소모품 추천{isAppAdmin ? ' · 앱 관리자 모드' : ''}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <Chip tone={!cat ? 'green' : 'outline'} onPress={() => setCat(null)}>전체</Chip>
          {GEAR_CATEGORIES.map((c) => (
            <Chip key={c} tone={cat === c ? 'green' : 'outline'} onPress={() => setCat(c)}>{c}</Chip>
          ))}
        </View>

        <View style={{ marginTop: 12 }}>
          {list.map((it) => (
            <Pressable key={it.id} onPress={() => open(it.link)}>
              <Card style={{ marginBottom: 10, padding: 0, overflow: 'hidden' }}>
                <View style={{ flexDirection: 'row' }}>
                  {it.image ? (
                    <Image source={{ uri: it.image }} style={{ width: 100, height: 100 }} resizeMode="cover" />
                  ) : (
                    <View style={{ width: 100, height: 100, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 28 }}>🎾</Text>
                    </View>
                  )}
                  <View style={{ flex: 1, padding: 12 }}>
                    <Chip tone="outline">{it.category}</Chip>
                    <Text numberOfLines={2} style={{ fontSize: 14, fontWeight: '800', marginTop: 4 }}>{it.title}</Text>
                    {!!it.desc && <Text numberOfLines={2} style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>{it.desc}</Text>}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                      {!!it.price && <Text style={{ fontSize: 14, fontWeight: '900', color: C.green }}>{Number(it.price).toLocaleString()}원</Text>}
                      {!!it.link && <Text style={{ fontSize: 11, color: C.green2, fontWeight: '700' }}>구매처 →</Text>}
                    </View>
                  </View>
                </View>
                {isAppAdmin && (
                  <Pressable onPress={() => { deleteGear(it.id); flash('삭제됨'); }}
                    style={{ position: 'absolute', top: 6, right: 8 }}>
                    <Text style={{ fontSize: 12, color: C.danger }}>✕</Text>
                  </Pressable>
                )}
              </Card>
            </Pressable>
          ))}
          {list.length === 0 && (
            <Card><Text style={{ fontSize: 12, color: C.sub }}>
              {cat ? `${cat} 항목이 없습니다.` : '등록된 용품이 없습니다.'}
              {isAppAdmin ? ' 아래에서 추가하세요.' : ''}
            </Text></Card>
          )}
        </View>

        {isAppAdmin && (
          <>
            <SectionTitle right={
              <Chip tone={adding ? 'green' : 'outline'} onPress={() => setAdding(!adding)}>{adding ? '닫기' : '+ 추가'}</Chip>
            }>용품 등록</SectionTitle>
            {adding && (
              <Card>
                <Label>카테고리</Label>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {GEAR_CATEGORIES.map((c) => (
                    <Chip key={c} tone={f.category === c ? 'green' : 'outline'} onPress={() => setF({ ...f, category: c })}>{c}</Chip>
                  ))}
                </View>
                <Label>상품명</Label>
                <Field placeholder="예: 윌슨 블레이드 98" value={f.title} onChangeText={(v) => setF({ ...f, title: v })} />
                <View style={{ marginTop: 8 }}>
                  <Label hint="선택">한 줄 설명</Label>
                  <Field placeholder="예: 컨트롤 중심 올라운드 라켓" value={f.desc} onChangeText={(v) => setF({ ...f, desc: v })} />
                </View>
                <View style={{ marginTop: 8 }}>
                  <Label hint="숫자만">가격</Label>
                  <Field keyboardType="number-pad" placeholder="290000" value={f.price} onChangeText={(v) => setF({ ...f, price: v })} />
                </View>
                <View style={{ marginTop: 8 }}>
                  <Label hint="이미지 주소(https://…jpg)">사진 URL</Label>
                  <Field placeholder="https://..." autoCapitalize="none" value={f.image} onChangeText={(v) => setF({ ...f, image: v })} />
                </View>
                <View style={{ marginTop: 8 }}>
                  <Label hint="누르면 이동할 판매처">구매 링크</Label>
                  <Field placeholder="https://..." autoCapitalize="none" value={f.link} onChangeText={(v) => setF({ ...f, link: v })} />
                </View>
                <View style={{ marginTop: 12 }}>
                  <Btn full disabled={!f.title} onPress={() => {
                    addGear({ ...f, price: Number(f.price) || 0, active: true });
                    setF({ title: '', category: GEAR_CATEGORIES[0], price: '', image: '', link: '', desc: '' });
                    flash('용품이 등록되었습니다');
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
