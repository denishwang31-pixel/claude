/* ============================================================
   회비 — 회비 관리 화면의 부품들 (회장·총무 전용)

   회비 관리(FeeManageScreen)가 이 부품들을 조립한다:
     FeeDashboard  현황판 — 기간 고르기 + 납부·미납·미수금 + 수입·지출·잔액
     PaidList      개인별 납부 현황 — 이름 옆 칸을 누르면 납부↔미납
     ExpensePanel  지출 관리 — 코트장 거르기 · 지출 입력 · 목록 · 삭제

   코트장별 구분
     코트를 여러 곳 운영하면 대관료도 코트별로 나간다. 지출에 코트장을 달고,
     지출 관리에서 코트를 고르면 그 코트 지출만 본다. 회비(수입)는 청구
     단위(클럽 전체 또는 코트장별로 걷는 클럽이면 그 코트장) 기준이다.

   숫자 계산은 src/lib/feeView.js(검사: scripts/test-feeview.mjs).
   ============================================================ */
import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { setFeePaid, addExpense, deleteExpense } from '../lib/firestore';
import { FEE_CYCLE } from '../lib/constants';
import { periodTitle, won } from '../lib/feeView';
import { DateField, Label } from './pickers';
import { VenuePicker } from './VenuePicker';
import { BillingScopeTabs } from './ScopeControls';
import { Card, Chip, Btn, Field, HeroCard } from './ui';
import { C, S } from '../lib/theme';

const todayStr = () => new Date().toISOString().slice(0, 10);
const monthKeyNow = () => new Date().toISOString().slice(0, 7);
const yearKeyNow = () => new Date().toISOString().slice(0, 4);

export const EXPENSE_CATS = ['코트 대관', '공·소모품', '경조사', '회식', '대회 참가', '기타'];

/** 고를 수 있는 기간 — 월납은 최근 3달, 연납은 올해·작년 */
export function periodChoices(cycle) {
  if (cycle === FEE_CYCLE.YEARLY) return [0, -1].map((off) => String(Number(yearKeyNow()) + off));
  return [0, -1, -2].map((off) => {
    const d = new Date(); d.setMonth(d.getMonth() + off);
    return d.toISOString().slice(0, 7);
  });
}

function Stat({ value, label, tone }) {
  const color = tone === 'bad' ? C.danger : tone === 'good' ? C.green : C.text;
  return (
    <View style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: C.fill }}>
      <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 20, fontWeight: '800', color }}>{value}</Text>
      <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 12, fontWeight: '700', color: C.sub, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

const MoneyCell = ({ label, value, tone }) => (
  <View style={{ flex: 1 }}>
    <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: '600' }}>{label}</Text>
    <Text style={{
      fontSize: 16, fontWeight: '800', marginTop: 2, letterSpacing: -0.4,
      color: tone === 'red' ? '#FCA5A5' : tone === 'white' ? '#FFFFFF' : C.lime,
    }}>{won(value)}</Text>
  </View>
);

/* ---------------- 현황판 ----------------
   총무가 들어오자마자 보는 한 장. "이번 달 몇 명 냈고, 얼마 못 받았고,
   통장에 얼마 남았나". 기간·청구 단위도 여기서 바꾼다(아래 메뉴가 전부 따른다). */
