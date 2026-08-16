/* 결산 — 총회 회계보고 자료를 자동으로 만든다.

   총무의 연중 최대 스트레스는 총회 회계보고다. 1년 치 엑셀을 뒤져 만들고
   회원들 앞에서 검증받는다. 그 숫자가 이미 앱 안에 다 있으니 다시 만들 이유가 없다.

   화면 아래 [자료 공유]를 누르면 총회에 그대로 쓸 수 있는 텍스트가 나온다.
   카톡·메일·문서 어디에 붙여도 형태가 유지되게 평문으로 만든다. */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Share, Pressable } from 'react-native';
import {
  settle, compare, previousPeriod, deltaText, toPlainText, won,
} from '../lib/settlement';
import { loadAllFees, subIncomes, addIncome, deleteIncome } from '../lib/firestore';
import { Field, Label } from './pickers';
import { Card, SectionTitle, Chip, Btn, StatCard, EmptyState } from './ui';
import { C, S, R, F } from '../lib/theme';

const thisYear = () => String(new Date().getFullYear());

/** 막대 하나 — 월별 추이용. 차트 라이브러리 없이 View 로 그린다 */
function Bar({ ratio, tone }) {
  return (
    <View style={{
      height: Math.max(2, Math.round(ratio * 56)),
      backgroundColor: tone, borderRadius: 3, width: '100%',
    }} />
  );
}

