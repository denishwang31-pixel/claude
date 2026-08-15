/* ============================================================
   온보딩 — 클럽은 "반드시" 만들지 않아도 된다.

   세 갈래:
     1) 클럽 찾기   : 이름·지역으로 검색 → 가입 신청 → 운영진 승인 후 입장
        (초대코드를 알면 검색창에 코드를 넣어 승인 없이 바로 가입)
     2) 클럽 만들기 : 내가 회장이 되어 새 클럽 개설
     3) 나중에 하기 : 클럽 없이 앱 둘러보기(게스트 모집 게시판·용품 등)

   승인 대기 중에는 대기 화면이 뜨고, 운영진이 승인하는 즉시 자동 입장한다.
   ============================================================ */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { auth } from '../firebaseConfig';
import {
  createClub, findClubByInviteCode, searchClubs, getClubDirectory,
  requestJoinClub, subMyJoinRequest, cancelJoinRequest, joinClubWithCode,
} from '../src/lib/firestore';
import { seedClub } from '../src/lib/seed';
import { linkUserToClub, markPendingClub, skipOnboarding, getMySession, logout } from '../src/lib/auth';
import { JOIN_STATUS } from '../src/lib/constants';
import { DEFAULT_SETTINGS, roundsFromSettings } from '../src/lib/schedule';
import { DateField, Label } from '../src/components/pickers';
import { useBackHandler } from '../src/hooks/useBackHandler';
import { Card, Btn, Field, Chip, SectionTitle } from '../src/components/ui';
import { C } from '../src/lib/theme';

const TABS = [
  ['find', '클럽 찾기'],
  ['create', '클럽 만들기'],
];

