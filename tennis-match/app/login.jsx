/* ============================================================
   로그인 · 회원가입 — v4 (외부 디자인 검토 반영)

   구조
     위는 어두운 히어로(브랜드), 아래는 흰 시트(행동). 검토 문서가
     제안한 형태다. 코트 사진 대신 브랜드 색을 쓴다 — 시안은 외부
     사진을 링크로 불러오는데, 스토어에 올릴 앱에서 남의 서버 사진을
     로그인 화면에 걸면 느리고, 인터넷이 없으면 첫 화면이 비고,
     저작권도 따로 확인해야 한다.

   소셜을 위로, 이메일을 아래로
     검토 문서의 순서를 따랐다. 다만 이메일을 없애지는 않았다 —
     시안에는 이메일 칸이 아예 없는데, 지금 이 앱에서 실제로 도는
     로그인은 이메일과 구글 둘뿐이고 기존 회원은 이메일로 들어온다.
     대신 접어 두고, 소셜이 하나도 없으면 자동으로 펼친다. 그래야
     소셜이 안 켜진 빌드에서 로그인할 길이 사라지지 않는다.

   그대로 지킨 것 (예전 화면에서 고쳤던 것들 — 되돌리면 안 된다)
     · 키보드가 입력칸을 가리지 않게
     · 오류는 색 있는 칸으로, 입력칸 가까이
     · 비밀번호 보기 / 비밀번호 찾기
     · ⚠️ 가입 시 약관 동의. 이게 없으면 개인정보를 동의 없이 모으는
       것이라 법에도 스토어 심사에도 걸린다. 시안에는 체크박스가 없고
       "계속하면 동의하게 됩니다" 문구만 있는데, 그건 둘러보기처럼
       가벼운 길에만 쓰고 가입에는 명시적 동의를 받는다.
   ============================================================ */
import React, { useState } from 'react';
import {
  View, Text, Pressable, ScrollView, Modal, Platform, Image,
  KeyboardAvoidingView, ActivityIndicator, LayoutAnimation, UIManager,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { Icon } from '../src/components/Icon';
import {
  signInEmail, signUpEmail, signInAnon, getMySession, sendReset,
} from '../src/lib/auth';
import { Btn, Field, CheckRow } from '../src/components/ui';
import { SocialButtons, OrDivider } from '../src/components/SocialButtons';
import { PROVIDER_SHORT, PROVIDERS, enabledProviders } from '../src/lib/social';
import { LIVE_SOCIAL_CONFIG } from '../src/lib/socialConfig';
/* ⚠️ 네이티브 모듈을 직접 부르지 않는다. socialSignIn 은 버튼을 눌렀을
   때에만 안에서 await import() 한다 — 그 파일 머리말 참고. 여기서
   무심코 expo-auth-session 을 import 하면 앱이 시작도 못 하고 닫힌다.
   실제로 한 번 그렇게 됐다. 검사가 이걸 막고 있다. */
import { signInWithGoogle } from '../src/lib/socialSignIn';
import { TERMS, PRIVACY } from '../src/lib/legalText';
import { C, S, R, F, SHADOW, TAP } from '../src/lib/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PW = 6;
const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 };

/* 접었다 펴는 동작. 없어도 되지만 있으면 훨씬 부드럽다.
   ⚠️ try 로 감싼다 — 기기·아키텍처에 따라 이 API 가 없을 수 있고,
      고작 애니메이션 때문에 로그인 화면이 죽으면 안 된다. */
try {
  if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
} catch { /* 없으면 애니메이션만 없다 */ }
const animate = () => {
  try { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); } catch { /* noop */ }
};

