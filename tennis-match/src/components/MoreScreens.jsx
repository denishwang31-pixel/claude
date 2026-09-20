/* 클럽 공지 / 게스트 모집(공개 게시판) / 코트 검색 서브화면 묶음 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, Linking } from 'react-native';
import {
  addPost, addComment, addGuestPost, deleteGuestPost, applyToGuestPost, cancelApplication,
  confirmApplicant, subApplicants, updateMeeting, addCourt, deleteCourt,
  subClubDirectory, subCoaches, reportCourt, REPORT_KINDS,
} from '../lib/firestore';
import { GUEST_STATUS } from '../lib/constants';
import { RegionPicker } from './RegionPicker';
import {
  POST_KIND, POST_KINDS, kindOf, kindLabel, kindsFor, canPost,
  AUDIENCE, AUDIENCE_LABEL, audienceOf, canBePublic, defaultAudience,
  safeAudience, isExpired, sortPosts, filterPosts, countByKind,
} from '../lib/board';
import { DateField, TimeField, Label } from './pickers';
import { KAKAO_JS_KEY } from '../lib/keys';
import { geocodeAddress } from '../lib/kakao';
import { KakaoMapCourts } from './KakaoMapCourts';
import {
  ALL_COURTS, SURFACE_FILTERS, searchCourts, courtSidos, courtGungus, courtDongs,
  courtLink, linkKind, courtRegionText, courtDataNote,
} from '../lib/courtData';
import { buildCourtIndex, courtInfo, courtInfoLine, lessonsByDay } from '../lib/courtInfo';
import { publicCoaches, lessonSlotText } from '../lib/coach';
import { useOptionSheet } from './native';
import { Card, SectionTitle, Chip, Btn, Field, Avatar } from './ui';
import { C, R, F } from '../lib/theme';

const today = () => new Date().toISOString().slice(0, 10);
const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ---------------- 게시판 ----------------

   말머리(공지·코트 양도·대회 멤버 모집·회원 모집·자유)로 한 게시판을
   나눠 쓴다. 왜 게시판을 여러 개로 쪼개지 않았는지는 src/lib/board.js
   머리말에 적어 두었다.

   판단(누가 무엇을 쓸 수 있나, 지난 글인가, 어떤 순서인가)은 전부
   board.js 에 있다. 화면은 그 결과를 그리기만 한다 — 화면에 규칙을
   적으면 검사로 확인할 수가 없다.                                  */
