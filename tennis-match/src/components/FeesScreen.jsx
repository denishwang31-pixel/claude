/* 회비 — 월납/연납 구분, 납부 현황, 지출 관리 (회장·총무 전용 화면)
   수입(회비) - 지출 = 잔액 을 한눈에 보여줍니다.

   코트장별 구분
     코트를 여러 곳 운영하면 대관료도 코트별로 나간다. 예전엔 전부 한 통에
     섞여서 "어느 코트에 얼마 썼는지"를 알 수 없었다. 지출에 코트장을 달고,
     상단에서 코트를 고르면 그 코트 지출만 본다.
     회장·총무는 [전체]로 모든 코트를 합쳐 볼 수 있다.
     회비(수입)는 클럽 단위라 코트로 나누지 않는다. */
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, Pressable, Alert } from 'react-native';
import { setFeePaid, subExpenses, addExpense, deleteExpense } from '../lib/firestore';
import { FEE_CYCLE } from '../lib/constants';
import { DateField, Label } from './pickers';
import { VenuePicker } from './VenuePicker';
import { Card, SectionTitle, Chip, Btn, Field } from './ui';
import { C, S } from '../lib/theme';

const todayStr = () => new Date().toISOString().slice(0, 10);
const monthKeyNow = () => new Date().toISOString().slice(0, 7);
const yearKeyNow = () => new Date().toISOString().slice(0, 4);

const EXPENSE_CATS = ['코트 대관', '공·소모품', '경조사', '회식', '대회 참가', '기타'];

