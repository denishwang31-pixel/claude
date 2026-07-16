/* 게시판 / 게스트 모집 / 코트 검색 / 회원 관리 서브화면 묶음 */
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, Linking } from 'react-native';
import {
  addPost, addComment, addGuestPost, deleteGuestPost, applyToGuestPost, cancelApplication,
  confirmApplicant, subApplicants, updateMeeting, addCourt, deleteCourt, addMember,
} from '../lib/firestore';
import { GUEST_STATUS } from '../lib/constants';
import { Card, SectionTitle, Chip, Btn, Field, Avatar } from './ui';
import { C } from '../lib/theme';

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

/* ---------------- 게스트 모집 (루트 공개, FIX-05) ---------------- */
function GuestPostCard({ post, clubId, meetings, me, meVal, isAdmin, nameOf, flash }) {
  const [applicants, setApplicants] = useState([]);
  useEffect(() => subApplicants(post.id, setApplicants), [post.id]);

  const canManage = isAdmin && post.clubId === clubId; // 모집 클럽 총무만 확정
  const mine = applicants.find((a) => a.uid === me);
  const confirmedN = applicants.filter((a) => a.status === GUEST_STATUS.CONFIRMED).length;

  const apply = () => {
    if (!meVal) return flash('프로필을 먼저 등록하세요');
    if (mine) return flash('이미 신청했습니다');
    applyToGuestPost(post.id, { uid: me, name: meVal.name, gender: meVal.gender, grade: meVal.grade, clubId });
    flash('참여 의사 전달. 확정되면 알림이 옵니다');
  };
  const confirm = (a) => {
    confirmApplicant(post.id, a.uid);
    // 모집 클럽의 같은 날짜 모임에 게스트로 자동 포함(uid 귀속)
    const mt = meetings.find((m) => m.date === post.date);
    if (mt && !(mt.guests || []).some((g) => g.uid === a.uid)) {
      updateMeeting(clubId, mt.id, { guests: [...(mt.guests || []), { uid: a.uid, name: a.name, gender: a.gender, grade: a.grade }] });
    }
    flash('게스트 확정! 대진 자동 포함 (PHASE 3: 본인 푸시)');
  };

  return (
    <Card style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontWeight: '900', fontSize: 14 }}>{post.clubName}</Text>
        <Chip tone="lime">{Math.max(0, (post.slots || 0) - confirmedN)}자리 남음</Chip>
      </View>
      <Text style={{ fontSize: 12, color: '#44403c', marginTop: 4 }}>{post.date} · {post.place} ({post.region})</Text>
      <Text style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>모집: {post.need} · 게스트비 {(post.fee || 0).toLocaleString()}원</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
        {applicants.map((a) => {
          const confirmed = a.status === GUEST_STATUS.CONFIRMED;
          return (
            <View key={a.uid} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: confirmed ? C.green : '#f5f5f4', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: confirmed ? C.lime : C.sub }}>{a.name} {confirmed ? '✓확정' : '신청'}</Text>
              {canManage && !confirmed && (
                <Pressable onPress={() => confirm(a)}><Text style={{ fontSize: 11, color: C.green2, textDecorationLine: 'underline' }}>확정</Text></Pressable>
              )}
            </View>
          );
        })}
        {applicants.length === 0 && <Text style={{ fontSize: 11, color: C.faint }}>아직 신청자가 없습니다.</Text>}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        {mine ? (
          <Btn small tone="ghost" onPress={() => { cancelApplication(post.id, me); flash('신청을 취소했습니다'); }}>신청 취소</Btn>
        ) : (
          <Btn small onPress={apply}>참여 의사 개진</Btn>
        )}
        {canManage && <Btn small tone="ghost" onPress={() => deleteGuestPost(post.id)}>모집글 삭제</Btn>}
      </View>
    </Card>
  );
}

