/* ============================================================
   알림 상태 — "왜 알림이 안 오는가"를 휴대폰에서 바로 읽는 화면

   왜 필요한가
     푸시가 죽는 자리는 네 군데다: 권한, projectId, 토큰 발급, 저장.
     어디서 막혀도 앱은 멀쩡히 돌아가고 알림만 안 온다. 그리고 APK 로
     설치한 앱에서는 콘솔 로그를 볼 수 없다. 그래서 원인을 못 찾은 채
     "알림이 안 와요"만 반복된다 — 실제로 그렇게 몇 주가 흘렀다.

     여기서는 실패한 자리와 원문 오류를 그대로 보여 준다. 화면을 찍어
     보내기만 하면 원인이 잡힌다.
   ============================================================ */
import React, { useState, useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {
  registerPushToken, pushPermissionStatus, PUSH_FAIL, PUSH_FAIL_LABEL,
} from '../lib/notifications';
import { requestTestPush, subPushJob } from '../lib/firestore';
import { Card, SectionTitle, Chip, Btn } from './ui';
import { C } from '../lib/theme';

const PERM_LABEL = {
  granted: '허용됨',
  denied: '거부됨',
  undetermined: '아직 안 물어봄',
  unknown: '알 수 없음',
};

export function NotifyStatus({ clubId, me, flash }) {
  const [perm, setPerm] = useState('unknown');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => { pushPermissionStatus().then(setPerm); }, []);

  /* 서버가 결과를 적어 줄 때까지 그 문서를 지켜본다 */
  useEffect(() => {
    if (!clubId || !jobId) return undefined;
    return subPushJob(clubId, jobId, setJob);
  }, [clubId, jobId]);

  /* 테스트 알림 — 앱이 아니라 "서버가 무엇을 봤는지"를 알려 준다.
     앱에서 토큰이 보여도 서버가 못 찾는 경우가 있다. 그때 앱만 들여다보면
     원인을 영영 못 찾는다. */
  const sendTest = async () => {
    if (!clubId || !me) { flash?.('클럽에 속해야 보낼 수 있습니다'); return; }
    setSending(true);
    setJob(null);
    try {
      const ref = await requestTestPush(clubId, me);
      setJobId(ref.id);
      flash?.('보내는 중… 결과가 아래에 나옵니다');
    } catch (e) {
      setJob({ status: 'failed', reason: 'create', detail: e?.message || String(e) });
    }
    setSending(false);
  };

  const retry = async () => {
    setBusy(true);
    const r = await registerPushToken(clubId, me);
    setRes(r);
    setPerm(await pushPermissionStatus());
    setBusy(false);
    flash?.(r.ok ? '알림을 받을 수 있습니다' : '아직 알림을 받을 수 없습니다');
  };

  const copy = async () => {
    await Clipboard.setStringAsync(JSON.stringify(res, null, 2));
    flash?.('내용을 복사했습니다');
  };

  return (
    <View>
      <SectionTitle hint="회비 알림 · 참석 투표 · 교류전 초대">알림 상태</SectionTitle>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 12, color: C.sub, width: 76 }}>알림 권한</Text>
          <Chip tone={perm === 'granted' ? 'green' : perm === 'denied' ? 'red' : 'warn'}>
            {PERM_LABEL[perm] || perm}
          </Chip>
        </View>

        {!!res && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <Text style={{ fontSize: 12, color: C.sub, width: 76 }}>토큰</Text>
            <Chip tone={res.ok ? 'green' : 'red'}>
              {res.ok ? '받아서 저장됨' : '없음'}
            </Chip>
          </View>
        )}

        {!!res?.ok && (
          <Text style={{ fontSize: 10.5, color: C.faint, marginTop: 8 }} numberOfLines={1}>
            {res.token}
          </Text>
        )}

        {/* 어디에 저장했는지 —
            토큰은 "지금 들어와 있는 클럽"의 내 문서에 저장된다. 클럽이
            여러 개면 Firestore 에서 엉뚱한 클럽을 열어 놓고 "토큰이
            없다"고 하게 된다. 실제로 그렇게 한 번 헤맸다.
            그래서 찾아갈 경로를 그대로 적어 둔다. */}
        {!!res?.ok && (
          <Pressable onPress={async () => {
            await Clipboard.setStringAsync(`clubs/${clubId}/members/${me}`);
            flash?.('경로를 복사했습니다');
          }}>
            <View style={{ marginTop: 10, backgroundColor: C.fill, borderRadius: 8, padding: 10 }}>
              <Text style={{ fontSize: 10.5, color: C.sub, fontWeight: '700' }}>
                저장된 곳 (눌러서 복사)
              </Text>
              <Text style={{ fontSize: 10.5, color: C.text, marginTop: 4 }} selectable>
                clubs/{clubId}/members/{me}
              </Text>
              <Text style={{ fontSize: 10, color: C.faint, marginTop: 6, lineHeight: 14 }}>
                Firestore 에서 이 경로를 그대로 따라가면 pushToken 이 있습니다.
                클럽이 여러 개면 다른 클럽에는 없습니다 — 지금 들어와 있는
                클럽에만 저장됩니다.
              </Text>
            </View>
          </Pressable>
        )}

        {!!res && !res.ok && (
          <View style={{ marginTop: 12, backgroundColor: C.dangerBg, borderRadius: 8, padding: 10 }}>
            <Text style={{ fontSize: 12, color: C.danger, fontWeight: '700' }}>
              막힌 곳: {res.reason}
            </Text>
            <Text style={{ fontSize: 12, color: C.text, marginTop: 6, lineHeight: 18 }}>
              {PUSH_FAIL_LABEL[res.reason] || '알 수 없는 이유입니다.'}
            </Text>
            {!!res.detail && (
              <Text style={{ fontSize: 10.5, color: C.sub, marginTop: 8, lineHeight: 15 }}>
                {res.detail}
              </Text>
            )}
            {res.reason === PUSH_FAIL.TOKEN && (
              <Text style={{ fontSize: 10.5, color: C.sub, marginTop: 8, lineHeight: 15 }}>
                안드로이드 푸시는 FCM 을 씁니다. 이 앱은 Firebase 웹 SDK 로
                데이터만 다루고 있어서, 알림을 받으려면 빌드에
                google-services.json 이 따로 들어가야 합니다.
              </Text>
            )}
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <View style={{ flex: 1 }}>
            <Btn small full disabled={busy} onPress={retry}>
              {busy ? '확인 중…' : res ? '다시 확인' : '알림 확인'}
            </Btn>
          </View>
          {!!res && !res.ok && (
            <Btn small tone="outline" onPress={copy}>내용 복사</Btn>
          )}
        </View>

        {/* ---- 테스트 알림 ----
            여기까지 와야 진짜 확인이다. 앱에 토큰이 보이는 것과 서버가
            그 토큰을 찾는 것은 다른 문제다. */}
        <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 14 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: C.text }}>
            테스트 알림 보내기
          </Text>
          <Text style={{ fontSize: 10.5, color: C.faint, marginTop: 4, lineHeight: 15 }}>
            서버가 내 문서에서 토큰을 찾아 나에게 한 건 보냅니다.
            서버가 무엇을 봤는지 아래에 그대로 나옵니다.
          </Text>

          <View style={{ marginTop: 10 }}>
            <Btn small full tone="outline" disabled={sending} onPress={sendTest}>
              {sending ? '요청 중…' : '나에게 테스트 알림'}
            </Btn>
          </View>

          {!!jobId && !job?.status && (
            <Text style={{ fontSize: 11, color: C.sub, marginTop: 8 }}>
              서버 응답을 기다리는 중…
            </Text>
          )}

          {job?.status === 'done' && (
            <View style={{ marginTop: 10, backgroundColor: C.greenSoft, borderRadius: 8, padding: 10 }}>
              <Text style={{ fontSize: 12, color: C.green, fontWeight: '700' }}>
                서버가 보냈습니다
              </Text>
              <Text style={{ fontSize: 11, color: C.text, marginTop: 4, lineHeight: 16 }}>
                {job.detail}
              </Text>
              {!!job.tokenTail && (
                <Text style={{ fontSize: 10, color: C.faint, marginTop: 4 }}>
                  서버가 읽은 토큰 끝자리: …{job.tokenTail}
                </Text>
              )}
              <Text style={{ fontSize: 10, color: C.faint, marginTop: 6, lineHeight: 14 }}>
                그런데도 알림이 안 오면 휴대폰 설정 → 앱 → 알림에서 이 앱이
                꺼져 있거나, 배터리 절약으로 막혀 있을 수 있습니다.
              </Text>
            </View>
          )}

          {job?.status === 'failed' && (
            <View style={{ marginTop: 10, backgroundColor: C.dangerBg, borderRadius: 8, padding: 10 }}>
              <Text style={{ fontSize: 12, color: C.danger, fontWeight: '700' }}>
                서버가 못 보냈습니다 — {job.reason}
              </Text>
              <Text style={{ fontSize: 11, color: C.text, marginTop: 4, lineHeight: 16 }}>
                {job.detail}
              </Text>
              <Pressable
                style={{ marginTop: 8 }}
                onPress={async () => {
                  await Clipboard.setStringAsync(JSON.stringify(job, null, 2));
                  flash?.('내용을 복사했습니다');
                }}>
                <Text style={{ fontSize: 11, color: C.green2, fontWeight: '700' }}>내용 복사</Text>
              </Pressable>
            </View>
          )}
        </View>

        <Text style={{ fontSize: 10.5, color: C.faint, marginTop: 10, lineHeight: 15 }}>
          여기가 [받아서 저장됨]이 되어야 회비 알림·참석 투표 요청·교류전
          초대가 도착합니다. 그 전까지는 서버가 보내도 받을 곳이 없습니다.
        </Text>
      </Card>
    </View>
  );
}

export default NotifyStatus;
