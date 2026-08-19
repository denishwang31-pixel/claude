/* 용품 — 카테고리별 테니스 용품 소개. 누르면 판매처(네이버 스마트스토어 등)로 이동.
   앱 관리자(appAdmins/{uid})만 등록·삭제하고, 운영진 포함 모든 회원은 보기·이동만 합니다.
   용품 데이터는 클럽이 아니라 앱 전체가 공유하는 루트 컬렉션(gear)에 저장됩니다.
   이동 링크는 src/lib/ads.js 가 만들며, 나중에 제휴 코드를 붙여도 이 화면은 그대로입니다. */
import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Image } from 'react-native';
import { useApp } from '../_layout';
import { useBottomPad } from '../../src/hooks/useBottomPad';
import { useClub } from '../../src/hooks/useClub';
import { useBackHandler } from '../../src/hooks/useBackHandler';
import { subGear, addGear, deleteGear } from '../../src/lib/firestore';
import { GEAR_CATEGORIES } from '../../src/lib/constants';
import { openAd, sellerName, AD_SLOTS } from '../../src/lib/ads';
import {
  GEAR_MODE, GEAR_MODE_LABEL, gearMode, margin, marginText, gearReady, isSoldOut,
} from '../../src/lib/dropship';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Label } from '../../src/components/pickers';
import {
  Card, SectionTitle, Chip, Btn, Field, FilterRow, EmptyState, CheckRow,
} from '../../src/components/ui';
import { C, S, R, F, SHADOW } from '../../src/lib/theme';

const BLANK = {
  title: '', category: GEAR_CATEGORIES[0], price: '', image: '', link: '', desc: '',
  onHome: true,
  /* 드랍십 — 지금은 링크형만 쓰지만 칸을 미리 둔다.
     실제로 앱에서 주문을 받으려면 사업자등록·통신판매업 신고가 필요하다.
     PRE-LAUNCH.md D 참고. */
  mode: GEAR_MODE.LINK,
  supplier: '', cost: '', shipCost: '', shipFee: '', feeRate: '', stock: '', orderUrl: '',
};

