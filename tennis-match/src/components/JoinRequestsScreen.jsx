/* ============================================================
   가입 신청 승인 (운영진 전용)

   클럽을 검색해서 들어온 사람은 바로 회원이 되지 않고 여기 쌓인다.
   승인하면 회원 명단에 추가되고, 신청자 앱은 그 즉시 자동 입장한다.
   (초대코드로 들어온 사람은 코드 자체가 초대장이므로 여기 오지 않는다)
   ============================================================ */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Alert } from 'react-native';
import {
  subJoinRequests, approveJoinRequest, rejectJoinRequest, publishClubDirectory,
} from '../lib/firestore';
import { JOIN_STATUS, JOIN_STATUS_LABEL } from '../lib/constants';
import { Card, SectionTitle, Chip, Btn } from './ui';
import { C } from '../lib/theme';

const fmt = (ts) => {
  const d = ts?.toDate ? ts.toDate() : null;
  if (!d) return '';
  return `${d.getMonth() + 1}.${d.getDate()}`;
};

export function JoinRequests({ clubId, club, members, isAdmin, flash }) {
  const [reqs, setReqs] = useState([]);

  useEffect(() => {
    if (!clubId) return undefined;
    const unsub = subJoinRequests(clubId, setReqs);
    return () => unsub && unsub();
  }, [clubId]);

  const pending = useMemo(
    () => reqs.filter((r) => r.status === JOIN_STATUS.PENDING)
      .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)),
    [reqs],
  );
  const decided = useMemo(
    () => reqs.filter((r) => r.status !== JOIN_STATUS.PENDING)
      .sort((a, b) => (b.decidedAt?.seconds || 0) - (a.decidedAt?.seconds || 0)).slice(0, 10),
    [reqs],
  );

  if (!isAdmin) {
    return (
      <Card><Text style={{ fontSize: 12, color: C.sub }}>가입 신청은 운영진만 볼 수 있습니다.</Text></Card>
    );
  }

  const approve = async (r) => {
    try {
      await approveJoinRequest(clubId, r.id, r);
      // 공개 목록의 회원 수도 같이 갱신
      await publishClubDirectory(clubId, {
        name: club?.name || '', region: club?.settings?.region || '', memberCount: members.length + 1,
      });
      flash(`${r.name || '신규 회원'} 님을 승인했습니다`);
    } catch (e) { flash('승인에 실패했습니다. 다시 시도하세요'); }
  };

  const reject = (r) => {
    Alert.alert('가입 거절', `${r.name || '이 신청'}을 거절할까요?\n신청자에게 거절 안내가 표시됩니다.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '거절',
        style: 'destructive',
        onPress: async () => {
          try { await rejectJoinRequest(clubId, r.id); flash('신청을 거절했습니다'); }
          catch (e) { flash('처리에 실패했습니다'); }
        },
      },
    ]);
  };

  return (
    <View>
      <Card style={{ backgroundColor: C.ink, borderColor: C.green }}>
        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
          {pending.length > 0 ? `승인 대기 ${pending.length}건` : '대기 중인 신청이 없습니다'}
        </Text>
        <Text style={{ color: '#BFE3D3', fontSize: 11, marginTop: 4, lineHeight: 16 }}>
          클럽 검색으로 들어온 신청입니다. 승인하면 바로 회원 명단에 추가되고,
          신청한 분의 앱에서도 즉시 입장됩니다.{'\n'}
          초대코드로 들어온 분은 승인 없이 바로 가입되므로 여기 표시되지 않습니다.
        </Text>
      </Card>

      {pending.map((r) => (
        <Card key={r.id} style={{ marginTop: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{
              width: 34, height: 34, borderRadius: 17,
              backgroundColor: r.gender === 'F' ? C.femaleBg : C.maleBg,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: r.gender === 'F' ? C.female : C.male }}>
                {(r.name || '?').slice(0, 1)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '800' }}>
                {r.name || '이름 미입력'}
                <Text style={{ fontSize: 11, fontWeight: '500', color: C.sub }}>
                  {r.gender ? `  ${r.gender === 'F' ? '여' : '남'}` : ''}
                </Text>
              </Text>
              <Text style={{ fontSize: 10, color: C.faint, marginTop: 2 }}>
                신청 {fmt(r.createdAt)}{r.startedAt ? ` · 구력 시작 ${r.startedAt}` : ''}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <Btn small onPress={() => approve(r)}>승인</Btn>
            <Btn small tone="ghost" onPress={() => reject(r)}>거절</Btn>
          </View>
        </Card>
      ))}

      {pending.length === 0 && (
        <Card style={{ marginTop: 10 }}>
          <Text style={{ fontSize: 12, color: C.sub, lineHeight: 18 }}>
            새 회원을 빨리 받으려면 [더보기 → 클럽 초대]에서 초대 링크를 보내세요.
            링크로 들어오면 승인 절차 없이 바로 가입됩니다.
          </Text>
        </Card>
      )}

      {decided.length > 0 && (
        <>
          <SectionTitle>최근 처리 내역</SectionTitle>
          <Card>
            {decided.map((r, i) => (
              <View key={r.id} style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                paddingVertical: 7, borderTopWidth: i ? 1 : 0, borderTopColor: '#f5f5f4',
              }}>
                <Text style={{ fontSize: 13 }}>{r.name || r.id.slice(0, 6)}</Text>
                <Chip tone={r.status === JOIN_STATUS.APPROVED ? 'green' : 'outline'}>
                  {JOIN_STATUS_LABEL[r.status] || r.status}
                </Chip>
              </View>
            ))}
          </Card>
        </>
      )}
    </View>
  );
}

export default JoinRequests;
