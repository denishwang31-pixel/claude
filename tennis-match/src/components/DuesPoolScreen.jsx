/* 일회성 정산 — 대회 참가비·캠프·회식처럼 그때그때 걷는 돈.

   정기 회비와 왜 나눴나
     정기 회비는 "전원이 같은 금액을 매달", 일회성은 "참여한 사람만,
     때로는 다른 금액을 한 번". 한 화면에 섞으면 둘 다 헷갈린다.

   흐름
     [＋ 새 정산] → 이름·총액·나누는 방식 → 참여자 체크 → 개설
       → 1인당 금액이 자동 계산된다
       → [송금 요청]으로 미납자에게 개별 발송
       → 입금되면 이름을 눌러 납부 체크 */
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, Alert, Modal, Share, ScrollView } from 'react-native';
import {
  SPLIT, SPLIT_MODES, POOL_CATEGORIES, computeShares, poolSummary,
  requestMessage, shareText, blankPool, validatePool, won,
  groupPools, memberBreakdown,
} from '../lib/duespool';
import {
  addDuesPool, updateDuesPool, deleteDuesPool, setPoolPaid,
} from '../lib/firestore';
import { DateField, Label } from './pickers';
import { Segmented } from './native';
import { Card, SectionTitle, Chip, Btn, Field, StatCard, EmptyState } from './ui';
import { C, S, R, F } from '../lib/theme';

const today = () => new Date().toISOString().slice(0, 10);

