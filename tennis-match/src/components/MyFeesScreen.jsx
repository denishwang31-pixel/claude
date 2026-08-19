/* 내 회비 — 회원 본인이 자기 납부 현황을 확인한다.

   왜 필요한가
     전체 명단을 회원에게 열면 누가 안 냈는지 서로 다 보게 되어 분위기가
     상한다. 그렇다고 아예 막으면 본인도 "냈는데 미납으로 되어 있다"를
     발견할 방법이 없다. 그래서 본인 몫만 따로 내려 준다.

   체크는 클럽(회장·총무)이 한다. 회원은 결과를 볼 뿐 스스로 납부 표시를
   할 수 없다 — 그렇게 하면 회비 관리가 무너진다. 대신 기록이 다르면
   [확인 요청]을 남길 수 있고, 그게 총무 화면에 뜬다. */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, Alert, Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { subMyFees, fileFeeClaim, cancelFeeClaim } from '../lib/firestore';
import { paySettings, availableMethods, payTarget, PAY_LABEL, accountText } from '../lib/pay';
import { Card, SectionTitle, Chip, Btn, StatCard, EmptyState } from './ui';
import { C, S, R, F } from '../lib/theme';

const won = (n) => `${Number(n || 0).toLocaleString()}원`;
const label = (key) => {
  const [y, m] = String(key).split('-');
  return m ? `${y}년 ${Number(m)}월` : `${y}년`;
};

