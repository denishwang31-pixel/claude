/* PHASE 2 — 로그인 화면 (전화번호 OTP) — recaptcha 실배선(R-1 1차)
   1차: Firebase JS SDK + expo-firebase-recaptcha(FirebaseRecaptchaVerifierModal).
        ⚠️ 이 패키지는 deprecated 상태지만 JS SDK 전화인증의 현실적 유일 경로.
   2차: @react-native-firebase/auth + EAS dev build 로 마이그레이션(ROADMAP R-1). */
import React, { useState, useRef } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { FirebaseRecaptchaVerifierModal } from 'expo-firebase-recaptcha';
import { firebaseConfig } from '../firebaseConfig';
import { sendOtp, confirmOtp, getMyClubId } from '../src/lib/auth';
import { Card, Btn, Field } from '../src/components/ui';
import { C } from '../src/lib/theme';

export default function Login() {
  const router = useRouter();
  const [step, setStep] = useState('phone'); // phone → code
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [verId, setVerId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const recaptchaRef = useRef(null);

  const toE164 = (p) => {
    const digits = p.replace(/[^0-9+]/g, '');
    return digits.startsWith('0') ? '+82' + digits.slice(1) : digits;
  };

  const requestCode = async () => {
    setErr(''); setBusy(true);
    try {
      const id = await sendOtp(toE164(phone), recaptchaRef.current);
      setVerId(id); setStep('code');
    } catch (e) { setErr('인증번호 발송 실패. 번호를 확인하세요.'); }
    setBusy(false);
  };

  const verify = async () => {
    setErr(''); setBusy(true);
    try {
      const uid = await confirmOtp(verId, code);
      const clubId = await getMyClubId(uid);
      router.replace(clubId ? '/(tabs)' : '/onboarding');
    } catch (e) { setErr('인증번호가 올바르지 않습니다.'); }
    setBusy(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.ink, justifyContent: 'center', padding: 24 }}>
      <FirebaseRecaptchaVerifierModal
        ref={recaptchaRef}
        firebaseConfig={firebaseConfig}
        attemptInvisibleVerification
        title="봇이 아님을 확인"
        cancelLabel="닫기"
      />

      <Text style={{ fontSize: 32, fontWeight: '900', color: '#fff', textAlign: 'center' }}>🎾</Text>
      <Text style={{ fontSize: 22, fontWeight: '900', color: '#fff', textAlign: 'center', marginTop: 8 }}>테니스매치</Text>
      <Text style={{ fontSize: 13, color: '#6ee7b7', textAlign: 'center', marginTop: 4, marginBottom: 28 }}>클럽 운영을 한 곳에서</Text>

      <Card>
        {step === 'phone' ? (
          <>
            <Text style={{ fontSize: 13, fontWeight: '700', marginBottom: 8 }}>휴대폰 번호</Text>
            <Field placeholder="010-0000-0000" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
            <View style={{ marginTop: 12 }}>
              <Btn full disabled={busy || phone.replace(/\D/g, '').length < 10} onPress={requestCode}>{busy ? '발송 중…' : '인증번호 받기'}</Btn>
            </View>
          </>
        ) : (
          <>
            <Text style={{ fontSize: 13, fontWeight: '700', marginBottom: 8 }}>인증번호 6자리</Text>
            <Field placeholder="000000" keyboardType="number-pad" value={code} onChangeText={setCode} />
            <View style={{ marginTop: 12 }}>
              <Btn full disabled={busy || code.length < 6} onPress={verify}>{busy ? '확인 중…' : '로그인'}</Btn>
            </View>
            <Text onPress={() => setStep('phone')} style={{ fontSize: 12, color: C.sub, textAlign: 'center', marginTop: 12 }}>번호 다시 입력</Text>
          </>
        )}
        {err ? <Text style={{ fontSize: 12, color: C.danger, textAlign: 'center', marginTop: 10 }}>{err}</Text> : null}
      </Card>
    </View>
  );
}
