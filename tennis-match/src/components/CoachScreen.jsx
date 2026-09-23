/* ============================================================
   코치 — 찾기 · 내 프로필 · 영상

   화면이 셋으로 갈린다
     찾기   지역으로 좁혀서 코치를 본다. 모든 회원이 쓴다.
     상세   한 코치의 경력·레슨시간·영상.
     내 등록 본인이 코치일 때 프로필과 영상을 올린다.

   왜 "내 등록"이 늘 보이나
     누가 코치인지 앱은 미리 모른다. 회원 명단에 코치 표시가 있는 것도
     아니다. 그래서 아무나 들어와서 신청할 수 있게 두고, 실제 공개
     여부는 앱 주인의 승인으로 가른다.

   예약·결제는 여기 없다 — 사용자가 "추후 개발"로 정한 부분이다.

   화면 모양은 원포인트(시안 A)와 같은 틀이다 — 칸 나누기 → 검색창 →
   지역 칩 한 줄(가로로 넘김) → 코치 줄 목록. 예전엔 시·도 17개를 칩으로
   여러 줄 깔아서 코치 목록이 화면 아래로 밀려났다.
   상세에서 코치의 영상(원포인트에 올린 것 + 소개 영상)은 앱 안에서 재생한다.
   "코치로 등록"은 목록 맨 아래로 내렸다 — 회원 대부분은 코치가 아니다.
   ============================================================ */
import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Image, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  subCoaches, subMyCoach, saveCoach, subCoachVideos, addCoachVideo, deleteCoachVideo, subOnepoint,
} from '../lib/firestore';
import { useBottomPad } from '../hooks/useBottomPad';
import { useBackHandler } from '../hooks/useBackHandler';
import {
  PAD, ShelfHeader, SubHeader, SearchField, CategoryChips, EmptyBlock, MetaBadge, VideoCard, CourtBackdrop,
} from './onepoint/parts';
import { PlayerModal } from './onepoint/PlayerModal';
import { parseYouTubeId } from '../lib/onepoint';
import {
  COACH_STATUS, COACH_STATUS_LABEL, VIDEO_STATUS, VIDEO_STATUS_LABEL,
  statusTone, normalizeCoach, coachProfileReady, submitPatch,
  searchCoaches, sortCoaches, publicVideos, lessonSlotText, sortLessonSlots,
  lessonSlotOk, videoThumb, videoReady, DAYS,
} from '../lib/coach';
import { SIDO_LIST, gunguOf } from '../lib/regions';
import { ALL_COURTS, courtRegionText } from '../lib/courtData';
import { courtKey } from '../lib/courtInfo';
import { Label } from './pickers';
import {
  Card, SectionTitle, Chip, Btn, Field, Divider,
} from './ui';
import { C, F } from '../lib/theme';

const BLANK = {
  name: '', phone: '', sido: '', gungu: '', career: '', intro: '',
  certs: [], courts: [], lessonSlots: [], feeNote: '',
};

/* ---------------- 코치 얼굴 ---------------- */
function Avatar({ coach, size }) {
  const [broken, setBroken] = useState(false);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' }}>
      <CourtBackdrop width={size} height={size} />
      {coach.photo && !broken ? (
        <Image source={{ uri: coach.photo }} onError={() => setBroken(true)} style={{ width: size, height: size }} />
      ) : (
        <Text allowFontScaling={false} style={{ fontSize: size * 0.4, fontWeight: '800', color: '#FFFFFF' }}>
          {String(coach.name || '?').slice(0, 1)}
        </Text>
      )}
    </View>
  );
}