export default function Onboarding() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const uid = auth.currentUser?.uid;

  const [tab, setTab] = useState(params?.mode === 'create' ? 'create' : 'find');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [booting, setBooting] = useState(true);

  /* 공통 프로필 */
  const [myName, setMyName] = useState('');
  const [gender, setGender] = useState('M');
  const [startedAt, setStartedAt] = useState('');

  /* 클럽 찾기 */
  const [kw, setKw] = useState('');
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);

  /* 승인 대기 */
  const [pending, setPending] = useState(null);   // { clubId, clubName, status }

  /* 클럽 만들기 */
  const [clubName, setClubName] = useState('');
  const [region, setRegion] = useState('');
  const [courts, setCourts] = useState('2');
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('13:00');
  const [roundMinutes, setRoundMinutes] = useState(40);
  const [withDemo, setWithDemo] = useState(false);

  /* 이전 상태 복원 — 앱을 껐다 켜도 대기 화면으로 돌아온다 */
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!uid) { setBooting(false); return; }
      try {
        const s = await getMySession(uid);
        if (!alive) return;
        if (s.profile?.name) {
          setMyName(s.profile.name);
          if (s.profile.gender) setGender(s.profile.gender);
          if (s.profile.startedAt) setStartedAt(s.profile.startedAt);
        }
        if (s.pendingClubId) {
          const dir = await getClubDirectory(s.pendingClubId);
          if (alive) setPending({ clubId: s.pendingClubId, clubName: dir?.name || '클럽', status: JOIN_STATUS.PENDING });
        }
      } catch (e) { /* 무시 — 새로 시작 */ }
      if (alive) setBooting(false);
    })();
    return () => { alive = false; };
  }, [uid]);

  /* 딥링크(초대 링크)로 들어온 코드 자동 입력 */
  useEffect(() => {
    if (params?.code) { setTab('find'); setKw(String(params.code).toUpperCase()); }
  }, [params?.code]);

  /* 승인 대기 중이면 내 신청 문서를 구독하다가 승인되는 즉시 입장 */
  useEffect(() => {
    if (!pending?.clubId || !uid) return undefined;
    const unsub = subMyJoinRequest(pending.clubId, uid, async (req) => {
      if (!req) return;
      if (req.status === JOIN_STATUS.APPROVED) {
        await linkUserToClub(uid, pending.clubId, buildProfile());
        router.replace('/(tabs)');
      } else if (req.status === JOIN_STATUS.REJECTED) {
        setPending((p) => (p ? { ...p, status: JOIN_STATUS.REJECTED } : p));
      }
    });
    return () => unsub && unsub();
  }, [pending?.clubId, uid]);

  /* 안드로이드 뒤로가기 — 검색 결과/대기 화면을 먼저 정리 */
  useBackHandler(() => {
    if (pending) return true;               // 대기 화면에선 앱 종료 대신 그대로
    if (searched) { setSearched(false); setResults([]); return true; }
    return false;
  });

  const buildProfile = () => {
    const p = { name: myName.trim(), gender, grade: 'B' };
    const s = startedAt.trim();
    if (s) {
      const norm = /^\d{4}-\d{2}$/.test(s) ? `${s}-01` : s;
      if (!Number.isNaN(new Date(norm).getTime())) p.startedAt = norm;
    }
    return p;
  };

  /* ---------------- 검색 ---------------- */
  const doSearch = async () => {
    setErr(''); setSearching(true);
    try {
      const code = kw.trim().toUpperCase();
      // 6자리 코드처럼 보이면 초대코드부터 확인
      if (/^[A-Z0-9]{6}$/.test(code)) {
        const found = await findClubByInviteCode(code);
        if (found) {
          setResults([{ id: found.clubId, name: found.clubName, byCode: true, code }]);
          setSearched(true); setSearching(false);
          return;
        }
      }
      const list = await searchClubs(kw);
      setResults(list);
      setSearched(true);
    } catch (e) { setErr('검색에 실패했습니다. 잠시 후 다시 시도하세요.'); }
    setSearching(false);
  };

  /* ---------------- 초대코드로 즉시 가입 ---------------- */
  const doJoinByCode = async (club) => {
    if (!uid) return setErr('로그인이 필요합니다.');
    if (!myName.trim()) return setErr('이름을 먼저 입력하세요.');
    setErr(''); setBusy(true);
    try {
      const profile = buildProfile();
      await joinClubWithCode(club.id, uid, profile, club.code);
      await linkUserToClub(uid, club.id, profile);
      router.replace('/(tabs)');
    } catch (e) { setErr('가입에 실패했습니다. 코드를 확인하세요.'); }
    setBusy(false);
  };

  /* ---------------- 가입 신청(승인 대기) ---------------- */
  const doRequest = async (club) => {
    if (!uid) return setErr('로그인이 필요합니다.');
    if (!myName.trim()) return setErr('이름을 먼저 입력하세요.');
    setErr(''); setBusy(true);
    try {
      const profile = buildProfile();
      await requestJoinClub(club.id, uid, profile);
      await markPendingClub(uid, club.id, profile);
      setPending({ clubId: club.id, clubName: club.name, status: JOIN_STATUS.PENDING });
    } catch (e) { setErr('가입 신청에 실패했습니다. 잠시 후 다시 시도하세요.'); }
    setBusy(false);
  };

  const doCancelRequest = async () => {
    if (!uid || !pending) return;
    setBusy(true);
    try {
      await cancelJoinRequest(pending.clubId, uid);
      await markPendingClub(uid, null, null);
    } catch (e) { /* 이미 지워졌을 수 있음 */ }
    setPending(null); setBusy(false);
  };

  /* ---------------- 클럽 만들기 ---------------- */
  const doCreate = async () => {
    if (!uid) return setErr('로그인이 필요합니다.');
    setErr(''); setBusy(true);
    try {
      const profile = buildProfile();
      const settings = {
        ...DEFAULT_SETTINGS,
        courts: Math.max(1, Math.min(20, Number(courts) || 2)),
        startTime, endTime, roundMinutes, region: region.trim(),
      };
      const { clubId } = await createClub(clubName.trim(), settings, { uid, ...profile });
      await seedClub(clubId, withDemo);
      await linkUserToClub(uid, clubId, profile);
      router.replace('/(tabs)');
    } catch (e) { setErr('클럽 생성에 실패했습니다. 다시 시도하세요.'); }
    setBusy(false);
  };

  /* ---------------- 나중에 하기 ---------------- */
  const doSkip = async () => {
    if (!uid) return;
    setBusy(true);
    try { await skipOnboarding(uid, myName.trim() ? buildProfile() : null); } catch (e) { /* 무시 */ }
    setBusy(false);
    router.replace('/(tabs)');
  };

  if (booting) {
    return (
      <View style={{ flex: 1, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.lime} />
      </View>
    );
  }

  /* ================= 승인 대기 화면 ================= */
  if (pending) {
    const rejected = pending.status === JOIN_STATUS.REJECTED;
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', padding: 24 }}>
        <Card style={{ backgroundColor: C.ink, borderColor: C.green, alignItems: 'center', paddingVertical: 28 }}>
          <Text style={{ fontSize: 40 }}>{rejected ? '🙏' : '⏳'}</Text>
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: '900', marginTop: 10 }}>
            {rejected ? '가입이 거절되었습니다' : '가입 승인을 기다리는 중'}
          </Text>
          <Text style={{ color: C.lime, fontSize: 14, fontWeight: '800', marginTop: 6 }}>{pending.clubName}</Text>
          <Text style={{ color: '#6ee7b7', fontSize: 12, textAlign: 'center', marginTop: 12, lineHeight: 18 }}>
            {rejected
              ? '다른 클럽을 찾아보거나, 클럽 운영진에게 직접 문의해 보세요.'
              : '클럽 운영진이 승인하면 이 화면에서 자동으로 입장합니다.\n앱을 껐다 켜도 됩니다.'}
          </Text>
        </Card>

        <View style={{ marginTop: 16, gap: 8 }}>
          <Btn full tone="ghost" disabled={busy} onPress={doCancelRequest}>
            {rejected ? '다른 클럽 찾기' : '신청 취소하고 다시 고르기'}
          </Btn>
          <Btn full tone="ghost" disabled={busy} onPress={doSkip}>클럽 없이 먼저 둘러보기</Btn>
        </View>
        {err ? <Text style={{ fontSize: 12, color: C.danger, textAlign: 'center', marginTop: 10 }}>{err}</Text> : null}
      </View>
    );
  }

  /* ================= 일반 온보딩 ================= */
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 24, paddingTop: 56, paddingBottom: 48 }}>
      <Text style={{ fontSize: 22, fontWeight: '900', color: C.ink }}>시작하기</Text>
      <Text style={{ fontSize: 12, color: C.sub, marginTop: 4 }}>
        클럽은 나중에 정해도 됩니다. 우선 이름만 알려주세요.
      </Text>

      {/* 내 프로필 */}
      <Card style={{ marginTop: 16 }}>
        <Label>내 이름</Label>
        <Field placeholder="이름" value={myName} onChangeText={setMyName} />
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
          {['M', 'F'].map((g) => (
            <Chip key={g} tone={gender === g ? 'green' : 'outline'} onPress={() => setGender(g)}>
              {g === 'M' ? '남' : '여'}
            </Chip>
          ))}
        </View>
        <View style={{ marginTop: 12 }}>
          <Label hint="선택 · 구력 계산에 쓰입니다">테니스 시작일</Label>
          <DateField value={startedAt} onChange={setStartedAt} placeholder="예: 2019-03-01" />
        </View>
      </Card>

      {/* 탭 */}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
        {TABS.map(([k, label]) => (
          <Pressable key={k} onPress={() => { setTab(k); setErr(''); }}
            style={{
              flex: 1, paddingVertical: 11, borderRadius: 12, alignItems: 'center',
              backgroundColor: tab === k ? C.green : '#fff',
              borderWidth: tab === k ? 0 : 1, borderColor: C.border,
            }}>
            <Text style={{ fontWeight: '800', fontSize: 13, color: tab === k ? C.lime : C.sub }}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'find' ? (
        <>
          <Card style={{ marginTop: 12 }}>
            <Label hint="클럽 이름·지역 또는 6자리 초대코드">클럽 검색</Label>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Field placeholder="예: 그린스매시 / 과천 / ABC234"
                autoCapitalize="characters" value={kw} onChangeText={setKw}
                onSubmitEditing={doSearch} returnKeyType="search" style={{ flex: 1 }} />
              <Btn disabled={searching} onPress={doSearch}>{searching ? '…' : '검색'}</Btn>
            </View>
            <Text style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 16 }}>
              · <Text style={{ fontWeight: '700' }}>초대코드</Text>를 받았다면 그대로 입력하세요 — 승인 없이 바로 가입됩니다.{'\n'}
              · 코드가 없으면 클럽을 찾아 <Text style={{ fontWeight: '700' }}>가입 신청</Text>하세요. 운영진이 승인하면 입장합니다.
            </Text>
          </Card>

          {searched && (
            <>
              <SectionTitle right={
                <Chip tone="outline" onPress={() => { setSearched(false); setResults([]); }}>지우기</Chip>
              }>검색 결과 {results.length}곳</SectionTitle>

              {results.map((c) => (
                <Card key={c.id} style={{ marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 15, fontWeight: '800', flex: 1 }}>{c.name}</Text>
                    {c.byCode && <Chip tone="lime">초대코드 확인됨</Chip>}
                  </View>
                  {!c.byCode && (
                    <Text style={{ fontSize: 11, color: C.sub, marginTop: 3 }}>
                      {c.region ? `${c.region} · ` : ''}회원 {c.memberCount || 0}명
                    </Text>
                  )}
                  <View style={{ marginTop: 10 }}>
                    {c.byCode ? (
                      <Btn full disabled={busy || !myName.trim()} onPress={() => doJoinByCode(c)}>
                        {busy ? '가입 중…' : '바로 가입하기'}
                      </Btn>
                    ) : (
                      <Btn full tone="ghost" disabled={busy || !myName.trim()} onPress={() => doRequest(c)}>
                        {busy ? '신청 중…' : '가입 신청'}
                      </Btn>
                    )}
                  </View>
                </Card>
              ))}

              {results.length === 0 && (
                <Card>
                  <Text style={{ fontSize: 12, color: C.sub, lineHeight: 18 }}>
                    검색 결과가 없습니다.{'\n'}
                    클럽 이름 일부만 넣어도 찾아집니다. 그래도 없으면 운영진에게 초대코드를 받거나,
                    직접 <Text style={{ fontWeight: '700' }}>클럽 만들기</Text>로 개설하세요.
                  </Text>
                </Card>
              )}
            </>
          )}
        </>
      ) : (
        <Card style={{ marginTop: 12 }}>
          <Label>클럽 이름</Label>
          <Field placeholder="예: 그린스매시 테니스클럽" value={clubName} onChangeText={setClubName} />

          <View style={{ marginTop: 10 }}>
            <Label hint="다른 사람이 검색할 때 쓰입니다">지역</Label>
            <Field placeholder="예: 경기 과천시" value={region} onChangeText={setRegion} />
          </View>

          <View style={{ marginTop: 14 }}>
            <Label hint="나중에 [클럽 설정]에서 변경 가능">운영 설정</Label>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>코트 면수</Text>
                <Field keyboardType="number-pad" value={courts} onChangeText={setCourts} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>시작</Text>
                <Field placeholder="10:00" value={startTime} onChangeText={setStartTime} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>종료</Text>
                <Field placeholder="13:00" value={endTime} onChangeText={setEndTime} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {[30, 40, 45, 60].map((v) => (
                <Chip key={v} tone={roundMinutes === v ? 'green' : 'outline'} onPress={() => setRoundMinutes(v)}>{v}분/타임</Chip>
              ))}
            </View>
            <Text style={{ fontSize: 11, color: C.green2, marginTop: 6 }}>
              → 총 {roundsFromSettings({ startTime, endTime, roundMinutes })}타임 진행 예정
            </Text>
          </View>

          <Pressable onPress={() => setWithDemo(!withDemo)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 }}>
            <View style={{ width: 20, height: 20, borderRadius: 5, backgroundColor: withDemo ? C.green : '#e7e5e4', alignItems: 'center', justifyContent: 'center' }}>
              {withDemo && <Text style={{ color: C.lime, fontWeight: '900', fontSize: 12 }}>✓</Text>}
            </View>
            <Text style={{ fontSize: 12, color: C.sub }}>데모 회원·모임 데이터로 시작 (체험용)</Text>
          </Pressable>

          <View style={{ marginTop: 16 }}>
            <Btn full disabled={busy || !clubName.trim() || !myName.trim()} onPress={doCreate}>
              {busy ? '생성 중…' : '클럽 만들기 (내가 회장)'}
            </Btn>
          </View>
          <Text style={{ fontSize: 10, color: C.faint, marginTop: 8 }}>
            만들면 초대코드가 자동 발급됩니다. [더보기]에서 링크로 바로 초대할 수 있어요.
          </Text>
        </Card>
      )}

      {err ? <Text style={{ fontSize: 12, color: C.danger, textAlign: 'center', marginTop: 12 }}>{err}</Text> : null}

      {/* 나중에 하기 */}
      <View style={{ marginTop: 24, alignItems: 'center' }}>
        <Pressable onPress={doSkip} disabled={busy} hitSlop={10}>
          <Text style={{ fontSize: 13, color: C.green2, fontWeight: '700', textDecorationLine: 'underline' }}>
            나중에 할게요 · 먼저 둘러보기
          </Text>
        </Pressable>
        <Text style={{ fontSize: 10, color: C.faint, marginTop: 6, textAlign: 'center', lineHeight: 15 }}>
          클럽 없이도 게스트 모집 게시판과 용품을 볼 수 있습니다.{'\n'}
          언제든 [더보기]에서 클럽을 찾거나 만들 수 있어요.
        </Text>
      </View>

      <View style={{ marginTop: 28, alignItems: 'center' }}>
        <Pressable onPress={logout} hitSlop={10}>
          <Text style={{ fontSize: 12, color: C.faint }}>다른 계정으로 로그인</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
