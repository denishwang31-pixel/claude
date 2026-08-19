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
   ============================================================ */
import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Image, Linking } from 'react-native';
import {
  subCoaches, subMyCoach, saveCoach, subCoachVideos, addCoachVideo, deleteCoachVideo,
} from '../lib/firestore';
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
  Card, SectionTitle, Chip, Btn, Field, EmptyState, Divider,
} from './ui';
import { C, F } from '../lib/theme';

const BLANK = {
  name: '', phone: '', sido: '', gungu: '', career: '', intro: '',
  certs: [], courts: [], lessonSlots: [], feeNote: '',
};

/* ---------------- 코치 한 장 ---------------- */
function CoachCard({ coach, videoCount, onPress }) {
  return (
    <Card style={{ marginTop: 8 }} onPress={onPress}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        {coach.photo ? (
          <Image source={{ uri: coach.photo }}
            style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: C.fill }} />
        ) : (
          <View style={{
            width: 52, height: 52, borderRadius: 26, backgroundColor: C.greenSoft,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontSize: 20 }}>🎾</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={F.bodyBold}>{coach.name}</Text>
          <Text style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>{coach.regionText}</Text>
          {!!coach.intro && (
            <Text style={{ fontSize: 12, color: C.text, marginTop: 4 }} numberOfLines={2}>
              {coach.intro}
            </Text>
          )}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
            {videoCount > 0 && <Chip tone="green">영상 {videoCount}</Chip>}
            {(coach.lessonSlots || []).length > 0 && (
              <Chip tone="outline">레슨 {coach.lessonSlots.length}타임</Chip>
            )}
            {(coach.certs || []).slice(0, 2).map((x) => <Chip key={x} tone="soft">{x}</Chip>)}
          </View>
        </View>
      </View>
    </Card>
  );
}

