/* ============================================================
   초대 링크 수신 화면 — tennismatch://join?code=ABC234

   초대 링크를 누르면 여기로 들어온다.
     · 로그인 전이면 코드를 들고 로그인 화면으로 보냈다가 다시 돌아온다
     · 이미 다른 클럽 회원이면 옮길지 확인한다
     · 코드가 유효하면 이름만 확인하고 바로 가입시킨다(승인 불필요)
   ============================================================ */
import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useApp } from './_layout';
import { findClubByInviteCode, joinClubWithCode } from '../src/lib/firestore';
import { linkUserToClub, getMySession } from '../src/lib/auth';
import { useBackHandler } from '../src/hooks/useBackHandler';
import { Card, Btn, Field, Chip } from '../src/components/ui';
import { Label } from '../src/components/pickers';
import { C } from '../src/lib/theme';

export default function Join() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { uid, clubId, switchClub } = useApp() || {};

  const code = String(params?.code || '').toUpperCase();
  const [club, setClub] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | invalid | done
  const [name, setName] = useState('');
  const [gender, setGender] = useState('M');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const goHome = () => router.replace(clubId ? '/(tabs)' : '/onboarding');
  useBackHandler(() => { goHome(); return true; });

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!code) { setState('invalid'); return; }
      try {
        const found = await findClubByInviteCode(code);
        if (!alive) return;
        if (!found) { setState('invalid'); return; }
        setClub(found);
        if (uid) {
          const s = await getMySession(uid);
          if (alive && s.profile?.name) { setName(s.profile.name); if (s.profile.gender) setGender(s.profile.gender); }
        }
        if (alive) setState('ready');
      } catch (e) { if (alive) setState('invalid'); }
    })();
    return () => { alive = false; };
  }, [code, uid]);

  const join = async () => {
    if (!uid) {
      // 로그인 후 이 화면으로 되돌아오도록 코드를 넘긴다
      router.replace({ pathname: '/login', params: { code } });
      return;
    }
    if (!name.trim()) return setErr('이름을 입력하세요.');
    setErr(''); setBusy(true);
    try {
      const profile = { name: name.trim(), gender, grade: 'B' };
      await joinClubWithCode(club.clubId, uid, profile, code);
      await linkUserToClub(uid, club.clubId, profile);
      switchClub?.(club.clubId);
      setState('done');
      router.replace('/(tabs)');
    } catch (e) { setErr('가입에 실패했습니다. 코드가 만료되었을 수 있습니다.'); }
    setBusy(false);
  };

  const confirmSwitch = () => {
    if (!clubId || clubId === club?.clubId) return join();
    Alert.alert(
      '클럽을 옮길까요?',
      `지금 소속된 클럽에서 '${club?.clubName || '새 클럽'}' 으로 이동합니다.\n`
      + '이전 클럽의 기록은 그대로 남아 있고, 초대코드로 다시 돌아올 수 있습니다.',
      [{ text: '취소', style: 'cancel' }, { text: '옮기기', onPress: join }],
    );
  };

  if (state === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.lime} />
        <Text style={{ color: '#6ee7b7', fontSize: 12, marginTop: 12 }}>초대 코드를 확인하는 중…</Text>
      </View>
    );
  }

  if (state === 'invalid') {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', padding: 24 }}>
        <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
          <Text style={{ fontSize: 36 }}>🔗</Text>
          <Text style={{ fontSize: 16, fontWeight: '900', marginTop: 10 }}>초대 링크가 유효하지 않습니다</Text>
          <Text style={{ fontSize: 12, color: C.sub, textAlign: 'center', marginTop: 8, lineHeight: 18 }}>
            {code ? `코드 "${code}" 를 찾을 수 없습니다.` : '초대 코드가 링크에 없습니다.'}{'\n'}
            링크가 잘렸을 수 있으니 초대해 준 분께 다시 요청하거나,{'\n'}
            클럽 이름으로 검색해 가입 신청해 보세요.
          </Text>
          <View style={{ marginTop: 18, width: '100%' }}>
            <Btn full onPress={goHome}>클럽 찾기로 이동</Btn>
          </View>
        </Card>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', padding: 24 }}>
      <Card style={{ backgroundColor: C.ink, borderColor: C.green, alignItems: 'center', paddingVertical: 24 }}>
        <Text style={{ fontSize: 34 }}>🎾</Text>
        <Text style={{ color: '#6ee7b7', fontSize: 12, marginTop: 8 }}>초대를 받았습니다</Text>
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900', marginTop: 4 }}>{club?.clubName || '테니스클럽'}</Text>
        <Text style={{ color: C.lime, fontSize: 12, fontWeight: '800', letterSpacing: 2, marginTop: 6 }}>{code}</Text>
      </Card>

      <Card style={{ marginTop: 14 }}>
        {uid ? (
          <>
            <Label>내 이름</Label>
            <Field placeholder="이름" value={name} onChangeText={setName} />
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
              {['M', 'F'].map((g) => (
                <Chip key={g} tone={gender === g ? 'green' : 'outline'} onPress={() => setGender(g)}>
                  {g === 'M' ? '남' : '여'}
                </Chip>
              ))}
            </View>
            <View style={{ marginTop: 16 }}>
              <Btn full disabled={busy || !name.trim()} onPress={confirmSwitch}>
                {busy ? '가입 중…' : '가입하기'}
              </Btn>
            </View>
            <Text style={{ fontSize: 10, color: C.faint, marginTop: 8, textAlign: 'center' }}>
              초대코드로 들어오면 운영진 승인 없이 바로 회원이 됩니다.
            </Text>
          </>
        ) : (
          <>
            <Text style={{ fontSize: 13, color: C.text, lineHeight: 19 }}>
              가입하려면 먼저 로그인이 필요합니다.{'\n'}
              로그인하면 이 초대가 그대로 이어집니다.
            </Text>
            <View style={{ marginTop: 16 }}>
              <Btn full onPress={join}>로그인하고 가입하기</Btn>
            </View>
          </>
        )}
        {err ? <Text style={{ fontSize: 12, color: C.danger, textAlign: 'center', marginTop: 10 }}>{err}</Text> : null}
      </Card>

      <View style={{ marginTop: 20, alignItems: 'center' }}>
        <Pressable onPress={goHome} hitSlop={10}>
          <Text style={{ fontSize: 12, color: C.faint }}>지금은 가입하지 않기</Text>
        </Pressable>
      </View>
    </View>
  );
}
