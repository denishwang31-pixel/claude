/* ============================================================
   원포인트 — 레벨업 탭의 첫 칸 (시안 A「선반」)

   왜 이렇게 바꿨나
     예전: 제목 + 칸 나누기 + 영역 칩 두 줄 + 큰 카드 세로 목록.
     영상이 화면 절반 아래에서 시작했고, 한 번에 한 영역만 보였고,
     검색이 없었고, 누르면 유튜브로 나가서 안 돌아왔다. "게시판 같다".

     지금: 칸 나누기 → 검색창 → 가로로 넘기는 선반(새로 올라온 영상,
     저장한 영상, 영역마다 한 줄). 내려 보면 모든 영역이 이어진다.
     영상은 앱 안에서 재생한다(PlayerModal).

   화면 상태
     empty     영상 0개 — 회원에게는 안내만, 운영진에게는 [영상 등록하기]
     compact   1~5개 — 선반이 짧으면 휑하다. 줄 목록 하나로
     shelves   6개 이상
     검색      검색창을 누르면. 칸 나누기를 숨기고 결과를 줄 목록으로
     영역 모아보기  선반의 [전체 ›] — 한 영역만 줄 목록으로
     태블릿    폭 900 이상 — 왼쪽 영역 목록 + 오른쪽 선반/격자

   ⚠️ 「레슨」이라는 말은 이 화면 어디에도 쓰지 않는다. 입구는 공짜로
      얻어 가는 것만 약속해야 사람들이 들어온다(levelup.jsx 참고).
   ⚠️ 코치 한 줄은 두 군데뿐 — 재생 화면 끝, 영역 모아보기 끝.
      첫 화면·검색 결과에는 두지 않는다.

   누가 올리나 (앱 주인이 정함)
     앱 관리자와, 앱 관리자가 승인한 코치만. 클럽 운영진이라고 올릴 수
     있는 게 아니다 — 영상의 질을 지키려는 것이다. 그래서 영상은 클럽마다
     따로가 아니라 앱 전체 공용(onepoint)이다. 코치는 자기 영상만 고치고
     지우며, 「추천」은 앱 관리자만 단다. 규칙(firestore.rules)도 같다.
   ============================================================ */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, Keyboard, Alert, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../app/_layout';
import { useBottomPad } from '../../hooks/useBottomPad';
import { useBackHandler } from '../../hooks/useBackHandler';
import { useOptionSheet } from '../native';
import { AddButton } from '../LevelupTop';
import {
  subOnepoint, addOnepoint, updateOnepoint, setOnepointPinned, deleteOnepoint,
  subOnepointStates, setOnepointState, subCoaches, subMyCoach, subTips, deleteTip,
} from '../../lib/firestore';
import { COACH_STATUS } from '../../lib/coach';
import { getJSON, setJSON } from '../../lib/deviceStore';
import {
  buildShelves, searchVideos, categoryCounts, inCategory, catOf, addRecent, suggestionsFor,
  canManage, canPin, canUpload, legacyMoves, tipDoc, videoIdOf, CATEGORIES,
} from '../../lib/onepoint';
import {
  PAD, VideoShelf, VideoRow, VideoCard, ShelfHeader, SearchField, CategoryChips, CoachLine,
  MemberEmpty, AdminEmpty, NoResults, WordChip, LegacyBanner,
} from './parts';
import { PlayerModal } from './PlayerModal';
import { VideoAddSheet } from './VideoAddSheet';
import { C } from '../../lib/theme';

const MAXF = 1.3;
const WIDE = 900;
const RECENT_KEY = 'onepoint.recent';

/**
 * @param renderTop  ({ right, beside }) => 레벨업 머리(칸 나누기)
 * @param onGoCoach  (coachId?) => 레벨업 칸을 「코치」로(코치 아이디가 있으면 그 코치 화면)
 * @param onGoGear   레벨업 칸을 「용품」으로
 */
