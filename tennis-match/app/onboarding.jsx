/* PHASE 2 — 온보딩: 클럽 생성(총무) 또는 초대코드로 가입
   FIX-04: 루트 inviteCodes 조회 기반 가입 / FIX-05: users 프로필 저장 */
import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { doc, setDoc } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { createClub, findClubByInviteCode } from '../src/lib/firestore';
import { seedClub } from '../src/lib/seed';
import { linkUserToClub } from '../src/lib/auth';
import { ROLES } from '../src/lib/constants';
import { DEFAULT_SETTINGS, roundsFromSettings } from '../src/lib/schedule';
import { Card, Btn, Field, Chip } from '../src/components/ui';
import { C } from '../src/lib/theme';

export default function Onboarding() {
  const router = useRouter();
  const [mode, setMode] = useState('create'); // create | join
  const [clubName, setClubName] = useState('');
  const [myName, setMyName] = useState('');
  const [gender, setGender] = useState('M');
  const [startedAt, setStartedAt] = useState('');
  const [withDemo, setWithDemo] = useState(false); // R-3: 실사용 기본 off
  // 최초 관리자가 정하는 클럽 운영 기본값
  const [courts, setCourts] = useState('2');
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('13:00');
  const [roundMinutes, setRoundMinutes] = useState(40);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const uid = auth.currentUser?.uid;

  // 테니스 시작일(구력) — 대회 참가 기준으로 쓰이므로 가입 때 받아둔다
  const buildProfile = () => {
    const p = { name: myName, gender, grade: 'B' };
    const s = startedAt.trim();
    if (s) {
      const norm = /^\d{4}-\d{2}$/.test(s) ? `${s}-01` : s;
      if (!Number.isNaN(new Date(norm).getTime())) p.startedAt = norm;
    }
    return p;
  };

  const doCreate = async () => {
    if (!uid) return setErr('로그인이 필요합니다.');
    setErr(''); setBusy(true);
    try {
      const profile = buildProfile();
      const settings = {
        ...DEFAULT_SETTINGS,
        courts: Math.max(1, Math.min(20, Number(courts) || 2)),
        startTime, endTime, roundMinutes,
      };
      const { clubId } = await createClub(clubName, settings, { uid, ...profile });
      await seedClub(clubId, withDemo);
      await linkUserToClub(uid, clubId, profile);
      router.replace('/(tabs)');
    } catch (e) { setErr('클럽 생성 실패. 다시 시도하세요.'); }
    setBusy(false);
  };

  const doJoin = async () => {
    if (!uid) return setErr('로그인이 필요합니다.');
    setErr(''); setBusy(true);
    try {
      const found = await findClubByInviteCode(code);
      if (!found) { setErr('초대코드를 찾을 수 없습니다.'); setBusy(false); return; }
      const profile = buildProfile();
      // members 문서에 joinCode 포함(규칙에서 코드 검증)
      await setDoc(doc(db, 'clubs', found.clubId, 'members', uid), {
        ...profile, role: ROLES.MEMBER, status: '활동', joinCode: String(code).toUpperCase(),
      });
      await linkUserToClub(uid, found.clubId, profile);
      router.replace('/(tabs)');
    } catch (e) { setErr('가입 실패. 코드를 확인하세요.'); }
    setBusy(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', padding: 24 }}>
      <Text style={{ fontSize: 22, fontWeight: '900', color: C.ink, marginBottom: 16 }}>시작하기</Text>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
        <Pressable onPress={() => setMode('create')} style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: mode === 'create' ? C.green : '#fff', borderWidth: mode === 'create' ? 0 : 1, borderColor: C.border }}>
          <Text style={{ fontWeight: '700', color: mode === 'create' ? C.lime : C.sub }}>클럽 만들기</Text>
        </Pressable>
        <Pressable onPress={() => setMode('join')} style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: mode === 'join' ? C.green : '#fff', borderWidth: mode === 'join' ? 0 : 1, borderColor: C.border }}>
          <Text style={{ fontWeight: '700', color: mode === 'join' ? C.lime : C.sub }}>초대코드로 가입</Text>
        </Pressable>
      </View>

      <Card>
        <Text style={{ fontSize: 13, fontWeight: '700', marginBottom: 6 }}>내 이름</Text>
        <Field placeholder="이름" value={myName} onChangeText={setMyName} />
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
          {['M', 'F'].map((g) => <Chip key={g} tone={gender === g ? 'green' : 'outline'} onPress={() => setGender(g)}>{g === 'M' ? '남' : '여'}</Chip>)}
        </View>

        <Text style={{ fontSize: 13, fontWeight: '700', marginTop: 16, marginBottom: 6 }}>테니스 시작일 <Text style={{ fontSize: 11, color: C.faint, fontWeight: '400' }}>(선택 · 구력)</Text></Text>
        <Field placeholder="예: 2019-03 (대회 참가 기준)" value={startedAt} onChangeText={setStartedAt} />

        {mode === 'create' ? (
          <>
            <Text style={{ fontSize: 13, fontWeight: '700', marginTop: 16, marginBottom: 6 }}>클럽 이름</Text>
            <Field placeholder="예: 그린스매시 테니스클럽" value={clubName} onChangeText={setClubName} />

            {/* 최초 관리자 운영 설정 — 나중에 [더보기 → 클럽 설정]에서 변경 가능 */}
            <Text style={{ fontSize: 13, fontWeight: '700', marginTop: 16, marginBottom: 6 }}>
              운영 설정 <Text style={{ fontSize: 11, color: C.faint, fontWeight: '400' }}>(나중에 변경 가능)</Text>
            </Text>
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
            <Pressable onPress={() => setWithDemo(!withDemo)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
              <View style={{ width: 20, height: 20, borderRadius: 5, backgroundColor: withDemo ? C.green : '#e7e5e4', alignItems: 'center', justifyContent: 'center' }}>
                {withDemo && <Text style={{ color: C.lime, fontWeight: '900', fontSize: 12 }}>✓</Text>}
              </View>
              <Text style={{ fontSize: 12, color: C.sub }}>데모 회원·모임 데이터로 시작 (체험용)</Text>
            </Pressable>
            <View style={{ marginTop: 16 }}>
              <Btn full disabled={busy || !clubName || !myName} onPress={doCreate}>{busy ? '생성 중…' : '클럽 생성 (총무로 시작)'}</Btn>
            </View>
          </>
        ) : (
          <>
            <Text style={{ fontSize: 13, fontWeight: '700', marginTop: 16, marginBottom: 6 }}>초대코드</Text>
            <Field placeholder="6자리 코드" autoCapitalize="characters" value={code} onChangeText={setCode} />
            <View style={{ marginTop: 16 }}>
              <Btn full disabled={busy || !code || !myName} onPress={doJoin}>{busy ? '가입 중…' : '클럽 가입'}</Btn>
            </View>
          </>
        )}
        {err ? <Text style={{ fontSize: 12, color: C.danger, textAlign: 'center', marginTop: 10 }}>{err}</Text> : null}
      </Card>
    </View>
  );
}