export function MyFees({ clubId, club, me, meVal, flash }) {
  const [data, setData] = useState({ periods: {}, claims: {} });
  const [asking, setAsking] = useState(null);   // 확인 요청 중인 기간
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!clubId || !me) return undefined;
    return subMyFees(clubId, me, setData);
  }, [clubId, me]);

  const rows = useMemo(() => Object.entries(data.periods || {})
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.key.localeCompare(a.key)), [data]);

  const paidCount = rows.filter((r) => r.paid).length;
  const unpaid = rows.filter((r) => !r.paid);
  const owed = unpaid.reduce((t, r) => t + Number(r.amount || 0), 0);
  const account = club?.settings?.feeAccount || '';
  const dueDay = club?.settings?.feeDueDay || 10;

  /* 송금 수단 — 클럽이 계좌를 넣어 뒀으면 버튼이 켜진다.
     예전에 자유 입력으로 적어 둔 계좌도 읽어 내므로 대개는 그냥 켜진다.
     아무것도 못 읽으면 목록이 비고, 아래 버튼 줄 자체가 안 그려진다. */
  const pay = useMemo(() => paySettings(club?.settings), [club?.settings]);
  const methods = useMemo(() => availableMethods(pay), [pay]);
  const [paying, setPaying] = useState(null);   // 송금 버튼을 펼친 기간

  /* 송금 앱으로 보낸다. 앱이 안 깔려 있으면 열리지 않으므로
     그 경우 계좌를 복사해 준다 — 회원이 막다른 길에 갇히지 않게. */
  const send = async (method, amount) => {
    const t = payTarget(method, pay, amount);
    if (!t) return;
    if (t.kind === 'copy') {
      await Clipboard.setStringAsync(t.value);
      flash('계좌번호를 복사했습니다');
      return;
    }
    try {
      await Linking.openURL(t.value);
    } catch (e) {
      await Clipboard.setStringAsync(accountText(pay.account));
      flash('앱을 열지 못해 계좌번호를 복사했습니다');
    }
  };

  const submit = (key) => {
    fileFeeClaim(clubId, me, key, note.trim());
    setAsking(null); setNote('');
    flash('확인 요청을 보냈습니다. 총무가 확인 후 반영합니다');
  };

  const cancel = (key) => Alert.alert('확인 요청 취소', `${label(key)} 확인 요청을 취소할까요?`, [
    { text: '아니오', style: 'cancel' },
    {
      text: '취소하기',
      onPress: () => { cancelFeeClaim(clubId, me, key); flash('요청을 취소했습니다'); },
    },
  ]);

  return (
    <View>
      <Card>
        <Text style={F.bodyBold}>{meVal?.name || '내'} 회비 현황</Text>
        <View style={{ flexDirection: 'row', gap: S.sm, marginTop: 12 }}>
          <StatCard value={paidCount} label="납부" />
          <StatCard value={unpaid.length} label="미납" />
          <StatCard value={owed ? (owed / 10000).toFixed(0) : 0} label="미납액(만원)" />
        </View>
        <Text style={{ fontSize: 11, color: C.faint, marginTop: 12, lineHeight: 16 }}>
          납부 확인은 클럽에서 합니다. 여기 보이는 것은 클럽이 확인한 결과입니다.
          {account ? `\n입금: ${account} (매월 ${dueDay}일까지)` : ''}
        </Text>
      </Card>

      {rows.length === 0 ? (
        <View style={{ marginTop: S.md }}>
          <EmptyState
            title="아직 회비 기록이 없습니다"
            body={'클럽에서 회비를 확인하면 여기에 표시됩니다.\n문의는 총무에게 해 주세요.'}
          />
        </View>
      ) : (
        <>
          <SectionTitle hint="최근 순">납부 내역</SectionTitle>
          {rows.map((r) => {
            const claim = (data.claims || {})[r.key];
            const pending = claim && !claim.resolved;
            return (
              <Card key={r.key} style={{ marginTop: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={F.bodyBold}>{label(r.key)}</Text>
                      <Chip tone={r.paid ? 'green' : 'warn'}>{r.paid ? '납부 완료' : '미납'}</Chip>
                      {pending && <Chip tone="outline">확인 요청 중</Chip>}
                    </View>
                    <Text style={{ fontSize: 11.5, color: C.sub, marginTop: 4 }}>
                      {won(r.amount)}
                      {r.at ? ` · ${String(r.at).slice(0, 10)} 기준` : ''}
                    </Text>
                    {pending && !!claim.note && (
                      <Text style={{ fontSize: 11, color: C.faint, marginTop: 4 }}>
                        보낸 내용: {claim.note}
                      </Text>
                    )}
                  </View>
                  {pending ? (
                    <Pressable onPress={() => cancel(r.key)}>
                      <Text style={{ fontSize: 11.5, color: C.faint }}>요청 취소</Text>
                    </Pressable>
                  ) : (
                    <Pressable onPress={() => { setAsking(r.key); setNote(''); }}>
                      <Text style={{ fontSize: 11.5, color: C.green, fontWeight: '700' }}>
                        {r.paid ? '기록이 달라요' : '냈어요'}
                      </Text>
                    </Pressable>
                  )}
                </View>

                {/* 납부 — 미납일 때만. 이미 낸 달에 송금 버튼을 두면 두 번 보낸다. */}
                {!r.paid && methods.length > 0 && (
                  <View style={{ marginTop: 10 }}>
                    {paying === r.key ? (
                      <View>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                          {methods.map((m) => (
                            <Chip key={m} tone="green" onPress={() => send(m, r.amount)}>
                              {PAY_LABEL[m]}
                            </Chip>
                          ))}
                        </View>
                        <Text style={{ fontSize: 10.5, color: C.faint, marginTop: 8, lineHeight: 16 }}>
                          송금 앱이 열리고 계좌·금액이 채워집니다. 보내신 뒤에는 총무가
                          입금을 확인해야 납부로 바뀝니다 — 버튼을 눌렀다고 바로
                          납부 처리되지는 않습니다.
                        </Text>
                        <Pressable onPress={() => setPaying(null)} style={{ marginTop: 6 }}>
                          <Text style={{ fontSize: 11, color: C.faint }}>닫기</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Btn small full onPress={() => setPaying(r.key)}>
                        {won(r.amount)} 납부하기
                      </Btn>
                    )}
                  </View>
                )}

                {asking === r.key && (
                  <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12 }}>
                    <Text style={{ fontSize: 11.5, color: C.sub, lineHeight: 17 }}>
                      {r.paid
                        ? '납부 기록이 사실과 다르면 알려 주세요.'
                        : '이미 납부하셨다면 언제·어떻게 보내셨는지 적어 주세요. 총무가 확인 후 반영합니다.'}
                    </Text>
                    <TextInput
                      value={note}
                      onChangeText={setNote}
                      multiline
                      placeholder="예: 8월 1일 배우자 명의(김영희)로 이체했습니다"
                      placeholderTextColor={C.faint}
                      style={{
                        marginTop: 10, minHeight: 64, borderWidth: 1, borderColor: C.border,
                        borderRadius: R.md, padding: 10, fontSize: 12.5, color: C.text,
                        textAlignVertical: 'top', backgroundColor: C.surface,
                      }}
                    />
                    <View style={{ flexDirection: 'row', gap: S.sm, marginTop: 10 }}>
                      <Btn small onPress={() => submit(r.key)}>확인 요청 보내기</Btn>
                      <Btn small tone="ghost" onPress={() => { setAsking(null); setNote(''); }}>
                        취소
                      </Btn>
                    </View>
                  </View>
                )}
              </Card>
            );
          })}
        </>
      )}

      <Card style={{ marginTop: S.md, backgroundColor: C.fill }}>
        <Text style={{ fontSize: 11.5, color: C.sub, lineHeight: 18 }}>
          다른 회원의 납부 여부는 볼 수 없고, 내 납부 여부도 다른 회원에게 보이지 않습니다.
        </Text>
      </Card>
    </View>
  );
}
