/* 회비 독촉 — 총무가 "형, 회비요..." 를 보내지 않아도 되게 한다.

   화면이 지키는 것
     · 알림은 클럽 이름으로 나간다. 총무 개인 이름이 들어가지 않는다.
     · 미납자 본인에게만 개별로 간다. 단체 공지로 명단이 뿌려지지 않는다.
     · 마지막 단계는 자동으로 안 나간다. 총무가 보고 누른다.
     · 자동 단계는 한 번만. 최종 안내는 여러 번(하루 한 번) — 계속 안 내는
       사람에게 다시 안내할 수 있게. 최근 발송일과 횟수를 버튼 아래 적는다.
     · [발송]은 서버가 실제로 보낸다(pushJobs · type 'dunning'). 예전엔 앱이
       "보냈다"고 기록만 하고 알림은 안 나갔다. */
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { View, Text, Alert, Pressable } from 'react-native';
import {
  DUN_STAGES, DUN_STAGE, dueDateOf, stageFor, unpaidMembers, recipientsFor,
  messageFor, canSend, periodLabel, sentTimes,
} from '../lib/dunning';
import {
  requestDunningSend, subPushJob, saveFeePolicy, saveVenueFee, resolveFeeClaim, setFeePaid,
} from '../lib/firestore';
import {
  billingScopes, membersInScope, feeDocKey, notifyRule,
} from '../lib/scope';
import { BillingScopeTabs } from './ScopeControls';
import { Label } from './pickers';
import { Card, SectionTitle, Chip, Btn, Field, StatCard } from './ui';
import { C, S, R, F } from '../lib/theme';

const today = () => new Date().toISOString().slice(0, 10);
const won = (n) => `${Number(n || 0).toLocaleString()}원`;

