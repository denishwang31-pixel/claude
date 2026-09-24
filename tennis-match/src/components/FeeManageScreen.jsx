/* ============================================================
   회비 관리 — 현황판 + 「회비 미납 관리」 + 「회비 지출 관리」

   앱 주인이 정한 모양
     1. 맨 위 **현황판**: 이번 달 납부·미납·미수금, 회비 수입·지출·잔액.
        들어오자마자 "몇 명 냈고, 얼마 못 받았고, 얼마 남았나"를 본다.
     2. 그 아래 **펼치는 메뉴 두 개** (둘 다 따로 열고 닫는다)
        · 회비 미납 관리  확인 요청 → 알림 단계(발송) → 납부 안내 설정 → 개인별 납부 현황
        · 회비 지출 관리  코트장 거르기 · 지출 입력 · 목록
     3. 일회성 정산(대회·회식)은 맨 아래 작은 메뉴로 남긴다(예전 기능을 잃지 않게).

   예전엔 드롭다운으로 한 번에 하나만 봤다. 그러면 현황을 보려고 한 번,
   납부 체크하려고 또 한 번 바꿔야 했고, 지출 입력은 드롭다운 네 번째에 숨어
   "지출 입력이 빠졌다"로 보였다(앱 주인이 겪음).

   기간·청구 단위는 현황판에서 정하고, 아래 메뉴는 전부 그것을 따른다.
   회비 문서는 여기서 직접 구독한다 — 연납일 때 예전 화면은 월 문서를 읽고
   연 문서에 써서 체크가 안 보이는 일이 있었다.
   ============================================================ */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { subFee } from '../lib/firestore';
import { FEE_CYCLE } from '../lib/constants';
import { billingScopes, membersInScope, feeDocKey } from '../lib/scope';
import { dueDateOf } from '../lib/dunning';
import { activeMembers, periodExpenses, feeSummary, won } from '../lib/feeView';
import { Dunning } from './DunningScreen';
import { FeeDashboard, PaidList, ExpensePanel } from './FeesScreen';
import { DuesPools } from './DuesPoolScreen';
import { Card } from './ui';
import { C } from '../lib/theme';

/** 펼치는 메뉴 한 칸 — 머리를 누르면 열고 닫는다 */
function Section({ title, sub, badge, badgeTone, open, onToggle, children, small }) {
  return (
    <View style={{ marginTop: 12 }}>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }}
        style={({ pressed }) => ({
          minHeight: small ? 52 : 64, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10,
          flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: open ? C.greenSoft : C.surface,
          borderWidth: 1.5, borderColor: open ? C.green : C.border, opacity: pressed ? 0.85 : 1,
        })}>
        <View style={{ flex: 1 }}>
          <Text maxFontSizeMultiplier={1.3} style={{ fontSize: small ? 15 : 17, fontWeight: '800', color: C.text }}>{title}</Text>
          {!!sub && <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 12, fontWeight: '600', color: C.sub, marginTop: 2 }}>{sub}</Text>}
        </View>
        {!!badge && (
          <View style={{
            paddingHorizontal: 10, height: 26, borderRadius: 13, justifyContent: 'center',
            backgroundColor: badgeTone === 'bad' ? '#FEE2E2' : C.fill,
          }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: badgeTone === 'bad' ? '#B91C1C' : C.sub }}>{badge}</Text>
          </View>
        )}
        <Text style={{ fontSize: 14, fontWeight: '800', color: C.green }}>{open ? '▲' : '▼'}</Text>
      </Pressable>
      {open && <View style={{ marginTop: 10 }}>{children}</View>}
    </View>
  );
}

const SubTitle = ({ children }) => (
  <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 16, fontWeight: '800', color: C.text, marginTop: 18, marginBottom: 8 }}>{children}</Text>
);

