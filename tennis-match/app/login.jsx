/* ============================================================
   로그인 · 회원가입

   이 화면이 앱의 첫인상이다. 여기가 허술하면 뒤가 아무리 잘 되어 있어도
   "만들다 만 앱"으로 읽힌다.

   고친 것들 (예전 화면의 문제)
     · 키보드가 올라오면 입력칸을 가렸다. 작은 기기에서는 비밀번호 칸이
       아예 안 보였다 → KeyboardAvoidingView + 스크롤
     · 🎾 이모지를 로고로 썼다. 기기마다 모양이 달라 장난스러워 보인다
       → 앱 전체가 쓰는 벡터 아이콘으로 통일
     · 오류가 작은 가운데 글씨 하나였다. 무엇이 잘못됐는지 눈에 안 들어온다
       → 색이 있는 칸으로, 입력칸 바로 위에
     · 비밀번호를 볼 방법이 없었다. 오타를 냈는지 알 수가 없다 → 보기 단추
     · 비밀번호 찾기가 없었다. 잊으면 막다른 길이었다
     · ⚠️ 약관 동의를 받지 않고 가입시켰다. 개인정보를 모으면서 동의를
       안 받는 것이라, 법에도 스토어 심사에도 걸린다

   소셜 로그인
     준비된 것만 나온다(키가 없는 제공자는 버튼 자체가 안 그려진다).
     지금 실제로 도는 것은 **구글뿐**이다 — 카카오·네이버는 토큰을
     Firebase 계정으로 바꿔 줄 서버 함수가 더 있어야 하고, 애플은
     Apple Developer 계정이 있어야 한다.

     어느 버튼을 그릴지는 src/lib/social.js,
     실제로 창을 띄우는 것은 src/lib/socialSignIn.js.
   ============================================================ */
import React, { useMemo, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, Modal,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  signInEmail, signUpEmail, signInAnon, getMySession, sendReset,
} from '../src/lib/auth';
import { Btn, Field, CheckRow } from '../src/components/ui';
import { SocialButtons } from '../src/components/SocialButtons';
import { PROVIDER_SHORT, PROVIDERS } from '../src/lib/social';
import { useGoogleSignIn } from '../src/lib/socialSignIn';
import { TERMS, PRIVACY } from '../src/lib/legalText';
import { C, S, R, F, SHADOW } from '../src/lib/theme';

/* 화면에서 바로 거르는 것 — 서버까지 갔다 와서 "형식이 틀렸다"고
   듣는 것보다, 누르기 전에 아는 편이 낫다. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PW = 6;

/** 화면 전체를 덮는 자리 — 처리 중 가림막에 쓴다 */
const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 };