/* ---------------- 코치 한 줄 ---------------- */
function CoachRow({ coach, videoCount, onPress }) {
  const slots = (coach.lessonSlots || []).length;
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      accessibilityLabel={[`${coach.name} 코치`, coach.regionText, videoCount ? `영상 ${videoCount}개` : ''].filter(Boolean).join(', ')}
      style={({ pressed }) => ({
        flexDirection: 'row', gap: 12, paddingVertical: 12, minHeight: 88,
        borderBottomWidth: 1, borderBottomColor: C.border, opacity: pressed ? 0.8 : 1,
      })}>
      <Avatar coach={coach} size={64} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ flexShrink: 1, fontSize: 17, fontWeight: '800', color: C.text }}>{coach.name}</Text>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ flexShrink: 1, fontSize: 13, fontWeight: '600', color: C.sub }}>{coach.regionText}</Text>
        </View>
        {!!coach.intro && (
          <Text numberOfLines={2} maxFontSizeMultiplier={1.3} style={{ marginTop: 3, fontSize: 14, fontWeight: '600', color: C.text, lineHeight: 20 }}>{coach.intro}</Text>
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {videoCount > 0 && <MetaBadge>영상 {videoCount}</MetaBadge>}
          {slots > 0 && <MetaBadge tone="level">레슨 {slots}타임</MetaBadge>}
          {(coach.certs || []).slice(0, 1).map((x) => <MetaBadge key={x} tone="level">{x}</MetaBadge>)}
        </View>
      </View>
      <Text allowFontScaling={false} style={{ alignSelf: 'center', fontSize: 22, color: C.faint }}>›</Text>
    </Pressable>
  );
}

/** 상세의 구역 — 제목 + 흰 카드 */
function Block({ title, hint, children }) {
  return (
    <View style={{ marginTop: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: PAD, marginBottom: 8 }}>
        <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 19, fontWeight: '800', color: C.text }}>{title}</Text>
        {!!hint && <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 15, fontWeight: '700', color: C.sub }}>{hint}</Text>}
      </View>
      {children}
    </View>
  );
}
const boxStyle = {
  marginHorizontal: PAD, backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: PAD,
};

/* ---------------- 코치 상세 ---------------- */
function CoachDetail({ coach, clips, onPlay }) {
  const slots = sortLessonSlots(coach.lessonSlots);
  return (
    <View>
      <View style={[boxStyle, { flexDirection: 'row', gap: 16, alignItems: 'center' }]}>
        <Avatar coach={coach} size={72} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 22, fontWeight: '800', color: C.text }}>{coach.name} 코치</Text>
          <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 14, fontWeight: '600', color: C.sub, marginTop: 2 }}>{coach.regionText}</Text>
        </View>
      </View>
      {!!coach.intro && (
        <Text maxFontSizeMultiplier={1.3} style={{ marginHorizontal: PAD, marginTop: 12, fontSize: 16, fontWeight: '600', color: C.text, lineHeight: 24 }}>
          {coach.intro}
        </Text>
      )}
      {!!coach.phone && (
        <Pressable onPress={() => Linking.openURL(`tel:${coach.phone}`)} accessibilityRole="button"
          style={({ pressed }) => ({
            marginHorizontal: PAD, marginTop: 16, minHeight: 52, borderRadius: 12, backgroundColor: C.green,
            alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1,
          })}>
          <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 16, fontWeight: '800', color: '#FFFFFF' }}>📞 전화하기 · {coach.phone}</Text>
        </Pressable>
      )}
      {!!coach.phone && (
        <Text maxFontSizeMultiplier={1.3} style={{ marginHorizontal: PAD, marginTop: 6, fontSize: 13, fontWeight: '600', color: C.sub, textAlign: 'center' }}>
          예약과 결제는 코치와 직접 하세요
        </Text>
      )}

      {clips.length > 0 && (
        <View style={{ marginTop: 8 }}>
          <ShelfHeader title="영상" count={clips.length} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: PAD, gap: 12 }}>
            {clips.map((v) => <VideoCard key={v.id} v={v} width={220} onPress={() => onPlay(v)} />)}
          </ScrollView>
        </View>
      )}

      <Block title="경력">
        <View style={boxStyle}>
          <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 15, fontWeight: '500', color: C.text, lineHeight: 23 }}>
            {coach.career || '등록된 경력이 없습니다'}
          </Text>
          {(coach.certs || []).length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {coach.certs.map((x) => <MetaBadge key={x}>{x}</MetaBadge>)}
            </View>
          )}
        </View>
      </Block>

      {slots.length > 0 && (
        <Block title="레슨 시간" hint={`${slots.length}타임`}>
          <View style={boxStyle}>
            {slots.map((sl, i) => (
              <View key={`${sl.day}${sl.from}${i}`}
                style={{ minHeight: 40, justifyContent: 'center', borderTopWidth: i ? 1 : 0, borderTopColor: C.border }}>
                <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 15, fontWeight: '600', color: C.text }}>{lessonSlotText(sl)}</Text>
              </View>
            ))}
            {!!coach.feeNote && (
              <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 14, fontWeight: '600', color: C.sub, marginTop: 8 }}>{coach.feeNote}</Text>
            )}
          </View>
        </Block>
      )}

      {(coach.courts || []).length > 0 && (
        <Block title="레슨 코트">
          <View style={[boxStyle, { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }]}>
            {coach.courts.map((k) => {
              const ct = ALL_COURTS.find((x) => courtKey(x) === k);
              return <MetaBadge key={k} tone="level">{ct ? ct.name : k.split('|')[1]}</MetaBadge>;
            })}
          </View>
        </Block>
      )}
    </View>
  );
}

