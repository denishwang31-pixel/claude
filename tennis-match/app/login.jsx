/* 로그인 — 이메일 가입/로그인 + 체험 모드(익명)
   ⚠️ 전화번호 인증은 R-1 2차(@react-native-firebase/auth 전환) 때 추가한다.
   Firebase JS SDK 의 전화 인증은 RN 에서 recaptcha 웹뷰가 필요한데,
   그 역할을 하던 expo-firebase-recaptcha 가 지원 종료되어 1차에서는 제외. */
import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { signInEmail, signUpEmail, signInAnon, getMySession } from '../src/lib/auth';
import { Card, Btn, Field } from '../src/components/ui';
import { C } from '../src/lib/theme';

export default function Login() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const inviteCode = params?.code ? String(params.code).toUpperCase() : '';
  const [mode, setMode] = useState(inviteCode ? 'signup' : 'signin'); // signin | signup
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const go = async (uid) => {
    // 초대 링크를 타고 온 경우 로그인 후 그 초대로 되돌아간다
    if (inviteCode) { router.replace({ pathname: '/join', params: { code: inviteCode } }); return; }
    const s = await getMySession(uid);
    router.replace(s.clubId || s.skipped ? '/(tabs)' : '/onboarding');
  };

  const messageOf = (e) => {
    const code = e?.code || '';
    if (code.includes('invalid-credential') || code.includes('wrong-password')) return '이메일 또는 비밀번호가 올바르지 않습니다.';
    if (code.includes('user-not-found')) return '가입되지 않은 이메일입니다. [회원가입]을 눌러주세요.';
    if (code.includes('email-already-in-use')) return '이미 가입된 이메일입니다. [로그인]을 눌러주세요.';
    if (code.includes('weak-password')) return '비밀번호는 6자 이상이어야 합니다.';
    if (code.includes('invalid-email')) return '이메일 형식을 확인해주세요.';
    if (code.includes('operation-not-allowed')) return 'Firebase 콘솔에서 해당 로그인 방법을 사용 설정해주세요.';
    if (code.includes('network')) return '네트워크 연결을 확인해주세요.';
    return '로그인에 실패했습니다. 잠시 후 다시 시도해주세요.';
  };

  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      const uid = mode === 'signup' ? await signUpEmail(email, pw) : await signInEmail(email, pw);
      await go(uid);
    } catch (e) { setErr(messageOf(e)); }
    setBusy(false);
  };

  const demo = async () => {
    setErr(''); setBusy(true);
    try { await go(await signInAnon()); }
    catch (e) { setErr(messageOf(e)); }
    setBusy(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.ink, justifyContent: 'center', padding: 24 }}>
      <Text style={{ fontSize: 32, fontWeight: '900', color: '#fff', textAlign: 'center' }}>🎾</Text>
      <Text style={{ fontSize: 22, fontWeight: '900', color: '#fff', textAlign: 'center', marginTop: 8 }}>테니스매치</Text>
      <Text style={{ fontSize: 13, color: '#6ee7b7', textAlign: 'center', marginTop: 4, marginBottom: 28 }}>클럽 운영을 한 곳에서</Text>

      {!!inviteCode && (
        <Card style={{ backgroundColor: C.green, borderColor: C.lime2, marginBottom: 12 }}>
          <Text style={{ color: C.lime, fontSize: 12, fontWeight: '800' }}>초대 코드 {inviteCode}</Text>
          <Text style={{ color: '#a7f3d0', fontSize: 11, marginTop: 3 }}>
            로그인(또는 가입)하면 초대받은 클럽으로 바로 들어갑니다.
          </Text>
        </Card>
      )}

      <Card>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
          {[['signin', '로그인'], ['signup', '회원가입']].map(([k, label]) => (
            <Pressable key={k} onPress={() => { setMode(k); setErr(''); }}
              style={{
                flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: 'center',
                backgroundColor: mode === k ? C.green : '#f5f5f4',
              }}>
              <Text style={{ fontWeight: '700', fontSize: 13, color: mode === k ? C.lime : C.sub }}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={{ fontSize: 12, color: C.sub, marginBottom: 4 }}>이메일</Text>
        <Field
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
        />
        <Text style={{ fontSize: 12, color: C.sub, marginTop: 10, marginBottom: 4 }}>비밀번호</Text>
        <Field placeholder="6자 이상" secureTextEntry value={pw} onChangeText={setPw} />

        <View style={{ marginTop: 14 }}>
          <Btn full disabled={busy || !email || pw.length < 6} onPress={submit}>
            {busy ? '처리 중…' : (mode === 'signup' ? '가입하고 시작하기' : '로그인')}
          </Btn>
        </View>

        {err ? <Text style={{ fontSize: 12, color: C.danger, textAlign: 'center', marginTop: 10 }}>{err}</Text> : null}
      </Card>

      <View style={{ alignItems: 'center', marginTop: 20 }}>
        <Pressable disabled={busy} onPress={demo}>
          <Text style={{ color: '#6ee7b7', fontSize: 13, fontWeight: '700' }}>계정 없이 체험해보기 →</Text>
        </Pressable>
        <Text style={{ color: '#34d399', fontSize: 10, marginTop: 6, textAlign: 'center' }}>
          체험 모드는 앱을 삭제하면 데이터가 사라집니다. 실제 클럽 운영은 이메일 가입을 권장합니다.
        </Text>
      </View>
    </View>
  );
}