export default function Login() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const inviteCode = params?.code ? String(params.code).toUpperCase() : '';

  const [mode, setMode] = useState(inviteCode ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');          // 성공/안내 (오류와 다른 색)
  const [legal, setLegal] = useState(null);      // null | 'terms' | 'privacy'
  const [touched, setTouched] = useState(false); // 한 번이라도 제출을 눌렀나

  const signup = mode === 'signup';

  /* 구글 로그인. 훅이라 조건 없이 부른다 — 키가 없으면 ready 가 false 가
     되고, 버튼 자체도 안 그려진다. 성공하면 이메일 로그인과 똑같이 go(). */
  const google = useGoogleSignIn({ onDone: (uid) => { go(uid); } });

  /* 입력이 성립하는가. 제출을 누르기 전에는 빨간 글씨를 띄우지 않는다 —
     아직 다 치지도 않았는데 "틀렸다"고 하면 성가시기만 하다. */
  const emailBad = !!email && !EMAIL_RE.test(email.trim());
  const pwShort = !!pw && pw.length < MIN_PW;
  const canSubmit = EMAIL_RE.test(email.trim())
    && pw.length >= MIN_PW
    && (!signup || agree)
    && !busy;

  const switchMode = (k) => {
    setMode(k); setErr(''); setNote(''); setTouched(false);
  };

  const go = async (uid) => {
    /* 초대 링크를 타고 온 경우 로그인 후 그 초대로 되돌아간다 */
    if (inviteCode) { router.replace({ pathname: '/join', params: { code: inviteCode } }); return; }
    const s = await getMySession(uid);
    router.replace(s.clubId || s.skipped ? '/(tabs)' : '/onboarding');
  };

  const messageOf = (e) => {
    const code = e?.code || '';
    if (code.includes('invalid-credential') || code.includes('wrong-password')) return '이메일 또는 비밀번호가 올바르지 않습니다.';
    if (code.includes('user-not-found')) return '가입되지 않은 이메일입니다. 위에서 [회원가입]을 눌러 주세요.';
    if (code.includes('email-already-in-use')) return '이미 가입된 이메일입니다. 위에서 [로그인]을 눌러 주세요.';
    if (code.includes('weak-password')) return `비밀번호는 ${MIN_PW}자 이상이어야 합니다.`;
    if (code.includes('invalid-email')) return '이메일 형식을 확인해 주세요.';
    if (code.includes('too-many-requests')) return '시도가 너무 많습니다. 잠시 후 다시 해 주세요.';
    if (code.includes('operation-not-allowed')) return 'Firebase 콘솔에서 해당 로그인 방법을 사용 설정해 주세요.';
    if (code.includes('network')) return '네트워크 연결을 확인해 주세요.';
    return '로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.';
  };

  const submit = async () => {
    setTouched(true);
    if (!canSubmit) return;
    setErr(''); setNote(''); setBusy(true);
    try {
      const uid = signup ? await signUpEmail(email, pw) : await signInEmail(email, pw);
      await go(uid);
    } catch (e) { setErr(messageOf(e)); }
    setBusy(false);
  };

  const demo = async () => {
    setErr(''); setNote(''); setBusy(true);
    try { await go(await signInAnon()); }
    catch (e) { setErr(messageOf(e)); }
    setBusy(false);
  };

  const reset = async () => {
    setErr(''); setNote('');
    if (!EMAIL_RE.test(email.trim())) {
      setErr('비밀번호를 다시 정하려면 먼저 이메일을 넣어 주세요.');
      return;
    }
    setBusy(true);
    const r = await sendReset(email);
    setBusy(false);
    /* ⚠️ 가입 안 된 주소여도 같은 문구를 보여 준다 — 남의 가입 여부를
       알아내는 통로가 되면 안 된다. auth.js 의 sendReset 머리말 참고. */
    if (r.ok) setNote(`${email.trim()} 으로 비밀번호 재설정 메일을 보냈습니다. 받은편지함을 확인해 주세요.`);
    else setErr(r.reason);
  };

  const onSocial = (p) => {
    setErr(''); setNote('');
    if (p === PROVIDERS.GOOGLE) { google.signIn(); return; }
    /* 카카오·네이버·애플은 아직 흐름이 없다. 키를 넣으면 버튼은
       나오지만 눌러도 안 되는 상태가 되므로, 그 사실을 말해 준다 —
       아무 일도 안 일어나는 것이 제일 나쁘다. */
    setErr(`${PROVIDER_SHORT[p]} 로그인은 아직 준비 중입니다.`);
  };

  const legalBody = legal === 'terms' ? TERMS : PRIVACY;
  const legalTitle = legal === 'terms' ? '이용약관' : '개인정보처리방침';

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: insets.top + S.xxl,
            paddingBottom: insets.bottom + S.xxl,
            paddingHorizontal: S.xl,
          }}>

          {/* ---------- 브랜드 ---------- */}
          <View style={{ alignItems: 'center', marginBottom: S.xxl }}>
            <View style={[{
              width: 62, height: 62, borderRadius: 20,
              backgroundColor: C.ink,
              alignItems: 'center', justifyContent: 'center',
            }, SHADOW.md]}>
              <Ionicons name="tennisball" size={30} color={C.lime} />
            </View>
            <Text style={{
              fontSize: 24, fontWeight: '700', color: C.text,
              letterSpacing: -0.6, marginTop: S.md,
            }}>테니스매치</Text>
            <Text style={{ fontSize: 13.5, color: C.sub, marginTop: 5 }}>
              클럽 운영을 한 곳에서
            </Text>
          </View>

          {/* ---------- 초대 배너 ---------- */}
          {!!inviteCode && (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              backgroundColor: C.greenSoft, borderRadius: R.md,
              padding: S.md, marginBottom: S.lg,
            }}>
              <Ionicons name="mail-open-outline" size={18} color={C.green} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.green }}>
                  초대 코드 {inviteCode}
                </Text>
                <Text style={{ fontSize: 11.5, color: C.sub, marginTop: 2, lineHeight: 17 }}>
                  가입하거나 로그인하면 초대받은 클럽으로 바로 들어갑니다.
                </Text>
              </View>
            </View>
          )}

          {/* ---------- 폼 ---------- */}
          <View style={[{
            backgroundColor: C.surface, borderRadius: R.xl, padding: S.xl,
          }, SHADOW.md]}>

            {/* 로그인 / 회원가입 */}
            <View style={{
              flexDirection: 'row', backgroundColor: C.fill,
              borderRadius: R.md, padding: 3, marginBottom: S.xl,
            }}>
              {[['signin', '로그인'], ['signup', '회원가입']].map(([k, label]) => {
                const on = mode === k;
                return (
                  <Pressable key={k} onPress={() => switchMode(k)}
                    style={[{
                      flex: 1, alignItems: 'center', paddingVertical: 10,
                      borderRadius: R.sm,
                      backgroundColor: on ? C.surface : 'transparent',
                    }, on ? SHADOW.sm : null]}>
                    <Text style={{
                      fontSize: 14, fontWeight: '700',
                      color: on ? C.green : C.sub,
                    }}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* 알림칸 — 오류와 안내를 같은 자리에서, 다른 색으로 */}
            {/* 구글 쪽 실패도 같은 자리에 같은 모양으로 보여 준다.
                오류가 화면마다 다른 자리에 뜨면 못 보고 지나친다. */}
            {!!(err || google.error) && <Banner tone="danger" text={err || google.error} />}
            {!!note && !err && !google.error && <Banner tone="info" text={note} />}

            <Text style={[F.label, { marginBottom: 6 }]}>이메일</Text>
            <Field
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              value={email}
              onChangeText={(v) => { setEmail(v); setErr(''); }}
              error={touched && emailBad ? '이메일 형식을 확인해 주세요' : ''}
            />

            <Text style={[F.label, { marginTop: S.lg, marginBottom: 6 }]}>비밀번호</Text>
            <Field
              placeholder={`${MIN_PW}자 이상`}
              secureTextEntry={!showPw}
              autoCapitalize="none"
              autoComplete={signup ? 'new-password' : 'current-password'}
              textContentType={signup ? 'newPassword' : 'password'}
              returnKeyType="go"
              onSubmitEditing={submit}
              value={pw}
              onChangeText={(v) => { setPw(v); setErr(''); }}
              error={touched && pwShort ? `${MIN_PW}자 이상 입력해 주세요` : ''}
              suffix={
                <Pressable onPress={() => setShowPw((v) => !v)} hitSlop={10}>
                  <Ionicons
                    name={showPw ? 'eye-off-outline' : 'eye-outline'}
                    size={19} color={C.faint}
                  />
                </Pressable>
              }
            />

            {/* 약관 동의 — 가입할 때만.
                ⚠️ 이게 없으면 개인정보를 동의 없이 모으는 것이 된다. */}
            {signup && (
              <View style={{ marginTop: S.lg }}>
                <CheckRow
                  checked={agree}
                  onToggle={() => { setAgree((v) => !v); setErr(''); }}
                  label="이용약관과 개인정보처리방침에 동의합니다"
                />
                <View style={{ flexDirection: 'row', gap: S.lg, marginLeft: 32, marginTop: 6 }}>
                  <LinkText onPress={() => setLegal('terms')}>이용약관 보기</LinkText>
                  <LinkText onPress={() => setLegal('privacy')}>개인정보처리방침 보기</LinkText>
                </View>
              </View>
            )}

            <View style={{ marginTop: S.xl }}>
              <Btn full disabled={!canSubmit} onPress={submit}>
                {busy ? '처리 중…' : signup ? '동의하고 가입하기' : '로그인'}
              </Btn>
            </View>

            {!signup && (
              <View style={{ alignItems: 'center', marginTop: S.md }}>
                <LinkText onPress={busy ? undefined : reset}>비밀번호를 잊으셨나요?</LinkText>
              </View>
            )}

            {/* 소셜 — 준비된 것이 없으면 구분선까지 통째로 안 나온다 */}
            <SocialButtons
              onPress={onSocial}
              disabled={busy || google.busy}
              style={{ marginTop: S.xl }}
            />
          </View>

          {/* ---------- 체험 모드 ---------- */}
          <View style={{ alignItems: 'center', marginTop: S.xxl }}>
            <Pressable
              disabled={busy}
              onPress={demo}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingVertical: 10, paddingHorizontal: 16,
                opacity: pressed ? 0.6 : 1,
              })}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.green }}>
                계정 없이 둘러보기
              </Text>
              <Ionicons name="arrow-forward" size={15} color={C.green} />
            </Pressable>
            <Text style={{
              fontSize: 11.5, color: C.faint, textAlign: 'center',
              marginTop: 2, lineHeight: 17, maxWidth: 300,
            }}>
              둘러보기로 만든 기록은 앱을 지우면 사라집니다.
              실제 클럽 운영은 가입 후 이용해 주세요.
            </Text>
            {/* 둘러보기도 계정을 만드는 것이라(익명 계정) 동의 근거가 필요하다.
                체크박스를 하나 더 두면 "그냥 구경만 하려는" 사람을 막게 되므로,
                눌러서 진행하는 것으로 갈음하고 문서로 가는 길을 함께 둔다. */}
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              justifyContent: 'center', flexWrap: 'wrap', gap: 4, marginTop: 8,
            }}>
              <Text style={{ fontSize: 11, color: C.faint }}>계속하면</Text>
              <LinkText onPress={() => setLegal('terms')}>이용약관</LinkText>
              <Text style={{ fontSize: 11, color: C.faint }}>및</Text>
              <LinkText onPress={() => setLegal('privacy')}>개인정보처리방침</LinkText>
              <Text style={{ fontSize: 11, color: C.faint }}>에 동의하게 됩니다</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 처리 중 — 화면 전체를 덮어 두 번 눌리는 것을 막는다 */}
      {(busy || google.busy) && (
        <View style={{
          ...FILL,
          backgroundColor: 'rgba(255,255,255,0.55)',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <ActivityIndicator size="large" color={C.green} />
        </View>
      )}

      {/* 약관 전문 */}
      <Modal visible={!!legal} animationType="slide" onRequestClose={() => setLegal(null)}>
        <View style={{ flex: 1, backgroundColor: C.surface, paddingTop: insets.top }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: S.xl, paddingVertical: S.md,
            borderBottomWidth: 1, borderBottomColor: C.border,
          }}>
            <Text style={F.h2}>{legalTitle}</Text>
            <Pressable onPress={() => setLegal(null)} hitSlop={10}>
              <Ionicons name="close" size={24} color={C.text} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{
            padding: S.xl, paddingBottom: insets.bottom + S.xxl,
          }}>
            <Text selectable style={{ fontSize: 12.5, color: C.text, lineHeight: 21 }}>
              {legalBody}
            </Text>
          </ScrollView>
          <View style={{
            padding: S.xl, paddingBottom: insets.bottom + S.lg,
            borderTopWidth: 1, borderTopColor: C.border,
          }}>
            <Btn full onPress={() => { setAgree(true); setLegal(null); setErr(''); }}>
              읽었고 동의합니다
            </Btn>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ---------------- 작은 조각들 ---------------- */

const LinkText = ({ children, onPress }) => (
  <Pressable onPress={onPress} hitSlop={8}
    style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
    <Text style={{
      fontSize: 12.5, fontWeight: '600', color: C.green2,
      textDecorationLine: 'underline',
    }}>{children}</Text>
  </Pressable>
);

/** 오류·안내 칸. 작은 가운데 글씨보다 훨씬 잘 읽힌다. */
const Banner = ({ tone, text }) => {
  const t = tone === 'danger'
    ? { bg: C.dangerBg, fg: C.danger, icon: 'alert-circle' }
    : { bg: C.infoBg, fg: C.info, icon: 'information-circle' };
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'flex-start', gap: 8,
      backgroundColor: t.bg, borderRadius: R.md,
      padding: S.md, marginBottom: S.lg,
    }}>
      <Ionicons name={t.icon} size={17} color={t.fg} style={{ marginTop: 1 }} />
      <Text style={{ flex: 1, fontSize: 12.5, color: t.fg, lineHeight: 18.5 }}>
        {text}
      </Text>
    </View>
  );
};
