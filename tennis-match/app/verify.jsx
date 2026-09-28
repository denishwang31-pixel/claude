/* ============================================================
   이메일 인증 대기 화면

   이메일·비밀번호로 새로 가입한 사람은 받은 메일의 링크를 눌러야 앱에 들어온다
   (없는 사람이 가입해 활동하는 것을 막는다 — 앱 주인 요청). 누구를 막는지는
   src/lib/verify.js. 기존 회원·구글·카카오·네이버·둘러보기는 여기 오지 않는다.

   [인증을 마쳤어요]를 누르면 계정 정보를 새로 읽어 확인한다 — 링크를 눌러도
   앱이 저절로 알지 못한다(Firebase 가 알려 주지 않는다).
   ============================================================ */
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from './_layout';
import { sendVerify, refreshVerified, logout } from '../src/lib/auth';
import { resendWait, MAIL_HINT } from '../src/lib/verify';
import { Card, Btn } from '../src/components/ui';
import { C, F, S } from '../src/lib/theme';

export default function Verify() {
  const insets = useSafeAreaInsets();
  const { email, markVerified } = useApp() || {};
  const [lastSent, setLastSent] = useState(() => Date.now());   // 가입할 때 한 통 보냈다
  const [wait, setWait] = useState(resendWait(Date.now()));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    const t = setInterval(() => setWait(resendWait(lastSent)), 1000);
    return () => clearInterval(t);
  }, [lastSent]);

  const resend = async () => {
    setErr(''); setNote(''); setBusy(true);
    const r = await sendVerify();
    setBusy(false);
    if (r.ok) { setLastSent(Date.now()); setNote('인증 메일을 다시 보냈습니다.'); } else setErr(r.reason);
  };

  const check = async () => {
    setErr(''); setNote(''); setBusy(true);
    const ok = await refreshVerified();
    if (ok) { await markVerified?.(); return; }
    setBusy(false);
    setErr('아직 인증되지 않았습니다. 메일의 링크를 누른 뒤 다시 눌러 주세요.');
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ padding: S.xl, paddingTop: insets.top + 48, paddingBottom: 48 }}>
      <Text style={{ fontSize: 24, fontWeight: '800', color: C.text }}>이메일을 확인해 주세요</Text>
      <Text style={{ fontSize: 14.5, color: C.sub, marginTop: 10, lineHeight: 22 }}>
        <Text style={{ fontWeight: '800', color: C.text }}>{email || '가입한 주소'}</Text>
        {' '}으로 인증 메일을 보냈습니다. 메일의 링크를 누른 뒤 아래 [인증을 마쳤어요]를 눌러 주세요.
      </Text>

      <Card style={{ marginTop: S.xl, backgroundColor: C.fill }}>
        <Text style={{ fontSize: 13, color: C.sub, lineHeight: 20 }}>{MAIL_HINT}</Text>
        <Text style={{ fontSize: 13, color: C.sub, lineHeight: 20, marginTop: 6 }}>
          없는 사람이 가입해 클럽에서 활동하는 것을 막으려고 확인합니다. 한 번만 하면 됩니다.
        </Text>
      </Card>

      {!!note && <Text style={{ fontSize: 13.5, color: C.green, marginTop: S.lg, fontWeight: '700' }}>{note}</Text>}
      {!!err && <Text style={{ fontSize: 13.5, color: C.danger, marginTop: S.lg, fontWeight: '700' }}>{err}</Text>}

      <View style={{ marginTop: S.xl, gap: 10 }}>
        <Btn full cta disabled={busy} onPress={check}>{busy ? '확인 중…' : '인증을 마쳤어요'}</Btn>
        <Btn full tone="outline" disabled={busy || wait > 0} onPress={resend}>
          {wait > 0 ? `인증 메일 다시 보내기 (${wait}초)` : '인증 메일 다시 보내기'}
        </Btn>
        <Btn full tone="ghost" disabled={busy} onPress={() => logout()}>
          다른 계정으로 로그인
        </Btn>
      </View>
    </ScrollView>
  );
}
