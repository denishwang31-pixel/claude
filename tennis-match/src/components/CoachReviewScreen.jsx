/* ============================================================
   코치 승인 · 광고비 청구 — 앱 주인 전용

   돈의 방향: **코치가 앱에 낸다.** 영상 노출이 곧 광고이고, 그 대가를
   월 단위로 받는다. 코치는 유튜브 구독자와 레슨 문의를 얻는다.

   승인과 청구를 한 화면에 둔 이유
     영상을 승인하면 그 달 광고가 나간 것이고, 그 순간 청구할 근거가
     생긴다. 두 화면으로 갈라 두면 승인만 해 놓고 청구를 잊는다 —
     그건 그대로 받지 못한 돈이 된다.

   반려에 사유를 강제하는 이유
     사유 없이 반려하면 코치는 무엇을 고쳐야 할지 모른 채 같은 것을
     다시 낸다. 그 왕복이 몇 번 반복되면 코치가 떠난다.
   ============================================================ */
import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Image, Linking } from 'react-native';
import {
  subCoaches, subCoachVideos, subCoachBillings,
  patchCoach, patchCoachVideo, saveCoachBilling,
} from '../lib/firestore';
import {
  COACH_STATUS, COACH_STATUS_LABEL, VIDEO_STATUS, VIDEO_STATUS_LABEL,
  statusTone, approvePatch, rejectPatch,
  billingMonth, billingId, billingAmountOk, billingTargets, billingDiff,
  BILLING_MIN, BILLING_MAX, BILLING_STATUS, BILLING_STATUS_LABEL,
  videoThumb, lessonSlotText, sortLessonSlots,
} from '../lib/coach';
import { Label } from './pickers';
import { Card, SectionTitle, Chip, Btn, Field, EmptyState, Divider, StatCard } from './ui';
import { C, F } from '../lib/theme';

/* 반려 사유를 받는 작은 입력 — 목록 안에서 바로 쓴다 */
function RejectBox({ onCancel, onConfirm }) {
  const [why, setWhy] = useState('');
  return (
    <View style={{ marginTop: 8, backgroundColor: C.dangerBg, borderRadius: 8, padding: 10 }}>
      <Field placeholder="반려 사유 (코치에게 그대로 보입니다)" value={why} onChangeText={setWhy} />
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <View style={{ flex: 1 }}>
          <Btn small full tone="outline" onPress={onCancel}>취소</Btn>
        </View>
        <View style={{ flex: 1 }}>
          <Btn small full tone="danger" disabled={!why.trim()}
            onPress={() => onConfirm(why.trim())}>반려</Btn>
        </View>
      </View>
    </View>
  );
}

