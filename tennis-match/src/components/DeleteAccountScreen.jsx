/* ============================================================
   계정 삭제 — 되돌릴 수 없는 일이므로 천천히 간다

   화면이 하는 일
     1. 무엇이 지워지고 무엇이 남는지 먼저 보여 준다
     2. 회장이면 클럽이 누구에게 넘어가는지 이름으로 알려 준다
     3. "계정 삭제" 를 정확히 입력해야 버튼이 열린다
     4. 진행 중에는 어느 단계인지 보여 준다

   왜 확인을 이렇게까지 하나
     복구할 방법이 없다. 실수로 지운 사람이 나오면 해 줄 수 있는 것이
     아무것도 없다. 그래서 한 걸음 더 두었다.
   ============================================================ */
import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import {
  reauthenticate, deleteAuthUser, isAnonymousUser, currentEmail, logout,
} from '../lib/auth';
import {
  promoteToPresidents, handOverClub, closeEmptyClub, wipeMember, deleteUserDoc,
} from '../lib/firestore';
import {
  tombstone, successionPlan, successionText, emptyClubPatch,
  CONFIRM_WORD, confirmOk, deleteReady, DELETE_STEPS, WIPE_FIELDS, KEEP_FIELDS,
} from '../lib/accountDelete';
import { Card, SectionTitle, Btn, Chip } from './ui';
import { Label } from './pickers';
import { C, R, F } from '../lib/theme';