/* ---------------- 코치 상세 ---------------- */
function CoachDetail({ coach, videos, onBack }) {
  const mine = publicVideos(videos).filter((v) => v.coachId === coach.id);
  const slots = sortLessonSlots(coach.lessonSlots);

  return (
    <View>
      <Pressable onPress={onBack} style={{ paddingVertical: 8 }}>
        <Text style={{ fontSize: 13, color: C.green2, fontWeight: '700' }}>‹ 코치 목록</Text>
      </Pressable>

      <Card>
        <Text style={{ fontSize: 20, fontWeight: '800', color: C.text }}>{coach.name}</Text>
        <Text style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>{coach.regionText}</Text>
        {!!coach.intro && (
          <Text style={{ fontSize: 13, color: C.text, marginTop: 10, lineHeight: 20 }}>
            {coach.intro}
          </Text>
        )}
      </Card>

      <SectionTitle>경력</SectionTitle>
      <Card>
        <Text style={{ fontSize: 13, color: C.text, lineHeight: 21 }}>
          {coach.career || '등록된 경력이 없습니다'}
        </Text>
        {(coach.certs || []).length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
            {coach.certs.map((x) => <Chip key={x} tone="soft">{x}</Chip>)}
          </View>
        )}
      </Card>

      {slots.length > 0 && (
        <>
          <SectionTitle hint={`${slots.length}타임`}>레슨 시간</SectionTitle>
          <Card>
            {slots.map((s, i) => (
              <View key={`${s.day}${s.from}${i}`}
                style={{ paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderTopColor: C.border }}>
                <Text style={{ fontSize: 13, color: C.text }}>{lessonSlotText(s)}</Text>
              </View>
            ))}
            {!!coach.feeNote && (
              <Text style={{ fontSize: 12, color: C.sub, marginTop: 8 }}>{coach.feeNote}</Text>
            )}
          </Card>
        </>
      )}

      {(coach.courts || []).length > 0 && (
        <>
          <SectionTitle>레슨 코트</SectionTitle>
          <Card>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
              {coach.courts.map((k) => {
                const c = ALL_COURTS.find((x) => courtKey(x) === k);
                return <Chip key={k} tone="outline">{c ? c.name : k.split('|')[1]}</Chip>;
              })}
            </View>
          </Card>
        </>
      )}

      <SectionTitle hint={`${mine.length}편`}>영상</SectionTitle>
      {mine.length === 0 && (
        <Card><Text style={{ fontSize: 12, color: C.sub }}>아직 올라온 영상이 없습니다</Text></Card>
      )}
      {mine.map((v) => (
        <Card key={v.id} style={{ marginTop: 8 }} onPress={() => Linking.openURL(v.url)}>
          {!!videoThumb(v.url) && (
            <Image source={{ uri: videoThumb(v.url) }}
              style={{ width: '100%', height: 160, borderRadius: 8, backgroundColor: C.fill }} />
          )}
          <Text style={[F.bodyBold, { marginTop: 8 }]}>{v.title}</Text>
          {!!v.note && <Text style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>{v.note}</Text>}
        </Card>
      ))}

      {!!coach.phone && (
        <>
          <SectionTitle>연락처</SectionTitle>
          <Card onPress={() => Linking.openURL(`tel:${coach.phone}`)}>
            <Text style={{ fontSize: 15, color: C.green2, fontWeight: '700' }}>{coach.phone}</Text>
            <Text style={{ fontSize: 11, color: C.faint, marginTop: 4 }}>
              눌러서 전화 · 예약과 결제는 코치와 직접 하세요
            </Text>
          </Card>
        </>
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
export function CoachScreen({ uid, flash }) {
  const [coaches, setCoaches] = useState([]);
  const [videos, setVideos] = useState([]);
  const [mine, setMine] = useState(null);
  const [tab, setTab] = useState('find');     // find | mine
  const [openId, setOpenId] = useState(null);
  const [sido, setSido] = useState(null);
  const [gungu, setGungu] = useState(null);
  const [kw, setKw] = useState('');

  useEffect(() => subCoaches(setCoaches), []);
  useEffect(() => subCoachVideos(setVideos), []);
  useEffect(() => subMyCoach(uid, setMine), [uid]);

  /* 코치가 등록한 코트의 지역표 — 사는 곳이 아니라 가르치는 곳으로도
     검색되게 하려면 이게 필요하다. 코트 목록은 앱에 내장돼 있어 공짜다. */
  const courtRegions = useMemo(() => {
    const m = {};
    ALL_COURTS.forEach((c) => { m[courtKey(c)] = `${c.sido} ${c.gungu}`.trim(); });
    return m;
  }, []);

  const videoCount = useMemo(() => {
    const n = {};
    publicVideos(videos).forEach((v) => { n[v.coachId] = (n[v.coachId] || 0) + 1; });
    return n;
  }, [videos]);

  const list = useMemo(
    () => sortCoaches(
      searchCoaches(coaches, { sido, gungu, keyword: kw, courtRegions }),
      (id) => videoCount[id] || 0,
    ),
    [coaches, sido, gungu, kw, courtRegions, videoCount],
  );

  const open = coaches.find((c) => c.id === openId);
  if (open) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <CoachDetail coach={open} videos={videos} onBack={() => setOpenId(null)} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
        <Chip tone={tab === 'find' ? 'green' : 'outline'} onPress={() => setTab('find')}>코치 찾기</Chip>
        <Chip tone={tab === 'mine' ? 'green' : 'outline'} onPress={() => setTab('mine')}>
          {mine ? '내 코치 프로필' : '코치로 등록'}
        </Chip>
      </View>

      {tab === 'mine' ? (
        <MyCoach uid={uid} mine={mine} videos={videos} flash={flash} />
      ) : (
        <View>
          <Label hint="시/도만 골라도 검색됩니다">지역</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Chip tone={!sido ? 'green' : 'outline'}
              onPress={() => { setSido(null); setGungu(null); }}>전체</Chip>
            {SIDO_LIST.map((s) => (
              <Chip key={s} tone={sido === s ? 'green' : 'outline'}
                onPress={() => { setSido(s); setGungu(null); }}>{s}</Chip>
            ))}
          </View>
          {!!sido && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              <Chip tone={!gungu ? 'soft' : 'outline'} onPress={() => setGungu(null)}>{sido} 전체</Chip>
              {gunguOf(sido).map((g) => (
                <Chip key={g} tone={gungu === g ? 'soft' : 'outline'}
                  onPress={() => setGungu(g)}>{g}</Chip>
              ))}
            </View>
          )}

          <View style={{ marginTop: 12 }}>
            <Field placeholder="이름 · 경력으로 검색" value={kw} onChangeText={setKw} />
          </View>

          <SectionTitle hint={`${list.length}명`}>
            {[sido, gungu].filter(Boolean).join(' ') || '전체 지역'}
          </SectionTitle>

          {list.length === 0 ? (
            <EmptyState
              icon="🎾"
              title="아직 등록된 코치가 없습니다"
              body="지역을 넓혀 보시거나, 코치라면 [코치로 등록]에서 프로필을 올려 주세요."
            />
          ) : list.map((c) => (
            <CoachCard key={c.id} coach={c} videoCount={videoCount[c.id] || 0}
              onPress={() => setOpenId(c.id)} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}