export function Guest({ clubId, club, guestPosts, meetings, me, meVal, isAdmin, nameOf, flash }) {
  const [ng, setNg] = useState({ date: '', place: '', region: '', slots: '2', need: '' });
  return (
    <View>
      <Text style={{ fontSize: 11, color: C.sub, marginBottom: 8 }}>
        공개 게시판입니다. 다른 클럽 회원도 신청할 수 있고, 게스트 경기 기록은 본인 계정에 누적됩니다.
      </Text>
      {guestPosts.map((post) => (
        <GuestPostCard key={post.id} {...{ post, clubId, meetings, me, meVal, isAdmin, nameOf, flash }} />
      ))}
      {guestPosts.length === 0 && <Card><Text style={{ fontSize: 12, color: C.sub }}>진행 중인 게스트 모집이 없습니다.</Text></Card>}

      {isAdmin && (
        <>
          <SectionTitle>게스트 모집글 올리기</SectionTitle>
          <Card>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Field placeholder="날짜 (YYYY-MM-DD)" value={ng.date} onChangeText={(t) => setNg({ ...ng, date: t })} style={{ flex: 2 }} />
              <Field placeholder="인원" keyboardType="number-pad" value={ng.slots} onChangeText={(t) => setNg({ ...ng, slots: t })} style={{ flex: 1 }} />
            </View>
            <View style={{ marginTop: 8 }}><Field placeholder="장소" value={ng.place} onChangeText={(t) => setNg({ ...ng, place: t })} /></View>
            <View style={{ marginTop: 8 }}><Field placeholder="지역 (예: 경기 과천시)" value={ng.region} onChangeText={(t) => setNg({ ...ng, region: t })} /></View>
            <View style={{ marginTop: 8 }}><Field placeholder="모집 조건 (예: 남1 여1 · C조 이상)" value={ng.need} onChangeText={(t) => setNg({ ...ng, need: t })} /></View>
            <View style={{ marginTop: 8 }}>
              <Btn full disabled={!ng.date || !ng.place} onPress={() => {
                addGuestPost({ clubId, clubName: club?.name || '', date: ng.date, place: ng.place, region: ng.region, slots: +ng.slots, need: ng.need, fee: club?.settings?.guestFee || 10000, authorId: me });
                setNg({ date: '', place: '', region: '', slots: '2', need: '' });
                flash('모집글이 공개 게시판에 등록됨');
              }}>모집글 등록</Btn>
            </View>
          </Card>
        </>
      )}
    </View>
  );
}

/* ---------------- 코트 검색 ---------------- */
export function Courts({ clubId, courts, isAdmin, flash }) {
  const [sido, setSido] = useState(null);
  const [gu, setGu] = useState(null);
  const [nc, setNc] = useState({ sido: '', gu: '', name: '', addr: '', surface: '하드', link: '' });
  const sidos = [...new Set(courts.map((c) => c.sido))];
  const gus = sido ? [...new Set(courts.filter((c) => c.sido === sido).map((c) => c.gu))] : [];
  const list = courts.filter((c) => (!sido || c.sido === sido) && (!gu || c.gu === gu));

  return (
    <View>
      <Text style={{ fontSize: 11, color: C.sub, marginBottom: 8 }}>
        지역 → 구 단위로 좁히면 코트 핀이 표시됩니다. 예약은 각 코트 사이트로 이동. (PHASE 4: 카카오맵 SDK)
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Chip tone={!sido ? 'green' : 'outline'} onPress={() => { setSido(null); setGu(null); }}>전국</Chip>
        {sidos.map((s) => <Chip key={s} tone={sido === s ? 'green' : 'outline'} onPress={() => { setSido(s); setGu(null); }}>{s}</Chip>)}
      </View>
      {sido && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {gus.map((g) => <Chip key={g} tone={gu === g ? 'lime' : 'outline'} onPress={() => setGu(g)}>{g}</Chip>)}
        </View>
      )}

      {/* 간이 지도 (PHASE 4: WebView + Kakao 지도로 교체) */}
      <Card style={{ marginTop: 12, backgroundColor: C.ink, borderColor: C.green, height: 150 }}>
        {list.slice(0, 8).map((c, i) => (
          <View key={c.id} style={{ position: 'absolute', left: `${15 + (i * 23) % 70}%`, top: `${18 + (i * 31) % 55}%`, alignItems: 'center' }}>
            <Text style={{ fontSize: 16 }}>📍</Text>
            <Text style={{ fontSize: 9, color: C.lime, fontWeight: '700' }}>{c.name.slice(0, 8)}</Text>
          </View>
        ))}
        <Text style={{ position: 'absolute', bottom: 6, right: 8, fontSize: 9, color: '#34d399' }}>{sido || '전국'}{gu ? ` · ${gu}` : ''} · {list.length}개</Text>
      </Card>

      {list.map((c) => (
        <Card key={c.id} style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', fontSize: 14 }}>{c.name}</Text>
            <Text style={{ fontSize: 11, color: C.sub }}>{c.addr} · {c.surface}{c.indoor ? ' · 실내' : ''}</Text>
          </View>
          {c.link ? (
            <Pressable onPress={() => Linking.openURL(c.link)} style={{ backgroundColor: C.lime, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }}>
              <Text style={{ fontSize: 12, fontWeight: '900', color: C.ink }}>예약 사이트 →</Text>
            </Pressable>
          ) : null}
          {isAdmin && (
            <Pressable onPress={() => deleteCourt(clubId, c.id)} style={{ marginLeft: 8 }}><Text style={{ color: C.faint }}>✕</Text></Pressable>
          )}
        </Card>
      ))}

      {isAdmin && (
        <>
          <SectionTitle>코트 추가 (주소·링크 직접 입력)</SectionTitle>
          <Card>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Field placeholder="시/도" value={nc.sido} onChangeText={(t) => setNc({ ...nc, sido: t })} style={{ flex: 1 }} />
              <Field placeholder="구/시" value={nc.gu} onChangeText={(t) => setNc({ ...nc, gu: t })} style={{ flex: 1 }} />
            </View>
            <View style={{ marginTop: 8 }}><Field placeholder="코트명" value={nc.name} onChangeText={(t) => setNc({ ...nc, name: t })} /></View>
            <View style={{ marginTop: 8 }}><Field placeholder="주소" value={nc.addr} onChangeText={(t) => setNc({ ...nc, addr: t })} /></View>
            <View style={{ marginTop: 8 }}><Field placeholder="예약 사이트 링크 (https://…)" value={nc.link} onChangeText={(t) => setNc({ ...nc, link: t })} /></View>
            <View style={{ marginTop: 8 }}>
              <Btn full disabled={!nc.name || !nc.sido} onPress={() => {
                addCourt(clubId, { ...nc, indoor: false });
                setNc({ sido: '', gu: '', name: '', addr: '', surface: '하드', link: '' });
                flash('코트 등록됨');
              }}>코트 등록</Btn>
            </View>
          </Card>
        </>
      )}
    </View>
  );
}