export function DeleteAccount({ clubId, me, members, flash }) {
  const router = useRouter();
  const [pw, setPw] = useState('');
  const [typed, setTyped] = useState('');
  const [step, setStep] = useState(null);      // 진행 중인 단계 key
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  const anon = isAnonymousUser();
  const email = currentEmail();
  const nameOf = (id) => members?.find((m) => m.id === id)?.name || '';

  const ready = useMemo(() => deleteReady({ uid: me, members }), [me, members]);
  const plan = ready.plan;
  const planText = successionText(plan, nameOf);
  const myDoc = members?.find((m) => m.id === me);

  const run = async () => {
    setErr('');
    try {
      /* 1) 본인 확인 — 가장 먼저 한다.
            마지막에 하면 계정 삭제가 막혔을 때 데이터만 지워진 채로 남는다. */
      setStep('reauth');
      const auth1 = await reauthenticate(pw);
      if (!auth1.ok) { setErr(auth1.reason); setStep(null); return; }

      /* 2) 클럽 정리 — 회장 자리를 넘기거나, 빈 클럽을 닫는다 */
      setStep('succession');
      if (clubId && plan.needed) {
        if (plan.orphan) {
          await closeEmptyClub(clubId, emptyClubPatch());
        } else {
          await promoteToPresidents(clubId, plan.promote);
          await handOverClub(clubId, plan.promote[0]);
        }
      }

      /* 3) 개인정보 삭제 — 회원 문서는 비우고, users 문서는 지운다 */
      setStep('wipe');
      if (clubId && myDoc) {
        const keep = {};
        KEEP_FIELDS.forEach((k) => { if (myDoc[k] !== undefined) keep[k] = myDoc[k]; });
        const t = tombstone(myDoc);
        await wipeMember(clubId, me, {
          ...keep,
          role: t.role, roles: t.roles, status: t.status,
          deleted: true, deletedAt: t.deletedAt,
        }, WIPE_FIELDS);
      }
      await deleteUserDoc(me).catch(() => {});

      /* 4) 로그인 계정 삭제 */
      setStep('auth');
      const gone = await deleteAuthUser();
      if (!gone.ok) {
        /* 여기까지 왔는데 막히면 데이터는 이미 정리된 상태다.
           숨기지 않고 정확히 알린다 — 다시 로그인해서 한 번 더 누르면 된다. */
        setErr(`${gone.reason}\n\n개인정보는 이미 삭제되었습니다. 다시 로그인한 뒤 한 번 더 시도해 주세요.`);
        setStep(null);
        return;
      }

      setDone(true);
      setStep(null);
      await logout().catch(() => {});
      router.replace('/');
    } catch (e) {
      setErr(e?.message || String(e));
      setStep(null);
    }
  };

  if (done) {
    return (
      <Card>
        <Text style={F.bodyBold}>계정이 삭제되었습니다</Text>
        <Text style={{ fontSize: 12, color: C.sub, marginTop: 8, lineHeight: 18 }}>
          그동안 이용해 주셔서 감사합니다.
        </Text>
      </Card>
    );
  }

  const busy = !!step;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      <Card style={{ backgroundColor: C.dangerBg }}>
        <Text style={{ fontSize: 14, fontWeight: '800', color: C.danger }}>
          계정을 삭제하면 되돌릴 수 없습니다
        </Text>
        <Text style={{ fontSize: 12, color: C.text, marginTop: 8, lineHeight: 19 }}>
          삭제 후에는 같은 계정으로 다시 들어올 수 없습니다.
          다시 가입하시면 <Text style={{ fontWeight: '700' }}>새 계정</Text>이 되고,
          지금 속한 클럽과는 이어지지 않습니다.
        </Text>
      </Card>

      <SectionTitle>지워지는 것</SectionTitle>
      <Card>
        {['로그인 계정 (이메일·비밀번호)',
          '내 프로필과 소속 클럽 정보',
          '연락처 · 알림 수신 정보',
          '클럽 안에서의 운영 권한'].map((t) => (
            <Text key={t} style={{ fontSize: 12.5, color: C.text, marginTop: 4 }}>· {t}</Text>
        ))}
      </Card>

      <SectionTitle>남는 것</SectionTitle>
      <Card>
        <Text style={{ fontSize: 12.5, color: C.text, lineHeight: 19 }}>
          · 지난 <Text style={{ fontWeight: '700' }}>대진표와 회비 정산 기록에 남은 이름</Text>
        </Text>
        <Text style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 16 }}>
          이름까지 지우면 함께 뛴 분들의 지난 대진표가 "(탈퇴)"만 남아 읽을 수
          없게 됩니다. 그래서 이름은 기록에 남기고, 연락할 수 있는 정보는
          모두 지웁니다.
        </Text>
      </Card>

      {!!planText && (
        <>
          <SectionTitle>클럽은 이렇게 됩니다</SectionTitle>
          <Card style={{ backgroundColor: C.warnBg }}>
            <Text style={{ fontSize: 12.5, color: C.warn, lineHeight: 19 }}>{planText}</Text>
          </Card>
        </>
      )}

      {!ready.ok && (
        <Card style={{ marginTop: 10, backgroundColor: C.dangerBg }}>
          {ready.blockers.map((b) => (
            <Text key={b} style={{ fontSize: 12, color: C.danger }}>· {b}</Text>
          ))}
        </Card>
      )}

      {!anon && (
        <>
          <SectionTitle hint={email}>본인 확인</SectionTitle>
          <Card>
            <Label>비밀번호</Label>
            <TextInput
              value={pw}
              onChangeText={setPw}
              secureTextEntry
              autoCapitalize="none"
              placeholder="비밀번호"
              placeholderTextColor={C.faint}
              style={{
                borderWidth: 1, borderColor: C.border, borderRadius: R.md,
                paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: C.text,
                backgroundColor: C.fill,
              }}
            />
          </Card>
        </>
      )}

      <SectionTitle>확인</SectionTitle>
      <Card>
        <Text style={{ fontSize: 12, color: C.sub, lineHeight: 18 }}>
          아래 칸에 <Text style={{ fontWeight: '800', color: C.danger }}>{CONFIRM_WORD}</Text>
          {' '}라고 정확히 입력하세요.
        </Text>
        <TextInput
          value={typed}
          onChangeText={setTyped}
          placeholder={CONFIRM_WORD}
          placeholderTextColor={C.faint}
          style={{
            marginTop: 10,
            borderWidth: 1, borderColor: confirmOk(typed) ? C.danger : C.border,
            borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 10,
            fontSize: 14, color: C.text, backgroundColor: C.fill,
          }}
        />
      </Card>

      {busy && (
        <Card style={{ marginTop: 10 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: C.text }}>삭제 중…</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
            {DELETE_STEPS.map((s) => (
              <Chip key={s.key} tone={s.key === step ? 'green' : 'outline'}>{s.label}</Chip>
            ))}
          </View>
        </Card>
      )}

      {!!err && (
        <Card style={{ marginTop: 10, backgroundColor: C.dangerBg }}>
          <Text style={{ fontSize: 12, color: C.danger, lineHeight: 18 }}>{err}</Text>
        </Card>
      )}

      <View style={{ marginTop: 16 }}>
        <Btn
          full
          tone="danger"
          disabled={busy || !ready.ok || !confirmOk(typed) || (!anon && !pw)}
          onPress={run}>
          {busy ? '삭제 중…' : '계정 영구 삭제'}
        </Btn>
      </View>

      <Text style={{ fontSize: 10.5, color: C.faint, marginTop: 12, lineHeight: 16 }}>
        클럽만 나가고 계정은 남기고 싶으시면, 운영진에게 회원 삭제를 요청하세요.
        계정 삭제는 앱 전체에서 나가는 것입니다.
      </Text>
    </ScrollView>
  );
}

export default DeleteAccount;