export function FeeDashboard({
  cycle, setCycle, periodKey, setFeeMonth, scopes, scopeId, setScopeId, summary, amount, dueDate,
}) {
  return (
    <View>
      {cycle === FEE_CYCLE.MONTHLY && (
        <BillingScopeTabs scopes={scopes} value={scopeId} onChange={setScopeId} />
      )}
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text maxFontSizeMultiplier={1.3} style={{ flex: 1, fontSize: 19, fontWeight: '800', color: C.text }}>
            {periodTitle(periodKey)} 회비 현황
          </Text>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {[[FEE_CYCLE.MONTHLY, '월납'], [FEE_CYCLE.YEARLY, '연납']].map(([k, label]) => (
              <Chip key={k} tone={cycle === k ? 'green' : 'outline'}
                onPress={() => { setCycle(k); setFeeMonth(k === FEE_CYCLE.YEARLY ? `${yearKeyNow()}-01` : monthKeyNow()); }}>
                {label}
              </Chip>
            ))}
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {periodChoices(cycle).map((p) => (
            <Chip key={p} tone={periodKey === p ? 'lime' : 'outline'}
              onPress={() => setFeeMonth(cycle === FEE_CYCLE.YEARLY ? `${p}-01` : p)}>{p}</Chip>
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: S.sm, marginTop: 12 }}>
          <Stat value={`${summary.paidN}명`} label="납부" tone="good" />
          <Stat value={`${summary.unpaidN}명`} label="미납" tone={summary.unpaidN ? 'bad' : null} />
          <Stat value={Number(summary.outstanding).toLocaleString('ko-KR')} label="미수금(원)" tone={summary.outstanding ? 'bad' : null} />
        </View>
        <View style={{ height: 8, backgroundColor: C.border, borderRadius: 999, overflow: 'hidden', marginTop: 12 }}>
          <View style={{ height: 8, width: `${summary.pct}%`, backgroundColor: C.green2 }} />
        </View>
        <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 12, fontWeight: '600', color: C.sub, marginTop: 6 }}>
          납부율 {summary.pct}% · 1인 {won(amount)}{dueDate ? ` · 납부 기한 ${dueDate}` : ''}
        </Text>
      </Card>

      {/* 돈 흐름 — 이번 기간 들어온 회비와 나간 지출, 그 차이 */}
      <HeroCard style={{ marginTop: 10 }}>
        <Text style={{ color: C.lime, fontSize: 12, fontWeight: '700' }}>{periodKey} 회비 수입 − 지출</Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 5, marginTop: S.sm }}>
          <Text style={{ color: '#fff', fontSize: 28, fontWeight: '800', letterSpacing: -1 }}>
            {Number(summary.balance).toLocaleString('ko-KR')}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 15, fontWeight: '700', marginBottom: 4 }}>원</Text>
        </View>
        <View style={{
          flexDirection: 'row', gap: S.sm, marginTop: S.md, paddingTop: S.md,
          borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)',
        }}>
          <MoneyCell label="회비 수입" value={summary.income} tone="lime" />
          <MoneyCell label="지출" value={summary.spent} tone="red" />
        </View>
      </HeroCard>
    </View>
  );
}

/* ---------------- 개인별 납부 현황 ----------------
   이름 옆 칸을 **한 번 누르면** 납부 ↔ 미납이 바로 바뀐다(앱 주인이 정함 —
   드롭다운으로 고르는 한 단계가 번거롭다). 잘못 눌렀으면 한 번 더 누르면
   되돌아간다. 그래서 칸 안에 "누르면 바뀐다"는 표시(⇄)를 같이 둔다. */
export function PaidList({ clubId, members, paidMap, amount, feeKey, periodKey, flash }) {
  const setPaidState = (m, paidNow) => {
    if (!!paidMap[m.id] === paidNow) return;
    const next = { ...paidMap, [m.id]: paidNow };
    // 이전 상태를 같이 넘긴다 — 바뀐 사람만 개인 문서에 반영하기 위해
    setFeePaid(clubId, feeKey, next, amount, paidMap)
      .then(() => flash(`${m.name} → ${paidNow ? '납부' : '미납'}`))
      .catch(() => flash('바꾸지 못했습니다'));
  };
  /* 이름순으로 **고정**한다. 미납을 위로 올리면, 누르는 순간 그 사람이 아래로
     내려가 버려서 "잘못 눌렀으니 한 번 더"를 할 수가 없다. */
  const list = [...members].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko'));
  return (
    <Card>
      <Text style={{ fontSize: 12, fontWeight: '600', color: C.sub, marginBottom: 6 }}>
        오른쪽 칸을 누르면 납부 ↔ 미납이 바로 바뀝니다 · 잘못 눌렀으면 한 번 더 누르세요
      </Text>
      {list.map((m, i) => (
        <View key={m.id} style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48,
          borderTopWidth: i ? 1 : 0, borderTopColor: C.border,
        }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: C.text }}>{m.name}</Text>
          <PaidToggle paid={!!paidMap[m.id]} name={m.name} onPress={() => setPaidState(m, !paidMap[m.id])} />
        </View>
      ))}
      {members.length === 0 && <Text style={{ fontSize: 13, color: C.faint }}>활동 회원이 없습니다.</Text>}
    </Card>
  );
}

/** 납부/미납 알약 — 누르면 반대로 바뀐다 */
function PaidToggle({ paid, name, onPress }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} accessibilityRole="button"
      accessibilityLabel={`${name} ${paid ? '납부' : '미납'}, 누르면 ${paid ? '미납' : '납부'}으로 바뀝니다`}
      style={({ pressed }) => ({
        minWidth: 76, minHeight: 36, paddingHorizontal: 12, borderRadius: 999,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
        backgroundColor: paid ? C.green : '#FEE2E2', borderWidth: 1, borderColor: paid ? C.green : '#FECACA',
        opacity: pressed ? 0.7 : 1,
      })}>
      <Text style={{ fontSize: 13, fontWeight: '800', color: paid ? '#FFFFFF' : '#B91C1C' }}>{paid ? '납부' : '미납'}</Text>
      <Text style={{ fontSize: 11, fontWeight: '800', color: paid ? 'rgba(255,255,255,0.75)' : '#DC2626' }}>⇄</Text>
    </Pressable>
  );
}

