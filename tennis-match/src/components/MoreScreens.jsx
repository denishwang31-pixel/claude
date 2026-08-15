/* 클럽 공지 / 게스트 모집(공개 게시판) / 코트 검색 서브화면 묶음 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, Linking } from 'react-native';
import {
  addPost, addComment, addGuestPost, deleteGuestPost, applyToGuestPost, cancelApplication,
  confirmApplicant, subApplicants, updateMeeting, addCourt, deleteCourt,
} from '../lib/firestore';
import { GUEST_STATUS } from '../lib/constants';
import { DateField, TimeField, Label } from './pickers';
import { KAKAO_JS_KEY } from '../lib/keys';
import { geocodeAddress } from '../lib/kakao';
import { KakaoMapCourts } from './KakaoMapCourts';
import {
  ALL_COURTS, SURFACE_FILTERS, searchCourts, courtSidos, courtGungus, courtDongs,
  courtLink, linkKind, courtRegionText,
} from '../lib/courtData';
import { Card, SectionTitle, Chip, Btn, Field, Avatar } from './ui';
import { C, R, F } from '../lib/theme';

const today = () => new Date().toISOString().slice(0, 10);
const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ---------------- 게시판 ---------------- */
export function Board({ clubId, posts, meVal, me, isAdmin, flash }) {
  const [np, setNp] = useState({ type: 'free', title: '', body: '' });
  const [cmt, setCmt] = useState({});
  const sorted = [...posts].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  return (
    <View>
      <Card>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {isAdmin && <Chip tone={np.type === 'notice' ? 'green' : 'outline'} onPress={() => setNp({ ...np, type: 'notice' })}>공지</Chip>}
          <Chip tone={np.type === 'free' ? 'green' : 'outline'} onPress={() => setNp({ ...np, type: 'free' })}>자유</Chip>
        </View>
        <View style={{ marginTop: 8 }}><Field placeholder="제목" value={np.title} onChangeText={(t) => setNp({ ...np, title: t })} /></View>
        <TextInput placeholder="내용" placeholderTextColor={C.faint} multiline value={np.body} onChangeText={(t) => setNp({ ...np, body: t })}
          style={{ backgroundColor: '#f5f5f4', borderRadius: 12, padding: 12, fontSize: 14, height: 72, marginTop: 8, textAlignVertical: 'top', color: C.text }} />
        <View style={{ marginTop: 8 }}>
          <Btn full disabled={!np.title} onPress={() => {
            addPost(clubId, { type: np.type, title: np.title, body: np.body, author: meVal?.name || '', authorId: me, pinned: np.type === 'notice' });
            setNp({ type: 'free', title: '', body: '' });
            flash(np.type === 'notice' ? '공지 등록 (PHASE 3: 전체 푸시)' : '게시글 등록');
          }}>등록</Btn>
        </View>
      </Card>
      {sorted.map((p) => (
        <Card key={p.id} style={{ marginTop: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Chip tone={p.type === 'notice' ? 'lime' : 'default'}>{p.type === 'notice' ? '공지' : '자유'}</Chip>
            <Text style={{ fontWeight: '700', fontSize: 14 }}>{p.title}</Text>
          </View>
          <Text style={{ fontSize: 14, color: '#44403c', marginTop: 6 }}>{p.body}</Text>
          <Text style={{ fontSize: 10, color: C.faint, marginTop: 4 }}>{p.author} · {p.date}</Text>
          <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: '#f5f5f4', paddingTop: 8 }}>
            {(p.comments || []).map((c) => (
              <Text key={c.id || c.body} style={{ fontSize: 12, paddingVertical: 2 }}><Text style={{ fontWeight: '700' }}>{c.author}</Text> {c.body}</Text>
            ))}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <Field placeholder="댓글 달기" value={cmt[p.id] || ''} onChangeText={(t) => setCmt({ ...cmt, [p.id]: t })} style={{ flex: 1 }} />
              <Btn small tone="ghost" onPress={() => {
                if (!cmt[p.id]) return;
                addComment(clubId, p.id, { id: rid(), author: meVal?.name || '', body: cmt[p.id], date: today() });
                setCmt({ ...cmt, [p.id]: '' });
              }}>등록</Btn>
            </View>
          </View>
        </Card>
      ))}
    </View>
  );
}