export function CoachReviewScreen({ uid, flash }) {
  const [coaches, setCoaches] = useState([]);
  const [videos, setVideos] = useState([]);
  const [billings, setBillings] = useState([]);
  const [tab, setTab] = useState('queue');    // queue | billing
  const [rejecting, setRejecting] = useState(null);   // `${kind}:${id}`
  const [month, setMonth] = useState(billingMonth());
  const [amounts, setAmounts] = useState({});

  useEffect(() => subCoaches(setCoaches), []);
  useEffect(() => subCoachVideos(setVideos), []);
  useEffect(() => subCoachBillings(setBillings), []);

  const pendingCoaches = useMemo(
    () => coaches.filter((c) => c.status === COACH_STATUS.PENDING),
    [coaches],
  );
  const pendingVideos = useMemo(
    () => videos.filter((v) => v.status === VIDEO_STATUS.PENDING),
    [videos],
  );
  const nameOf = (id) => coaches.find((c) => c.id === id)?.name || id;

  const targets = useMemo(
    () => billingTargets(coaches, videos, month),
    [coaches, videos, month],
  );
  const diff = useMemo(
    () => billingDiff(targets, billings, month),
    [targets, billings, month],
  );
  const billingOf = (coachId) => billings.find((b) => b.id === billingId(coachId, month));

  /* 최근 6개월 — 지난달 미수금을 뒤늦게 받는 일이 흔하다 */
  const months = useMemo(() => {
    const out = [];
    const d = new Date();
    for (let i = 0; i < 6; i += 1) {
      out.push(billingMonth(new Date(d.getFullYear(), d.getMonth() - i, 1)));
    }
    return out;
  }, []);

  const okCoach = async (c) => {
    await patchCoach(c.id, approvePatch(uid));
    flash(`${c.name} 프로필을 승인했습니다`);
  };
  const noCoach = async (c, why) => {
    const p = rejectPatch(uid, why);
    if (!p) return;
    await patchCoach(c.id, p);
    setRejecting(null);
    flash(`${c.name} 프로필을 반려했습니다`);
  };
  const okVideo = async (v) => {
    await patchCoachVideo(v.id, approvePatch(uid));
    flash('영상을 승인했습니다 — 이번 달 광고비 청구 대상이 됩니다');
  };
  const noVideo = async (v, why) => {
    const p = rejectPatch(uid, why);
    if (!p) return;
    await patchCoachVideo(v.id, p);
    setRejecting(null);
    flash('영상을 반려했습니다');
  };

  const saveBilling = async (t, status) => {
    const key = billingId(t.coachId, month);
    const raw = amounts[t.coachId] ?? billingOf(t.coachId)?.amount ?? BILLING_MAX;
    /* 면제는 금액 검사를 하지 않는다 — 0원이 정상이기 때문 */
    if (status !== BILLING_STATUS.WAIVED && !billingAmountOk(raw)) {
      flash(`${BILLING_MIN.toLocaleString()}~${BILLING_MAX.toLocaleString()}원 사이로 넣어 주세요`);
      return;
    }
    await saveCoachBilling(key, {
      coachId: t.coachId,
      coachName: t.name,
      month,
      amount: status === BILLING_STATUS.WAIVED ? 0 : Number(raw),
      videoCount: t.videoCount,
      status,
      ...(status === BILLING_STATUS.PAID
        ? { paidAt: new Date().toISOString(), confirmedBy: uid } : {}),
    });
    flash({
      [BILLING_STATUS.BILLED]: '청구서를 만들었습니다',
      [BILLING_STATUS.PAID]: '입금 확인했습니다',
      [BILLING_STATUS.WAIVED]: '이 달은 면제로 두었습니다',
    }[status]);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
        <Chip tone={tab === 'queue' ? 'green' : 'outline'} onPress={() => setTab('queue')}>
          승인 대기 {pendingCoaches.length + pendingVideos.length > 0
            ? `(${pendingCoaches.length + pendingVideos.length})` : ''}
        </Chip>
        <Chip tone={tab === 'billing' ? 'green' : 'outline'} onPress={() => setTab('billing')}>
          광고비 {diff.unpaid.length > 0 ? `(미수 ${diff.unpaid.length})` : ''}
        </Chip>
      </View>

      {tab === 'queue' ? (
        <View>
          <SectionTitle hint={`${pendingCoaches.length}명`}>프로필 승인 대기</SectionTitle>
          {pendingCoaches.length === 0 && (
            <Card><Text style={{ fontSize: 12, color: C.sub }}>대기 중인 프로필이 없습니다</Text></Card>
          )}
          {pendingCoaches.map((c) => (
            <Card key={c.id} style={{ marginTop: 8 }}>
              <Text style={F.bodyBold}>{c.name}</Text>
              <Text style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>
                {c.regionText}{c.phone ? ` · ${c.phone}` : ''}
              </Text>
              {!!c.intro && (
                <Text style={{ fontSize: 12, color: C.text, marginTop: 6 }}>{c.intro}</Text>
              )}
              <Text style={{ fontSize: 12, color: C.text, marginTop: 8, lineHeight: 19 }}>
                {c.career}
              </Text>
              {(c.certs || []).length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                  {c.certs.map((x) => <Chip key={x} tone="soft">{x}</Chip>)}
                </View>
              )}
              {(c.lessonSlots || []).length > 0 && (
                <Text style={{ fontSize: 11, color: C.sub, marginTop: 8 }}>
                  {sortLessonSlots(c.lessonSlots).map(lessonSlotText).join(' / ')}
                </Text>
              )}

              {rejecting === `coach:${c.id}` ? (
                <RejectBox onCancel={() => setRejecting(null)} onConfirm={(w) => noCoach(c, w)} />
              ) : (
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Btn small full tone="outline"
                      onPress={() => setRejecting(`coach:${c.id}`)}>반려</Btn>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Btn small full onPress={() => okCoach(c)}>승인</Btn>
                  </View>
                </View>
              )}
            </Card>
          ))}

          <SectionTitle hint={`${pendingVideos.length}편`}>영상 승인 대기</SectionTitle>
          {pendingVideos.length === 0 && (
            <Card><Text style={{ fontSize: 12, color: C.sub }}>대기 중인 영상이 없습니다</Text></Card>
          )}
          {pendingVideos.map((v) => (
            <Card key={v.id} style={{ marginTop: 8 }}>
              <Pressable onPress={() => Linking.openURL(v.url)}>
                {!!videoThumb(v.url) && (
                  <Image source={{ uri: videoThumb(v.url) }}
                    style={{ width: '100%', height: 150, borderRadius: 8, backgroundColor: C.fill }} />
                )}
                <Text style={[F.bodyBold, { marginTop: 8 }]}>{v.title}</Text>
                <Text style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>
                  {v.coachName || nameOf(v.coachId)} · 눌러서 영상 확인
                </Text>
                {!!v.note && (
                  <Text style={{ fontSize: 12, color: C.text, marginTop: 6 }}>{v.note}</Text>
                )}
              </Pressable>

              {rejecting === `video:${v.id}` ? (
                <RejectBox onCancel={() => setRejecting(null)} onConfirm={(w) => noVideo(v, w)} />
              ) : (
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Btn small full tone="outline"
                      onPress={() => setRejecting(`video:${v.id}`)}>반려</Btn>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Btn small full onPress={() => okVideo(v)}>승인</Btn>
                  </View>
                </View>
              )}
            </Card>
          ))}
        </View>
      ) : (
        <View>
          <Label hint="지난달 미수금도 여기서 처리합니다">청구 월</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {months.map((m) => (
              <Chip key={m} tone={month === m ? 'green' : 'outline'} onPress={() => setMonth(m)}>
                {m}
              </Chip>
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <StatCard value={`${diff.billed.toLocaleString()}원`} label="청구" style={{ flex: 1 }}
              tone={diff.inSync ? 'default' : 'warn'} />
            <StatCard value={`${diff.collected.toLocaleString()}원`} label="입금" style={{ flex: 1 }}
              tone="green" />
            <StatCard value={`${diff.outstanding.toLocaleString()}원`} label="미수금" style={{ flex: 1 }}
              tone={diff.outstanding > 0 ? 'warn' : 'default'} />
          </View>

          {diff.missing.length > 0 && (
            <Card style={{ marginTop: 10, backgroundColor: C.warnBg }}>
              <Text style={{ fontSize: 12, color: C.warn, lineHeight: 18 }}>
                광고가 나갔는데 청구서를 안 만든 코치가 {diff.missing.length}명 있습니다:
                {' '}{diff.missing.map((t) => t.name).join(', ')}
                {'\n'}그대로 두면 받지 못한 돈이 됩니다.
              </Text>
            </Card>
          )}

          {diff.outOfRange.length > 0 && (
            <Card style={{ marginTop: 10, backgroundColor: C.warnBg }}>
              <Text style={{ fontSize: 12, color: C.warn, lineHeight: 18 }}>
                금액이 {BILLING_MIN.toLocaleString()}~{BILLING_MAX.toLocaleString()}원 범위를 벗어난 건이
                {' '}{diff.outOfRange.length}건 있습니다: {diff.outOfRange.map((b) => b.coachName).join(', ')}
              </Text>
            </Card>
          )}

          <SectionTitle hint="그 달에 광고가 나간 코치만">
            {month} 청구 대상
          </SectionTitle>

          {targets.length === 0 ? (
            <EmptyState
              icon="🧾"
              title="청구할 건이 없습니다"
              body="그 달에 승인된 영상이 있어야 청구 대상이 됩니다. 광고가 안 나갔으면 받을 근거도 없습니다."
            />
          ) : targets.map((t) => {
            const b = billingOf(t.coachId);
            const val = String(amounts[t.coachId] ?? b?.amount ?? BILLING_MAX);
            const paid = b?.status === BILLING_STATUS.PAID;
            const waived = b?.status === BILLING_STATUS.WAIVED;
            return (
              <Card key={t.coachId} style={{ marginTop: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={F.bodyBold}>{t.name}</Text>
                    <Text style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>
                      이 달 노출 영상 {t.videoCount}편
                    </Text>
                  </View>
                  {b
                    ? (
                      <Chip tone={paid ? 'green' : waived ? 'soft' : 'warn'}>
                        {BILLING_STATUS_LABEL[b.status] || b.status}
                      </Chip>
                    )
                    : <Chip tone="outline">청구 전</Chip>}
                </View>

                <Divider style={{ marginVertical: 10 }} />

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Field keyboardType="number-pad" suffix="원" value={val}
                      onChangeText={(v) => setAmounts({ ...amounts, [t.coachId]: v })} />
                  </View>
                  <Btn small tone="outline"
                    onPress={() => saveBilling(t, BILLING_STATUS.BILLED)}>청구</Btn>
                  <Btn small disabled={paid}
                    onPress={() => saveBilling(t, BILLING_STATUS.PAID)}>입금됨</Btn>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 }}>
                  <Pressable onPress={() => saveBilling(t, BILLING_STATUS.WAIVED)}>
                    <Text style={{ fontSize: 11, color: C.faint }}>
                      {waived ? '면제 상태' : '이 달 면제 (무료 체험 등)'}
                    </Text>
                  </Pressable>
                </View>

                {!waived && !billingAmountOk(val) && (
                  <Text style={{ fontSize: 11, color: C.danger, marginTop: 6 }}>
                    {BILLING_MIN.toLocaleString()}~{BILLING_MAX.toLocaleString()}원 사이여야 합니다
                  </Text>
                )}
              </Card>
            );
          })}

          <Text style={{ fontSize: 11, color: C.faint, marginTop: 16, lineHeight: 18 }}>
            코치가 앱에 내는 광고비입니다. 지금은 청구서를 만들고 입금을 손으로
            확인하는 장부까지입니다. 앱 안에서 카드로 자동 결제되는 월 구독은
            PG 계약이 필요해 아직 없습니다.
            {'\n'}코치는 이 화면을 볼 수 없습니다.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}