export function DuesPools({ clubId, club, members, pools = [], isAdmin, flash }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const active = useMemo(
    () => members.filter((m) => !m.status || m.status === '활동'), [members],
  );
  const byId = useMemo(
    () => Object.fromEntries(members.map((m) => [m.id, m])), [members],
  );
  const account = club?.settings?.feeAccount || '';

  /* 정산들을 이벤트 단위로 묶는다. 캠프처럼 한 행사에 숙박비·회식비·렌트카가
     따로 나오는 경우, 회원은 "이 행사로 내가 총 얼마"를 보고 싶어 한다. */
  const groups = useMemo(() => groupPools(pools, byId), [pools, byId]);

  const start = (pool = null, group = null) => {
    setDraft(pool
      ? { ...blankPool(), ...pool }
      : { ...blankPool(today()), groupId: group?.groupId || '', groupTitle: group?.title || '' });
    setEditingId(pool?.id || null);
    setOpen(true);
  };

  /* 기존 행사에 정산을 하나 더 붙인다 — 참여자는 그 행사 참여자로 미리 채운다 */
  const addToGroup = (g) => {
    setDraft({
      ...blankPool(g.date || today()),
      groupId: g.groupId,
      groupTitle: g.title,
      category: g.category || POOL_CATEGORIES[0],
      participants: g.rows.map((r) => r.id),
    });
    setEditingId(null);
    setOpen(true);
  };

  /* 회원 한 명의 이 행사 전체 항목을 한 번에 납부 처리 */
  const payAll = (g, row) => {
    const br = memberBreakdown(g, row.id);
    const targets = br.items.filter((x) => (row.done ? x.paid : !x.paid));
    if (!targets.length) return undefined;
    return Alert.alert(
      row.done ? '납부 취소' : '납부 처리',
      `${row.name}님의 "${g.title}" ${targets.length}건`
      + `(${won(row.done ? row.paid : row.outstanding)})을 `
      + `${row.done ? '미납으로 되돌릴까요?' : '납부 완료로 표시할까요?'}`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: row.done ? '되돌리기' : '납부 처리',
          onPress: () => {
            targets.forEach((x) => setPoolPaid(clubId, x.id, row.id, !row.done));
            flash(row.done ? '미납으로 되돌렸습니다' : '납부 처리했습니다');
          },
        },
      ],
    );
  };
  const close = () => { setOpen(false); setDraft(null); setEditingId(null); };

  const save = async () => {
    const err = validatePool(draft);
    if (err) return flash(err);
    const { total } = computeShares(draft);
    const body = {
      title: draft.title.trim(),
      category: draft.category,
      date: draft.date,
      dueDate: draft.dueDate || '',
      splitMode: draft.splitMode,
      total,
      perPerson: Number(draft.perPerson) || 0,
      participants: draft.participants,
      custom: draft.custom || {},
      memo: draft.memo || '',
      groupId: draft.groupId || '',
      groupTitle: draft.groupTitle || '',
      closed: false,
    };
    if (editingId) {
      await updateDuesPool(clubId, editingId, body);
      flash('정산이 수정되었습니다');
    } else {
      /* 행사 이름을 적었는데 아직 묶음 키가 없으면 여기서 만든다.
         이 키로 나중에 같은 행사에 정산을 더 붙인다. */
      if (!body.groupId && body.groupTitle) {
        body.groupId = `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      }
      await addDuesPool(clubId, { ...body, paid: {} });
      flash(body.groupTitle ? '행사와 첫 정산이 만들어졌습니다' : '정산이 개설되었습니다');
    }
    return close();
  };

  const toggleMember = (id) => setDraft((d) => ({
    ...d,
    participants: d.participants.includes(id)
      ? d.participants.filter((x) => x !== id)
      : [...d.participants, id],
  }));

  /** 미납자에게 개별 송금 요청 — 정기 회비 독촉과 같은 원칙(개별·클럽 이름).
      항목이 여럿이면 그 사람의 합계로 보낸다. */
  const request = (g) => {
    const unpaid = g.rows.filter((r) => !r.done);
    if (!unpaid.length) return flash('미납자가 없습니다');
    const sample = requestMessage(
      { title: g.title, dueDate: g.items[0]?.dueDate || '' },
      unpaid[0].outstanding,
      { clubName: club?.name, account },
    );
    return Alert.alert(
      '송금 요청',
      `미납 ${unpaid.length}명에게 개별로 보냅니다.\n`
      + '(단체 공지가 아니라 각자에게만 갑니다)\n\n'
      + `예시 — ${unpaid[0].name}\n${sample.body}`,
      [
        { text: '취소', style: 'cancel' },
        { text: '보내기', onPress: () => flash(`${unpaid.length}명에게 요청을 보냈습니다`) },
      ],
    );
  };

  /** 단체방용 — 행사 전체 내역을 항목별로 정리해서 내보낸다 */
  const shareAll = async (g) => {
    const L = [`[${club?.name || '클럽'}] ${g.title}`, `총액 ${won(g.total)} · ${g.memberCount}명`, ''];
    g.items.forEach((p) => {
      L.push(`— ${p.title} (${won(computeShares(p).total)})`);
    });
    L.push('');
    g.rows.forEach((r) => L.push(`${r.done ? '✓' : '·'} ${r.name}  ${won(r.due)}`));
    if (account) { L.push(''); L.push(`입금: ${account}`); }
    try { await Share.share({ message: L.join('\n') }); } catch (_) { /* 취소 */ }
  };

  const remove = (pool) => Alert.alert('정산 삭제', `"${pool.title}"을 삭제할까요?`, [
    { text: '취소', style: 'cancel' },
    {
      text: '삭제',
      style: 'destructive',
      onPress: () => { deleteDuesPool(clubId, pool.id); flash('삭제되었습니다'); },
    },
  ]);

  const preview = draft ? computeShares(draft) : null;

  return (
    <View style={{ flex: 1 }}>
      {/* 새 정산 버튼.

         예전에는 화면 위에 떠 있는 동그란 버튼(FAB)이었는데, 이 화면이
         [회비·지출] 안에 끼워지면서 스크롤 중간에 붙박여 목록을 가렸다.
         떠 있지 않고 목록 맨 위에 놓는다. */}
      {isAdmin && groups.length > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Text style={[F.label, { flex: 1 }]}>행사 {groups.length}건</Text>
          <Btn small onPress={() => start()}>＋ 새 정산</Btn>
        </View>
      )}

      {groups.length === 0 ? (
        <EmptyState
          title="일회성 정산이 없습니다"
          body={'대회 참가비 · 캠프 · 회식처럼 그때그때 걷는 돈을 여기서 관리합니다.\n한 행사 안에 숙박비 · 회식비처럼 정산을 여러 건 넣을 수도 있습니다.'}
          action={isAdmin ? <Btn onPress={() => start()}>새 정산 만들기</Btn> : null}
        />
      ) : groups.map((g) => {
        const isOpen = expanded === g.groupId;
        return (
          <Card key={g.groupId} style={{ marginBottom: 10 }}>
            <Pressable onPress={() => setExpanded(isOpen ? null : g.groupId)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={F.bodyBold} numberOfLines={1}>{g.title}</Text>
                    {!!g.category && <Chip tone="outline">{g.category}</Chip>}
                    {g.itemCount > 1 && <Chip tone="soft">정산 {g.itemCount}건</Chip>}
                    {g.done && <Chip tone="green">완료</Chip>}
                  </View>
                  <Text style={[F.caption, { marginTop: 3 }]}>
                    {g.date} · {g.memberCount}명 · 총 {won(g.total)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{
                    fontSize: 13, fontWeight: '700',
                    color: g.done ? C.green : C.danger,
                  }}>
                    {g.rows.filter((r) => r.done).length}/{g.memberCount}
                  </Text>
                  <Text style={{ fontSize: 10.5, color: C.faint, marginTop: 2 }}>
                    {g.done ? '전원 완료' : `${won(g.outstanding)} 남음`}
                  </Text>
                </View>
              </View>
            </Pressable>

            {isOpen && (
              <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12 }}>
                {/* 이 이벤트에 속한 정산 항목들 */}
                <Label hint={isAdmin ? '항목을 눌러 수정합니다' : ''}>정산 항목</Label>
                {g.items.map((p) => {
                  const ps = poolSummary(p, byId);
                  return (
                    <Pressable key={p.id} disabled={!isAdmin} onPress={() => start(p, g)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 8,
                        paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.border,
                      }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: C.text }}>{p.title}</Text>
                        <Text style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>
                          {ps.count}명 · {won(ps.total)}
                          {p.memo ? ` · ${p.memo}` : ''}
                        </Text>
                      </View>
                      <Text style={{
                        fontSize: 11.5, fontWeight: '700',
                        color: ps.done ? C.green : C.danger,
                      }}>
                        {ps.paidCount}/{ps.count}
                      </Text>
                      {isAdmin && (
                        <Pressable onPress={() => remove(p)} hitSlop={8}>
                          <Text style={{ fontSize: 11, color: C.faint }}>삭제</Text>
                        </Pressable>
                      )}
                    </Pressable>
                  );
                })}

                {isAdmin && (
                  <View style={{ marginTop: 10 }}>
                    <Btn small tone="ghost" onPress={() => addToGroup(g)}>
                      ＋ 이 행사에 정산 추가
                    </Btn>
                  </View>
                )}

                {/* 회원별 합계 — 여러 항목을 합쳐서 "이 사람이 총 얼마" */}
                <View style={{ marginTop: 16 }}>
                  <Label hint={isAdmin ? '이름을 누르면 전체 항목이 납부 처리됩니다' : ''}>
                    회원별 합계
                  </Label>
                  {g.rows.map((r, i) => (
                    <Pressable
                      key={r.id}
                      disabled={!isAdmin}
                      onPress={() => payAll(g, r)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                        paddingVertical: 9, borderTopWidth: i ? 1 : 0, borderTopColor: C.border,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, color: C.text }}>{r.name}</Text>
                        {g.itemCount > 1 && (
                          <Text style={{ fontSize: 10.5, color: C.faint, marginTop: 2 }}>
                            {memberBreakdown(g, r.id).items
                              .map((x) => `${x.title} ${won(x.amount)}${x.paid ? '✓' : ''}`)
                              .join(' · ')}
                          </Text>
                        )}
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Text style={{ fontSize: 12.5, color: C.sub }}>{won(r.due)}</Text>
                        <View style={{
                          paddingHorizontal: 11, paddingVertical: 4, borderRadius: R.pill,
                          backgroundColor: r.done ? C.green : '#fee2e2',
                        }}>
                          <Text style={{
                            fontSize: 11.5, fontWeight: '700',
                            color: r.done ? '#fff' : '#b91c1c',
                          }}>
                            {r.done ? '납부' : won(r.outstanding)}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  ))}
                </View>

                {isAdmin && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, marginTop: 14 }}>
                    <Btn small disabled={g.done} onPress={() => request(g)}>송금 요청</Btn>
                    <Btn small tone="ghost" onPress={() => shareAll(g)}>내역 공유</Btn>
                  </View>
                )}
              </View>
            )}
          </Card>
        );
      })}


      {/* 새 정산 / 수정 — 팝업 */}
      <Modal visible={open && !!draft} animationType="slide" transparent onRequestClose={close}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View style={{
            backgroundColor: C.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
            maxHeight: '92%', paddingTop: 6,
          }}>
            <View style={{
              width: 38, height: 4, borderRadius: 2, backgroundColor: C.border,
              alignSelf: 'center', marginBottom: 8,
            }} />
            <View style={{
              flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg,
              paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.border,
            }}>
              <Text style={[F.h3, { flex: 1 }]}>{editingId ? '정산 수정' : '새 정산'}</Text>
              <Pressable onPress={close} hitSlop={10}>
                <Text style={{ fontSize: 13, color: C.sub, fontWeight: '700' }}>닫기</Text>
              </Pressable>
            </View>

            {!!draft && (
              <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: 40 }}
                keyboardShouldPersistTaps="handled">
                {!!draft.groupId && (
                  <Card style={{ marginBottom: 12, backgroundColor: C.greenSoft }}>
                    <Text style={{ fontSize: 12, color: C.green, fontWeight: '700' }}>
                      "{draft.groupTitle}" 행사에 추가합니다
                    </Text>
                    <Text style={{ fontSize: 11, color: C.green, marginTop: 3, lineHeight: 16 }}>
                      같은 행사의 다른 정산과 합산되어 회원별 총액이 계산됩니다.
                    </Text>
                  </Card>
                )}

                <Label hint={draft.groupId ? '이 행사 안에서의 항목 이름' : ''}>정산 이름</Label>
                <Field
                  placeholder={draft.groupId ? '예: 숙박비 / 저녁 회식 / 렌트카' : '예: 9월 정기 회식 / 가을 대회 참가비'}
                  value={draft.title}
                  onChangeText={(v) => setDraft({ ...draft, title: v })}
                />

                {!draft.groupId && !editingId && (
                  <View style={{ marginTop: 12 }}>
                    <Label hint="비워두면 정산 하나짜리 행사가 됩니다">
                      행사 이름 (정산을 여러 건 넣을 경우)
                    </Label>
                    <Field
                      placeholder="예: 가을 캠프 — 숙박비·회식비를 따로 정산할 때"
                      value={draft.groupTitle}
                      onChangeText={(v) => setDraft({ ...draft, groupTitle: v })}
                    />
                  </View>
                )}

                <View style={{ marginTop: 12 }}>
                  <Label>분류</Label>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {POOL_CATEGORIES.map((c) => (
                      <Chip key={c} tone={draft.category === c ? 'green' : 'outline'}
                        onPress={() => setDraft({ ...draft, category: c })}>{c}</Chip>
                    ))}
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: S.sm, marginTop: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Label>일자</Label>
                    <DateField value={draft.date} onChange={(v) => setDraft({ ...draft, date: v })} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Label hint="선택">납부 기한</Label>
                    <DateField value={draft.dueDate} onChange={(v) => setDraft({ ...draft, dueDate: v })} />
                  </View>
                </View>

                <View style={{ marginTop: 14 }}>
                  <Label>나누는 방식</Label>
                  <Segmented
                    options={SPLIT_MODES.map((m) => ({ key: m.key, label: m.label }))}
                    value={draft.splitMode}
                    onChange={(k) => setDraft({ ...draft, splitMode: k })}
                  />
                  <Text style={{ fontSize: 11, color: C.faint, marginTop: 6, lineHeight: 16 }}>
                    {SPLIT_MODES.find((m) => m.key === draft.splitMode)?.hint}
                  </Text>
                </View>

                {draft.splitMode === SPLIT.EQUAL && (
                  <View style={{ marginTop: 12 }}>
                    <Label hint="참여 인원으로 나눕니다">총액</Label>
                    <Field keyboardType="number-pad" placeholder="120000"
                      value={String(draft.total || '')}
                      onChangeText={(v) => setDraft({ ...draft, total: v })} />
                  </View>
                )}
                {draft.splitMode === SPLIT.FIXED && (
                  <View style={{ marginTop: 12 }}>
                    <Label>1인당 금액</Label>
                    <Field keyboardType="number-pad" placeholder="20000"
                      value={String(draft.perPerson || '')}
                      onChangeText={(v) => setDraft({ ...draft, perPerson: v })} />
                  </View>
                )}

                <View style={{ marginTop: 14 }}>
                  <Label hint={`${draft.participants.length}명 선택됨`}>참여자</Label>
                  <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                    <Btn small tone="ghost"
                      onPress={() => setDraft({ ...draft, participants: active.map((m) => m.id) })}>
                      전체 선택
                    </Btn>
                    <Btn small tone="ghost" onPress={() => setDraft({ ...draft, participants: [] })}>
                      전체 해제
                    </Btn>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {active.map((m) => (
                      <Chip key={m.id}
                        tone={draft.participants.includes(m.id) ? 'green' : 'outline'}
                        onPress={() => toggleMember(m.id)}>
                        {m.name}
                      </Chip>
                    ))}
                  </View>
                </View>

                {/* 개인별 지정 — 고른 사람만 금액 입력칸이 뜬다 */}
                {draft.splitMode === SPLIT.CUSTOM && draft.participants.length > 0 && (
                  <View style={{ marginTop: 14 }}>
                    <Label>개인별 금액</Label>
                    {draft.participants.map((id) => (
                      <View key={id} style={{
                        flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8,
                      }}>
                        <Text style={{ width: 76, fontSize: 13 }}>{byId[id]?.name || id}</Text>
                        <View style={{ flex: 1 }}>
                          <Field keyboardType="number-pad" placeholder="0"
                            value={String((draft.custom || {})[id] || '')}
                            onChangeText={(v) => setDraft({
                              ...draft, custom: { ...(draft.custom || {}), [id]: v },
                            })} />
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                <View style={{ marginTop: 12 }}>
                  <Label hint="선택">메모</Label>
                  <Field placeholder="예: 삼겹살집, 2차 제외"
                    value={draft.memo}
                    onChangeText={(v) => setDraft({ ...draft, memo: v })} />
                </View>

                {/* 계산 미리보기 — 저장 전에 1인당 얼마인지 확인 */}
                {!!preview && draft.participants.length > 0 && (
                  <Card style={{ marginTop: 16, backgroundColor: C.fill }}>
                    <Text style={[F.label, { marginBottom: 6 }]}>계산 결과</Text>
                    <Text style={{ fontSize: 13, color: C.text, fontWeight: '700' }}>
                      총 {won(preview.total)} · {draft.participants.length}명
                    </Text>
                    <Text style={{ fontSize: 12, color: C.sub, marginTop: 4, lineHeight: 17 }}>
                      {draft.splitMode === SPLIT.CUSTOM
                        ? '사람마다 지정한 금액대로 청구됩니다.'
                        : `1인당 ${won(preview.perPerson)}`}
                      {preview.remainder > 0
                        ? ` (나머지 ${preview.remainder}원은 앞 ${preview.remainder}명이 1원씩 더 냅니다)`
                        : ''}
                    </Text>
                  </Card>
                )}

                <View style={{ marginTop: 18 }}>
                  <Btn full onPress={save}>{editingId ? '수정 저장' : '정산 개설'}</Btn>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