export function Settlement({ clubId, club, members, expenses = [], isAdmin, flash }) {
  const [year, setYear] = useState(thisYear());
  const [fees, setFees] = useState([]);
  const [incomes, setIncomes] = useState([]);
  const [carryOver, setCarryOver] = useState('');
  const [adding, setAdding] = useState(false);
  const [ni, setNi] = useState({ label: '', amount: '' });

  useEffect(() => {
    if (!clubId) return undefined;
    loadAllFees(clubId).then(setFees).catch(() => setFees([]));
    return subIncomes(clubId, setIncomes);
  }, [clubId]);

  const extraIncome = useMemo(
    () => incomes.filter((x) => String(x.date || '').startsWith(year))
      .map((x) => ({ label: x.label, amount: x.amount, id: x.id })),
    [incomes, year],
  );

  const s = useMemo(() => settle(year, {
    fees, expenses, members, carryOver: Number(carryOver) || 0, extraIncome,
  }), [year, fees, expenses, members, carryOver, extraIncome]);

  const prev = useMemo(() => settle(previousPeriod(year), {
    fees, expenses, members,
  }), [year, fees, expenses, members]);
  const cmp = useMemo(() => compare(s, prev), [s, prev]);

  /* 데이터가 있는 연도만 고르게 한다 */
  const years = useMemo(() => {
    const set = new Set([thisYear()]);
    fees.forEach((f) => set.add(String(f.id).slice(0, 4)));
    expenses.forEach((e) => set.add(String(e.date || '').slice(0, 4)));
    return [...set].filter(Boolean).sort().reverse();
  }, [fees, expenses]);

  const share = async () => {
    try {
      await Share.share({ message: toPlainText(s, club?.name) });
    } catch (_) { flash('공유를 취소했습니다'); }
  };

  if (!isAdmin) {
    return (
      <Card>
        <Text style={F.bodyBold}>회장·총무 전용</Text>
        <Text style={{ fontSize: 12, color: C.sub, marginTop: 5, lineHeight: 18 }}>
          회계 자료는 회장·총무만 볼 수 있습니다.
        </Text>
      </Card>
    );
  }

  const maxMonthly = Math.max(1, ...s.monthly.map((m) => Math.max(m.income, m.spent)));

  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {years.map((y) => (
          <Chip key={y} tone={year === y ? 'green' : 'outline'} onPress={() => setYear(y)}>
            {y}년
          </Chip>
        ))}
      </View>

      {/* 총괄 */}
      <Card style={{ marginTop: S.md }}>
        <Text style={[F.label, { marginBottom: 10 }]}>{year}년 총괄</Text>
        <View style={{ flexDirection: 'row', gap: S.sm }}>
          <StatCard value={(s.income / 10000).toFixed(0)} label="수입(만원)" />
          <StatCard value={(s.spent / 10000).toFixed(0)} label="지출(만원)" />
          <StatCard value={(s.balance / 10000).toFixed(0)} label="잔액(만원)" />
        </View>
        {!!cmp && (prev.income > 0 || prev.spent > 0) && (
          <View style={{ marginTop: 12, gap: 4 }}>
            <Text style={{ fontSize: 11.5, color: C.sub }}>
              전년 대비 수입 {deltaText(cmp.income)}
            </Text>
            <Text style={{ fontSize: 11.5, color: C.sub }}>
              전년 대비 지출 {deltaText(cmp.spent)}
            </Text>
          </View>
        )}
      </Card>

      {/* 수입 */}
      <SectionTitle>수입</SectionTitle>
      <Card>
        <Row label="회비" value={won(s.feeIncome)} />
        {extraIncome.map((x) => (
          <Row
            key={x.id} label={x.label} value={won(x.amount)}
            onDelete={() => { deleteIncome(clubId, x.id); flash('삭제됨'); }}
          />
        ))}
        <Row label="합계" value={won(s.income)} bold />
        <View style={{ marginTop: 10 }}>
          <Label hint="전년도에서 넘어온 잔액">이월금</Label>
          <Field
            keyboardType="number-pad" placeholder="0"
            value={carryOver} onChangeText={setCarryOver}
          />
        </View>
        {adding ? (
          <View style={{ marginTop: 12 }}>
            <Field placeholder="항목 (예: 게스트비)" value={ni.label}
              onChangeText={(v) => setNi({ ...ni, label: v })} />
            <View style={{ marginTop: 8 }}>
              <Field keyboardType="number-pad" placeholder="금액" value={ni.amount}
                onChangeText={(v) => setNi({ ...ni, amount: v })} />
            </View>
            <View style={{ flexDirection: 'row', gap: S.sm, marginTop: 10 }}>
              <Btn small disabled={!ni.label || !ni.amount} onPress={() => {
                addIncome(clubId, {
                  label: ni.label, amount: Number(ni.amount) || 0, date: `${year}-01-01`,
                });
                setNi({ label: '', amount: '' }); setAdding(false); flash('수입 추가됨');
              }}>추가</Btn>
              <Btn small tone="ghost" onPress={() => setAdding(false)}>취소</Btn>
            </View>
          </View>
        ) : (
          <View style={{ marginTop: 10 }}>
            <Btn small tone="ghost" onPress={() => setAdding(true)}>＋ 회비 외 수입 추가</Btn>
          </View>
        )}
      </Card>

      {/* 지출 */}
      <SectionTitle hint={`${s.expenseCount}건`}>지출</SectionTitle>
      <Card>
        {s.byCategory.length === 0 ? (
          <Text style={{ fontSize: 12, color: C.faint }}>{year}년 지출 내역이 없습니다.</Text>
        ) : (
          <>
            {s.byCategory.map((c, i) => (
              <View key={c.category} style={{
                paddingVertical: 9, borderTopWidth: i ? 1 : 0, borderTopColor: C.border,
              }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12.5, color: C.text }}>{c.category}</Text>
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.text }}>
                    {won(c.amount)}
                  </Text>
                </View>
                <View style={{
                  height: 5, backgroundColor: C.fill, borderRadius: 3, marginTop: 6,
                  overflow: 'hidden',
                }}>
                  <View style={{
                    width: `${Math.round(c.ratio * 100)}%`, height: '100%',
                    backgroundColor: C.green, borderRadius: 3,
                  }} />
                </View>
              </View>
            ))}
            <Row label="합계" value={won(s.spent)} bold />
          </>
        )}
      </Card>

      {/* 월별 추이 */}
      {s.monthly.length > 0 && (
        <>
          <SectionTitle hint="위 수입 · 아래 지출">월별 추이</SectionTitle>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 64 }}>
              {s.monthly.map((m) => (
                <View key={m.month} style={{ flex: 1, gap: 2, justifyContent: 'flex-end' }}>
                  <Bar ratio={m.income / maxMonthly} tone={C.green} />
                  <Bar ratio={m.spent / maxMonthly} tone={C.danger} />
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 4, marginTop: 6 }}>
              {s.monthly.map((m) => (
                <Text key={m.month} style={{
                  flex: 1, fontSize: 9, color: C.faint, textAlign: 'center',
                }}>
                  {Number(m.month.slice(5))}
                </Text>
              ))}
            </View>
          </Card>
        </>
      )}

      {/* 납부 명세 */}
      <SectionTitle hint={`평균 납부율 ${Math.round(s.paidRate * 100)}%`}>
        회원별 납부
      </SectionTitle>
      <Card>
        {s.roster.length === 0 ? (
          <Text style={{ fontSize: 12, color: C.faint }}>회원이 없습니다.</Text>
        ) : s.roster.map((r, i) => (
          <View key={r.id} style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: C.border,
          }}>
            <Text style={[F.bodyBold, { flex: 1 }]} numberOfLines={1}>{r.name}</Text>
            <Text style={{ fontSize: 11.5, color: C.sub }}>
              {r.paidCount}/{r.totalCount}회
            </Text>
            <Text style={{
              fontSize: 12, fontWeight: '700', width: 46, textAlign: 'right',
              color: r.rate === 1 ? C.green : r.rate >= 0.5 ? C.sub : C.danger,
            }}>
              {Math.round(r.rate * 100)}%
            </Text>
          </View>
        ))}
      </Card>

      {s.arrears.length > 0 && (
        <Card style={{ marginTop: S.sm, backgroundColor: '#FFF7ED' }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#9A3412' }}>
            미납 {s.arrears.length}명 · {won(s.arrearsTotal)}
          </Text>
          <Text style={{ fontSize: 11, color: '#9A3412', marginTop: 4, lineHeight: 16 }}>
            {s.arrears.map((r) => `${r.name}(${won(r.owed)})`).join(', ')}
          </Text>
        </Card>
      )}

      <View style={{ marginTop: S.lg }}>
        <Btn full onPress={share}>총회 자료 공유</Btn>
        <Text style={{ fontSize: 10.5, color: C.faint, marginTop: 8, textAlign: 'center', lineHeight: 15 }}>
          위 내용이 그대로 정리된 텍스트로 나갑니다. 카톡·메일·문서에 붙여넣으세요.
        </Text>
      </View>
    </View>
  );
}

function Row({ label, value, bold, onDelete }) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: 8, borderTopWidth: bold ? 1 : 0, borderTopColor: C.border,
    }}>
      <Text style={{ fontSize: 12.5, color: C.text, fontWeight: bold ? '700' : '400' }}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.text }}>{value}</Text>
        {!!onDelete && (
          <Pressable onPress={onDelete}>
            <Text style={{ fontSize: 11, color: C.faint }}>삭제</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
