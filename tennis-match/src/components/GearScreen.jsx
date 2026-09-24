/* 용품 — 카테고리별 테니스 용품 소개. 누르면 판매처(네이버 스마트스토어 등)로 이동.
   앱 관리자(appAdmins/{uid})만 등록·삭제하고, 운영진 포함 모든 회원은 보기·이동만 합니다.
   용품 데이터는 클럽이 아니라 앱 전체가 공유하는 루트 컬렉션(gear)에 저장됩니다.
   이동 링크는 src/lib/ads.js 가 만들며, 나중에 제휴 코드를 붙여도 이 화면은 그대로입니다.

   화면 모양은 원포인트(시안 A「선반」)와 같은 틀이다 — 칸 나누기 → 검색창 →
   가로로 넘기는 선반(새로 들어온 용품, 카테고리마다 한 줄). 카테고리 칩을
   두 줄로 늘어놓던 예전 모양은 "게시판 같다"는 이유로 원포인트와 함께 바꿨다.
   판단(순서·검색)은 src/lib/gearView.js. */
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, ScrollView, Pressable, Image, Keyboard, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../app/_layout';
import { useBottomPad } from '../hooks/useBottomPad';
import { useBackHandler } from '../hooks/useBackHandler';
import {
  subGear, addGear, deleteGear, subGearPicks, saveGearPick, deleteGearPick, subMyCoach,
} from '../lib/firestore';
import { GEAR_CATEGORIES, GEAR_CATEGORY_HINT } from '../lib/constants';
import { useClub } from '../hooks/useClub';
import { GearSheet } from './GearSheet';
import { openAd, sellerName, AD_SLOTS } from '../lib/ads';
import {
  GEAR_MODE, GEAR_MODE_LABEL, gearMode, margin, marginText, gearReady, isSoldOut,
} from '../lib/dropship';
import { ScreenHeader } from './ScreenHeader';
import { AddButton } from './LevelupTop';
import { useOptionSheet } from './native';
import { Label } from './pickers';
import {
  Card, Chip, Btn, Field, CheckRow,
} from './ui';
import {
  PAD, Shelf, SubHeader, SearchField, CategoryChips, EmptyBlock, MetaBadge, CourtBackdrop,
} from './onepoint/parts';
import {
  gearShelves, searchGear, gearCounts, inGearCategory, gearCatOf, priceText,
  groupPicks, pickEligibility, pickLabel, pickDoc, pickId,
} from '../lib/gearView';
import { C, S, R } from '../lib/theme';

const BLANK = {
  title: '', category: GEAR_CATEGORIES[0], price: '', image: '', link: '', desc: '',
  onHome: true,
  /* 드랍십 — 지금은 링크형만 쓰지만 칸을 미리 둔다.
     실제로 앱에서 주문을 받으려면 사업자등록·통신판매업 신고가 필요하다.
     PRE-LAUNCH.md D 참고. */
  mode: GEAR_MODE.LINK,
  supplier: '', cost: '', shipCost: '', shipFee: '', feeRate: '', stock: '', orderUrl: '',
};

/**
 * @param title      머리 제목(등록 폼을 열었을 때, 또는 레벨업 밖에서 쓸 때)
 * @param renderTop  레벨업의 머리(칸 나누기) — ({ right }) => 요소.
 *                   있으면 제목 머리 대신 이걸 쓴다. 등록 폼을 열면 뒤로
 *                   버튼이 있는 제목 머리로 바뀐다.
 *                   ⚠️ 스크롤 안이 아니라 밖에 둔다. 목록을 내려도 다른 칸으로
 *                      바로 건너갈 수 있어야 한다.
 */
/* ---------------- 상품 그림 ---------------- */
function GearImage({ g, size, radius = 12 }) {
  const [broken, setBroken] = useState(false);
  return (
    <View style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', backgroundColor: C.ink }}>
      <CourtBackdrop width={size} height={size} />
      {!!g.image && !broken && (
        <Image source={{ uri: g.image }} onError={() => setBroken(true)}
          style={{ width: '100%', height: '100%', backgroundColor: C.surface }} resizeMode="cover" />
      )}
      {isSoldOut(g) && (
        <View style={{ position: 'absolute', top: 6, left: 6, height: 24, paddingHorizontal: 8, borderRadius: 6, backgroundColor: C.danger, justifyContent: 'center' }}>
          <Text allowFontScaling={false} style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '800' }}>품절</Text>
        </View>
      )}
    </View>
  );
}