/* ---------------- 게스트 모집 = 공개 게시판 (루트 guestPosts, FIX-05) ----------------
   모든 클럽·회원이 함께 보는 하나의 게시판이다.
   · 모집글은 클럽 운영진이 올리고, 신청은 어느 클럽 회원이든 할 수 있다.
   · 모집 조건(남/여 인원)과 신청자 성별을 비교해 "매칭" 배지를 띄운다.
   · 확정하면 모집 클럽의 해당 모임(guests)에 자동으로 들어가 대진에 포함된다. */

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const dateLabel = (d) => {
  if (!d) return '';
  const dt = new Date(`${d}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return d;
  return `${d.slice(5).replace('-', '.')}(${WEEK[dt.getDay()]})`;
};
const dday = (d) => {
  const diff = Math.round((new Date(`${d}T00:00:00`) - new Date(`${today()}T00:00:00`)) / 86400000);
  return diff <= 0 ? '오늘' : `D-${diff}`;
};

/** 모집 조건 요약 — 신규(needMale/needFemale) 우선, 구버전(need 문자열) 하위호환 */
function needSummary(post) {
  const m = post.needMale || 0;
  const f = post.needFemale || 0;
  if (m || f) return [m ? `남 ${m}` : null, f ? `여 ${f}` : null].filter(Boolean).join(' · ');
  return post.need || `${post.slots || 0}명`;
}
/** 내 성별이 아직 필요한 자리인가 */
function matchesMe(post, meVal, confirmed) {
  if (!meVal?.gender) return false;
  const m = post.needMale || 0;
  const f = post.needFemale || 0;
  if (!m && !f) return true; // 조건이 자유 서술이면 일단 매칭 후보
  const doneM = confirmed.filter((a) => a.gender === 'M').length;
  const doneF = confirmed.filter((a) => a.gender === 'F').length;
  return meVal.gender === 'F' ? doneF < f : doneM < m;
}

function GuestPostCard({ post, clubId, meetings, me, meVal, isAdmin, flash }) {
  const [applicants, setApplicants] = useState([]);
  useEffect(() => subApplicants(post.id, setApplicants), [post.id]);

  const isMyClub = post.clubId === clubId;
  const canManage = isAdmin && isMyClub;        // 모집 클럽 운영진만 확정·삭제
  const mine = applicants.find((a) => a.uid === me);
  const confirmed = applicants.filter((a) => a.status === GUEST_STATUS.CONFIRMED);
  const left = Math.max(0, (post.slots || 0) - confirmed.length);
  const fits = !mine && left > 0 && matchesMe(post, meVal, confirmed);

  const apply = () => {
    if (!meVal) return flash('프로필을 먼저 등록하세요');
    if (mine) return flash('이미 신청했습니다');
    applyToGuestPost(post.id, { uid: me, name: meVal.name, gender: meVal.gender, grade: meVal.grade || '', clubId });
    flash('참여 의사 전달. 확정되면 알림이 옵니다');
  };
  const confirm = (a) => {
    confirmApplicant(post.id, a.uid);
    // 모집글에 연결된 모임(없으면 같은 날짜 모임)에 게스트로 자동 포함 — uid 귀속
    const mt = meetings.find((m) => m.id === post.meetingId) || meetings.find((m) => m.date === post.date);
    if (mt && !(mt.guests || []).some((g) => g.uid === a.uid)) {
      updateMeeting(clubId, mt.id, {
        guests: [...(mt.guests || []), { uid: a.uid, name: a.name, gender: a.gender, grade: a.grade || '' }],
      });
    }
    flash(mt ? '게스트 확정! 해당 모임 대진에 자동 포함됩니다' : '게스트 확정! (연결된 모임을 찾지 못해 수동 추가 필요)');
  };

  return (
    <Card style={{ marginBottom: 12, padding: 0, overflow: 'hidden' }}>
      {/* 상단 띠 — 날짜/D-day/남은자리 */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: left > 0 ? C.ink : '#57534e', paddingHorizontal: 12, paddingVertical: 8,
      }}>
        <Text style={{ color: C.lime, fontSize: 13, fontWeight: '700' }}>{dateLabel(post.date)}</Text>
        {!!post.time && <Text style={{ color: '#BFE3D3', fontSize: 11 }}>{post.time}</Text>}
        <Text style={{ color: '#BFE3D3', fontSize: 10 }}>{dday(post.date)}</Text>
        <View style={{ marginLeft: 'auto', backgroundColor: left > 0 ? C.lime : '#a8a29e', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: C.ink }}>
            {left > 0 ? `${left}자리 남음` : '모집 완료'}
          </Text>
        </View>
      </View>

      <View style={{ padding: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={{ fontWeight: '700', fontSize: 14 }}>{post.clubName || '이름 없는 클럽'}</Text>
          {isMyClub && <Chip tone="outline">우리 클럽</Chip>}
          {fits && <Chip tone="lime">내 조건 맞음</Chip>}
        </View>

        <Text style={{ fontSize: 12, color: '#44403c', marginTop: 6 }}>
          📍 {post.place}{post.region ? ` · ${post.region}` : ''}
        </Text>
        <Text style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>
          모집 {needSummary(post)} · 게스트비 {(post.fee || 0).toLocaleString()}원
        </Text>
        {!!post.note && <Text style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>💬 {post.note}</Text>}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 10 }}>
          {applicants.map((a) => {
            const ok = a.status === GUEST_STATUS.CONFIRMED;
            return (
              <View key={a.uid} style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                backgroundColor: ok ? C.green : '#f5f5f4', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
              }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: ok ? C.lime : C.sub }}>
                  {a.name}{a.gender ? `(${a.gender === 'F' ? '여' : '남'})` : ''} {ok ? '✓확정' : '신청'}
                </Text>
                {canManage && !ok && (
                  <Pressable onPress={() => confirm(a)} hitSlop={6}>
                    <Text style={{ fontSize: 11, color: C.green2, textDecorationLine: 'underline' }}>확정</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
          {applicants.length === 0 && <Text style={{ fontSize: 11, color: C.faint }}>아직 신청자가 없습니다.</Text>}
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          {mine ? (
            <Btn small tone="ghost" onPress={() => { cancelApplication(post.id, me); flash('신청을 취소했습니다'); }}>신청 취소</Btn>
          ) : (
            <Btn small onPress={apply}>참여 의사 개진</Btn>
          )}
          {canManage && <Btn small tone="ghost" onPress={() => deleteGuestPost(post.id)}>모집글 삭제</Btn>}
        </View>
      </View>
    </Card>
  );
}

const EMPTY_NG = { meetingId: '', date: '', time: '', place: '', region: '', needMale: '1', needFemale: '1', note: '' };

export function Guest({ clubId, club, guestPosts, meetings, venues, me, meVal, isAdmin, flash }) {
  const [ng, setNg] = useState(EMPTY_NG);
  const [adding, setAdding] = useState(false);
  const [scope, setScope] = useState('all');   // all | mine | others
  const [region, setRegion] = useState(null);

  const regions = useMemo(
    () => [...new Set(guestPosts.map((p) => p.region).filter(Boolean))].sort(),
    [guestPosts],
  );
  const list = useMemo(() => guestPosts
    .filter((p) => (scope === 'mine' ? p.clubId === clubId : scope === 'others' ? p.clubId !== clubId : true))
    .filter((p) => !region || p.region === region)
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))),
  [guestPosts, scope, region, clubId]);

  /* 모집글 올릴 때 우리 클럽 예정 모임을 고르면 날짜·시간·장소가 자동으로 채워진다 */
  const upcoming = useMemo(
    () => meetings.filter((m) => !m.canceled && m.date >= today()).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8),
    [meetings],
  );
  const pickMeeting = (m) => {
    const v = (venues || []).find((x) => x.id === m.venueId);
    setNg({
      ...ng, meetingId: m.id, date: m.date, time: m.time || v?.startTime || '',
      place: m.place || v?.name || '', region: ng.region || v?.region || '',
    });
  };

  const submit = () => {
    const needMale = Number(ng.needMale) || 0;
    const needFemale = Number(ng.needFemale) || 0;
    addGuestPost({
      clubId, clubName: club?.name || '', meetingId: ng.meetingId || null,
      date: ng.date, time: ng.time || '', place: ng.place, region: ng.region,
      needMale, needFemale, slots: needMale + needFemale, note: ng.note,
      fee: club?.settings?.guestFee || 10000, authorId: me,
    });
    setNg(EMPTY_NG);
    setAdding(false);
    flash('모집글이 공개 게시판에 등록되었습니다');
  };

  return (
    <View>
      <Card style={{ backgroundColor: C.ink, borderColor: C.green }}>
        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>공개 게시판</Text>
        <Text style={{ color: '#BFE3D3', fontSize: 11, marginTop: 4, lineHeight: 16 }}>
          여기 올라온 모집글은 앱을 쓰는 모든 클럽·회원에게 보입니다.
          신청 후 모집 클럽 운영진이 확정하면 그 클럽 대진에 자동으로 들어가고,
          게스트로 뛴 경기 기록은 내 계정에 그대로 쌓입니다.
        </Text>
      </Card>

      {/* 필터 */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
        {[['all', '전체'], ['mine', '우리 클럽'], ['others', '다른 클럽']].map(([k, label]) => (
          <Chip key={k} tone={scope === k ? 'green' : 'outline'} onPress={() => setScope(k)}>{label}</Chip>
        ))}
      </View>
      {regions.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          <Chip tone={!region ? 'lime' : 'outline'} onPress={() => setRegion(null)}>전 지역</Chip>
          {regions.map((r) => (
            <Chip key={r} tone={region === r ? 'lime' : 'outline'} onPress={() => setRegion(r)}>{r}</Chip>
          ))}
        </View>
      )}

      <View style={{ marginTop: 12 }}>
        {list.map((post) => (
          <GuestPostCard key={post.id} {...{ post, clubId, meetings, me, meVal, isAdmin, flash }} />
        ))}
        {list.length === 0 && (
          <Card><Text style={{ fontSize: 12, color: C.sub }}>
            {guestPosts.length === 0 ? '진행 중인 게스트 모집이 없습니다.' : '조건에 맞는 모집글이 없습니다. 필터를 바꿔보세요.'}
          </Text></Card>
        )}
      </View>

      {isAdmin && (
        <>
          <SectionTitle right={
            <Chip tone={adding ? 'green' : 'outline'} onPress={() => setAdding(!adding)}>{adding ? '닫기' : '+ 모집글'}</Chip>
          }>게스트 모집글 올리기</SectionTitle>
          {adding && (
            <Card>
              {upcoming.length > 0 && (
                <>
                  <Label hint="고르면 날짜·시간·장소가 자동 입력됩니다">우리 클럽 예정 모임</Label>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    {upcoming.map((m) => (
                      <Chip key={m.id} tone={ng.meetingId === m.id ? 'green' : 'outline'} onPress={() => pickMeeting(m)}>
                        {dateLabel(m.date)} {m.time || ''}
                      </Chip>
                    ))}
                  </View>
                </>
              )}

              <Label>날짜</Label>
              <DateField value={ng.date} onChange={(v) => setNg({ ...ng, date: v, meetingId: '' })} minDate={today()} />

              <View style={{ marginTop: 8 }}>
                <Label hint="선택">시작 시간</Label>
                <TimeField value={ng.time} onChange={(v) => setNg({ ...ng, time: v })} />
              </View>

              <View style={{ marginTop: 8 }}>
                <Label>장소</Label>
                <Field placeholder="예: 과천시민회관 테니스장" value={ng.place} onChangeText={(t) => setNg({ ...ng, place: t })} />
              </View>
              <View style={{ marginTop: 8 }}>
                <Label hint="다른 클럽이 지역으로 검색합니다">지역</Label>
                <Field placeholder="예: 경기 과천시" value={ng.region} onChangeText={(t) => setNg({ ...ng, region: t })} />
              </View>

              <View style={{ marginTop: 8 }}>
                <Label hint="성별로 나눠 적으면 자동 매칭됩니다">모집 인원</Label>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 10, color: C.male, marginBottom: 4, fontWeight: '700' }}>남</Text>
                    <Field keyboardType="number-pad" value={ng.needMale} onChangeText={(t) => setNg({ ...ng, needMale: t })} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 10, color: C.female, marginBottom: 4, fontWeight: '700' }}>여</Text>
                    <Field keyboardType="number-pad" value={ng.needFemale} onChangeText={(t) => setNg({ ...ng, needFemale: t })} />
                  </View>
                </View>
              </View>

              <View style={{ marginTop: 8 }}>
                <Label hint="선택">추가 조건·안내</Label>
                <Field placeholder="예: C조 이상 · 볼값 별도" value={ng.note} onChangeText={(t) => setNg({ ...ng, note: t })} />
              </View>

              <View style={{ marginTop: 12 }}>
                <Btn full disabled={!ng.date || !ng.place || (!Number(ng.needMale) && !Number(ng.needFemale))} onPress={submit}>
                  공개 게시판에 등록
                </Btn>
              </View>
              <Text style={{ fontSize: 10, color: C.faint, marginTop: 6 }}>
                게스트비는 클럽 설정의 게스트비({(club?.settings?.guestFee || 10000).toLocaleString()}원)가 자동으로 붙습니다.
              </Text>
            </Card>
          )}
        </>
      )}
    </View>
  );
}

/* ---------------- 코트 검색 ----------------

   지역을 시/도 → 시·군·구 → 동 순으로 좁힌다. 아래 단계를 안 고르면
   그 위 단계 전체가 검색된다(서울만 골라도 서울 전부가 나온다).
   표면(하드·클레이·인조잔디)으로도 걸러 볼 수 있다.

   예약 링크는 기관 대문이 아니라 예약 화면으로 보낸다.
   정확한 주소를 아는 코트는 [예약하기], 검색 결과로 보내는 코트는
   [예약 찾기]로 구분해 표시한다.                                   */
export function Courts({ clubId, courts, isAdmin, flash }) {
  const [sido, setSido] = useState(null);
  const [gungu, setGungu] = useState(null);
  const [dong, setDong] = useState(null);
  const [surfaces, setSurfaces] = useState([]);
  const [keyword, setKeyword] = useState('');
  const [nc, setNc] = useState({ sido: '', gu: '', name: '', addr: '', surface: '하드', link: '' });

  /* 클럽이 직접 등록한 코트도 같은 목록에서 함께 검색되게 합친다 */
  const merged = useMemo(() => [
    ...ALL_COURTS,
    ...(courts || []).map((c) => ({
      ...c, gungu: c.gungu || c.gu || '', dong: c.dong || '', operator: c.operator || '클럽 등록', mine: true,
    })),
  ], [courts]);

  const sidos = useMemo(() => courtSidos(merged), [merged]);
  const gungus = useMemo(() => (sido ? courtGungus(sido, merged) : []), [sido, merged]);
  const dongs = useMemo(() => (sido && gungu ? courtDongs(sido, gungu, merged) : []), [sido, gungu, merged]);
  const list = useMemo(
    () => searchCourts({ sido, gungu, dong, surfaces, keyword }, merged),
    [sido, gungu, dong, surfaces, keyword, merged],
  );

  const toggleSurface = (s) =>
    setSurfaces((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const openCourt = (c) => {
    const url = courtLink(c);
    if (!url) return flash('이 코트는 등록된 예약 링크가 없습니다');
    return Linking.openURL(url);
  };

  return (
    <View>
      {/* 1단계: 시/도 */}
      <Label hint="아래 단계를 안 골라도 검색됩니다">지역</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Chip tone={!sido ? 'green' : 'outline'}
          onPress={() => { setSido(null); setGungu(null); setDong(null); }}>전체</Chip>
        {sidos.map((s) => (
          <Chip key={s} tone={sido === s ? 'green' : 'outline'}
            onPress={() => { setSido(s); setGungu(null); setDong(null); }}>{s}</Chip>
        ))}
      </View>

      {/* 2단계: 시·군·구 */}
      {!!sido && gungus.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          <Chip tone={!gungu ? 'soft' : 'outline'}
            onPress={() => { setGungu(null); setDong(null); }}>{sido} 전체</Chip>
          {gungus.map((g) => (
            <Chip key={g} tone={gungu === g ? 'soft' : 'outline'}
              onPress={() => { setGungu(g); setDong(null); }}>{g}</Chip>
          ))}
        </View>
      )}

      {/* 3단계: 동 — 그 구에 코트가 있는 동만 나온다 */}
      {!!gungu && dongs.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          <Chip tone={!dong ? 'soft' : 'outline'} onPress={() => setDong(null)}>{gungu} 전체</Chip>
          {dongs.map((d) => (
            <Chip key={d} tone={dong === d ? 'soft' : 'outline'} onPress={() => setDong(d)}>{d}</Chip>
          ))}
        </View>
      )}

      {/* 코트 종류 */}
      <View style={{ marginTop: 14 }}>
        <Label hint="여러 개 고를 수 있습니다">코트 종류</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <Chip tone={surfaces.length === 0 ? 'green' : 'outline'} onPress={() => setSurfaces([])}>전체</Chip>
          {SURFACE_FILTERS.map((s) => (
            <Chip key={s} tone={surfaces.includes(s) ? 'green' : 'outline'}
              onPress={() => toggleSurface(s)}>{s}</Chip>
          ))}
        </View>
      </View>

      <View style={{ marginTop: 12 }}>
        <Field placeholder="코트명 검색 (예: 올림픽공원)" value={keyword} onChangeText={setKeyword} />
      </View>

      {/* 지도 — 카카오 JS 키가 있어야 실지도가 뜬다 */}
      <View style={{ marginTop: 12 }}><KakaoMapCourts courts={list} /></View>

      <SectionTitle hint={`${list.length}곳`}>
        {[sido, gungu, dong].filter(Boolean).join(' ') || '전체 지역'}
      </SectionTitle>

      {list.length === 0 && (
        <Card>
          <Text style={{ fontSize: 12, color: C.sub, lineHeight: 18 }}>
            조건에 맞는 코트가 없습니다. 지역이나 코트 종류를 넓혀 보세요.
          </Text>
        </Card>
      )}

      {list.map((c, i) => (
        <Card key={`${c.sido}${c.name}${i}`} style={{ marginTop: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={F.bodyBold} numberOfLines={2}>{c.name}</Text>
              <Text style={{ fontSize: 11, color: C.sub, marginTop: 3 }}>
                {courtRegionText(c)}{c.addr ? ` · ${c.addr}` : ''}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                <Chip tone="outline">{c.surface || '하드'}</Chip>
                {!!c.indoor && <Chip tone="soft">실내</Chip>}
                {c.courts > 0 && <Chip tone="outline">{c.courts}면</Chip>}
                {!!c.mine && <Chip tone="soft">우리 클럽 등록</Chip>}
              </View>
              {!!c.operator && (
                <Text style={{ fontSize: 10, color: C.faint, marginTop: 6 }}>{c.operator}</Text>
              )}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              {courtLink(c) ? (
                <Pressable onPress={() => openCourt(c)}
                  style={{
                    backgroundColor: linkKind(c) === 'exact' ? C.green : C.fill,
                    paddingHorizontal: 12, paddingVertical: 8, borderRadius: R.pill,
                  }}>
                  <Text style={{
                    fontSize: 11.5, fontWeight: '700',
                    color: linkKind(c) === 'exact' ? '#fff' : C.sub,
                  }}>
                    {linkKind(c) === 'exact' ? '예약하기' : '예약 찾기'}
                  </Text>
                </Pressable>
              ) : null}
              {isAdmin && c.mine && (
                <Pressable onPress={() => deleteCourt(clubId, c.id)}>
                  <Text style={{ fontSize: 11, color: C.faint }}>삭제</Text>
                </Pressable>
              )}
            </View>
          </View>
        </Card>
      ))}

      <Text style={{ fontSize: 10, color: C.faint, marginTop: 14, lineHeight: 16 }}>
        면수·운영시간은 바뀔 수 있습니다. 예약 전에 링크에서 확인하세요.
        {'\n'}[예약하기]는 예약 화면으로 바로, [예약 찾기]는 그 기관 검색 결과로 이동합니다.
      </Text>

      {isAdmin && (
        <>
          <SectionTitle hint="목록에 없는 코트를 우리 클럽 것으로 추가합니다">코트 추가</SectionTitle>
          <Card>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Field placeholder="시/도" value={nc.sido} onChangeText={(t) => setNc({ ...nc, sido: t })} style={{ flex: 1 }} />
              <Field placeholder="시/군/구" value={nc.gu} onChangeText={(t) => setNc({ ...nc, gu: t })} style={{ flex: 1 }} />
            </View>
            <View style={{ marginTop: 8 }}><Field placeholder="코트명" value={nc.name} onChangeText={(t) => setNc({ ...nc, name: t })} /></View>
            <View style={{ marginTop: 8 }}><Field placeholder="주소" value={nc.addr} onChangeText={(t) => setNc({ ...nc, addr: t })} /></View>
            <View style={{ marginTop: 8 }}>
              <Label>코트 종류</Label>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {SURFACE_FILTERS.map((s) => (
                  <Chip key={s} tone={nc.surface === s ? 'green' : 'outline'}
                    onPress={() => setNc({ ...nc, surface: s })}>{s}</Chip>
                ))}
              </View>
            </View>
            <View style={{ marginTop: 8 }}>
              <Field placeholder="예약 페이지 링크 (https://…)" value={nc.link} onChangeText={(t) => setNc({ ...nc, link: t })} />
            </View>
            <View style={{ marginTop: 12 }}>
              <Btn full disabled={!nc.name || !nc.sido} onPress={async () => {
                const geo = await geocodeAddress(nc.addr); // 카카오 REST 키 있으면 좌표 자동 저장
                addCourt(clubId, { ...nc, gungu: nc.gu, indoor: false, ...(geo || {}) });
                setNc({ sido: '', gu: '', name: '', addr: '', surface: '하드', link: '' });
                flash(geo ? '코트 등록됨 (지도 좌표 포함)' : '코트 등록됨');
              }}>코트 등록</Btn>
            </View>
          </Card>
        </>
      )}
    </View>
  );
}
