/* 입금 대사 — 은행 거래내역을 붙여넣으면 미납자와 자동으로 맞춰 준다.

   총무가 하는 일: 은행 앱에서 거래내역 복사 → 여기 붙여넣기 → 확인 → 반영.
   확실한 건 이미 체크돼 있고, 애매한 것만 이름을 골라 주면 된다.
   고른 결과는 별칭으로 남아서 다음 달부터는 그것도 자동으로 붙는다. */
import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, Alert } from 'react-native';
import { reconcile, learnAlias, cleanName, MATCH } from '../lib/reconcile';
import { saveFeeAliases, setFeePaid } from '../lib/firestore';
import { useOptionSheet } from './native';
import { Card, SectionTitle, Chip, Btn, StatCard } from './ui';
import { C, S, R, F } from '../lib/theme';

const won = (n) => `${Number(n || 0).toLocaleString()}원`;

const TONE = {
  [MATCH.AUTO]: { bg: '#E7F6F1', fg: '#0E6B4F', label: '확인됨' },
  [MATCH.SUGGEST]: { bg: '#FEF3C7', fg: '#92400E', label: '확인 필요' },
  [MATCH.NONE]: { bg: '#F5F5F4', fg: '#78716C', label: '미확인' },
};

export function Reconcile({
  clubId, club, members, fee, periodKey, amount, aliases = {}, flash, onDone,
}) {
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  /* 총무가 손으로 고친 매칭 — { 줄번호: memberId | null } */
  const [picked, setPicked] = useState({});
  const sheet = useOptionSheet();

  const paid = fee?.paid || {};
  const active = useMemo(
    () => members.filter((m) => !m.status || m.status === '활동'),
    [members],
  );

  const run = () => {
    if (!text.trim()) return flash('거래내역을 붙여넣어 주세요');
    const r = reconcile(text, active, { amount, paid, aliases });
    setResult(r);
    setPicked({});
    if (!r.rows.length) {
      return flash('입금 내역을 찾지 못했습니다. 형식을 확인해 주세요');
    }
    return flash(`${r.summary.total}건 중 ${r.summary.matched}건 자동 확인`);
  };

  /** 그 줄에 최종적으로 붙은 회원 id */
  const memberOf = (i, row) =>
    (i in picked ? picked[i] : (row.match.kind === MATCH.AUTO ? row.match.memberId : null));

  const choose = (i, row) => {
    const others = active.filter((m) => !row.match.candidates.some((c) => c.id === m.id));
    sheet.open({
      title: `"${row.name || '이름 없음'}" ${won(row.amount)}`,
      options: [
        ...row.match.candidates.map((c) => ({
          key: c.id, label: `${c.name} · 일치도 ${Math.round(c.score * 100)}%`,
        })),
        ...others.map((m) => ({ key: m.id, label: m.name })),
        { key: '__skip', label: '이 줄은 건너뛰기' },
      ],
      onSelect: (o) => setPicked((p) => ({ ...p, [i]: o.key === '__skip' ? null : o.key })),
    });
  };

  const applied = useMemo(() => {
    if (!result) return { ids: [], newAliases: {} };
    const ids = [];
    let newAliases = {};
    result.rows.forEach((row, i) => {
      const id = memberOf(i, row);
      if (!id) return;
      ids.push(id);
      /* 손으로 고른 것만 별칭으로 배운다. 자동으로 맞은 건 배울 게 없다 */
      if (i in picked && picked[i]) newAliases = learnAlias(newAliases, row.name, picked[i]);
    });
    return { ids: [...new Set(ids)], newAliases };
  }, [result, picked]);

  const apply = () => {
    if (!applied.ids.length) return flash('반영할 항목이 없습니다');
    const names = applied.ids
      .map((id) => active.find((m) => m.id === id)?.name)
      .filter(Boolean);
    return Alert.alert(
      '납부 처리',
      `${applied.ids.length}명을 ${periodKey} 납부 완료로 표시합니다.\n\n${names.join(', ')}`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '반영',
          onPress: async () => {
            const next = { ...paid };
            applied.ids.forEach((id) => { next[id] = true; });
            await setFeePaid(clubId, periodKey, next, amount, paid);
            if (Object.keys(applied.newAliases).length) {
              await saveFeeAliases(clubId, { ...aliases, ...applied.newAliases });
            }
            flash(`${applied.ids.length}명 납부 처리 완료`);
            setText(''); setResult(null); setPicked({});
            onDone?.();
          },
        },
      ],
    );
  };

  const unpaidCount = active.filter((m) => !paid[m.id]).length;

  return (
    <View>
      <Card>
        <Text style={F.bodyBold}>은행 거래내역 붙여넣기</Text>
        <Text style={{ fontSize: 11.5, color: C.sub, marginTop: 5, lineHeight: 17 }}>
          은행 앱에서 거래내역을 복사하거나, 인터넷뱅킹에서 받은 엑셀 내용을
          그대로 붙여넣으세요. 날짜·금액·입금자명을 알아서 읽습니다.
        </Text>
        <Text style={{ fontSize: 10.5, color: C.faint, marginTop: 6, lineHeight: 15 }}>
          은행마다 형식이 달라도 됩니다. 출금·카드결제 줄은 자동으로 걸러집니다.
        </Text>
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          placeholder={'2026-08-01  30,000  김철수\n2026-08-02  30,000  이영희'}
          placeholderTextColor={C.faint}
          style={{
            marginTop: 12, minHeight: 130, borderWidth: 1, borderColor: C.border,
            borderRadius: R.md, padding: 12, fontSize: 12.5, color: C.text,
            textAlignVertical: 'top', backgroundColor: C.surface,
          }}
        />
        <View style={{ flexDirection: 'row', gap: S.sm, marginTop: 12 }}>
          <View style={{ flex: 1 }}><Btn full onPress={run}>대사 실행</Btn></View>
          {!!text && (
            <Btn tone="ghost" onPress={() => { setText(''); setResult(null); setPicked({}); }}>
              지우기
            </Btn>
          )}
        </View>
        <Text style={{ fontSize: 10.5, color: C.faint, marginTop: 10, lineHeight: 15 }}>
          붙여넣은 내용은 이 화면에서만 쓰이고 저장되지 않습니다.
          납부 여부만 기록됩니다.
        </Text>
      </Card>

      {!result && (
        <Card style={{ marginTop: S.md }}>
          <Text style={[F.label, { marginBottom: 8 }]}>{periodKey} 현황</Text>
          <View style={{ flexDirection: 'row', gap: S.sm }}>
            <StatCard value={active.length - unpaidCount} label="납부" />
            <StatCard value={unpaidCount} label="미납" />
            <StatCard value={won(unpaidCount * amount).replace('원', '')} label="미수금" />
          </View>
        </Card>
      )}

      {!!result && (
        <>
          <SectionTitle hint={`합계 ${won(result.summary.amountSum)}`}>
            대사 결과 {result.summary.total}건
          </SectionTitle>
          <Card>
            <View style={{ flexDirection: 'row', gap: S.sm }}>
              <StatCard value={result.summary.matched} label="자동 확인" />
              <StatCard value={result.summary.needCheck} label="확인 필요" />
              <StatCard value={result.summary.unknown} label="미확인" />
            </View>
          </Card>

          {result.rows.map((row, i) => {
            const id = memberOf(i, row);
            const who = active.find((m) => m.id === id);
            const kind = id ? MATCH.AUTO : (row.match.kind === MATCH.NONE ? MATCH.NONE : MATCH.SUGGEST);
            const t = TONE[kind];
            return (
              <Card key={`${row.raw}-${i}`} style={{ marginTop: 8, paddingVertical: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={F.bodyBold}>{row.name || '(이름 없음)'}</Text>
                      <Text style={{ fontSize: 12, color: C.sub }}>{won(row.amount)}</Text>
                    </View>
                    <Text style={{ fontSize: 10.5, color: C.faint, marginTop: 3 }}>
                      {row.date}
                      {row.match.byAlias ? ' · 저장된 별칭으로 확인' : ''}
                      {row.match.duplicate ? ' · 같은 회원이 이미 매칭됨' : ''}
                    </Text>
                    {!!who && (
                      <Text style={{ fontSize: 12, color: C.green, fontWeight: '700', marginTop: 5 }}>
                        → {who.name}
                        {paid[who.id] ? ' (이미 납부 처리됨)' : ''}
                      </Text>
                    )}
                    {!who && kind === MATCH.NONE && (
                      <Text style={{ fontSize: 11.5, color: C.sub, marginTop: 5 }}>
                        일치하는 회원이 없습니다
                      </Text>
                    )}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <View style={{
                      backgroundColor: t.bg, paddingHorizontal: 9, paddingVertical: 4,
                      borderRadius: R.pill,
                    }}>
                      <Text style={{ fontSize: 10.5, fontWeight: '700', color: t.fg }}>{t.label}</Text>
                    </View>
                    <Pressable onPress={() => choose(i, row)}>
                      <Text style={{ fontSize: 11.5, color: C.green, fontWeight: '700' }}>
                        {who ? '바꾸기' : '고르기'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </Card>
            );
          })}

          <View style={{ marginTop: S.lg }}>
            <Btn full disabled={!applied.ids.length} onPress={apply}>
              {applied.ids.length ? `${applied.ids.length}명 납부 처리` : '반영할 항목 없음'}
            </Btn>
            {Object.keys(applied.newAliases).length > 0 && (
              <Text style={{ fontSize: 10.5, color: C.faint, marginTop: 8, textAlign: 'center' }}>
                직접 고른 {Object.keys(applied.newAliases).length}건은 별칭으로 저장되어
                다음 달부터 자동으로 연결됩니다.
              </Text>
            )}
          </View>
        </>
      )}

      {Object.keys(aliases).length > 0 && (
        <>
          <SectionTitle hint="입금자명이 회원 이름과 다를 때 쓰입니다">저장된 별칭</SectionTitle>
          <Card>
            {Object.entries(aliases).map(([raw, id], i) => {
              const m = active.find((x) => x.id === id);
              return (
                <View key={raw} style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: C.border,
                }}>
                  <Text style={{ fontSize: 12.5, color: C.text }}>
                    {raw} <Text style={{ color: C.faint }}>→</Text> {m?.name || '(탈퇴)'}
                  </Text>
                  <Pressable onPress={() => {
                    const next = { ...aliases };
                    delete next[raw];
                    saveFeeAliases(clubId, next);
                    flash('별칭 삭제됨');
                  }}>
                    <Text style={{ fontSize: 11, color: C.faint }}>삭제</Text>
                  </Pressable>
                </View>
              );
            })}
          </Card>
        </>
      )}
    </View>
  );
}
