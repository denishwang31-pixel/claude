/* ============================================================
   코치 승인 · 월 지급 — 앱 주인 전용

   이 화면이 하는 일은 결국 하나다: 돈을 줄지 정하는 것.
   영상을 승인하면 그 코치는 그 달 지급 대상이 된다. 그래서 승인 버튼
   옆에 늘 "이번 달 지급"이 같이 보인다 — 두 화면으로 갈라 두면
   승인만 해 놓고 지급을 잊는다.

   반려에 사유를 강제하는 이유
     사유 없이 반려하면 코치는 무엇을 고쳐야 할지 모른 채 같은 것을
     다시 낸다. 그 왕복이 몇 번 반복되면 코치가 떠난다.
   ============================================================ */
import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Image, Linking } from 'react-native';
import {
  subCoaches, subCoachVideos, subCoachPayouts,
  patchCoach, patchCoachVideo, saveCoachPayout,
} from '../lib/firestore';
import {
  COACH_STATUS, COACH_STATUS_LABEL, VIDEO_STATUS, VIDEO_STATUS_LABEL,
  statusTone, approvePatch, rejectPatch,
  payoutMonth, payoutId, payoutAmountOk, payoutCandidates, payoutDiff,
  PAYOUT_MIN, PAYOUT_MAX, videoThumb, lessonSlotText, sortLessonSlots,
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
  const [payouts, setPayouts] = useState([]);
  const [tab, setTab] = useState('queue');    // queue | payout
  const [rejecting, setRejecting] = useState(null);   // `${kind}:${id}`
  const [month, setMonth] = useState(payoutMonth());
  const [amounts, setAmounts] = useState({});

  useEffect(() => subCoaches(setCoaches), []);
  useEffect(() => subCoachVideos(setVideos), []);
  useEffect(() => subCoachPayouts(setPayouts), []);

  const pendingCoaches = useMemo(
    () => coaches.filter((c) => c.status === COACH_STATUS.PENDING),
    [coaches],
  );
  const pendingVideos = useMemo(
    () => videos.filter((v) => v.status === VIDEO_STATUS.PENDING),
    [videos],
  );
  const nameOf = (id) => coaches.find((c) => c.id === id)?.name || id;

  const candidates = useMemo(
    () => payoutCandidates(coaches, videos, month),
    [coaches, videos, month],
  );
  const diff = useMemo(
    () => payoutDiff(candidates, payouts, month),
    [candidates, payouts, month],
  );
  const payoutOf = (coachId) => payouts.find((p) => p.id === payoutId(coachId, month));

  /* 최근 6개월 — 지난달 지급을 뒤늦게 처리하는 일이 흔하다 */
  const months = useMemo(() => {
    const out = [];
    const d = new Date();
    for (let i = 0; i < 6; i += 1) {
      out.push(payoutMonth(new Date(d.getFullYear(), d.getMonth() - i, 1)));
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
    flash('영상을 승인했습니다 — 이번 달 지급 대상이 됩니다');
  };
  const noVideo = async (v, why) => {
    const p = rejectPatch(uid, why);
    if (!p) return;
    await patchCoachVideo(v.id, p);
    setRejecting(null);
    flash('영상을 반려했습니다');
  };

  const savePayout = async (cand, status) => {
    const key = payoutId(cand.coachId, month);
    const raw = amounts[cand.coachId] ?? payoutOf(cand.coachId)?.amount ?? PAYOUT_MAX;
    if (!payoutAmountOk(raw)) {
      flash(`${PAYOUT_MIN.toLocaleString()}~${PAYOUT_MAX.toLocaleString()}원 사이로 넣어 주세요`);
      return;
    }
    await saveCoachPayout(key, {
      coachId: cand.coachId,
      coachName: cand.name,
      month,
      amount: Number(raw),
      videoCount: cand.videoCount,
      status,
      ...(status === 'paid' ? { paidAt: new Date().toISOString(), paidBy: uid } : {}),
    });
    flash(status === 'paid' ? '지급 처리했습니다' : '지급 예정으로 저장했습니다');
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
        <Chip tone={tab === 'queue' ? 'green' : 'outline'} onPress={() => setTab('queue')}>
          승인 대기 {pendingCoaches.length + pendingVideos.length > 0
            ? `(${pendingCoaches.length + pendingVideos.length})` : ''}
        </Chip>
        <Chip tone={tab === 'payout' ? 'green' : 'outline'} onPress={() => setTab('payout')}>
          월 지급
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
          <Label hint="지난달 지급을 뒤늦게 처리할 수도 있습니다">지급 월</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {months.map((m) => (
              <Chip key={m} tone={month === m ? 'green' : 'outline'} onPress={() => setMonth(m)}>
                {m}
              </Chip>
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <StatCard value={`${candidates.length}명`} label="지급 대상" style={{ flex: 1 }} />
            <StatCard value={`${diff.total.toLocaleString()}원`} label="합계" style={{ flex: 1 }}
              tone={diff.inSync ? 'default' : 'warn'} />
            <StatCard value={`${diff.unpaid.length}건`} label="미지급" style={{ flex: 1 }}
              tone={diff.unpaid.length ? 'warn' : 'default'} />
          </View>

          {diff.outOfRange.length > 0 && (
            <Card style={{ marginTop: 10, backgroundColor: C.warnBg }}>
              <Text style={{ fontSize: 12, color: C.warn, lineHeight: 18 }}>
                금액이 {PAYOUT_MIN.toLocaleString()}~{PAYOUT_MAX.toLocaleString()}원 범위를 벗어난 건이
                {' '}{diff.outOfRange.length}건 있습니다: {diff.outOfRange.map((p) => p.coachName).join(', ')}
              </Text>
            </Card>
          )}

          <SectionTitle hint="그 달에 승인된 영상이 있는 코치만">
            {month} 지급 대상
          </SectionTitle>

          {candidates.length === 0 ? (
            <EmptyState
              icon="💸"
              title="지급 대상이 없습니다"
              body="그 달에 승인된 영상이 있어야 지급 대상이 됩니다. 프로필만 올린 코치는 여기 나오지 않습니다."
            />
          ) : candidates.map((cand) => {
            const p = payoutOf(cand.coachId);
            const val = String(amounts[cand.coachId] ?? p?.amount ?? PAYOUT_MAX);
            return (
              <Card key={cand.coachId} style={{ marginTop: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={F.bodyBold}>{cand.name}</Text>
                    <Text style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>
                      이 달 승인 영상 {cand.videoCount}편
                    </Text>
                  </View>
                  {p?.status === 'paid'
                    ? <Chip tone="green">지급 완료</Chip>
                    : p ? <Chip tone="warn">지급 예정</Chip> : <Chip tone="outline">미등록</Chip>}
                </View>

                <Divider style={{ marginVertical: 10 }} />

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Field keyboardType="number-pad" suffix="원" value={val}
                      onChangeText={(v) => setAmounts({ ...amounts, [cand.coachId]: v })} />
                  </View>
                  <Btn small tone="outline" onPress={() => savePayout(cand, 'planned')}>저장</Btn>
                  <Btn small disabled={p?.status === 'paid'}
                    onPress={() => savePayout(cand, 'paid')}>지급함</Btn>
                </View>
                {!payoutAmountOk(val) && (
                  <Text style={{ fontSize: 11, color: C.danger, marginTop: 6 }}>
                    {PAYOUT_MIN.toLocaleString()}~{PAYOUT_MAX.toLocaleString()}원 사이여야 합니다
                  </Text>
                )}
              </Card>
            );
          })}

          <Text style={{ fontSize: 11, color: C.faint, marginTop: 16, lineHeight: 18 }}>
            실제 송금은 앱 밖에서 합니다. 여기 기록은 "누구에게 얼마를 주기로 했고
            줬는가"를 남기는 장부입니다. 코치는 이 화면을 볼 수 없습니다.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}