export function Board({ clubId, club, posts, publicPosts = [], meVal, me, isAdmin, flash }) {
  const myKinds = kindsFor(isAdmin);
  const [np, setNp] = useState({
    kind: POST_KIND.FREE, title: '', body: '', eventDate: '',
    audience: defaultAudience(POST_KIND.FREE),
  });
  const [cmt, setCmt] = useState({});
  const [filter, setFilter] = useState('');
  const [writing, setWriting] = useState(false);

  const t = today();
  /* 우리 클럽 글 + 다른 클럽이 공개로 올린 글.
     ⚠️ 우리 글은 경로로, 남의 글은 컬렉션 그룹으로 읽어 와서 두 갈래다.
        subPublicPosts 가 우리 clubId 것을 이미 빼고 주므로 여기서
        겹치지 않는다. */
  const all = useMemo(() => [...posts, ...publicPosts], [posts, publicPosts]);
  const counts = useMemo(() => countByKind(all), [all]);
  const list = useMemo(
    () => sortPosts(filterPosts(all, filter), t),
    [all, filter, t],
  );

  const kindSpec = kindOf(np.kind);
  /* 날짜가 필요한 말머리(양도·대회 멤버)는 날짜 없이 못 올린다.
     "언제"가 없으면 그 글은 아무 쓸모가 없다. */
  const canSubmit = !!np.title.trim()
    && canPost(np.kind, isAdmin)
    && (!kindSpec.needsDate || !!np.eventDate);

  const submit = () => {
    addPost(clubId, {
      kind: np.kind,
      /* ⚠️ 화면이 고른 값을 그대로 믿지 않는다. 말머리를 '코트 양도 +
         공개'로 골라 두고 '공지'로 바꾸면 공개인 채로 남는데, 그대로
         저장하면 클럽 공지가 전국에 뜬다. 저장 직전에 한 번 더 본다. */
      audience: safeAudience(np.kind, np.audience),
      clubName: club?.name || '',
      /* ⚠️ type 도 같이 남긴다. 예전 글과 예전 코드가 type 을 보고
         공지 여부를 가린다. 한쪽만 쓰면 예전 화면에서 공지가 평범한
         글로 보인다. 나중에 정리할 때 한 번에 걷어낼 것. */
      type: np.kind === POST_KIND.NOTICE ? 'notice' : 'free',
      title: np.title.trim(),
      body: np.body,
      eventDate: np.eventDate || '',
      author: meVal?.name || '',
      authorId: me,
      pinned: np.kind === POST_KIND.NOTICE,
    });
    setNp({
      kind: POST_KIND.FREE, title: '', body: '', eventDate: '',
      audience: defaultAudience(POST_KIND.FREE),
    });
    setWriting(false);
    flash(`${kindLabel(np.kind)} 글을 올렸습니다`);
  };

  return (
    <View>
      {/* 말머리 거르개 — 숫자를 같이 적어 "여기 뭐가 있나"를 알려 준다 */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Chip tone={!filter ? 'green' : 'outline'} onPress={() => setFilter('')}>
          전체 {posts.length}
        </Chip>
        {POST_KINDS.map((k) => (
          <Chip key={k.key} tone={filter === k.key ? 'green' : 'outline'}
            onPress={() => setFilter(k.key)}>
            {k.label} {counts[k.key] || 0}
          </Chip>
        ))}
      </View>

      <SectionTitle right={
        <Chip tone={writing ? 'green' : 'outline'} onPress={() => setWriting(!writing)}>
          {writing ? '닫기' : '+ 글쓰기'}
        </Chip>
      }>글 올리기</SectionTitle>

      {writing && (
        <Card>
          <Label>말머리</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {myKinds.map((k) => (
              <Chip key={k.key} tone={np.kind === k.key ? 'green' : 'outline'}
                onPress={() => setNp({
                  ...np, kind: k.key,
                  /* 말머리를 바꾸면 공개 범위도 그 말머리의 기본값으로
                     되돌린다. 안 그러면 공지를 공개로 올리게 된다. */
                  audience: defaultAudience(k.key),
                })}>
                {k.label}
              </Chip>
            ))}
          </View>

          {kindSpec.needsDate && (
            <View style={{ marginTop: 10 }}>
              <Label hint={np.kind === POST_KIND.COURT ? '코트를 쓰는 날' : '대회 날짜'}>
                날짜
              </Label>
              <DateField value={np.eventDate} minDate={t}
                onChange={(v) => setNp({ ...np, eventDate: v })} />
            </View>
          )}

          {/* 공개 범위. 밖에 낼 수 있는 말머리일 때만 고를 수 있다 —
              공지·자유글은 클럽 안의 이야기라 선택지를 주지 않는다.
              고를 수 없을 때도 지금 어디까지 보이는지는 적어 준다. */}
          <View style={{ marginTop: 10 }}>
            <Label hint="올린 뒤에는 바꿀 수 없습니다">누가 볼 수 있나</Label>
            {canBePublic(np.kind) ? (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {[AUDIENCE.PUBLIC, AUDIENCE.CLUB].map((a2) => (
                  <Chip key={a2} tone={np.audience === a2 ? 'green' : 'outline'}
                    onPress={() => setNp({ ...np, audience: a2 })}>
                    {AUDIENCE_LABEL[a2]}
                  </Chip>
                ))}
              </View>
            ) : (
              <Text style={{ fontSize: 12, color: C.sub, lineHeight: 18 }}>
                우리 클럽 회원만 — {kindLabel(np.kind)}은(는) 클럽 안의
                이야기라 밖으로 나가지 않습니다.
              </Text>
            )}
          </View>

          <View style={{ marginTop: 10 }}>
            <Field placeholder="제목" value={np.title}
              onChangeText={(x) => setNp({ ...np, title: x })} />
          </View>
          <TextInput placeholder="내용" placeholderTextColor={C.faint} multiline
            value={np.body} onChangeText={(x) => setNp({ ...np, body: x })}
            style={{
              backgroundColor: C.fill, borderRadius: 12, padding: 12, fontSize: 14,
              height: 84, marginTop: 8, textAlignVertical: 'top', color: C.text,
            }} />
          <View style={{ marginTop: 10 }}>
            <Btn full disabled={!canSubmit} onPress={submit}>등록</Btn>
          </View>
          {kindSpec.needsDate && !np.eventDate && (
            <Text style={{ fontSize: 11, color: C.faint, marginTop: 6 }}>
              날짜를 넣어야 올릴 수 있습니다. 언제인지 없으면 보는 사람이
              연락할지 말지를 정할 수 없습니다.
            </Text>
          )}
        </Card>
      )}

      {list.map((p) => {
        const gone = isExpired(p, t);
        return (
          <Card key={p.id} style={{ marginTop: 12, opacity: gone ? 0.5 : 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Chip tone={p.pinned ? 'lime' : 'default'}>{kindLabel(p.kind ?? p.type)}</Chip>
              {/* 다른 클럽 글이면 어느 클럽인지 밝힌다 — 안 적으면 우리
                  클럽 회원 모집으로 오해한다 */}
              {p.clubId && p.clubId !== clubId && (
                <Chip tone="outline">{p.clubName || '다른 클럽'}</Chip>
              )}
              {p.clubId === clubId && audienceOf(p) === AUDIENCE.PUBLIC && (
                <Chip tone="outline">전체 공개</Chip>
              )}
              {gone && <Chip tone="default">지난 글</Chip>}
              <Text style={{ fontWeight: '700', fontSize: 14, flexShrink: 1 }}>{p.title}</Text>
            </View>
            {!!p.eventDate && (
              <Text style={{ fontSize: 12, color: gone ? C.faint : C.green, marginTop: 4, fontWeight: '700' }}>
                {dateLabel(p.eventDate)}
              </Text>
            )}
            <Text style={{ fontSize: 14, color: C.text, marginTop: 6 }}>{p.body}</Text>
            <Text style={{ fontSize: 10, color: C.faint, marginTop: 4 }}>{p.author} · {p.date}</Text>
            {/* ⚠️ 댓글은 우리 클럽 글에만 달 수 있다. 남의 클럽 글은
                보안 규칙이 쓰기를 막는다 — 칸을 그려 두면 눌러도 안 되는
                버튼이 되고, 그게 제일 나쁘다. */}
            {p.clubId === clubId && (
            <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: C.fill, paddingTop: 8 }}>
              {(p.comments || []).map((c) => (
                <Text key={c.id || c.body} style={{ fontSize: 12, paddingVertical: 2 }}>
                  <Text style={{ fontWeight: '700' }}>{c.author}</Text> {c.body}
                </Text>
              ))}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <Field placeholder="댓글 달기" value={cmt[p.id] || ''}
                  onChangeText={(x) => setCmt({ ...cmt, [p.id]: x })} style={{ flex: 1 }} />
                <Btn small tone="ghost" onPress={() => {
                  if (!cmt[p.id]) return;
                  addComment(clubId, p.id, {
                    id: rid(), author: meVal?.name || '', body: cmt[p.id], date: today(),
                  });
                  setCmt({ ...cmt, [p.id]: '' });
                }}>등록</Btn>
              </View>
            </View>
            )}
          </Card>
        );
      })}

      {list.length === 0 && (
        <Card style={{ marginTop: 12 }}>
          <Text style={{ fontSize: 12, color: C.sub }}>
            {posts.length === 0
              ? '아직 올라온 글이 없습니다. 첫 글을 올려 보세요.'
              : '이 말머리에는 아직 글이 없습니다.'}
          </Text>
        </Card>
      )}
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
          모집 {needSummary(post)}
          {/* ⚠️ 금액이 없으면 "0원"이라고 적지 않는다. 0원은 공짜라는
              뜻인데, 실제로는 그냥 안 적은 것이다. 공짜인 줄 알고 온
              사람에게 코트비를 받으면 그 자리에서 다툼이 된다. */}
          {post.fee > 0 ? ` · 코트비 ${post.fee.toLocaleString()}원` : ' · 코트비 문의'}
        </Text>
        {post.audience === GUEST_AUDIENCE.CLUB && (
          <Text style={{ fontSize: 11, color: C.green, marginTop: 2, fontWeight: '700' }}>
            우리 클럽 회원만 보이는 글
          </Text>
        )}
        {!!post.note && <Text style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>💬 {post.note}</Text>}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 10 }}>
          {applicants.map((a) => {
            const ok = a.status === GUEST_STATUS.CONFIRMED;
            return (
              <View key={a.uid} style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                backgroundColor: ok ? C.green : '#f5f5f4', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
              }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: ok ? '#fff' : C.sub }}>
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

const EMPTY_NG = {
  meetingId: '', date: '', time: '', place: '', venueId: '', region: '',
  needMale: '1', needFemale: '1', note: '', fee: '', audience: 'public',
};

/* 모집글을 누구에게 보일 것인가.
   ⚠️ 위쪽 필터(전체/우리 클럽/다른 클럽)와 다른 것이다. 저건 "내가
      무엇을 볼까"이고 이건 "내 글을 누가 볼까"다. 예전에는 후자가
      아예 없어서, 클럽 안에서만 구하고 싶어도 전국에 공개됐다. */
export const GUEST_AUDIENCE = { PUBLIC: 'public', CLUB: 'club' };
const AUDIENCE_OPTS = [
  [GUEST_AUDIENCE.PUBLIC, '모든 클럽', '앱을 쓰는 다른 클럽 회원도 신청할 수 있습니다'],
  [GUEST_AUDIENCE.CLUB, '우리 클럽만', '우리 클럽 회원에게만 보입니다'],
];

export function Guest({
  clubId, club, guestPosts, meetings, venues, me, meVal, isAdmin, flash, draft = null,
}) {
  const [ng, setNg] = useState(EMPTY_NG);
  const [adding, setAdding] = useState(false);

  /* 대진 화면의 [게스트 모집]에서 넘어온 경우 — 필요한 성비까지 채워서
     모집 폼을 바로 열어 준다. 총무가 다시 입력할 필요가 없다. */
  useEffect(() => {
    if (!draft?.meetingId) return;
    const m = meetings.find((x) => x.id === draft.meetingId);
    const v = (venues || []).find((x) => x.id === m?.venueId);
    setNg({
      ...EMPTY_NG,
      meetingId: draft.meetingId,
      date: m?.date || '',
      time: m?.time || '',
      /* 장소는 그 모임이 쓰는 코트장 이름으로 채운다 — 손으로 다시
         적게 하면 같은 코트가 여러 이름으로 올라간다. */
      venueId: m?.venueId || '',
      place: m?.place || v?.name || '',
      region: v?.region || club?.settings?.region || '',
      fee: String(club?.settings?.guestFee ?? ''),
      needMale: String(draft.needM || 0),
      needFemale: String(draft.needF || 0),
      note: draft.text || '',
    });
    setAdding(true);
  }, [draft?.meetingId, draft?.needM, draft?.needF]);
  const [region, setRegion] = useState(null);

  const regions = useMemo(
    () => [...new Set(guestPosts.map((p) => p.region).filter(Boolean))].sort(),
    [guestPosts],
  );
  /* ⚠️ 위쪽의 전체/우리 클럽/다른 클럽 칩을 없앴다. 그건 "내가 무엇을
     볼까"였는데, 정작 필요한 것은 글쓴이가 정하는 "내 글을 누가 볼까"
     였다. 이제 그 선택은 모집글을 쓸 때 고른다(audience).

     목록은 그 선택을 존중해서 그린다 — 우리 클럽만으로 올린 글은
     우리 클럽 사람에게만 보인다. 예전 글에는 audience 가 없는데,
     그건 전부 공개로 올라간 글이므로 공개로 본다. */
  const list = useMemo(() => guestPosts
    .filter((p) => p.audience !== GUEST_AUDIENCE.CLUB || p.clubId === clubId)
    .filter((p) => !region || p.region === region)
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))),
  [guestPosts, region, clubId]);

  /* 모집글 올릴 때 우리 클럽 예정 모임을 고르면 날짜·시간·장소가 자동으로 채워진다 */
  const upcoming = useMemo(
    () => meetings.filter((m) => !m.canceled && m.date >= today()).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8),
    [meetings],
  );
  const pickMeeting = (m) => {
    const v = (venues || []).find((x) => x.id === m.venueId);
    setNg({
      ...ng, meetingId: m.id, date: m.date, time: m.time || v?.startTime || '',
      /* ⚠️ 장소는 그 모임의 코트장 이름을 그대로 쓴다. 손으로 적게 하면
         "과천시민회관", "과천 시민회관", "시민회관"이 따로 올라오고,
         신청자는 같은 코트인지 알 수가 없다. */
      venueId: m.venueId || '', place: m.place || v?.name || '',
      region: ng.region || v?.region || club?.settings?.region || '',
    });
  };

  /* 코트장을 직접 고르는 길 — 모임을 안 고르고 올릴 때 쓴다 */
  const pickVenue = (v) => {
    setNg({
      ...ng, venueId: v.id, place: v.name,
      time: ng.time || v.startTime || '',
      region: ng.region || v.region || club?.settings?.region || '',
    });
  };

  const submit = () => {
    const needMale = Number(ng.needMale) || 0;
    const needFemale = Number(ng.needFemale) || 0;
    /* ⚠️ 코트비는 **적은 대로** 올린다. 예전에는 클럽 설정값(기본 1만원)을
       자동으로 붙였는데, 코트비는 코트·시간대·인원에 따라 매번 다르다.
       글에 적힌 금액과 실제로 받는 금액이 다르면 그 자리에서 다툼이 된다.
       빈칸이면 클럽 설정값을 쓰되, 그것도 없으면 0(= 표시 안 함)이다.
       지어낸 숫자를 적어 두는 것보다 안 적는 편이 낫다. */
    const typed = String(ng.fee).replace(/[^0-9]/g, '');
    const fee = typed !== '' ? Number(typed) : Number(club?.settings?.guestFee || 0);
    addGuestPost({
      clubId, clubName: club?.name || '', meetingId: ng.meetingId || null,
      date: ng.date, time: ng.time || '', place: ng.place,
      venueId: ng.venueId || null,
      region: ng.region,
      needMale, needFemale, slots: needMale + needFemale, note: ng.note,
      fee, audience: ng.audience, authorId: me,
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

      {/* 지역 필터 — 클럽 안/밖 칩은 없앴다(글쓴이가 정한다) */}
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
                <Label hint="우리 클럽 코트장에서 고릅니다">장소</Label>
                {(venues || []).length > 0 ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {venues.map((v) => (
                      <Chip key={v.id} tone={ng.venueId === v.id ? 'green' : 'outline'} onPress={() => pickVenue(v)}>
                        {v.name}
                      </Chip>
                    ))}
                  </View>
                ) : (
                  /* 코트장을 아직 등록 안 한 클럽도 있다. 그때까지는
                     손으로 적을 수 있어야 글을 올릴 수 있다. */
                  <Field placeholder="예: 과천시민회관 테니스장" value={ng.place}
                    onChangeText={(t) => setNg({ ...ng, place: t, venueId: '' })} />
                )}
              </View>
              <View style={{ marginTop: 8 }}>
                <Label hint="다른 클럽이 지역으로 검색합니다">지역</Label>
                <RegionPicker value={ng.region} onChange={(v) => setNg({ ...ng, region: v })} labels={false} />
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
                <Label hint="1인당 · 비워 두면 안 적힙니다">코트비</Label>
                <Field keyboardType="number-pad" placeholder="예: 10000"
                  value={ng.fee}
                  onChangeText={(t) => setNg({ ...ng, fee: t.replace(/[^0-9]/g, '') })}
                  suffix="원" />
              </View>

              <View style={{ marginTop: 8 }}>
                <Label hint="올린 뒤에는 바꿀 수 없습니다">누가 볼 수 있나</Label>
                <View style={{ gap: 6 }}>
                  {AUDIENCE_OPTS.map(([k, label, hint]) => (
                    <Chip key={k} tone={ng.audience === k ? 'green' : 'outline'}
                      onPress={() => setNg({ ...ng, audience: k })}>
                      {label} · {hint}
                    </Chip>
                  ))}
                </View>
              </View>

              <View style={{ marginTop: 8 }}>
                <Label hint="선택">추가 조건·안내</Label>
                <Field placeholder="예: C조 이상 · 볼값 별도" value={ng.note} onChangeText={(t) => setNg({ ...ng, note: t })} />
              </View>

              <View style={{ marginTop: 12 }}>
                <Btn full disabled={!ng.date || !ng.place || !ng.region || (!Number(ng.needMale) && !Number(ng.needFemale))} onPress={submit}>
                  공개 게시판에 등록
                </Btn>
              </View>
              <Text style={{ fontSize: 10, color: C.faint, marginTop: 6 }}>
                코트비를 비워 두면 클럽 설정값
                ({Number(club?.settings?.guestFee || 0).toLocaleString()}원)을 씁니다.
                그것도 0이면 글에 금액이 안 적힙니다.
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
/* 코트 한 곳에 붙는 "누가 있는가" — 눌러야 펼쳐진다.
   목록에서 늘 펼쳐 두면 코트 500곳이 전부 길어져 훑기가 어려워진다. */
function CourtWho({ info, expanded, onToggle }) {
  const line = courtInfoLine(info);
  if (!line) return null;

  const byDay = lessonsByDay(info.lessons);
  const days = ['월', '화', '수', '목', '금', '토', '일'].filter((d) => byDay[d]?.length);

  return (
    <View style={{ marginTop: 8 }}>
      <Pressable onPress={onToggle}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}>
        <Chip tone="green">{line}</Chip>
        <Text style={{ fontSize: 11, color: C.green2, fontWeight: '700' }}>
          {expanded ? '접기' : '보기'}
        </Text>
      </Pressable>

      {expanded && (
        <View style={{ marginTop: 4 }}>
          {info.clubs.length > 0 && (
            <View style={{ marginTop: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: C.sub }}>운영 중인 클럽</Text>
              {info.clubs.map((c) => (
                <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 }}>
                  <Text style={{ fontSize: 12.5, color: C.text, fontWeight: '700' }}>{c.name}</Text>
                  <Text style={{ fontSize: 11, color: C.faint }}>
                    {c.region || ''}{c.memberCount ? ` · ${c.memberCount}명` : ''}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {info.coaches.length > 0 && (
            <View style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: C.sub }}>레슨 중인 코치</Text>
              {info.coaches.map((co) => (
                <View key={co.id} style={{ marginTop: 4 }}>
                  <Text style={{ fontSize: 12.5, color: C.text, fontWeight: '700' }}>
                    {co.name}
                    {co.phone ? <Text style={{ fontWeight: '400', color: C.faint }}>  {co.phone}</Text> : null}
                  </Text>
                  {!!co.intro && (
                    <Text style={{ fontSize: 11, color: C.sub }} numberOfLines={1}>{co.intro}</Text>
                  )}
                </View>
              ))}
            </View>
          )}

          {days.length > 0 && (
            <View style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: C.sub }}>레슨 시간</Text>
              {days.map((d) => (
                <View key={d} style={{ flexDirection: 'row', marginTop: 4, gap: 8 }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: C.green, width: 16 }}>{d}</Text>
                  <View style={{ flex: 1 }}>
                    {byDay[d].map((l, i) => (
                      <Text key={`${l.coachId}${l.from}${i}`} style={{ fontSize: 11.5, color: C.text }}>
                        {[l.from, l.to].filter(Boolean).join('~')} · {l.coachName}
                        {l.note ? ` (${l.note})` : ''}
                      </Text>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          )}

          <Text style={{ fontSize: 10, color: C.faint, marginTop: 10, lineHeight: 15 }}>
            클럽 정보는 각 클럽이 등록한 코트장에서, 레슨 정보는 코치가 등록한
            내용에서 옵니다. 방문 전에 직접 확인하세요.
          </Text>
        </View>
      )}
    </View>
  );
}

export function Courts({ clubId, courts, me = '', isAdmin, flash }) {
  const sheet = useOptionSheet();
  const [sido, setSido] = useState(null);
  const [gungu, setGungu] = useState(null);
  const [dong, setDong] = useState(null);
  const [surfaces, setSurfaces] = useState([]);
  const [keyword, setKeyword] = useState('');
  const [nc, setNc] = useState({ sido: '', gu: '', name: '', addr: '', surface: '하드', link: '' });

  /* 그 코트에 누가 있는지 — 공개 클럽 목록과 승인된 코치 목록에서 온다.
     둘 다 루트 컬렉션이라 클럽에 속하지 않은 사람도 볼 수 있다. */
  const [directory, setDirectory] = useState([]);
  const [coaches, setCoaches] = useState([]);
  const [openWho, setOpenWho] = useState(null);
  useEffect(() => subClubDirectory(setDirectory), []);
  useEffect(() => subCoaches(setCoaches), []);

  /* 색인을 한 번 만들어 두고 카드마다 조회만 한다.
     코트 500곳마다 클럽·코치 전체를 훑으면 스크롤이 끊긴다. */
  const whoIndex = useMemo(
    () => buildCourtIndex({ clubs: directory, coaches: publicCoaches(coaches) }),
    [directory, coaches],
  );

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

  /* 코트 정보 신고 */
  const report = (c) => sheet.open({
    title: `${c.name} — 무엇이 잘못되었나요?`,
    options: REPORT_KINDS.map((k) => ({ key: k, label: k })),
    onSelect: async (o) => {
      try {
        await reportCourt(c, o.key, '', me);
        flash('알려 주셔서 고맙습니다. 확인 후 반영하겠습니다');
      } catch (e) {
        flash('신고를 보내지 못했습니다');
      }
    },
  });

  /* 목록이 오래되었으면 미리 말한다 — 틀릴 수 있다는 것을 모르는 것보다
     낫다. 최신이면 아무 말도 하지 않는다(멀쩡할 때 잔소리하지 않는다). */
  const freshness = courtDataNote(new Date().toISOString().slice(0, 10));

  return (
    <View>
      {freshness ? (
        <Card style={{ backgroundColor: C.fill, marginBottom: 12 }}>
          <Text style={{ fontSize: 11.5, color: C.sub, lineHeight: 17 }}>{freshness}</Text>
        </Card>
      ) : null}

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
              <CourtWho
                info={courtInfo(c, whoIndex)}
                expanded={openWho === `${c.sido}${c.name}${i}`}
                onToggle={() => setOpenWho(
                  openWho === `${c.sido}${c.name}${i}` ? null : `${c.sido}${c.name}${i}`,
                )}
              />
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
              {/* 신고 — 목록은 한 시점에 긁어 온 값이라 조용히 틀려진다.
                 수백 곳을 직접 확인할 수는 없으니, 실제로 가려던 사람이
                 알려 주는 것이 가장 빠르다. 우리 클럽이 등록한 코트는
                 직접 고치면 되므로 신고 대상이 아니다. */}
              {!c.mine && (
                <Pressable onPress={() => report(c)}>
                  <Text style={{ fontSize: 10.5, color: C.faint }}>정보 신고</Text>
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
