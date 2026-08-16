/* 회비 독촉 — 총무가 "형, 회비요..." 를 보내지 않아도 되게 한다.

   화면이 지키는 것
     · 알림은 클럽 이름으로 나간다. 총무 개인 이름이 들어가지 않는다.
     · 미납자 본인에게만 개별로 간다. 단체 공지로 명단이 뿌려지지 않는다.
     · 마지막 단계는 자동으로 안 나간다. 총무가 보고 누른다.
     · 같은 단계는 한 번만. 이미 보냈으면 버튼이 막힌다. */
import React, { useMemo, useState } from 'react';
import { View, Text, Alert } from 'react-native';
import {
  DUN_STAGES, DUN_STAGE, dueDateOf, stageFor, unpaidMembers, recipientsFor,
  messageFor, canSend, periodLabel,
} from '../lib/dunning';
import { markDunningSent, saveFeePolicy } from '../lib/firestore';
import { Field, Label } from './pickers';
import { Card, SectionTitle, Chip, Btn, StatCard } from './ui';
import { C, S, R, F } from '../lib/theme';

const today = () => new Date().toISOString().slice(0, 10);
const won = (n) => `${Number(n || 0).toLocaleString()}원`;

export function Dunning({
  clubId, club, members, fee, periodKey, amount, sentLog = {}, isAdmin, flash,
}) {
  const dueDay = club?.settings?.feeDueDay || 10;
  const account = club?.settings?.feeAccount || '';
  const [policy, setPolicy] = useState({ dueDay: String(dueDay), account });
  const [editing, setEditing] = useState(false);

  const paid = fee?.paid || {};
  const active = useMemo(
    () => members.filter((m) => !m.status || m.status === '활동'), [members],
  );
  const unpaid = useMemo(() => unpaidMembers(active, paid), [active, paid]);
  const dueDate = dueDateOf(periodKey, dueDay);
  const todayStage = stageFor(periodKey, today(), dueDay);

  const send = (stage) => {
    const gate = canSend(stage, periodKey, sentLog);
    if (!gate.ok) return flash(gate.reason);

    const to = recipientsFor(stage, active, paid);
    if (!to.length) return flash('보낼 대상이 없습니다');

    const msg = messageFor(stage, {
      clubName: club?.name, monthKey: periodKey, amount, dueDate, account,
    });

    return Alert.alert(
      `${stage.label} 발송`,
      `${to.length}명에게 개별로 발송합니다.\n`
      + `(단체 공지가 아니라 각자에게만 갑니다)\n\n`
      + `제목: ${msg.title}\n내용: ${msg.body}`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '발송',
          onPress: async () => {
            await markDunningSent(clubId, periodKey, stage.key, today());
            flash(`${to.length}명에게 ${stage.label} 발송 요청됨`);
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
      <Card>
        <Text style={F.bodyBold}>{periodLabel(periodKey)} 회비 현황</Text>
        <View style={{ flexDirection: 'row', gap: S.sm, marginTop: 10 }}>
          <StatCard value={active.length - unpaid.length} label="납부" />
          <StatCard value={unpaid.length} label="미납" />
          <StatCard value={won(unpaid.length * amount).replace('원', '')} label="미수금" />
        </View>
        <Text style={{ fontSize: 11.5, color: C.sub, marginTop: 12 }}>
          납부 기한 {dueDate}
          {todayStage ? ` · 오늘은 "${todayStage.label}" 발송일입니다` : ''}
        </Text>
      </Card>

      <SectionTitle hint="총무 이름이 아니라 클럽 이름으로 나갑니다">알림 단계</SectionTitle>
      {DUN_STAGES.map((stage) => {
        const gate = canSend(stage, periodKey, sentLog);
        const to = recipientsFor(stage, active, paid);
        const isToday = todayStage?.key === stage.key;
        const sentAt = sentLog?.[periodKey]?.[stage.key];
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
                  {sentAt ? ` · ${sentAt} 발송함` : ''}
                </Text>
              </View>
              <Btn small disabled={!gate.ok || !to.length} onPress={() => send(stage)}>
                {sentAt ? '발송됨' : '발송'}
              </Btn>
            </View>
          </Card>
        );
      })}

      <Card style={{ marginTop: S.md, backgroundColor: C.fill }}>
        <Text style={{ fontSize: 11.5, color: C.sub, lineHeight: 18 }}>
          미납 여부는 <Text style={{ fontWeight: '700' }}>본인에게만</Text> 보입니다.
          다른 회원은 누가 안 냈는지 알 수 없고, 단체 공지로도 나가지 않습니다.
        </Text>
      </Card>

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
                await saveFeePolicy(clubId, policy);
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

      {unpaid.length > 0 && (
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