export function OnePointScreen({ renderTop, onGoCoach, onGoGear }) {
  const { clubId, me, isAppAdmin } = useApp();
  const insets = useSafeAreaInsets();
  const bottomPad = useBottomPad();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const sheetUi = useOptionSheet();

  /* ---- 데이터 ---- */
  const [items, setItems] = useState([]);
  const [states, setStates] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [coachCount, setCoachCount] = useState(0);
  const [myCoach, setMyCoach] = useState(null);
  const [legacy, setLegacy] = useState([]);
  const [moving, setMoving] = useState(false);
  useEffect(() => subOnepoint((l) => { setItems(l); setLoaded(true); }), []);
  useEffect(() => subOnepointStates(me, setStates), [me]);
  useEffect(() => subCoaches((list) => setCoachCount(list.filter((c) => c.status === COACH_STATUS.APPROVED).length)), []);
  useEffect(() => subMyCoach(me, setMyCoach), [me]);
  /* 예전에 클럽 운영진이 이 클럽에만 올린 영상 — 앱 관리자에게만 옮기기 안내를 띄운다 */
  useEffect(() => (isAppAdmin && clubId ? subTips(clubId, setLegacy) : (setLegacy([]), undefined)), [isAppAdmin, clubId]);

  const isCoach = myCoach?.status === COACH_STATUS.APPROVED;
  const who = { me, isAppAdmin: !!isAppAdmin, isCoach };
  const uploader = canUpload(who);

  const watchedMap = useMemo(() => states.watched || {}, [states]);
  const savedMap = useMemo(() => states.saved || {}, [states]);
  const isWatched = (id) => !!watchedMap[id];
  const isSaved = (id) => !!savedMap[id];
  const savedIds = useMemo(() => new Set(Object.keys(savedMap).filter((k) => savedMap[k])), [savedMap]);
  const home = useMemo(() => buildShelves(items, savedIds), [items, savedIds]);
  const counts = useMemo(() => categoryCounts(items), [items]);

  /* ---- 화면 상태 ---- */
  const [cat, setCat] = useState(null);           // 영역 모아보기(폰) / 왼쪽 목록 선택(태블릿)
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [resultCat, setResultCat] = useState('all');
  const [recent, setRecent] = useState([]);
  const [playingId, setPlayingId] = useState(null);
  const [sheet, setSheet] = useState(null);       // { editing, initialCategory }
  const [toast, setToast] = useState(null);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const shelfY = useRef({});
  const [scrollTo, setScrollTo] = useState(null);
  const [rightW, setRightW] = useState(0);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2000); };

  useEffect(() => { getJSON(RECENT_KEY, []).then((v) => setRecent(Array.isArray(v) ? v : [])); }, []);
  useEffect(() => { const t = setTimeout(() => setDq(q), 150); return () => clearTimeout(t); }, [q]);

  /* 고른 영역의 영상이 다 지워지면 그 화면에 빈 채로 남지 않게 */
  useEffect(() => {
    if (cat && !counts.some((c) => c.category === cat)) setCat(null);
  }, [cat, counts]);

  /* 등록 직후 그 영역 선반이 보이게 */
  useEffect(() => {
    if (!scrollTo) return undefined;
    const t = setTimeout(() => {
      const y = shelfY.current[scrollTo];
      if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
      setScrollTo(null);
    }, 400);
    return () => clearTimeout(t);
  }, [scrollTo, items]);

  const remember = (word) => {
    const next = addRecent(recent, word);
    setRecent(next);
    setJSON(RECENT_KEY, next);
  };

  const exitSearch = () => {
    setQ(''); setDq(''); setResultCat('all'); setSearching(false);
    Keyboard.dismiss();
  };

  useBackHandler(() => {
    if (searching) { exitSearch(); return true; }
    if (cat && !wide) { setCat(null); return true; }
    return false;
  });

  /* ---- 동작 ---- */
  const open = (v) => {
    if (searching && dq.trim()) remember(dq);
    setPlayingId(v.id);
  };
  const openCategory = (c) => {
    if (searching) exitSearch();
    setCat(c);
    if (!wide) scrollRef.current?.scrollTo({ y: 0, animated: false });
  };
  const toggle = (kind, id, current) => {
    if (!me) return;
    setOnepointState(me, id, kind, !current).catch(() => flash('저장하지 못했어요'));
  };

  /* 길게 누르기 — 고칠 수 있는 영상에만(앱 관리자: 전부, 코치: 자기 것).
     일반 회원은 길게 눌러도 아무 일도 없다. */
  const manageMenu = (v) => {
    if (!canManage(v, who)) return;
    const options = [
      { key: 'edit', label: '수정' },
      ...(canPin(who) ? [{ key: 'pin', label: v.pinned ? '추천 해제' : '추천으로 두기' }] : []),
      { key: 'del', label: '삭제', destructive: true },
    ];
    sheetUi.open({
      title: v.title,
      options,
      destructiveIndex: options.length - 1,
      onSelect: (o) => {
        if (o.key === 'edit') setSheet({ editing: v });
        else if (o.key === 'pin') setOnepointPinned(v.id, !v.pinned).catch(() => flash('바꾸지 못했어요'));
        else if (o.key === 'del') {
          Alert.alert('이 영상을 지울까요?', '회원 화면에서도 사라져요', [
            { text: '그대로 두기', style: 'cancel' },
            {
              text: '지우기', style: 'destructive',
              onPress: () => deleteOnepoint(v.id).then(() => flash('지웠어요')).catch(() => flash('지우지 못했어요')),
            },
          ]);
        }
      },
    });
  };
  const adminMenu = uploader ? manageMenu : undefined;

  const submit = async (doc, editing) => {
    if (editing) {
      await updateOnepoint(editing.id, doc);
      setSheet(null);
      flash('고쳤어요');
    } else {
      /* 앱 관리자가 코치이기도 하면 앱 관리자로 올린다(코치 표시 없이) */
      await addOnepoint(doc, me, isAppAdmin ? null : myCoach);
      setSheet(null);
      flash('등록했어요');
      if (!wide) setScrollTo(doc.category); else setCat(doc.category);
    }
  };

  /* 예전 클럽 영상을 앱 전체로 옮긴다 — 같은 영상이 이미 있으면 지우기만 */
  const moveLegacy = async () => {
    if (moving) return;
    setMoving(true);
    const { copy, drop } = legacyMoves(legacy, items);
    let failed = 0;
    for (const t of copy) {
      try {
        const cat0 = CATEGORIES.includes(t.category) ? t.category : '기타';
        await addOnepoint(tipDoc({ ...t, category: cat0 }, videoIdOf(t)), me, null);
        await deleteTip(clubId, t.id);
      } catch (e) { failed += 1; }
    }
    for (const t of drop) {
      try { await deleteTip(clubId, t.id); } catch (e) { failed += 1; }
    }
    setMoving(false);
    flash(failed ? `${failed}개는 옮기지 못했어요. 다시 눌러 주세요` : '앱 전체로 옮겼어요');
  };
  const legacyBanner = isAppAdmin && legacy.length > 0
    ? <LegacyBanner count={legacy.length} moving={moving} onMove={moveLegacy} />
    : null;

  const playing = playingId ? items.find((v) => v.id === playingId) || null : null;
  const addBtn = uploader ? <AddButton label="영상 등록" onPress={() => setSheet({ initialCategory: cat || '' })} /> : null;

  /* ---- 검색 결과 ---- */
  const results = useMemo(() => searchVideos(items, dq), [items, dq]);
  const resultCounts = useMemo(() => categoryCounts(results), [results]);
  const rc = resultCat !== 'all' && resultCounts.some((c) => c.category === resultCat) ? resultCat : 'all';
  const shown = rc === 'all' ? results : results.filter((v) => catOf(v) === rc);

  const searchField = (
    <SearchField
      inputRef={inputRef}
      value={q}
      onChangeText={setQ}
      focused={searching}
      onFocus={() => setSearching(true)}
      onClear={() => { setQ(''); setDq(''); inputRef.current?.focus(); }}
      onCancel={searching ? exitSearch : undefined}
      onSubmit={() => { if (q.trim() && searchVideos(items, q).length) remember(q); }}
    />
  );

  const searchBody = () => {
    const k = dq.trim();
    if (!k) {
      return (
        <View style={{ paddingHorizontal: PAD, paddingTop: 12 }}>
          {recent.length > 0 ? (
            <>
              <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 15, fontWeight: '800', color: C.text, marginBottom: 10 }}>최근 찾은 말</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {recent.map((w) => <WordChip key={w} label={w} onPress={() => setQ(w)} />)}
              </View>
            </>
          ) : (
            <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 15, fontWeight: '600', color: C.sub }}>
              제목이나 메모에 있는 말로 찾아요. 영역 이름(서브, 발리…)도 돼요.
            </Text>
          )}
        </View>
      );
    }
    if (results.length === 0) {
      return (
        <NoResults q={k} suggestions={suggestionsFor(k, items, recent)}
          onPick={(s) => (s.kind === 'category' ? openCategory(s.category) : setQ(s.word))} />
      );
    }
    return (
      <View>
        <View style={{ paddingHorizontal: PAD, paddingTop: 8 }}>
          <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 18, fontWeight: '800', color: C.text }}>‘{k}’ 영상 {results.length}개</Text>
          <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 14, fontWeight: '600', color: C.sub, marginTop: 2 }}>제목 · 메모에서 찾았어요</Text>
        </View>
        {resultCounts.length > 1 && (
          <View style={{ marginTop: 12 }}>
            <CategoryChips value={rc} onChange={setResultCat}
              items={[{ key: 'all', label: '전체', count: results.length },
                ...resultCounts.map((c) => ({ key: c.category, label: c.category, count: c.count }))]} />
          </View>
        )}
        <View style={{ paddingHorizontal: PAD, marginTop: 4 }}>
          {shown.map((v) => (
            <VideoRow key={v.id} v={v} q={k} watched={isWatched(v.id)}
              onPress={() => open(v)} onLongPress={adminMenu ? () => adminMenu(v) : undefined} />
          ))}
        </View>
      </View>
    );
  };

  /* ---- 첫 화면(선반) ---- */
  const shelvesBody = (cardBig = 248, cardSmall = 184) => {
    if (home.mode !== 'shelves') return null;
    const lp = adminMenu ? (v) => adminMenu(v) : undefined;
    return (
      <>
        {legacyBanner}
        {home.newest.length > 0 && (
          <VideoShelf title="새로 올라온 영상" items={home.newest} cardWidth={cardBig}
            isWatched={isWatched} onOpen={open} onLongPress={lp} />
        )}
        {home.saved.length > 0 && (
          <VideoShelf title="저장한 영상" count={home.saved.length} items={home.saved} cardWidth={cardSmall}
            isWatched={isWatched} onOpen={open} onLongPress={lp} />
        )}
        {home.byCategory.map((s) => (
          <VideoShelf key={s.category} title={s.category} count={s.count} items={s.items}
            cardWidth={home.newest.length > 0 ? cardSmall : cardBig}
            showCategory={false} isWatched={isWatched} onOpen={open} onLongPress={lp}
            onAll={() => openCategory(s.category)}
            onLayout={(e) => { shelfY.current[s.category] = e.nativeEvent.layout.y; }} />
        ))}
      </>
    );
  };

  /* 첫 목록이 오기 전에 "영상이 없어요"를 번쩍 보여 주지 않는다 */
  const emptyBody = !loaded ? null : uploader ? (
    <View>
      {legacyBanner}
      <AdminEmpty role={isAppAdmin ? '앱 관리자로 보는 중' : '코치로 보는 중'}
        onAdd={() => setSheet({ initialCategory: '' })} />
    </View>
  ) : <MemberEmpty onGear={onGoGear} />;

  /* ---- 영역 모아보기(폰) ---- */
  const categoryBody = () => {
    const list = inCategory(items, cat);
    return (
      <View>
        <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', minHeight: 56 }}>
          <Pressable onPress={() => setCat(null)} accessibilityRole="button" accessibilityLabel="뒤로"
            style={({ pressed }) => ({ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
            <Text allowFontScaling={false} style={{ fontSize: 30, lineHeight: 32, color: C.green, fontWeight: '500' }}>‹</Text>
          </Pressable>
          <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 22, fontWeight: '800', color: C.text }}>{cat}</Text>
          <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 16, fontWeight: '700', color: C.sub, marginLeft: 8 }}>{list.length}개</Text>
          <View style={{ marginLeft: 'auto', paddingRight: 8 }}>{addBtn}</View>
        </View>
        <View style={{ marginTop: 8 }}>
          <CategoryChips value={cat} onChange={setCat}
            items={counts.map((c) => ({ key: c.category, label: c.category, count: c.count }))} />
        </View>
        <View style={{ paddingHorizontal: PAD, marginTop: 8 }}>
          {list.map((v) => (
            <VideoRow key={v.id} v={v} watched={isWatched(v.id)} showCategory={false}
              onPress={() => open(v)} onLongPress={adminMenu ? () => adminMenu(v) : undefined} />
          ))}
          <CoachLine category={cat} count={coachCount} onPress={() => onGoCoach?.()} />
        </View>
      </View>
    );
  };

  /* ---- 태블릿: 오른쪽 격자 ---- */
  const gridBody = () => {
    const list = inCategory(items, cat);
    const inner = Math.max(0, rightW - PAD * 2);
    const cols = rightW >= 780 ? 3 : 2;
    const w = Math.floor((inner - 16 * (cols - 1)) / cols);
    return (
      <View>
        <ShelfHeader title={cat} count={list.length} />
        {w > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, paddingHorizontal: PAD, marginTop: 4 }}>
            {list.map((v) => (
              <VideoCard key={v.id} v={v} width={w} watched={isWatched(v.id)} showCategory={false}
                onPress={() => open(v)} onLongPress={adminMenu ? () => adminMenu(v) : undefined} />
            ))}
          </View>
        )}
        <View style={{ paddingHorizontal: PAD }}>
          <CoachLine category={cat} count={coachCount} onPress={() => onGoCoach?.()} />
        </View>
      </View>
    );
  };

  const overlays = (
    <>
      <PlayerModal
        video={playing}
        videos={items}
        isWatched={isWatched}
        isSaved={isSaved}
        onToggleWatched={(id) => toggle('watched', id, isWatched(id))}
        onToggleSaved={(id) => toggle('saved', id, isSaved(id))}
        onMarkWatched={(id) => { if (!isWatched(id)) toggle('watched', id, false); }}
        onOpenVideo={(v) => setPlayingId(v.id)}
        onOpenCategory={(c) => { setPlayingId(null); openCategory(c); }}
        coachCount={coachCount}
        onGoCoach={(coachId) => { setPlayingId(null); onGoCoach?.(coachId); }}
        onClose={() => setPlayingId(null)}
      />
      <VideoAddSheet
        visible={!!sheet}
        editing={sheet?.editing || null}
        initialCategory={sheet?.initialCategory || ''}
        videos={items}
        allowPin={canPin(who)}
        onSubmit={submit}
        onClose={() => setSheet(null)}
      />
      {sheetUi.node}
      {!!toast && (
        <View pointerEvents="none" style={{
          position: 'absolute', bottom: bottomPad - 8, alignSelf: 'center', backgroundColor: C.ink,
          paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12,
        }}>
          <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>{toast}</Text>
        </View>
      )}
    </>
  );

  /* ================= 태블릿 ================= */
  if (wide) {
    const total = items.length;
    const rail = [{ key: null, label: '전체', count: total }, ...counts.map((c) => ({ key: c.category, label: c.category, count: c.count }))];
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        {renderTop({ right: addBtn, beside: home.mode === 'empty' ? null : searchField })}
        {home.mode === 'empty' ? (
          <ScrollView contentContainerStyle={{ paddingBottom: bottomPad }}>{emptyBody}</ScrollView>
        ) : (
          <View style={{ flex: 1, flexDirection: 'row' }}>
            <ScrollView style={{ width: 280, flexGrow: 0 }} contentContainerStyle={{ padding: PAD, paddingBottom: bottomPad }}>
              <View style={{ backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 6 }}>
                {rail.map((r) => {
                  const on = !searching && cat === r.key;
                  return (
                    <Pressable key={String(r.key)} onPress={() => { if (searching) exitSearch(); setCat(r.key); }}
                      accessibilityRole="button" accessibilityState={{ selected: on }}
                      style={({ pressed }) => ({
                        minHeight: 48, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center',
                        backgroundColor: on ? C.greenSoft : 'transparent', opacity: pressed ? 0.7 : 1,
                      })}>
                      <Text maxFontSizeMultiplier={MAXF} style={{ flex: 1, fontSize: 16, fontWeight: on ? '800' : '600', color: on ? C.green : C.text }}>{r.label}</Text>
                      <Text maxFontSizeMultiplier={MAXF} style={{ fontSize: 15, fontWeight: '700', color: on ? C.green : C.sub }}>{r.count}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
            <ScrollView ref={scrollRef} style={{ flex: 1 }} keyboardShouldPersistTaps="handled"
              onLayout={(e) => setRightW(e.nativeEvent.layout.width)}
              contentContainerStyle={{ paddingBottom: bottomPad }}>
              {searching ? searchBody() : cat ? gridBody() : shelvesBody()}
            </ScrollView>
          </View>
        )}
        {overlays}
      </View>
    );
  }

  /* ================= 폰 ================= */
  /* ⚠️ 검색창은 늘 같은 자리(두 번째 자식)에 둔다. 검색 모드로 바뀔 때
        검색창이 다른 자리로 옮겨 그려지면 새로 만들어져서 키보드가 닫힌다 —
        누르자마자 키보드가 내려가는 검색창이 된다. 첫 자리만 바꾼다. */
  const showSearch = searching || (!cat && home.mode !== 'empty');
  let first = null;
  let body;
  if (searching) {
    first = <View style={{ height: insets.top + 8 }} />;   // 칸 나누기를 숨기고 검색에 집중
    body = searchBody();
  } else if (cat) {
    body = categoryBody();                                // 자기 머리(‹ 영역)를 스크롤 안에 갖는다
  } else if (home.mode === 'empty') {
    first = renderTop({ right: null });                   // 찾을 게 없으니 검색창도 숨긴다
    body = emptyBody;
  } else {
    first = renderTop({ right: addBtn });
    body = shelvesBody();
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {first}
      {showSearch ? <View style={{ paddingHorizontal: PAD, paddingBottom: 8 }}>{searchField}</View> : null}
      <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: bottomPad }}>
        {body}
      </ScrollView>
      {overlays}
    </View>
  );
}

export default OnePointScreen;