/** 누가 추천했는지 한 줄 — "한코치 코치 추천 외 2" */
function PickLine({ picks }) {
  if (!picks || !picks.length) return null;
  const first = pickLabel(picks[0]).split(' · ')[0];
  return (
    <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ marginTop: 2, fontSize: 13, fontWeight: '800', color: C.green }}>
      💬 {picks[0].kind === 'editor' ? first : `${first} 추천`}{picks.length > 1 ? ` 외 ${picks.length - 1}` : ''}
    </Text>
  );
}

/** 선반 카드 — 그림 → 이름 → 가격 → 추천 → 판매처 */
function GearCard({ g, width, isAppAdmin, picks, onPress, onLongPress }) {
  const seller = sellerName(g.link);
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={400}
      accessibilityRole="link" accessibilityLabel={[g.title, priceText(g.price), seller].filter(Boolean).join(', ')}
      style={({ pressed }) => ({ width, opacity: pressed ? 0.8 : 1 })}>
      <GearImage g={g} size={width} />
      <Text numberOfLines={2} maxFontSizeMultiplier={1.3} style={{ marginTop: 8, fontSize: 16, fontWeight: '700', lineHeight: 22, color: C.text }}>{g.title}</Text>
      {!!priceText(g.price) && (
        <Text maxFontSizeMultiplier={1.3} style={{ marginTop: 2, fontSize: 16, fontWeight: '800', color: C.text }}>{priceText(g.price)}</Text>
      )}
      <PickLine picks={picks} />
      <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ marginTop: 2, fontSize: 13, fontWeight: '600', color: C.sub }}>
        {seller || '구매처 링크'}
      </Text>
      {isAppAdmin && gearMode(g) === GEAR_MODE.DROPSHIP && (
        <Text maxFontSizeMultiplier={1.3} style={{ marginTop: 2, fontSize: 12, fontWeight: '700', color: margin(g).profit > 0 ? C.green : C.danger }}>{marginText(g)}</Text>
      )}
    </Pressable>
  );
}

/** 줄 — 검색 결과·카테고리 모아보기 */
function GearRow({ g, showCategory = true, isAppAdmin, picks, onPress, onLongPress }) {
  const seller = sellerName(g.link);
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={400} accessibilityRole="link"
      style={({ pressed }) => ({ flexDirection: 'row', gap: 12, minHeight: 112, paddingVertical: 8, opacity: pressed ? 0.8 : 1 })}>
      <GearImage g={g} size={96} radius={10} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={2} maxFontSizeMultiplier={1.3} style={{ fontSize: 16, fontWeight: '700', lineHeight: 22, color: C.text }}>{g.title}</Text>
        {!!g.desc && (
          <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ marginTop: 2, fontSize: 13, fontWeight: '600', color: C.sub }}>{g.desc}</Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          {showCategory && <MetaBadge>{gearCatOf(g)}</MetaBadge>}
          {!!priceText(g.price) && (
            <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 16, fontWeight: '800', color: C.text }}>{priceText(g.price)}</Text>
          )}
          <Text maxFontSizeMultiplier={1.3} style={{ marginLeft: 'auto', fontSize: 13, fontWeight: '700', color: C.green }}>
            {seller ? `${seller} ›` : '구매처 ›'}
          </Text>
        </View>
        <PickLine picks={picks} />
        {isAppAdmin && gearMode(g) === GEAR_MODE.DROPSHIP && (
          <Text maxFontSizeMultiplier={1.3} style={{ marginTop: 2, fontSize: 12, fontWeight: '700', color: margin(g).profit > 0 ? C.green : C.danger }}>{marginText(g)}</Text>
        )}
      </View>
    </Pressable>
  );
}