export function Fees({
  clubId, club, members, fee, feeMonth, setFeeMonth, isAdmin, flash,
  venues = [], seeFees = true, seeAllVenues = true, myLeadVenues = [],
}) {
  const [cycle, setCycle] = useState(FEE_CYCLE.MONTHLY);
  const [tab, setTab] = useState('income'); // income | expense
  const [paste, setPaste] = useState('');
  const [expenses, setExpenses] = useState([]);
  const [adding, setAdding] = useState(false);
  const [venueId, setVenueId] = useState(null);   // null = 전체 코트
  const [ex, setEx] = useState({
    date: todayStr(), category: EXPENSE_CATS[0], amount: '', memo: '', venueId: null,
  });

  /* 리드는 자기 코트 지출만 볼 수 있다 */
  const visibleVenues = seeAllVenues ? venues : myLeadVenues;
  /* 지출 한 건이 어느 코트장 것인지 — 미지정이면 '공통' */
  const venueLabel = (id) => (id ? (venues.find((v) => v.id === id)?.name || '알 수 없는 코트') : '공통');
  useEffect(() => {
    if (!seeAllVenues && myLeadVenues.length && !venueId) setVenueId(myLeadVenues[0].id);
  }, [seeAllVenues, myLeadVenues.length]);

  useEffect(() => {
    if (!clubId) return undefined;
    return subExpenses(clubId, setExpenses);
  }, [clubId]);

  /* 회비·지출은 회장·총무만 */
  if (!isAdmin || !seeFees) {
    return (
      <Card>
        <Text style={{ fontSize: 13, fontWeight: '700', marginBottom: 4 }}>회장·총무 전용 메뉴</Text>
        <Text style={{ fontSize: 12, color: C.sub, lineHeight: 18 }}>
          회비와 지출 내역은 회장·총무만 확인할 수 있습니다.
          납부 문의는 총무에게 연락해 주세요.
        </Text>
      </Card>
    );
  }

  const amount = fee.amount
    || (cycle === FEE_CYCLE.YEARLY ? club?.settings?.feeYearly : club?.settings?.feeAmount)
    || (cycle === FEE_CYCLE.YEARLY ? 300000 : 30000);
  const active = members.filter((m) => m.status === '활동' || !m.status);
  const paidMap = fee.paid || {};
  const periodKey = cycle === FEE_CYCLE.YEARLY ? feeMonth.slice(0, 4) : feeMonth;

  const togglePaid = (id) => {
    const next = { ...paidMap, [id]: !paidMap[id] };
    // 이전 상태를 같이 넘긴다 — 바뀐 사람만 개인 문서에 반영하기 위해
    setFeePaid(clubId, periodKey, next, amount, paidMap);
  };

  const runMatch = () => {
    let hit = 0;
    const next = { ...paidMap };
    active.forEach((m) => { if (m.name && paste.includes(m.name)) { next[m.id] = true; hit++; } });
    setFeePaid(clubId, periodKey, next, amount, paidMap);
    setPaste('');
    flash(`${hit}명 입금자명 매칭 완료`);
  };

  const paidN = active.filter((m) => paidMap[m.id]).length;
  const pct = active.length ? Math.round((paidN / active.length) * 100) : 0;

  /* 수입·지출 집계 */
  const income = paidN * amount;
  const periodExpenses = useMemo(
    () => expenses
      .filter((e) => (e.date || '').startsWith(periodKey))
      .filter((e) => (venueId ? (e.venueId || null) === venueId : true))
      .filter((e) => (seeAllVenues ? true
        : myLeadVenues.some((v) => v.id === (e.venueId || null)))),
    [expenses, periodKey, cycle, venueId, seeAllVenues, myLeadVenues],
  );
  const spent = periodExpenses.reduce((n, e) => n + (Number(e.amount) || 0), 0);

  /* 기간 선택 칩 */
  const periods = cycle === FEE_CYCLE.YEARLY
    ? [0, -1].map((off) => String(Number(yearKeyNow()) + off))
    : [0, -1, -2].map((off) => {
      const d = new Date(); d.setMonth(d.getMonth() + off);
      return d.toISOString().slice(0, 7);
    });

  const Tab = ({ v, label }) => (
    <Pressable onPress={() => setTab(v)}
      style={{ flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: 'center', backgroundColor: tab === v ? C.green : '#fff', borderWidth: tab === v ? 0 : 1, borderColor: C.border }}>
      <Text style={{ fontWeight: '700', fontSize: 13, color: tab === v ? C.lime : C.sub }}>{label}</Text>
    </Pressable>
  );

  return (
    <View>
      {/* 납부 주기 */}
      <Card>
        <Label>납부 주기</Label>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {[[FEE_CYCLE.MONTHLY, '월 납입'], [FEE_CYCLE.YEARLY, '연 납입']].map(([k, label]) => (
            <Chip key={k} tone={cycle === k ? 'green' : 'outline'}
              onPress={() => { setCycle(k); setFeeMonth(k === FEE_CYCLE.YEARLY ? yearKeyNow() + '-01' : monthKeyNow()); }}>
              {label}
            </Chip>
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {periods.map((p) => (
            <Chip key={p} tone={periodKey === p ? 'lime' : 'outline'}
              onPress={() => setFeeMonth(cycle === FEE_CYCLE.YEARLY ? `${p}-01` : p)}>{p}</Chip>
          ))}
        </View>
      </Card>

      {/* 코트장 선택 — 지출을 코트별로 나눠 본다 */}
      {visibleVenues.length > 0 && (
        <View style={{ marginTop: 10, zIndex: 20 }}>
          <VenuePicker
            venues={visibleVenues}
            value={venueId}
            onChange={setVenueId}
            allowAll={seeAllVenues}
            label="지출 코트장"
          />
          <Text style={{ fontSize: 11, color: C.faint, marginTop: 5, lineHeight: 16 }}>
            {venueId
              ? '이 코트장에 쓴 지출만 집계합니다. 회비(수입)는 클럽 전체 기준입니다.'
              : '모든 코트의 지출을 합쳐서 봅니다.'}
          </Text>
        </View>
      )}

      {/* 요약 */}
      <Card style={{ marginTop: 10, backgroundColor: C.ink, borderColor: C.green }}>
        <Text style={{ color: C.lime, fontSize: 11, fontWeight: '800' }}>
          {periodKey} 정산
          {venueId ? ` · ${visibleVenues.find((v) => v.id === venueId)?.name || ''}` : ' · 전체 코트'}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          {[['수입', income, '#BFE3D3'], ['지출', spent, '#fca5a5'], ['잔액', income - spent, C.lime]].map(([label, v, col]) => (
            <View key={label} style={{ flex: 1, backgroundColor: C.green, borderRadius: 12, padding: 8, alignItems: 'center' }}>
              <Text style={{ color: col, fontSize: 14, fontWeight: '700' }}>{Number(v).toLocaleString()}</Text>
              <Text style={{ color: '#BFE3D3', fontSize: 10 }}>{label}</Text>
            </View>
          ))}
        </View>
      </Card>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <Tab v="income" label="회비 납부" />
        <Tab v="expense" label="지출 관리" />
      </View>

      {tab === 'income' ? (
        <View>
          <SectionTitle>
            {periodKey} 납부 현황 ({paidN}/{active.length} · {pct}%)
          </SectionTitle>
          <View style={{ height: 8, backgroundColor: '#e7e5e4', borderRadius: 999, overflow: 'hidden', marginBottom: 8 }}>
            <View style={{ height: 8, width: `${pct}%`, backgroundColor: C.lime2 }} />
          </View>
          <Card>
            <Text style={{ fontSize: 11, color: C.faint, marginBottom: 8 }}>
              1인당 {Number(amount).toLocaleString()}원 · 이름을 눌러 납부/미납을 바꿉니다
            </Text>
            {active.map((m, i) => (
              <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7, borderTopWidth: i ? 1 : 0, borderTopColor: '#f5f5f4' }}>
                <Text style={{ fontSize: 14, fontWeight: '600' }}>{m.name}</Text>
                <Pressable onPress={() => togglePaid(m.id)}
                  style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, backgroundColor: paidMap[m.id] ? C.green : '#fee2e2' }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: paidMap[m.id] ? C.lime : '#b91c1c' }}>
                    {paidMap[m.id] ? '납부' : '미납'}
                  </Text>
                </Pressable>
              </View>
            ))}
            {active.length === 0 && <Text style={{ fontSize: 12, color: C.faint }}>활동 회원이 없습니다.</Text>}
          </Card>

          <SectionTitle>입금 내역 일괄 매칭</SectionTitle>
          <Card>
            <Text style={{ fontSize: 11, color: C.faint, marginBottom: 8 }}>
              은행 거래내역(입금자명 포함)을 붙여넣으면 회원 이름을 찾아 자동으로 납부 처리합니다.
            </Text>
            <TextInput
              value={paste} onChangeText={setPaste} multiline
              placeholder="예: 홍길동 30,000원 입금 / 김철수 30000 …"
              placeholderTextColor={C.faint}
              style={{ backgroundColor: '#f5f5f4', borderRadius: 12, padding: 12, fontSize: 13, height: 80, textAlignVertical: 'top', color: C.text }}
            />
            <View style={{ marginTop: 8 }}>
              <Btn full tone="ghost" disabled={!paste} onPress={runMatch}>붙여넣기 일괄 매칭</Btn>
            </View>
          </Card>

          <View style={{ marginTop: 10 }}>
            <Btn full tone="ghost" onPress={() => flash('미납자에게 리마인드 푸시 발송 (PHASE 3 연동 지점)')}>
              미납자 {active.length - paidN}명에게 리마인드
            </Btn>
          </View>
        </View>
      ) : (
        <View>
          <SectionTitle right={
            <Chip tone={adding ? 'green' : 'outline'} onPress={() => setAdding(!adding)}>{adding ? '닫기' : '+ 지출'}</Chip>
          }>
            {periodKey} 지출 ({periodExpenses.length}건 · {spent.toLocaleString()}원)
          </SectionTitle>

          {adding && (
            <Card style={{ marginBottom: 10 }}>
              <Label>날짜</Label>
              <DateField value={ex.date} onChange={(v) => setEx({ ...ex, date: v })} />
              {visibleVenues.length > 0 && (
                <View style={{ marginTop: 10 }}>
                  <Label hint="어느 코트에 쓴 돈인지">코트장</Label>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    <Chip tone={!(ex.venueId || venueId) ? 'green' : 'outline'}
                      onPress={() => setEx({ ...ex, venueId: null })}>공통(코트 무관)</Chip>
                    {visibleVenues.map((v) => (
                      <Chip key={v.id} tone={(ex.venueId || venueId) === v.id ? 'green' : 'outline'}
                        onPress={() => setEx({ ...ex, venueId: v.id })}>{v.name}</Chip>
                    ))}
                  </View>
                </View>
              )}

              <View style={{ marginTop: 10 }}>
                <Label>항목</Label>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {EXPENSE_CATS.map((c) => (
                    <Chip key={c} tone={ex.category === c ? 'green' : 'outline'} onPress={() => setEx({ ...ex, category: c })}>{c}</Chip>
                  ))}
                </View>
              </View>
              <View style={{ marginTop: 10 }}>
                <Label hint="숫자만">금액</Label>
                <Field keyboardType="number-pad" placeholder="120000" value={ex.amount} onChangeText={(v) => setEx({ ...ex, amount: v })} />
              </View>
              <View style={{ marginTop: 10 }}>
                <Label hint="선택">메모</Label>
                <Field placeholder="예: 3월 코트 대관비" value={ex.memo} onChangeText={(v) => setEx({ ...ex, memo: v })} />
              </View>
              <View style={{ marginTop: 12 }}>
                <Btn full disabled={!ex.amount || !ex.date} onPress={() => {
                  addExpense(clubId, {
                    ...ex,
                    venueId: ex.venueId || venueId || null,
                    amount: Number(ex.amount) || 0,
                  });
                  setEx({ date: todayStr(), category: EXPENSE_CATS[0], amount: '', memo: '' });
                  setAdding(false);
                  flash('지출이 등록되었습니다');
                }}>지출 등록</Btn>
              </View>
            </Card>
          )}

          <Card>
            {periodExpenses.map((e, i) => (
              <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: '#f5f5f4' }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Chip tone="outline">{e.category}</Chip>
                    {venues.length > 0 && (
                      <Chip tone={e.venueId ? 'soft' : 'default'}>{venueLabel(e.venueId)}</Chip>
                    )}
                    <Text style={{ fontSize: 11, color: C.faint }}>{e.date}</Text>
                  </View>
                  {!!e.memo && <Text style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>{e.memo}</Text>}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: C.danger }}>-{Number(e.amount).toLocaleString()}</Text>
                  <Pressable onPress={() => Alert.alert('지출 삭제', `${e.category} ${Number(e.amount).toLocaleString()}원을 삭제할까요?`, [
                    { text: '취소', style: 'cancel' },
                    { text: '삭제', style: 'destructive', onPress: () => { deleteExpense(clubId, e.id); flash('삭제됨'); } },
                  ])}>
                    <Text style={{ fontSize: 11, color: C.faint }}>삭제</Text>
                  </Pressable>
                </View>
              </View>
            ))}
            {periodExpenses.length === 0 && (
              <Text style={{ fontSize: 12, color: C.faint }}>{periodKey} 지출 내역이 없습니다.</Text>
            )}
          </Card>

          {expenses.length > periodExpenses.length && (
            <Text style={{ fontSize: 11, color: C.faint, textAlign: 'center', marginTop: 10 }}>
              다른 기간의 지출 {expenses.length - periodExpenses.length}건은 위에서 기간을 바꿔 확인하세요.
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