/* ---------------- 지출 관리 ----------------
   코트장 거르기 → [+ 지출 입력] → 이 기간 지출 목록(최근 날짜 먼저). */
export function ExpensePanel({
  clubId, periodKey, expenses, allExpensesCount, venues, visibleVenues, venueId, setVenueId,
  seeAllVenues, flash,
}) {
  const [adding, setAdding] = useState(false);
  const blank = () => ({ date: todayStr(), category: EXPENSE_CATS[0], amount: '', memo: '', venueId: null });
  const [ex, setEx] = useState(blank);
  useEffect(() => { if (!adding) setEx(blank()); }, [adding]);

  const venueLabel = (id) => (id ? (venues.find((v) => v.id === id)?.name || '알 수 없는 코트') : '공통');
  const spent = expenses.reduce((n, e) => n + (Number(e.amount) || 0), 0);

  const save = () => {
    const amount = Number(String(ex.amount).replace(/[^0-9]/g, '')) || 0;
    if (!amount || !ex.date) return;
    addExpense(clubId, { ...ex, venueId: ex.venueId || venueId || null, amount })
      .then(() => flash('지출을 등록했습니다'))
      .catch(() => flash('등록하지 못했습니다'));
    setAdding(false);
  };

  return (
    <View>
      {visibleVenues.length > 0 && (
        <View style={{ marginBottom: 10, zIndex: 20 }}>
          <VenuePicker venues={visibleVenues} value={venueId} onChange={setVenueId} allowAll={seeAllVenues} label="코트장" />
          <Text style={{ fontSize: 12, color: C.faint, marginTop: 5, lineHeight: 17 }}>
            {venueId ? '이 코트장에 쓴 지출만 봅니다.' : '모든 코트의 지출을 합쳐서 봅니다.'}
          </Text>
        </View>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <Text maxFontSizeMultiplier={1.3} style={{ flex: 1, fontSize: 15, fontWeight: '800', color: C.text }}>
          {periodKey} 지출 {expenses.length}건 · {won(spent)}
        </Text>
        {!adding && <Btn small onPress={() => setAdding(true)}>+ 지출 입력</Btn>}
      </View>

      {adding && (
        <Card style={{ marginBottom: 10, borderColor: C.green, borderWidth: 1.5 }}>
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
            <Field keyboardType="number-pad" placeholder="120000" suffix="원" value={ex.amount} onChangeText={(v) => setEx({ ...ex, amount: v })} />
          </View>
          <View style={{ marginTop: 10 }}>
            <Label hint="선택">메모</Label>
            <Field placeholder="예: 9월 코트 대관비" value={ex.memo} onChangeText={(v) => setEx({ ...ex, memo: v })} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <View style={{ flex: 1 }}><Btn full tone="ghost" onPress={() => setAdding(false)}>취소</Btn></View>
            <View style={{ flex: 2 }}><Btn full disabled={!ex.amount || !ex.date} onPress={save}>지출 등록</Btn></View>
          </View>
        </Card>
      )}

      <Card>
        {expenses.map((e, i) => (
          <View key={e.id} style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8,
            borderTopWidth: i ? 1 : 0, borderTopColor: C.border,
          }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Chip tone="outline">{e.category}</Chip>
                {venues.length > 0 && <Chip tone={e.venueId ? 'soft' : 'default'}>{venueLabel(e.venueId)}</Chip>}
                <Text style={{ fontSize: 12, color: C.faint }}>{e.date}</Text>
              </View>
              {!!e.memo && <Text style={{ fontSize: 13, color: C.sub, marginTop: 3 }}>{e.memo}</Text>}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: C.danger }}>-{Number(e.amount).toLocaleString('ko-KR')}</Text>
              <Pressable hitSlop={8} onPress={() => Alert.alert('지출 삭제', `${e.category} ${won(e.amount)}을 삭제할까요?`, [
                { text: '취소', style: 'cancel' },
                { text: '삭제', style: 'destructive', onPress: () => { deleteExpense(clubId, e.id); flash('삭제했습니다'); } },
              ])}>
                <Text style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>삭제</Text>
              </Pressable>
            </View>
          </View>
        ))}
        {expenses.length === 0 && (
          <Text style={{ fontSize: 13, color: C.faint }}>{periodKey} 지출 내역이 없습니다. [+ 지출 입력]으로 적어 주세요.</Text>
        )}
      </Card>
      {allExpensesCount > expenses.length && (
        <Text style={{ fontSize: 12, color: C.faint, textAlign: 'center', marginTop: 8 }}>
          다른 기간·코트장의 지출 {allExpensesCount - expenses.length}건은 위 현황판에서 기간을 바꿔 보세요.
        </Text>
      )}
    </View>
  );
}