/* ---------------- 회원 관리 ---------------- */
export function Members({ clubId, members, stats, me, isAdmin, flash }) {
  const [nm, setNm] = useState({ name: '', gender: 'M', grade: 'B' });
  return (
    <View>
      <Card>
        {members.map((m, i) => (
          <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: '#f5f5f4' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: m.gender === 'F' ? C.femaleBg : C.maleBg, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 12, fontWeight: '900', color: m.gender === 'F' ? C.female : C.male }}>{m.name?.[0]}</Text>
              </View>
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700' }}>{m.name}</Text>
                  {m.role !== '회원' && <Chip tone="lime">{m.role}</Chip>}
                </View>
                <Text style={{ fontSize: 10, color: C.faint }}>{m.gender === 'M' ? '남' : '여'} · {m.grade}조 · {m.status}</Text>
              </View>
            </View>
            {stats[m.id] && <Text style={{ fontSize: 11, color: C.faint }}>{stats[m.id].wins}승{stats[m.id].games - stats[m.id].wins}패</Text>}
          </View>
        ))}
      </Card>
      {isAdmin && (
        <>
          <SectionTitle>회원 추가 (오프라인 등록)</SectionTitle>
          <Card>
            <Field placeholder="이름" value={nm.name} onChangeText={(t) => setNm({ ...nm, name: t })} />
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
              {['M', 'F'].map((g) => <Chip key={g} tone={nm.gender === g ? 'green' : 'outline'} onPress={() => setNm({ ...nm, gender: g })}>{g === 'M' ? '남' : '여'}</Chip>)}
              {['A', 'B', 'C'].map((g) => <Chip key={g} tone={nm.grade === g ? 'lime' : 'outline'} onPress={() => setNm({ ...nm, grade: g })}>{g}조</Chip>)}
            </View>
            <View style={{ marginTop: 8 }}>
              <Btn full disabled={!nm.name} onPress={() => {
                addMember(clubId, 'local:' + rid(), nm);
                setNm({ name: '', gender: 'M', grade: 'B' });
                flash('회원 추가됨 (본인 계정 연동은 초대코드 가입 권장)');
              }}>추가</Btn>
            </View>
          </Card>
        </>
      )}
    </View>
  );
}