/**
 * @param title      머리 제목(등록 폼을 열었을 때, 또는 레벨업 밖에서 쓸 때)
 * @param renderTop  레벨업의 머리(칸 나누기) — ({ right }) => 요소.
 *                   있으면 제목 머리 대신 이걸 쓴다. 등록 폼을 열면 뒤로
 *                   버튼이 있는 제목 머리로 바뀐다.
 *                   ⚠️ 스크롤 안이 아니라 밖에 둔다. 목록을 내려도 다른 칸으로
 *                      바로 건너갈 수 있어야 한다.
 */
export function GearScreen({ title = '용품', renderTop = null } = {}) {
  const { clubId, me, viewMode, isAppAdmin } = useApp();
  const { members } = useClub(clubId, me, { viewMode });
  const insets = useSafeAreaInsets();
  const bottomPad = useBottomPad();
  const sheetUi = useOptionSheet();

  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [cat, setCat] = useState(null);
  const [adding, setAdding] = useState(false);
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [resultCat, setResultCat] = useState('all');
  const [toast, setToast] = useState(null);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2000); };
  const [f, setF] = useState(BLANK);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);

  const [picks, setPicks] = useState([]);
  const [myCoach, setMyCoach] = useState(null);
  const [detailId, setDetailId] = useState(null);
  useEffect(() => subGear((l) => { setItems(l); setLoaded(true); }), []);
  useEffect(() => subGearPicks(setPicks), []);
  useEffect(() => subMyCoach(me, setMyCoach), [me]);
  const picksOf = useMemo(() => groupPicks(picks), [picks]);
  const myMember = (members || []).find((m) => m.id === me) || null;
  const eligibility = { ...pickEligibility({ isAppAdmin, coach: myCoach, member: myMember, clubId }), isAppAdmin };
  useEffect(() => { const t = setTimeout(() => setDq(q), 150); return () => clearTimeout(t); }, [q]);

  const exitSearch = () => { setQ(''); setDq(''); setResultCat('all'); setSearching(false); Keyboard.dismiss(); };

  useBackHandler(() => {
    if (adding) { setAdding(false); return true; }
    if (detailId) { setDetailId(null); return true; }
    if (searching) { exitSearch(); return true; }
    if (cat) { setCat(null); return true; }
    return false;
  });

  const home = useMemo(() => gearShelves(items), [items]);
  const counts = useMemo(() => gearCounts(items), [items]);
  const results = useMemo(() => searchGear(items, dq), [items, dq]);
  const resultCounts = useMemo(() => gearCounts(results), [results]);
  const rc = resultCat !== 'all' && resultCounts.some((c) => c.category === resultCat) ? resultCat : 'all';
  const shown = rc === 'all' ? results : results.filter((g) => gearCatOf(g) === rc);

  const check = useMemo(() => gearReady(f), [f]);

  /* 누르면 상세(추천 이유)부터. 판매처로는 상세의 [○○에서 보기]로 간다. */
  const open = (g) => setDetailId(g.id);
  const detail = detailId ? items.find((g) => g.id === detailId) || null : null;
  const savePick = async (text, isNew) => {
    try {
      await saveGearPick(pickId(detail.id, me), pickDoc(detail.id, me, eligibility, text), isNew);
      flash('추천을 남겼어요');
    } catch (e) {
      flash('저장하지 못했어요');
      throw e;
    }
  };
  const removePick = (p) => Alert.alert('이 추천을 지울까요?', '', [
    { text: '그대로 두기', style: 'cancel' },
    { text: '지우기', style: 'destructive', onPress: () => deleteGearPick(p.id).then(() => flash('지웠어요')).catch(() => flash('지우지 못했어요')) },
  ]);
  /* 길게 누르기 — 앱 관리자만. 예전 ✕ 단추는 스크롤하다 잘못 눌리기 쉬웠다. */
  const manage = isAppAdmin ? (g) => sheetUi.open({
    title: g.title,
    options: [{ key: 'del', label: '삭제', destructive: true }],
    destructiveIndex: 0,
    onSelect: () => Alert.alert('이 용품을 지울까요?', '회원 화면과 홈 배너에서도 사라져요', [
      { text: '그대로 두기', style: 'cancel' },
      { text: '지우기', style: 'destructive', onPress: () => deleteGear(g.id).then(() => flash('지웠어요')).catch(() => flash('지우지 못했어요')) },
    ]),
  }) : undefined;

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

  const toastNode = toast && (
    <View pointerEvents="none" style={{
      position: 'absolute', bottom: bottomPad - 8, alignSelf: 'center', backgroundColor: C.ink,
      paddingHorizontal: 16, paddingVertical: 12, borderRadius: R.md,
    }}>
      <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{toast}</Text>
    </View>
  );

  /* ---- 등록 폼(앱 관리자) — 자기 머리(‹ 뒤로)를 갖는 별도 화면 ---- */
  if (adding) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <ScreenHeader
          title={`${title} 등록`}
          subtitle="앱 관리자 · 등록한 용품은 모든 클럽 회원에게 보여요"
          onBack={() => setAdding(false)}
          backLabel={title}
        />
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: S.lg, paddingBottom: bottomPad }}>
          <Card>
            <Label>카테고리</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: S.md }}>
              {GEAR_CATEGORIES.map((c) => (
                <Chip key={c} tone={f.category === c ? 'green' : 'outline'} onPress={() => setF({ ...f, category: c })}>{c}</Chip>
              ))}
            </View>
            {!!GEAR_CATEGORY_HINT[f.category] && (
              <Text style={{ fontSize: 12, color: C.sub, marginTop: -6, marginBottom: S.md }}>
                {f.category}: {GEAR_CATEGORY_HINT[f.category]}
              </Text>
            )}

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
                hint="끄면 레벨업 › 용품에서만 보입니다."
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
        </ScrollView>
        {toastNode}
      </View>
    );
  }

  const disclaimer = (
    <Text style={{ fontSize: 12, fontWeight: '500', color: C.faint, marginTop: S.xl, textAlign: 'center', lineHeight: 17, paddingHorizontal: PAD }}>
      상품 정보와 결제는 각 판매처가 제공합니다.{'\n'}
      테니스매치는 통신판매중개자가 아니며 거래에 관여하지 않습니다.
    </Text>
  );

  const searchBody = () => {
    const k = dq.trim();
    if (!k) {
      return (
        <Text maxFontSizeMultiplier={1.3} style={{ paddingHorizontal: PAD, paddingTop: 12, fontSize: 15, fontWeight: '600', color: C.sub }}>
          상품 이름·설명으로 찾아요. 카테고리 이름(라켓, 신발…)도 돼요.
        </Text>
      );
    }
    if (results.length === 0) {
      return <EmptyBlock art={false} title={`‘${k}’ 용품은 아직 없어요`} body="비슷한 말로 찾아보세요" />;
    }
    return (
      <View>
        <View style={{ paddingHorizontal: PAD, paddingTop: 8 }}>
          <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 18, fontWeight: '800', color: C.text }}>‘{k}’ 용품 {results.length}개</Text>
        </View>
        {resultCounts.length > 1 && (
          <View style={{ marginTop: 12 }}>
            <CategoryChips value={rc} onChange={setResultCat}
              items={[{ key: 'all', label: '전체', count: results.length },
                ...resultCounts.map((c) => ({ key: c.category, label: c.category, count: c.count }))]} />
          </View>
        )}
        <View style={{ paddingHorizontal: PAD, marginTop: 4 }}>
          {shown.map((g) => (
            <GearRow key={g.id} g={g} isAppAdmin={isAppAdmin} picks={picksOf[g.id]} onPress={() => open(g)} onLongPress={manage ? () => manage(g) : undefined} />
          ))}
        </View>
      </View>
    );
  };

  const shelvesBody = () => (
    <>
      {home.newest.length > 0 && (
        <Shelf title="새로 들어온 용품" data={home.newest}
          renderItem={(g) => <GearCard g={g} width={168} isAppAdmin={isAppAdmin} picks={picksOf[g.id]} onPress={() => open(g)} onLongPress={manage ? () => manage(g) : undefined} />} />
      )}
      {home.byCategory.map((s) => (
        <Shelf key={s.category} title={s.category} count={s.count} data={s.items}
          onAll={() => { setCat(s.category); scrollRef.current?.scrollTo({ y: 0, animated: false }); }}
          renderItem={(g) => <GearCard g={g} width={home.newest.length > 0 ? 144 : 168} isAppAdmin={isAppAdmin} picks={picksOf[g.id]} onPress={() => open(g)} onLongPress={manage ? () => manage(g) : undefined} />} />
      ))}
      {disclaimer}
    </>
  );

  const categoryBody = () => {
    const list = inGearCategory(items, cat);
    return (
      <View>
        <View style={{ paddingTop: insets.top + 4 }}>
          <SubHeader title={cat} count={`${list.length}개`} onBack={() => setCat(null)}
            right={isAppAdmin ? <AddButton label="용품 등록" onPress={() => { setF({ ...BLANK, category: cat }); setAdding(true); }} /> : null} />
        </View>
        <View style={{ marginTop: 8 }}>
          <CategoryChips value={cat} onChange={setCat}
            items={counts.map((c) => ({ key: c.category, label: c.category, count: c.count }))} />
        </View>
        <View style={{ paddingHorizontal: PAD, marginTop: 8 }}>
          {list.map((g) => (
            <GearRow key={g.id} g={g} showCategory={false} isAppAdmin={isAppAdmin} picks={picksOf[g.id]} onPress={() => open(g)} onLongPress={manage ? () => manage(g) : undefined} />
          ))}
        </View>
        {disclaimer}
      </View>
    );
  };

  const emptyBody = !loaded ? null : isAppAdmin ? (
    <EmptyBlock badge="앱 관리자로 보는 중" title="첫 용품을 올려 볼까요?"
      body={'판매 페이지 링크를 넣으면\n누를 때 판매처로 바로 이동해요.'}
      actionLabel="용품 등록하기" onAction={() => setAdding(true)}
      footnote="회원에게는 ‘아직 올라온 용품이 없어요’로 보여요" />
  ) : (
    <EmptyBlock title="아직 올라온 용품이 없어요" body="라켓·신발·스트링 추천을 모으고 있어요." />
  );

  /* ⚠️ 검색창은 늘 같은 자리(두 번째 자식) — 옮겨 그리면 키보드가 닫힌다(원포인트와 같은 이유) */
  const showSearch = searching || (!cat && home.mode !== 'empty');
  let first = null;
  let body;
  const addBtn = isAppAdmin ? <AddButton label="용품 등록" onPress={() => setAdding(true)} /> : null;
  if (searching) {
    first = <View style={{ height: insets.top + 8 }} />;
    body = searchBody();
  } else if (cat) {
    body = categoryBody();
  } else if (home.mode === 'empty') {
    first = renderTop ? renderTop({ right: null }) : <ScreenHeader title={title} />;
    body = emptyBody;
  } else {
    first = renderTop ? renderTop({ right: addBtn }) : <ScreenHeader title={title} right={addBtn} />;
    body = shelvesBody();
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {first}
      {showSearch ? (
        <View style={{ paddingHorizontal: PAD, paddingBottom: 8 }}>
          <SearchField
            inputRef={inputRef}
            value={q}
            onChangeText={setQ}
            focused={searching}
            onFocus={() => setSearching(true)}
            onClear={() => { setQ(''); setDq(''); inputRef.current?.focus(); }}
            onCancel={searching ? exitSearch : undefined}
            placeholder="용품 검색 (예: 라켓, 스트링)"
            label="용품 검색"
          />
        </View>
      ) : null}
      <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: bottomPad }}>
        {body}
      </ScrollView>
      {sheetUi.node}
      <GearSheet
        gear={detail}
        picks={detail ? picksOf[detail.id] || [] : []}
        me={me}
        eligibility={eligibility}
        onBuy={() => detail && openAd(detail, AD_SLOTS.GEAR)}
        onSavePick={savePick}
        onDeletePick={removePick}
        onClose={() => setDetailId(null)}
      />
      {toastNode}
    </View>
  );
}

export default GearScreen;