export default function Gear() {
  const { clubId, me, viewMode, isAppAdmin } = useApp();
  const bottomPad = useBottomPad();
  useClub(clubId, me, { viewMode }); // 클럽 컨텍스트 유지(용품은 앱 공통)

  const [items, setItems] = useState([]);
  const [cat, setCat] = useState(null);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState(null);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2000); };
  const [f, setF] = useState(BLANK);

  useEffect(() => subGear(setItems), []);

  useBackHandler(() => {
    if (adding) { setAdding(false); return true; }
    if (cat) { setCat(null); return true; }
    return false;
  });

  const list = useMemo(() => items.filter((x) => !cat || x.category === cat), [items, cat]);

  const check = useMemo(() => gearReady(f), [f]);

  const submit = () => {
    if (!check.ok) { flash(`${check.missing.join(' · ')}을(를) 채워 주세요`); return; }
    const drop = gearMode(f) === GEAR_MODE.DROPSHIP;
    addGear({
      title: f.title.trim(),
      category: f.category,
      desc: f.desc.trim(),
      image: f.image.trim(),
      link: f.link.trim(),
      price: Number(f.price) || 0,
      slots: f.onHome ? [AD_SLOTS.GEAR, AD_SLOTS.HOME, AD_SLOTS.SCHEDULE] : [AD_SLOTS.GEAR],
      active: true,
      mode: gearMode(f),
      /* 원가·수수료는 앱 운영자만 보는 값이다. 회원 화면에는 안 그린다.
         드랍십이 아닐 때는 아예 저장하지 않는다 — 쓰이지 않는 0 이 쌓이면
         나중에 "이 상품 원가가 0인가?"를 헷갈리게 한다. */
      ...(drop ? {
        supplier: f.supplier.trim(),
        cost: Number(f.cost) || 0,
        shipCost: Number(f.shipCost) || 0,
        shipFee: Number(f.shipFee) || 0,
        feeRate: Number(f.feeRate) || 0,
        stock: f.stock === '' ? null : Number(f.stock),
        orderUrl: f.orderUrl.trim(),
      } : {}),
    });
    setF(BLANK);
    setAdding(false);
    flash('용품이 등록되었습니다');
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader
        title="용품"
        subtitle={isAppAdmin ? '앱 관리자 모드 · 등록/삭제 가능' : '라켓·의류·소모품 추천'}
        onBack={adding ? () => setAdding(false) : undefined}
        backLabel="용품"
        right={isAppAdmin ? (
          <Chip tone={adding ? 'green' : 'soft'} onPress={() => setAdding(!adding)}>
            {adding ? '닫기' : '+ 등록'}
          </Chip>
        ) : null}
      />

      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: bottomPad }}>
        <FilterRow>
          <Chip tone={!cat ? 'green' : 'outline'} onPress={() => setCat(null)}>전체</Chip>
          {GEAR_CATEGORIES.map((c) => (
            <Chip key={c} tone={cat === c ? 'green' : 'outline'} onPress={() => setCat(c)}>{c}</Chip>
          ))}
        </FilterRow>

        {isAppAdmin && adding && (
          <Card style={{ marginTop: S.md }}>
            <Label>카테고리</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: S.md }}>
              {GEAR_CATEGORIES.map((c) => (
                <Chip key={c} tone={f.category === c ? 'green' : 'outline'} onPress={() => setF({ ...f, category: c })}>{c}</Chip>
              ))}
            </View>

            <Label hint="링크형은 판매처로 보내기만 합니다 · 드랍십은 앱에서 주문을 받습니다">
              판매 방식
            </Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: S.md }}>
              {[GEAR_MODE.LINK, GEAR_MODE.DROPSHIP].map((m) => (
                <Chip key={m} tone={gearMode(f) === m ? 'green' : 'outline'}
                  onPress={() => setF({ ...f, mode: m })}>{GEAR_MODE_LABEL[m]}</Chip>
              ))}
            </View>

            <Label>상품명</Label>
            <Field placeholder="예: 윌슨 블레이드 98" value={f.title} onChangeText={(v) => setF({ ...f, title: v })} />

            <View style={{ marginTop: S.md }}>
              <Label hint="선택">한 줄 설명</Label>
              <Field placeholder="예: 컨트롤 중심 올라운드 라켓" value={f.desc} onChangeText={(v) => setF({ ...f, desc: v })} />
            </View>
            <View style={{ marginTop: S.md }}>
              <Label hint="숫자만">가격</Label>
              <Field keyboardType="number-pad" placeholder="290000" suffix="원"
                value={f.price} onChangeText={(v) => setF({ ...f, price: v })} />
            </View>
            <View style={{ marginTop: S.md }}>
              <Label hint="이미지 주소(https://…jpg)">사진 URL</Label>
              <Field placeholder="https://..." autoCapitalize="none" value={f.image} onChangeText={(v) => setF({ ...f, image: v })} />
            </View>
            <View style={{ marginTop: S.md }}>
              <Label hint="네이버 스마트스토어·쿠팡 등 판매 페이지">구매 링크</Label>
              <Field placeholder="https://smartstore.naver.com/..." autoCapitalize="none"
                value={f.link} onChangeText={(v) => setF({ ...f, link: v })} />
              {!!f.link && (
                <Text style={{ fontSize: 11, color: C.green2, marginTop: 4 }}>
                  판매처: {sellerName(f.link) || '알 수 없음'}
                </Text>
              )}
            </View>

            {gearMode(f) === GEAR_MODE.DROPSHIP && (
              <View style={{ marginTop: S.lg, backgroundColor: C.fill, borderRadius: 10, padding: 12 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: C.text }}>
                  드랍십 — 나만 보는 값
                </Text>
                <Text style={{ fontSize: 10.5, color: C.faint, marginTop: 3, lineHeight: 15 }}>
                  공급가와 수수료는 회원 화면에 안 보입니다. 마진이 맞는지 여기서 확인하세요.
                </Text>

                <View style={{ marginTop: S.md }}>
                  <Label>공급처</Label>
                  <Field placeholder="예: ○○스포츠 총판"
                    value={f.supplier} onChangeText={(v) => setF({ ...f, supplier: v })} />
                </View>

                <View style={{ flexDirection: 'row', gap: 8, marginTop: S.md }}>
                  <View style={{ flex: 1 }}>
                    <Label>공급가</Label>
                    <Field keyboardType="number-pad" suffix="원"
                      value={f.cost} onChangeText={(v) => setF({ ...f, cost: v })} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Label hint="선택">재고</Label>
                    <Field keyboardType="number-pad"
                      value={f.stock} onChangeText={(v) => setF({ ...f, stock: v })} />
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 8, marginTop: S.md }}>
                  <View style={{ flex: 1 }}>
                    <Label hint="내가 내는">배송비</Label>
                    <Field keyboardType="number-pad" suffix="원"
                      value={f.shipCost} onChangeText={(v) => setF({ ...f, shipCost: v })} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Label hint="회원에게 받는">배송비</Label>
                    <Field keyboardType="number-pad" suffix="원"
                      value={f.shipFee} onChangeText={(v) => setF({ ...f, shipFee: v })} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Label hint="결제">수수료</Label>
                    <Field keyboardType="decimal-pad" suffix="%"
                      value={f.feeRate} onChangeText={(v) => setF({ ...f, feeRate: v })} />
                  </View>
                </View>

                {Number(f.price) > 0 && Number(f.cost) > 0 && (
                  <View style={{ marginTop: S.md }}>
                    <Text style={{
                      fontSize: 14, fontWeight: '800',
                      color: margin(f).profit > 0 ? C.green : C.danger,
                    }}>
                      한 건당 {marginText(f)}
                    </Text>
                    {check.warn.map((w) => (
                      <Text key={w} style={{ fontSize: 11, color: C.warn, marginTop: 4 }}>{w}</Text>
                    ))}
                  </View>
                )}
              </View>
            )}

            <View style={{ marginTop: S.lg }}>
              <CheckRow
                checked={f.onHome}
                onToggle={() => setF({ ...f, onHome: !f.onHome })}
                label="홈·일정 화면 배너에도 노출"
                hint="끄면 이 용품 탭에서만 보입니다."
              />
            </View>

            <View style={{ marginTop: S.lg }}>
              <Btn full disabled={!check.ok} onPress={submit}>등록</Btn>
              {!check.ok && (
                <Text style={{ fontSize: 11, color: C.faint, marginTop: 6, textAlign: 'center' }}>
                  {check.missing.join(' · ')}을(를) 채우면 등록할 수 있습니다
                </Text>
              )}
            </View>
          </Card>
        )}

        <View style={{ marginTop: S.md }}>
          {list.map((it) => {
            const seller = sellerName(it.link);
            return (
              <Pressable key={it.id} onPress={() => openAd(it, AD_SLOTS.GEAR)}
                style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1, marginBottom: 10 })}>
                <View style={[{
                  backgroundColor: C.surface, borderRadius: R.lg, overflow: 'hidden',
                  flexDirection: 'row',
                }, SHADOW.sm]}>
                  {it.image ? (
                    <Image source={{ uri: it.image }} style={{ width: 104, height: 104 }} resizeMode="cover" />
                  ) : (
                    <View style={{ width: 104, height: 104, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 28 }}>🎾</Text>
                    </View>
                  )}
                  <View style={{ flex: 1, padding: 12 }}>
                    <View style={{ flexDirection: 'row', gap: 5 }}>
                      <Chip tone="soft">{it.category}</Chip>
                      {isSoldOut(it) && <Chip tone="red">품절</Chip>}
                      {/* 마진은 앱 운영자만 본다 — 회원에게 원가가 보이면 안 된다 */}
                      {isAppAdmin && gearMode(it) === GEAR_MODE.DROPSHIP && (
                        <Chip tone={margin(it).profit > 0 ? 'green' : 'red'}>{marginText(it)}</Chip>
                      )}
                    </View>
                    <Text numberOfLines={2} style={[F.bodyBold, { marginTop: 5 }]}>{it.title}</Text>
                    {!!it.desc && (
                      <Text numberOfLines={1} style={{ fontSize: 11.5, color: C.sub, marginTop: 2 }}>{it.desc}</Text>
                    )}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                      {!!it.price && (
                        <Text style={{ fontSize: 15, fontWeight: '700', color: C.green }}>
                          {Number(it.price).toLocaleString()}원
                        </Text>
                      )}
                      {!!it.link && (
                        <Text style={{ fontSize: 11, color: C.green2, fontWeight: '700' }}>
                          {seller ? `${seller} →` : '구매처 →'}
                        </Text>
                      )}
                    </View>
                  </View>

                  {isAppAdmin && (
                    <Pressable onPress={() => { deleteGear(it.id); flash('삭제됨'); }}
                      hitSlop={10} style={{ position: 'absolute', top: 8, right: 10 }}>
                      <Text style={{ fontSize: 13, color: C.danger, fontWeight: '800' }}>✕</Text>
                    </Pressable>
                  )}
                </View>
              </Pressable>
            );
          })}

          {list.length === 0 && (
            <EmptyState
              icon="🛍"
              title={cat ? `${cat} 항목이 없습니다` : '등록된 용품이 없습니다'}
              body={isAppAdmin
                ? '오른쪽 위 [+ 등록]으로 상품을 추가하세요. 링크를 넣으면 누를 때 판매처로 바로 이동합니다.'
                : '앱 관리자가 추천 용품을 등록하면 여기에 표시됩니다.'}
            />
          )}
        </View>

        {list.length > 0 && (
          <Text style={{ fontSize: 10.5, color: C.faint, marginTop: S.lg, textAlign: 'center', lineHeight: 16 }}>
            상품 정보와 결제는 각 판매처가 제공합니다.{'\n'}
            테니스매치는 통신판매중개자가 아니며 거래에 관여하지 않습니다.
          </Text>
        )}
      </ScrollView>

      {toast && (
        <View style={{
          position: 'absolute', bottom: 24, alignSelf: 'center', backgroundColor: C.ink,
          paddingHorizontal: 16, paddingVertical: 11, borderRadius: R.md,
        }}>
          <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '700' }}>{toast}</Text>
        </View>
      )}
    </View>
  );
}