export function Dunning({
  clubId, club, members, fee, periodKey, sentLog = {}, claims = [], isAdmin, flash,
  venues = [], scopeId = null, setScopeId = () => {}, me = null,
  sections = null,
}) {
  /* 회비 관리 화면은 이 화면의 일부만 쓴다(현황 숫자는 위 현황판이 보여 준다).
     sections 가 없으면 전부 그린다. */
  const show = (k) => !sections || sections.includes(k);
  /* 방금 누른 발송의 결과 — 서버가 몇 명에게 보냈는지 적어 준다 */
  const [job, setJob] = useState(null);   // { id, label, status, detail }
  const jobOff = useRef(null);
  useEffect(() => () => jobOff.current?.(), []);
  /* ---------- 어느 단위로 걷는가 ----------
     코트장마다 걷는 클럽이면 청구 단위가 여러 개다. 금액·납부일·계좌·
     대상자가 단위마다 다르므로, 화면도 한 번에 하나만 다룬다.
     코트장을 안 쓰는 클럽은 단위가 하나뿐이라 탭 자체가 안 보인다. */
  const scopes = useMemo(() => billingScopes(club, venues), [club, venues]);
  const scope = scopes.find((s) => s.id === scopeId) || scopes[0];
  const venue = venues.find((v) => v.id === scope.id) || null;
  const docKey = feeDocKey(periodKey, scope.id);

  const { amount, dueDay, account } = scope;
  const [policy, setPolicy] = useState({ dueDay: String(dueDay), account });
  const [editing, setEditing] = useState(false);

  /* 청구 단위를 바꾸면 편집값도 그 단위의 것으로 갈아 끼운다.
     안 그러면 염곡 납부일을 띄워 놓고 수도공고에 저장하게 된다. */
  useEffect(() => {
    setPolicy({ dueDay: String(dueDay), account });
    setEditing(false);
  }, [scope.id, dueDay, account]);

  /* 알림 하이어라키 — 이 코트장에서 회비 알림을 꺼 두었으면 안 나간다.
     끄고도 발송 버튼이 눌리면 "껐는데 왜 갔냐"가 된다. */
  const feeNotify = notifyRule(club, venue, 'fee');

  const paid = fee?.paid || {};
  const active = useMemo(
    () => membersInScope(members, scope.id), [members, scope.id],
  );
  const unpaid = useMemo(() => unpaidMembers(active, paid), [active, paid]);
  const dueDate = dueDateOf(periodKey, dueDay);
  const todayStage = stageFor(periodKey, today(), dueDay);

  const send = (stage) => {
    if (!feeNotify.on) {
      return flash(venue
        ? `${venue.name}에서 회비 알림을 꺼 두었습니다`
        : '회비 알림이 꺼져 있습니다 — [설정] → [알림 종류]');
    }
    const gate = canSend(stage, docKey, sentLog, today());
    if (!gate.ok) return flash(gate.reason);

    const to = recipientsFor(stage, active, paid);
    if (!to.length) return flash('보낼 대상이 없습니다');

    const msg = messageFor(stage, {
      clubName: scope.id ? `${club?.name || '클럽'} ${scope.name}` : club?.name,
      monthKey: periodKey,
      amount,
      dueDate,
      account,
    });

    const lastAt = sentLog?.[docKey]?.[stage.key];
    return Alert.alert(
      lastAt ? `${stage.label} 다시 발송` : `${stage.label} 발송`,
      `${to.length}명에게 개별로 발송합니다.\n`
      + (lastAt ? `(지난 발송: ${lastAt})\n` : '')
      + `(단체 공지가 아니라 각자에게만 갑니다)\n\n`
      + `제목: ${msg.title}\n내용: ${msg.body}`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '발송',
          onPress: async () => {
            try {
              const ref = await requestDunningSend(clubId, {
                stageKey: stage.key, period: periodKey, scopeId: scope.id, by: me,
              });
              jobOff.current?.();
              setJob({ id: ref.id, label: stage.label, status: 'queued', detail: '' });
              jobOff.current = subPushJob(clubId, ref.id, (j) => {
                if (!j) return;
                setJob((cur) => (cur && cur.id === ref.id ? { ...cur, status: j.status, detail: j.detail || '' } : cur));
              });
            } catch (e) {
              flash('발송을 시작하지 못했습니다');
            }
          },
        },
      ],
    );
  };

  if (!isAdmin) {
    return (
      <Card>
        <Text style={F.bodyBold}>회장·총무 전용</Text>
        <Text style={{ fontSize: 12, color: C.sub, marginTop: 5, lineHeight: 18 }}>
          회비 알림은 회장·총무만 보낼 수 있습니다.
        </Text>
      </Card>
    );
  }

  return (
    <View>
      {/* 청구 단위 — 코트장마다 걷는 클럽에서만 보인다 */}
      {show('scope') && <BillingScopeTabs scopes={scopes} value={scope.id} onChange={setScopeId} />}

      {show('stages') && !feeNotify.on && (
        <Card style={{ backgroundColor: C.warnBg, marginBottom: 10 }}>
          <Text style={{ fontSize: 12, color: C.warn, fontWeight: '700' }}>
            회비 알림이 꺼져 있습니다
          </Text>
          <Text style={{ fontSize: 11.5, color: C.text, marginTop: 5, lineHeight: 17 }}>
            {venue
              ? `${venue.name}에서 껐습니다. [코트장 관리] → ${venue.name} → [이 코트장만 다르게]에서 다시 켤 수 있습니다.`
              : '[설정] → [알림 종류]에서 다시 켤 수 있습니다.'}
            {'\n'}현황은 그대로 보이지만 발송은 되지 않습니다.
          </Text>
        </Card>
      )}

      {show('summary') && <Card>
        <Text style={F.bodyBold}>
          {periodLabel(periodKey)} 회비 현황
          {scope.id ? ` · ${scope.name}` : ''}
        </Text>
        <View style={{ flexDirection: 'row', gap: S.sm, marginTop: 10 }}>
          <StatCard value={active.length - unpaid.length} label="납부" />
          <StatCard value={unpaid.length} label="미납" />
          <StatCard value={won(unpaid.length * amount).replace('원', '')} label="미수금" />
        </View>
        <Text style={{ fontSize: 11.5, color: C.sub, marginTop: 12 }}>
          {won(amount)} · 납부 기한 {dueDate}
          {todayStage ? ` · 오늘은 "${todayStage.label}" 발송일입니다` : ''}
        </Text>
      </Card>}

      {show('claims') && claims.length > 0 && (
        <>
          <SectionTitle hint="회원이 직접 보낸 요청입니다">
            확인 요청 {claims.length}건
          </SectionTitle>
          {claims.map((c) => {
            const who = members.find((m) => m.id === c.memberId);
            return (
              <Card key={`${c.memberId}-${c.period}`} style={{ marginTop: 8, backgroundColor: '#FFF7ED' }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={F.bodyBold}>
                      {who?.name || '(탈퇴 회원)'} · {c.period}
                    </Text>
                    {!!c.note && (
                      <Text style={{ fontSize: 12, color: C.sub, marginTop: 4, lineHeight: 17 }}>
                        {c.note}
                      </Text>
                    )}
                    <Text style={{ fontSize: 10.5, color: C.faint, marginTop: 4 }}>
                      {String(c.at || '').slice(0, 10)}
                    </Text>
                  </View>
                  <View style={{ gap: 6 }}>
                    <Btn small onPress={() => Alert.alert(
                      '납부 처리',
                      `${who?.name || '회원'}님의 ${c.period} 회비를 납부 완료로 표시할까요?`,
                      [
                        { text: '취소', style: 'cancel' },
                        {
                          text: '납부 처리',
                          onPress: async () => {
                            const next = { ...(fee?.paid || {}), [c.memberId]: true };
                            await setFeePaid(clubId, feeDocKey(c.period, scope.id), next, amount, fee?.paid || {});
                            await resolveFeeClaim(clubId, c.memberId, c.period);
                            flash('납부 처리했습니다');
                          },
                        },
                      ],
                    )}>납부 처리</Btn>
                    <Pressable onPress={() => {
                      resolveFeeClaim(clubId, c.memberId, c.period);
                      flash('확인 완료로 표시했습니다');
                    }}>
                      <Text style={{ fontSize: 11, color: C.faint, textAlign: 'center' }}>확인만</Text>
                    </Pressable>
                  </View>
                </View>
              </Card>
            );
          })}
        </>
      )}

      {show('stages') && (<>
      <SectionTitle hint={todayStage ? `오늘은 「${todayStage.label}」 발송일 · 클럽 이름으로 나갑니다` : '총무 이름이 아니라 클럽 이름으로 나갑니다'}>알림 단계</SectionTitle>
      {!!job && (
        <Card style={{ marginTop: 8, backgroundColor: job.status === 'failed' ? C.dangerBg : job.status === 'queued' ? C.fill : C.greenSoft }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: C.text }}>
            {job.label} · {job.status === 'queued' ? '보내는 중…' : job.status === 'done' ? '보냈습니다' : job.status === 'failed' ? '보내지 못했습니다' : '보내지 않았습니다'}
          </Text>
          {!!job.detail && <Text style={{ fontSize: 12, color: C.sub, marginTop: 4 }}>{job.detail}</Text>}
        </Card>
      )}
      {DUN_STAGES.map((stage) => {
        const gate = canSend(stage, docKey, sentLog, today());
        const to = recipientsFor(stage, active, paid);
        const isToday = todayStage?.key === stage.key;
        const sentAt = sentLog?.[docKey]?.[stage.key];
        return (
          <Card key={stage.key} style={{
            marginTop: 8,
            borderColor: isToday ? C.green : C.border,
            borderWidth: isToday ? 1.5 : 1,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={F.bodyBold}>{stage.label}</Text>
                  <Chip tone={stage.auto ? 'soft' : 'warn'}>
                    {stage.auto ? '자동' : '수동 확인'}
                  </Chip>
                  {isToday && <Chip tone="green">오늘</Chip>}
                </View>
                <Text style={{ fontSize: 11.5, color: C.sub, marginTop: 4, lineHeight: 16 }}>
                  {stage.desc}
                </Text>
                <Text style={{ fontSize: 10.5, color: C.faint, marginTop: 4 }}>
                  대상 {to.length}명
                </Text>
              </View>
              <Btn small disabled={!gate.ok || !to.length} onPress={() => send(stage)}>
                {!stage.auto && sentAt ? '다시 발송' : sentAt ? '발송됨' : '발송'}
              </Btn>
            </View>
            {/* 최근 발송일 — 최종 안내는 여러 번 보낼 수 있으니 몇 번째인지도 */}
            {!!sentAt && (
              <Text style={{ fontSize: 12, fontWeight: '700', color: C.sub, marginTop: 8 }}>
                최근 발송 {sentAt}
                {!stage.auto && sentTimes(stage, docKey, sentLog) > 1 ? ` · 지금까지 ${sentTimes(stage, docKey, sentLog)}번` : ''}
                {!stage.auto && sentAt === today() ? ' · 내일 다시 보낼 수 있어요' : ''}
              </Text>
            )}
          </Card>
        );
      })}

      <Card style={{ marginTop: S.md, backgroundColor: C.fill }}>
        <Text style={{ fontSize: 11.5, color: C.sub, lineHeight: 18 }}>
          미납 여부는 <Text style={{ fontWeight: '700' }}>본인에게만</Text> 보입니다.
          다른 회원은 누가 안 냈는지 알 수 없고, 단체 공지로도 나가지 않습니다.
        </Text>
      </Card>
      </>)}

      {show('policy') && (<>
      <SectionTitle>납부 안내 설정</SectionTitle>
      <Card>
        {editing ? (
          <>
            <Label hint="매월 며칠까지">납부 기한</Label>
            <Field
              keyboardType="number-pad" placeholder="10"
              value={policy.dueDay}
              onChangeText={(v) => setPolicy({ ...policy, dueDay: v })}
            />
            <View style={{ marginTop: 10 }}>
              <Label hint="알림에 함께 표시됩니다">입금 계좌</Label>
              <Field
                placeholder="예: 신한 110-123-456789 (홍길동)"
                value={policy.account}
                onChangeText={(v) => setPolicy({ ...policy, account: v })}
              />
            </View>
            <View style={{ flexDirection: 'row', gap: S.sm, marginTop: 12 }}>
              <Btn small onPress={async () => {
                /* 코트장 단위로 보고 있으면 그 코트장 값을 고친다.
                   여기서 클럽 값을 고치면 다른 코트장 납부일까지 같이
                   바뀐다 — 화면에는 이 코트장 이름이 떠 있는데. */
                if (scope.id) {
                  await saveVenueFee(clubId, scope.id, {
                    feeAmount: amount, feeDueDay: policy.dueDay, feeAccount: policy.account,
                  });
                } else {
                  await saveFeePolicy(clubId, policy);
                }
                setEditing(false);
                flash('저장되었습니다');
              }}>저장</Btn>
              <Btn small tone="ghost" onPress={() => {
                setPolicy({ dueDay: String(dueDay), account });
                setEditing(false);
              }}>취소</Btn>
            </View>
          </>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12.5, color: C.text }}>매월 {dueDay}일까지</Text>
              <Text style={{ fontSize: 11.5, color: C.sub, marginTop: 3 }}>
                {account || '입금 계좌가 등록되지 않았습니다'}
              </Text>
            </View>
            <Btn small tone="ghost" onPress={() => setEditing(true)}>수정</Btn>
          </View>
        )}
      </Card>
      </>)}

      {show('unpaid') && unpaid.length > 0 && (
        <>
          <SectionTitle hint="총무에게만 보입니다">미납자 {unpaid.length}명</SectionTitle>
          <Card>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {unpaid.map((m) => <Chip key={m.id} tone="outline">{m.name}</Chip>)}
            </View>
          </Card>
        </>
      )}
    </View>
  );
}