/* ---------------- 내 코치 등록 ---------------- */
function MyCoach({ uid, mine, videos, flash }) {
  const [f, setF] = useState(BLANK);
  const [slot, setSlot] = useState({ day: '월', from: '', to: '', note: '' });
  const [cert, setCert] = useState('');
  const [vid, setVid] = useState({ title: '', url: '', note: '' });
  const [courtKw, setCourtKw] = useState('');

  /* 저장된 프로필을 편집 상태로 옮긴다. 처음 들어왔을 때 한 번만. */
  useEffect(() => {
    if (mine) setF({ ...BLANK, ...mine });
  }, [mine?.id]);

  const ready = coachProfileReady(f);
  const myVideos = (videos || []).filter((v) => v.coachId === uid);

  /* 코트는 500곳이 넘는다. 전부 그리면 화면이 멎으므로 검색해서 고른다. */
  const courtHits = useMemo(() => {
    const kw = courtKw.trim();
    if (!kw) return [];
    return ALL_COURTS.filter((c) => c.name.includes(kw)).slice(0, 12);
  }, [courtKw]);

  const save = async (submit) => {
    const data = normalizeCoach(f);
    /* 승인 상태에서 내용을 고치면 다시 심사를 받는다. 규칙에서도 막고 있다 —
       깨끗한 내용으로 승인받고 나중에 바꿔 치우는 것을 막기 위해서다. */
    const patch = submit || mine?.status === COACH_STATUS.APPROVED
      ? { ...data, ...submitPatch() }
      : { ...data, status: mine?.status || COACH_STATUS.DRAFT };
    await saveCoach(uid, patch);
    flash(submit ? '승인을 신청했습니다' : '저장했습니다');
  };

  const addSlot = () => {
    if (!lessonSlotOk(slot)) return flash('요일과 시작·종료 시간을 확인하세요');
    setF({ ...f, lessonSlots: sortLessonSlots([...(f.lessonSlots || []), slot]) });
    return setSlot({ day: slot.day, from: '', to: '', note: '' });
  };

  const addVideo = async () => {
    const v = videoReady(vid);
    if (!v.ok) return flash(`${v.missing.join(' · ')}을(를) 확인하세요`);
    await addCoachVideo({
      coachId: uid,
      coachName: f.name || mine?.name || '',
      title: vid.title.trim(),
      url: vid.url.trim(),
      note: vid.note.trim(),
      status: VIDEO_STATUS.PENDING,
    });
    setVid({ title: '', url: '', note: '' });
    return flash('영상을 올렸습니다 — 승인 후 공개됩니다');
  };

  const toggleCourt = (k) => setF({
    ...f,
    courts: (f.courts || []).includes(k)
      ? f.courts.filter((x) => x !== k)
      : [...(f.courts || []), k],
  });

  return (
    <View>
      {!!mine && (
        <Card style={{ marginBottom: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Chip tone={statusTone(mine.status)}>{COACH_STATUS_LABEL[mine.status] || mine.status}</Chip>
            {mine.status === COACH_STATUS.APPROVED && (
              <Text style={{ fontSize: 11, color: C.sub, flex: 1 }}>
                모든 회원에게 보이고 있습니다
              </Text>
            )}
          </View>
          {mine.status === COACH_STATUS.REJECTED && !!mine.rejectReason && (
            <Text style={{ fontSize: 12, color: C.danger, marginTop: 8 }}>
              반려 사유: {mine.rejectReason}
            </Text>
          )}
          {mine.status === COACH_STATUS.APPROVED && (
            <Text style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 17 }}>
              내용을 고치면 다시 승인 대기로 바뀝니다.
            </Text>
          )}
        </Card>
      )}

      <SectionTitle>기본</SectionTitle>
      <Card>
        <Label>이름</Label>
        <Field placeholder="김코치" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />

        <Label>연락처</Label>
        <Field placeholder="010-1234-5678" keyboardType="phone-pad"
          value={f.phone} onChangeText={(v) => setF({ ...f, phone: v })} />

        <Label hint="회원이 지역으로 코치를 찾습니다">활동지역</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {SIDO_LIST.map((s) => (
            <Chip key={s} tone={f.sido === s ? 'green' : 'outline'}
              onPress={() => setF({ ...f, sido: s, gungu: '' })}>{s}</Chip>
          ))}
        </View>
        {!!f.sido && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {gunguOf(f.sido).map((g) => (
              <Chip key={g} tone={f.gungu === g ? 'soft' : 'outline'}
                onPress={() => setF({ ...f, gungu: g })}>{g}</Chip>
            ))}
          </View>
        )}

        <Label>한 줄 소개</Label>
        <Field placeholder="초보자 자세 교정 전문입니다"
          value={f.intro} onChangeText={(v) => setF({ ...f, intro: v })} />
      </Card>

      <SectionTitle hint="회원이 가장 많이 봅니다">경력</SectionTitle>
      <Card>
        <Field placeholder={'예)\n· 국가대표 상비군 3년\n· ○○테니스클럽 코치 5년\n· 전국동호인대회 우승'}
          multiline numberOfLines={5}
          style={{ minHeight: 100, textAlignVertical: 'top' }}
          value={f.career} onChangeText={(v) => setF({ ...f, career: v })} />

        <Label>자격증 · 수상</Label>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <View style={{ flex: 1 }}>
            <Field placeholder="생활체육지도자 2급" value={cert} onChangeText={setCert} />
          </View>
          <Btn small disabled={!cert.trim()}
            onPress={() => { setF({ ...f, certs: [...(f.certs || []), cert.trim()] }); setCert(''); }}>
            추가
          </Btn>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
          {(f.certs || []).map((x) => (
            <Chip key={x} tone="soft"
              onPress={() => setF({ ...f, certs: f.certs.filter((y) => y !== x) })}>{x} ✕</Chip>
          ))}
        </View>
      </Card>

      <SectionTitle hint="코트 검색에도 함께 나옵니다">레슨 코트</SectionTitle>
      <Card>
        <Field placeholder="코트명 검색 (예: 올림픽공원)" value={courtKw} onChangeText={setCourtKw} />
        {courtHits.map((c) => {
          const k = courtKey(c);
          const on = (f.courts || []).includes(k);
          return (
            <Pressable key={k} onPress={() => toggleCourt(k)}
              style={{ paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 15, color: on ? C.green : C.faint }}>{on ? '☑' : '☐'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, color: C.text }}>{c.name}</Text>
                <Text style={{ fontSize: 11, color: C.sub }}>{courtRegionText(c)}</Text>
              </View>
            </Pressable>
          );
        })}
        {(f.courts || []).length > 0 && (
          <>
            <Divider style={{ marginVertical: 8 }} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
              {f.courts.map((k) => {
                const c = ALL_COURTS.find((x) => courtKey(x) === k);
                return (
                  <Chip key={k} tone="green" onPress={() => toggleCourt(k)}>
                    {(c ? c.name : k.split('|')[1])} ✕
                  </Chip>
                );
              })}
            </View>
          </>
        )}
      </Card>

      <SectionTitle>레슨 시간</SectionTitle>
      <Card>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {DAYS.map((d) => (
            <Chip key={d} tone={slot.day === d ? 'green' : 'outline'}
              onPress={() => setSlot({ ...slot, day: d })}>{d}</Chip>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
          <View style={{ flex: 1 }}>
            <Field placeholder="06:00" value={slot.from} onChangeText={(v) => setSlot({ ...slot, from: v })} />
          </View>
          <View style={{ flex: 1 }}>
            <Field placeholder="08:00" value={slot.to} onChangeText={(v) => setSlot({ ...slot, to: v })} />
          </View>
          <Btn small onPress={addSlot}>추가</Btn>
        </View>
        <Field placeholder="메모 (예: 성인 그룹)" value={slot.note}
          onChangeText={(v) => setSlot({ ...slot, note: v })} />

        {sortLessonSlots(f.lessonSlots).map((s, i) => (
          <View key={`${s.day}${s.from}${i}`}
            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
            <Text style={{ flex: 1, fontSize: 13, color: C.text }}>{lessonSlotText(s)}</Text>
            <Pressable onPress={() => setF({
              ...f, lessonSlots: f.lessonSlots.filter((x) => x !== s),
            })}>
              <Text style={{ fontSize: 13, color: C.danger }}>삭제</Text>
            </Pressable>
          </View>
        ))}

        <Label>레슨비 안내</Label>
        <Field placeholder="예) 그룹 월 12만원 · 개인 회당 5만원"
          value={f.feeNote} onChangeText={(v) => setF({ ...f, feeNote: v })} />
      </Card>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <View style={{ flex: 1 }}>
          <Btn tone="outline" full onPress={() => save(false)}>임시 저장</Btn>
        </View>
        <View style={{ flex: 1 }}>
          <Btn full disabled={!ready.ok} onPress={() => save(true)}>승인 신청</Btn>
        </View>
      </View>
      {!ready.ok && (
        <Text style={{ fontSize: 11, color: C.faint, marginTop: 6, textAlign: 'center' }}>
          {ready.missing.join(' · ')}을(를) 채우면 신청할 수 있습니다
        </Text>
      )}

      {/* 영상 — 프로필이 승인된 뒤에 올리는 것이 순서지만 막지는 않는다.
          미리 올려 두고 함께 심사받는 편이 코치에게 편하다. */}
      <SectionTitle hint={`${myVideos.length}편`}>내 영상</SectionTitle>
      <Card>
        <Field placeholder="영상 제목 (예: 포핸드 그립 잡는 법)"
          value={vid.title} onChangeText={(v) => setVid({ ...vid, title: v })} />
        <Field placeholder="유튜브 링크" autoCapitalize="none"
          value={vid.url} onChangeText={(v) => setVid({ ...vid, url: v })} />
        <Field placeholder="설명 (선택)" value={vid.note}
          onChangeText={(v) => setVid({ ...vid, note: v })} />
        <Btn full onPress={addVideo}>영상 올리기</Btn>
        <Text style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 17 }}>
          유튜브에 올린 뒤 링크를 넣어 주세요. 승인되면 모든 회원에게 보입니다.
        </Text>
      </Card>

      {myVideos.map((v) => (
        <Card key={v.id} style={{ marginTop: 8 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {!!videoThumb(v.url) && (
              <Image source={{ uri: videoThumb(v.url) }}
                style={{ width: 90, height: 60, borderRadius: 6, backgroundColor: C.fill }} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={F.bodyBold} numberOfLines={2}>{v.title}</Text>
              <View style={{ flexDirection: 'row', gap: 5, marginTop: 5 }}>
                <Chip tone={statusTone(v.status)}>{VIDEO_STATUS_LABEL[v.status] || v.status}</Chip>
              </View>
              {v.status === VIDEO_STATUS.REJECTED && !!v.rejectReason && (
                <Text style={{ fontSize: 11, color: C.danger, marginTop: 4 }}>{v.rejectReason}</Text>
              )}
            </View>
            <Pressable onPress={() => deleteCoachVideo(v.id)}>
              <Text style={{ fontSize: 12, color: C.danger }}>삭제</Text>
            </Pressable>
          </View>
        </Card>
      ))}
    </View>
  );
}

/* ---------------- 바깥 껍데기 ---------------- */
/**
 * @param renderTop  레벨업 머리(칸 나누기) — 찾기 화면에서만 그린다
 * @param openId     바로 열 코치(원포인트 영상에서 [코치 보기 ›]로 왔을 때)
 * @param onOpened   openId 를 받았다고 알려 준다(다시 열리지 않게)
 */
export function CoachScreen({ uid, flash, renderTop = null, openId: askOpen = null, onOpened }) {
  const insets = useSafeAreaInsets();
  const bottomPad = useBottomPad();
  const [coaches, setCoaches] = useState([]);
  const [videos, setVideos] = useState([]);
  const [points, setPoints] = useState([]);
  const [mine, setMine] = useState(null);
  const [view, setView] = useState('find');     // find | mine
  const [openId, setOpenId] = useState(null);
  const [sido, setSido] = useState(null);
  const [gungu, setGungu] = useState(null);
  const [kw, setKw] = useState('');
  const [kwFocused, setKwFocused] = useState(false);
  const [playing, setPlaying] = useState(null);

  useEffect(() => subCoaches(setCoaches), []);
  useEffect(() => subCoachVideos(setVideos), []);
  useEffect(() => subOnepoint(setPoints), []);
  useEffect(() => subMyCoach(uid, setMine), [uid]);
  useEffect(() => {
    if (askOpen) { setOpenId(askOpen); setView('find'); onOpened?.(); }
  }, [askOpen]);

  useBackHandler(() => {
    if (openId) { setOpenId(null); return true; }
    if (view === 'mine') { setView('find'); return true; }
    return false;
  });

  /* 코치가 등록한 코트의 지역표 — 사는 곳이 아니라 가르치는 곳으로도
     검색되게 하려면 이게 필요하다. 코트 목록은 앱에 내장돼 있어 공짜다. */
  const courtRegions = useMemo(() => {
    const m = {};
    ALL_COURTS.forEach((c) => { m[courtKey(c)] = `${c.sido} ${c.gungu}`.trim(); });
    return m;
  }, []);

  /* 코치의 영상 = 원포인트에 올린 것 + 승인된 소개 영상 */
  const clipsOf = useMemo(() => {
    const m = {};
    points.filter((v) => v.coachId).forEach((v) => { (m[v.coachId] = m[v.coachId] || []).push(v); });
    publicVideos(videos).forEach((v) => {
      const id = parseYouTubeId(v.url);
      if (!id) return;
      const list = (m[v.coachId] = m[v.coachId] || []);
      if (!list.some((x) => (x.videoId || parseYouTubeId(x.url)) === id)) list.push({ ...v, videoId: id, category: v.category || '기타' });
    });
    return m;
  }, [points, videos]);
  const videoCount = useMemo(() => {
    const n = {};
    Object.keys(clipsOf).forEach((k) => { n[k] = clipsOf[k].length; });
    return n;
  }, [clipsOf]);

  const list = useMemo(
    () => sortCoaches(
      searchCoaches(coaches, { sido, gungu, keyword: kw, courtRegions }),
      (id) => videoCount[id] || 0,
    ),
    [coaches, sido, gungu, kw, courtRegions, videoCount],
  );

  const player = (
    <PlayerModal
      video={playing}
      videos={playing ? (clipsOf[playing.coachId] || []) : []}
      backLabel={playing ? `${playing.coachName || '코치'} 영상` : ''}
      onOpenVideo={(v) => setPlaying(v)}
      onClose={() => setPlaying(null)}
    />
  );

  /* ---- 상세 ---- */
  const open = coaches.find((c) => c.id === openId);
  if (open) {
    const coach = open;
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={{ paddingTop: insets.top + 4 }}>
          <SubHeader title={`${coach.name} 코치`} onBack={() => setOpenId(null)} />
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: bottomPad }}>
          <CoachDetail coach={{ ...coach, id: open.id }} clips={clipsOf[open.id] || []}
            onPlay={(v) => setPlaying({ ...v, coachName: v.coachName || coach.name, coachId: open.id })} />
        </ScrollView>
        {player}
      </View>
    );
  }

  /* ---- 내 코치 프로필(등록) ---- */
  if (view === 'mine') {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={{ paddingTop: insets.top + 4 }}>
          <SubHeader title={mine ? '내 코치 프로필' : '코치로 등록'} onBack={() => setView('find')} />
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: PAD, paddingBottom: bottomPad }}>
          {mine?.status === COACH_STATUS.APPROVED && (
            <View style={{ backgroundColor: C.greenSoft, borderRadius: 16, padding: PAD, marginBottom: 8 }}>
              <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 15, fontWeight: '800', color: C.green }}>원포인트에 영상을 올릴 수 있어요</Text>
              <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 14, fontWeight: '600', color: C.text, marginTop: 4, lineHeight: 20 }}>
                레벨업 › 원포인트 오른쪽 위 ＋ 에서 올리면 모든 회원에게 바로 보이고, 영상 아래에 코치님 이름이 붙어요.
              </Text>
            </View>
          )}
          <MyCoach uid={uid} mine={mine} videos={videos} flash={flash} />
        </ScrollView>
      </View>
    );
  }

  /* ---- 찾기 ---- */
  const regionTitle = [sido, gungu].filter(Boolean).join(' ') || '전체 지역';
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {renderTop ? renderTop() : <View style={{ height: insets.top + 8 }} />}
      <View style={{ paddingHorizontal: PAD, paddingBottom: 8 }}>
        <SearchField value={kw} onChangeText={setKw} focused={kwFocused}
          onFocus={() => setKwFocused(true)}
          onClear={() => setKw('')}
          onCancel={kwFocused ? () => { setKw(''); setKwFocused(false); } : undefined}
          placeholder="코치 검색 (이름·경력·자격증)" label="코치 검색" />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: bottomPad }}>
        {!!mine && (
          <Pressable onPress={() => setView('mine')} accessibilityRole="button"
            style={({ pressed }) => ({
              marginHorizontal: PAD, marginBottom: 8, minHeight: 56, borderRadius: 16, backgroundColor: C.surface,
              borderWidth: 1, borderColor: C.border, paddingHorizontal: PAD, flexDirection: 'row', alignItems: 'center', gap: 8,
              opacity: pressed ? 0.8 : 1,
            })}>
            <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 15, fontWeight: '800', color: C.text }}>내 코치 프로필</Text>
            <Chip tone={statusTone(mine.status)}>{COACH_STATUS_LABEL[mine.status] || mine.status}</Chip>
            <Text style={{ marginLeft: 'auto', fontSize: 22, color: C.faint }}>›</Text>
          </Pressable>
        )}

        <CategoryChips value={sido || 'all'}
          onChange={(k) => { setSido(k === 'all' ? null : k); setGungu(null); }}
          items={[{ key: 'all', label: '전체 지역' }, ...SIDO_LIST.map((x) => ({ key: x, label: x }))]} />
        {!!sido && (
          <View style={{ marginTop: 8 }}>
            <CategoryChips value={gungu || 'all'} onChange={(k) => setGungu(k === 'all' ? null : k)}
              items={[{ key: 'all', label: `${sido} 전체` }, ...gunguOf(sido).map((g) => ({ key: g, label: g }))]} />
          </View>
        )}

        <View style={{ marginTop: 8 }}>
          <ShelfHeader title={`${regionTitle} 코치`} count={list.length} />
        </View>
        {list.length === 0 ? (
          <EmptyBlock title="아직 등록된 코치가 없어요"
            body={sido ? '지역을 넓혀 보세요.' : '승인된 코치가 생기면 여기에 보여요.'} />
        ) : (
          <View style={{ paddingHorizontal: PAD }}>
            {list.map((c) => (
              <CoachRow key={c.id} coach={c} videoCount={videoCount[c.id] || 0} onPress={() => setOpenId(c.id)} />
            ))}
          </View>
        )}

        {!mine && (
          <Pressable onPress={() => setView('mine')} accessibilityRole="button"
            style={({ pressed }) => ({
              marginHorizontal: PAD, marginTop: 24, borderRadius: 16, backgroundColor: C.greenSoft,
              padding: PAD, flexDirection: 'row', alignItems: 'center', minHeight: 72, opacity: pressed ? 0.85 : 1,
            })}>
            <View style={{ flex: 1 }}>
              <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 15, fontWeight: '800', color: C.text }}>코치이신가요?</Text>
              <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 14, fontWeight: '600', color: C.sub, marginTop: 2 }}>
                프로필이 승인되면 원포인트에 영상도 올릴 수 있어요
              </Text>
            </View>
            <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 15, fontWeight: '800', color: C.green }}>코치로 등록 ›</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}