export function FeeManage({
  clubId, club, members, venues = [], feeMonth, setFeeMonth, scopeId = null, setScopeId = () => {},
  isAdmin, seeFees = true, seeAllVenues = true, myLeadVenues = [], expenses = [], pools = [],
  sentLog = {}, claims = [], me, flash,
}) {
  const [cycle, setCycle] = useState(FEE_CYCLE.MONTHLY);
  const [venueId, setVenueId] = useState(null);   // 지출 관리의 코트장 거르기(null = 전체)
  const [open, setOpen] = useState({ unpaid: false, expense: false, pool: false });
  const [feeDoc, setFeeDoc] = useState({ paid: {} });

  const scopes = useMemo(() => billingScopes(club, venues), [club, venues]);
  const scope = scopes.find((x) => x.id === scopeId) || scopes[0];
  const periodKey = cycle === FEE_CYCLE.YEARLY ? String(feeMonth).slice(0, 4) : feeMonth;
  const feeKey = feeDocKey(periodKey, cycle === FEE_CYCLE.YEARLY ? null : scope.id);

  useEffect(() => (clubId ? subFee(clubId, feeKey, setFeeDoc) : undefined), [clubId, feeKey]);
  useEffect(() => {
    if (!seeAllVenues && myLeadVenues.length && !venueId) setVenueId(myLeadVenues[0].id);
  }, [seeAllVenues, myLeadVenues.length]);

  const visibleVenues = seeAllVenues ? venues : myLeadVenues;
  const allowVenue = seeAllVenues ? null : (v) => myLeadVenues.some((x) => x.id === v);
  const scoped = useMemo(() => activeMembers(membersInScope(members, scope.id)), [members, scope.id]);
  const paidMap = feeDoc.paid || {};
  /* 연납은 아직 코트장별로 나누지 않는다 — 연회비를 코트장마다 다르게 걷는 클럽을 못 봤다 */
  const amount = cycle === FEE_CYCLE.YEARLY
    ? (feeDoc.amount || club?.settings?.feeYearly || 300000)
    : (feeDoc.amount || scope.amount);
  const allPeriodExp = useMemo(() => periodExpenses(expenses, periodKey, { allowVenue }), [expenses, periodKey, seeAllVenues, myLeadVenues]);
  const shownExp = useMemo(() => periodExpenses(expenses, periodKey, { venueId, allowVenue }), [expenses, periodKey, venueId, seeAllVenues, myLeadVenues]);
  const summary = feeSummary({ members: scoped, paidMap, amount, expenses: allPeriodExp });
  const dueDate = cycle === FEE_CYCLE.MONTHLY ? dueDateOf(periodKey, scope.dueDay) : '';

  if (!isAdmin || !seeFees) {
    return (
      <Card>
        <Text style={{ fontSize: 14, fontWeight: '800', marginBottom: 4 }}>회장·총무 전용 메뉴</Text>
        <Text style={{ fontSize: 13, color: C.sub, lineHeight: 19 }}>
          회비와 지출 내역은 회장·총무만 확인할 수 있습니다. 납부 문의는 총무에게 연락해 주세요.
        </Text>
      </Card>
    );
  }

  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  return (
    <View>
      <FeeDashboard
        cycle={cycle} setCycle={setCycle} periodKey={periodKey} setFeeMonth={setFeeMonth}
        scopes={scopes} scopeId={scope.id} setScopeId={setScopeId}
        summary={summary} amount={amount} dueDate={dueDate}
      />

      <Section
        title="회비 미납 관리"
        sub="미납 알림 발송 · 납부 안내 설정 · 개인별 납부 체크"
        badge={summary.unpaidN ? `미납 ${summary.unpaidN}명` : '전원 납부'}
        badgeTone={summary.unpaidN ? 'bad' : null}
        open={open.unpaid} onToggle={() => toggle('unpaid')}>
        {cycle === FEE_CYCLE.MONTHLY ? (
          <Dunning
            clubId={clubId} club={club} members={members} fee={feeDoc} periodKey={periodKey}
            sentLog={sentLog} claims={claims} isAdmin flash={flash} venues={venues}
            scopeId={scope.id} setScopeId={setScopeId} me={me}
            sections={['claims', 'stages', 'policy']}
          />
        ) : (
          <Card style={{ backgroundColor: C.fill }}>
            <Text style={{ fontSize: 13, color: C.sub, lineHeight: 19 }}>
              연 납입은 알림 단계를 아직 쓰지 않습니다. 아래에서 납부 여부만 체크하세요.
            </Text>
          </Card>
        )}
        <SubTitle>개인별 납부 현황 ({summary.paidN}/{summary.total})</SubTitle>
        <PaidList clubId={clubId} members={scoped} paidMap={paidMap} amount={amount}
          feeKey={feeKey} periodKey={periodKey} flash={flash} />
      </Section>

      <Section
        title="회비 지출 관리"
        sub="코트 대관·공·회식 등 지출 입력과 내역"
        badge={`${shownExp.length}건 · ${won(shownExp.reduce((n, e) => n + (Number(e.amount) || 0), 0))}`}
        open={open.expense} onToggle={() => toggle('expense')}>
        <ExpensePanel
          clubId={clubId} periodKey={periodKey} expenses={shownExp} allExpensesCount={(expenses || []).length}
          venues={venues} visibleVenues={visibleVenues} venueId={venueId} setVenueId={setVenueId}
          seeAllVenues={seeAllVenues} flash={flash}
        />
      </Section>

      <Section small
        title="일회성 정산"
        sub="대회·캠프·회식처럼 그때그때 걷는 돈"
        badge={pools.length ? `${pools.length}건` : null}
        open={open.pool} onToggle={() => toggle('pool')}>
        <DuesPools {...{ clubId, club, members, pools, isAdmin, flash }} />
      </Section>
    </View>
  );
}

export default FeeManage;
