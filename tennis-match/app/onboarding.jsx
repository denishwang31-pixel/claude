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
import { Card, Btn, Field, Chip } from '../src/components/ui';
import { C } from '../src/lib/theme';

export default function Onboarding() {
  const router = useRouter();
  const [mode, setMode] = useState('create'); // create | join
  const [clubName, setClubName] = useState('');
  const [myName, setMyName] = useState('');
  const [gender, setGender] = useState('M');
  const [withDemo, setWithDemo] = useState(false); // R-3: 실사용 기본 off
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const uid = auth.currentUser?.uid;

  const doCreate = async () => {
    if (!uid) return setErr('로그인이 필요합니다.');
    setErr(''); setBusy(true);
    try {
      const profile = { name: myName, gender, grade: 'B' };
      const { clubId } = await createClub(clubName, { feeAmount: 30000, guestFee: 10000, payLink: '' }, { uid, ...profile });
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
      const profile = { name: myName, gender, grade: 'B' };
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

        {mode === 'create' ? (
          <>
            <Text style={{ fontSize: 13, fontWeight: '700', marginTop: 16, marginBottom: 6 }}>클럽 이름</Text>
            <Field placeholder="예: 그린스매시 테니스클럽" value={clubName} onChangeText={setClubName} />
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