export default function Login() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const inviteCode = params?.code ? String(params.code).toUpperCase() : '';

  const socials = enabledProviders(LIVE_SOCIAL_CONFIG, Platform.OS);

  const [mode, setMode] = useState(inviteCode ? 'signup' : 'signin');
  /* 소셜이 없으면 이메일이 유일한 길이다. 그때는 처음부터 펼쳐 둔다. */
  const [openEmail, setOpenEmail] = useState(socials.length === 0 || !!inviteCode);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [legal, setLegal] = useState(null);
  const [touched, setTouched] = useState(false);

  const signup = mode === 'signup';
  const emailBad = !!email && !EMAIL_RE.test(email.trim());
  const pwShort = !!pw && pw.length < MIN_PW;
  const canSubmit = EMAIL_RE.test(email.trim())
    && pw.length >= MIN_PW && (!signup || agree) && !busy;

  const go = async (uid) => {
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
    if (r.ok) setNote(`${email.trim()} 으로 비밀번호 재설정 메일을 보냈습니다.`);
    else setErr(r.reason);
  };

  const onSocial = async (p) => {
    setErr(''); setNote('');
    if (p !== PROVIDERS.GOOGLE) {
      setErr(`${PROVIDER_SHORT[p]} 로그인은 아직 준비 중입니다.`);
      return;
    }
    setBusy(true);
    const r = await signInWithGoogle();
    if (r.ok) { await go(r.uid); setBusy(false); return; }
    setBusy(false);
    if (r.error) setErr(r.error);   // 빈 문자열이면 사용자가 창을 닫은 것
  };

  /* 소셜 버튼이 하나도 없을 때 빠져나갈 길.

     ⚠️ 키는 빌드할 때도, OTA 를 만들 때도 앱에 박힌다. 그래서 어느 한
        쪽에 키가 빠지면 [구글로 시작하기] 가 조용히 사라진다. 실제로
        그렇게 됐다 — 배포 워크플로가 키 없이 OTA 를 내보냈고, 기기에서
        버튼이 없어졌다.

        그때 사용자가 할 수 있는 일이 아무것도 없다는 것이 진짜 문제였다.
        버튼이 없으니 누를 것도 없고, 로그인을 못 하니 [더보기]의 앱 정보
        화면에도 못 간다. 여기서 바로 업데이트를 받을 수 있어야 한다.

     ⚠️ expo-updates 도 누를 때 부른다. 맨 위에서 부르면 이 모듈이
        없는 빌드에서 앱이 시작도 못 하고 닫힌다. */
  const [fixing, setFixing] = useState(false);
  const onFetchUpdate = async () => {
    setFixing(true); setErr(''); setNote('업데이트를 확인하는 중…');
    try {
      const U = await import('expo-updates');
      const res = await U.checkForUpdateAsync();
      if (!res?.isAvailable) {
        setFixing(false);
        setNote('');
        setErr('새 업데이트가 없습니다. 이 버전에는 소셜 로그인이 들어 있지 않으니 이메일로 로그인해 주세요.');
        return;
      }
      await U.fetchUpdateAsync();
      await U.reloadAsync();          // 여기서 앱이 다시 시작된다
    } catch (e) {
      setFixing(false);
      setNote('');
      setErr('업데이트를 받지 못했습니다. 인터넷 연결을 확인해 주세요.');
    }
  };

  const legalBody = legal === 'terms' ? TERMS : PRIVACY;
  const legalTitle = legal === 'terms' ? '이용약관' : '개인정보처리방침';

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1 }}>

          {/* ---------------- 히어로 ----------------

              코트 사진 + 로고. 둘 다 앱에 실어 둔 파일이다(assets/brand).
              ⚠️ 외부 주소로 불러오지 않는다 — 스토어 앱의 첫 화면이
                 남의 서버 사정에 달리면 안 되고, 비행기 모드에서도
                 화면이 비면 안 된다.

              사진 위에 글씨를 얹지 않았다. 시안은 사진 위에 제목을
              올리는데, 사진의 밝기는 기기 밝기와 햇빛에 따라 달라져서
              어떤 상황에서는 글씨가 사라진다. 글씨는 전부 흰 시트에 둔다. */}
          <View style={{ height: 224, backgroundColor: C.ink }}>
            <Image
              source={require('../assets/brand/court-hero.webp')}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
            {/* 아래로 갈수록 짙어지는 덮개. 시트와 자연스럽게 이어지고,
                사진이 밝아도 아래쪽 경계가 뭉개지지 않는다. */}
            <View style={{ ...FILL, backgroundColor: 'rgba(19,42,34,0.28)' }} />
            <View style={{
              position: 'absolute', left: 0, right: 0, bottom: 0, height: 90,
              backgroundColor: 'rgba(19,42,34,0.55)',
            }} />

            {/* 상단 배지 — 숫자를 적지 않는다.
                ⚠️ 시안에는 "전국 520+ 클럽 운영 중"이 있는데 사실이 아니다.
                   첫 화면에 없는 숫자를 적으면 광고로도 문제이고, 아는
                   사람에게는 앱 전체의 신뢰를 깎는다. 실제로 셀 수 있게
                   되면 그때 서버 값으로 넣는다. */}
            <View style={{
              position: 'absolute', top: insets.top + S.md, left: S.xl,
              flexDirection: 'row', alignItems: 'center', gap: 7,
              backgroundColor: 'rgba(255,255,255,0.92)',
              borderRadius: R.pill, paddingHorizontal: 13, paddingVertical: 7,
            }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.green }} />
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.green }}>
                테니스 클럽 운영 올인원
              </Text>
            </View>
          </View>

          {/* 로고 — 사진과 시트 경계에 걸친다 (시안의 엠블럼 자리) */}
          <View style={{ alignItems: 'center', marginTop: -36, zIndex: 5 }}>
            <View style={[{
              width: 72, height: 72, borderRadius: 22, padding: 6,
              backgroundColor: C.surface,
            }, SHADOW.md]}>
              <Image
                source={require('../assets/brand/logo.png')}
                style={{ width: '100%', height: '100%' }}
                resizeMode="contain"
              />
            </View>
          </View>

          {/* ---------------- 시트 ---------------- */}
          <View style={[{
            flexGrow: 1,
            backgroundColor: C.surface,
            borderTopLeftRadius: R.xxl, borderTopRightRadius: R.xxl,
            marginTop: -S.lg,
            paddingHorizontal: S.xl,
            paddingTop: S.md,
            paddingBottom: insets.bottom + S.xl,
          }, SHADOW.lg]}>

            {/* 브랜드 — 시안처럼 마침표를 브랜드 색으로 */}
            <View style={{ alignItems: 'center', marginBottom: S.xl }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
                <Text style={{
                  fontSize: 27, fontWeight: '800', color: C.text, letterSpacing: -0.8,
                }}>테니스매치</Text>
                <Text style={{
                  fontSize: 27, fontWeight: '800', color: C.green, letterSpacing: -0.8,
                }}>.</Text>
              </View>
              <Text style={{ fontSize: 14, color: C.sub, marginTop: 5 }}>
                더 즐겁고 편한 클럽 테니스 라이프
              </Text>
            </View>

            {!!inviteCode && (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                backgroundColor: C.greenSoft, borderRadius: R.md,
                padding: S.md, marginBottom: S.lg,
              }}>
                <Ionicons name="mail-open-outline" size={18} color={C.green} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '700', color: C.green }}>
                    초대 코드 {inviteCode}
                  </Text>
                  <Text style={{ fontSize: 12, color: C.sub, marginTop: 2, lineHeight: 17 }}>
                    가입하거나 로그인하면 초대받은 클럽으로 바로 들어갑니다.
                  </Text>
                </View>
              </View>
            )}

            {!!err && <Banner tone="danger" text={err} />}
            {!!note && !err && <Banner tone="info" text={note} />}

            {/* 소셜 — 준비된 것만. 없으면 통째로 안 그려진다 */}
            <SocialButtons onPress={onSocial} disabled={busy} divider={false} />

            {/* 하나도 없으면 막다른 길이 된다. 업데이트를 받을 길을 둔다 */}
            {socials.length === 0 && (
              <Pressable
                onPress={fixing ? undefined : onFetchUpdate}
                disabled={fixing}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  minHeight: TAP.small, paddingHorizontal: 14,
                  borderRadius: R.md, backgroundColor: pressed ? C.fill : 'transparent',
                  opacity: fixing ? 0.5 : 1,
                })}>
                <Ionicons name="cloud-download-outline" size={15} color={C.sub} />
                <Text style={{ flex: 1, fontSize: 12, color: C.sub, lineHeight: 17 }}>
                  간편 로그인이 안 보이나요?{' '}
                  <Text style={{ fontWeight: '700', color: C.green }}>
                    {fixing ? '확인하는 중…' : '업데이트 확인'}
                  </Text>
                </Text>
              </Pressable>
            )}

            {/* 소셜 ↔ 이메일 전환.

                ⚠️ 예전에는 이 자리가 구분선에 글씨만 얹은 모양이었다.
                   눌리는 것인 줄 아무도 몰랐다 — 실제로 "이메일로 넘어간
                   다음 소셜로 돌아올 방법이 없다"는 말을 들었다. 선은
                   나누는 것이지 누르는 것이 아니므로 그렇게 보이는 게
                   당연하다. 테두리·화살표를 넣어 버튼처럼 보이게 한다. */}
            {socials.length > 0 && (
              <View style={{ marginTop: S.lg, alignItems: 'center' }}>
                <OrDivider label="또는" style={{ alignSelf: 'stretch' }} />
                <Pressable
                  onPress={() => { animate(); setOpenEmail((v) => !v); setErr(''); }}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: openEmail }}
                  accessibilityLabel={openEmail ? '소셜 로그인으로 돌아가기' : '이메일로 계속하기'}
                  style={({ pressed }) => ({
                    flexDirection: 'row', alignItems: 'center', gap: 7,
                    minHeight: TAP.small, paddingHorizontal: 16,
                    marginTop: S.md,
                    borderRadius: R.pill, borderWidth: 1, borderColor: C.border,
                    backgroundColor: pressed ? C.fill : C.surface,
                  })}>
                  <Ionicons
                    name={openEmail ? 'arrow-back' : 'mail-outline'}
                    size={15} color={C.sub} />
                  <Text style={{ fontSize: 13.5, fontWeight: '700', color: C.text }}>
                    {openEmail ? '소셜 로그인으로 돌아가기' : '이메일로 계속하기'}
                  </Text>
                </Pressable>
              </View>
            )}

            {openEmail && (
              <View style={{ marginTop: S.lg }}>
                <View style={{
                  flexDirection: 'row', backgroundColor: C.fill,
                  borderRadius: R.md, padding: 4, marginBottom: S.lg,
                }}>
                  {[['signin', '로그인'], ['signup', '회원가입']].map(([k, label]) => {
                    const on = mode === k;
                    return (
                      <Pressable key={k}
                        onPress={() => { setMode(k); setErr(''); setNote(''); setTouched(false); }}
                        style={[{
                          flex: 1, alignItems: 'center', paddingVertical: 11,
                          borderRadius: R.sm + 2,
                          backgroundColor: on ? C.surface : 'transparent',
                        }, on ? SHADOW.sm : null]}>
                        <Text style={{ fontSize: 14.5, fontWeight: '700', color: on ? C.green : C.sub }}>
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={[F.label, { marginBottom: 7 }]}>이메일</Text>
                <Field
                  placeholder="you@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none" autoCorrect={false}
                  autoComplete="email" textContentType="emailAddress"
                  returnKeyType="next"
                  value={email}
                  onChangeText={(v) => { setEmail(v); setErr(''); }}
                  error={touched && emailBad ? '이메일 형식을 확인해 주세요' : ''}
                />

                <Text style={[F.label, { marginTop: S.lg, marginBottom: 7 }]}>비밀번호</Text>
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
                    <Pressable onPress={() => setShowPw((v) => !v)} hitSlop={12}>
                      <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={21} color={C.faint} />
                    </Pressable>
                  }
                />

                {signup && (
                  <View style={{ marginTop: S.lg }}>
                    <CheckRow
                      checked={agree}
                      onToggle={() => { setAgree((v) => !v); setErr(''); }}
                      label="이용약관과 개인정보처리방침에 동의합니다"
                    />
                    <View style={{ flexDirection: 'row', gap: S.lg, marginLeft: 32, marginTop: 7 }}>
                      <LinkText onPress={() => setLegal('terms')}>이용약관 보기</LinkText>
                      <LinkText onPress={() => setLegal('privacy')}>개인정보처리방침 보기</LinkText>
                    </View>
                  </View>
                )}

                <View style={{ marginTop: S.xl }}>
                  <Btn full cta disabled={!canSubmit} onPress={submit}>
                    {busy ? '처리 중…' : signup ? '동의하고 가입하기' : '로그인'}
                  </Btn>
                </View>

                {!signup && (
                  <View style={{ alignItems: 'center', marginTop: S.md }}>
                    <LinkText onPress={busy ? undefined : reset}>비밀번호를 잊으셨나요?</LinkText>
                  </View>
                )}
              </View>
            )}

            {/* ---------------- 둘러보기 ---------------- */}
            <View style={{ marginTop: S.xl }}>
              <Btn full cta tone="soft" disabled={busy} onPress={demo}
                icon={<Icon name="ball" size={19} color={C.green} />}>
                계정 없이 클럽 둘러보기
              </Btn>
              <Text style={{
                fontSize: 12.5, color: C.sub, textAlign: 'center',
                marginTop: 8, lineHeight: 18,
              }}>
                게스트 모집 게시판과 코트 검색을 바로 볼 수 있습니다
              </Text>
              <Text style={{
                fontSize: 11.5, color: C.faint, textAlign: 'center',
                marginTop: 3, lineHeight: 17,
              }}>
                둘러보기로 만든 기록은 앱을 지우면 사라집니다
              </Text>
            </View>

            {/* ---------------- 이 앱이 하는 일 ----------------

                ⚠️ 시안의 세 칸은 "실명 인증 매칭 / NTRP 등급제 / 코트
                   알림 실시간 빈자리"인데, 셋 다 이 앱에 없는 기능이다.
                   첫 화면에 없는 기능을 적으면 받은 사람이 그걸 기대하고
                   들어왔다가 못 찾는다. 실제로 있는 것 세 가지로 바꿨다. */}
            <View style={[{
              flexDirection: 'row', marginTop: S.xxl,
              backgroundColor: C.surface, borderRadius: R.lg,
              borderWidth: 1, borderColor: C.border,
              paddingVertical: S.md, paddingHorizontal: S.sm,
            }, SHADOW.sm]}>
              {[
                ['schedule', '일정 · 참석 투표', '누르면 바로 반영'],
                ['match', '대진 자동 편성', '출전 수까지 고르게'],
                ['fees', '회비 · 입금 대사', '단톡방 독촉 없이'],
              ].map(([icon, title, sub]) => (
                <View key={title} style={{ flex: 1, alignItems: 'center', paddingHorizontal: 3 }}>
                  <Icon name={icon} size={21} color={C.green} />
                  <Text numberOfLines={1} style={{
                    fontSize: 12, fontWeight: '700', color: C.text, marginTop: 6,
                  }}>{title}</Text>
                  <Text numberOfLines={1} style={{ fontSize: 10.5, color: C.faint, marginTop: 2 }}>
                    {sub}
                  </Text>
                </View>
              ))}
            </View>

            {/* 둘러보기도 계정(익명)을 만드는 것이라 동의 근거가 필요하다.
                체크박스를 하나 더 두면 구경만 하려는 사람을 막게 되므로,
                진행으로 갈음하고 문서로 가는 길을 함께 둔다. */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              flexWrap: 'wrap', gap: 4, marginTop: S.xl,
            }}>
              <Text style={{ fontSize: 11.5, color: C.faint }}>계속 진행 시 테니스매치의</Text>
              <LinkText small onPress={() => setLegal('terms')}>이용약관</LinkText>
              <Text style={{ fontSize: 11.5, color: C.faint }}>및</Text>
              <LinkText small onPress={() => setLegal('privacy')}>개인정보처리방침</LinkText>
              <Text style={{ fontSize: 11.5, color: C.faint }}>에 동의하게 됩니다</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {busy && (
        <View style={{ ...FILL, backgroundColor: 'rgba(255,255,255,0.6)', alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={C.green} />
        </View>
      )}

      <Modal visible={!!legal} animationType="slide" onRequestClose={() => setLegal(null)}>
        <View style={{ flex: 1, backgroundColor: C.surface, paddingTop: insets.top }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: S.xl, paddingVertical: S.md,
            borderBottomWidth: 1, borderBottomColor: C.border,
          }}>
            <Text style={F.h2}>{legalTitle}</Text>
            <Pressable onPress={() => setLegal(null)} hitSlop={12}>
              <Ionicons name="close" size={26} color={C.text} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: S.xl, paddingBottom: insets.bottom + S.xxl }}>
            <Text selectable style={{ fontSize: 13.5, color: C.text, lineHeight: 22 }}>{legalBody}</Text>
          </ScrollView>
          <View style={{
            padding: S.xl, paddingBottom: insets.bottom + S.lg,
            borderTopWidth: 1, borderTopColor: C.border,
          }}>
            <Btn full cta onPress={() => { setAgree(true); setLegal(null); setErr(''); }}>
              읽었고 동의합니다
            </Btn>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ---------------- 작은 조각들 ---------------- */

const LinkText = ({ children, onPress, small }) => (
  <Pressable onPress={onPress} hitSlop={10}
    style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
    <Text style={{
      fontSize: small ? 11.5 : 13.5, fontWeight: '600', color: C.green2,
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
      flexDirection: 'row', alignItems: 'flex-start', gap: 9,
      backgroundColor: t.bg, borderRadius: R.md,
      padding: S.md, marginBottom: S.lg,
    }}>
      <Ionicons name={t.icon} size={18} color={t.fg} style={{ marginTop: 1 }} />
      <Text style={{ flex: 1, fontSize: 13.5, color: t.fg, lineHeight: 20 }}>{text}</Text>
    </View>
  );
};
