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
} from '../lib/duespool';
import {
  addDuesPool, updateDuesPool, deleteDuesPool, setPoolPaid,
} from '../lib/firestore';
import { DateField, Label } from './pickers';
import { Segmented, Fab } from './native';
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

  const start = (pool = null) => {
    setDraft(pool ? { ...blankPool(), ...pool } : blankPool(today()));
    setEditingId(pool?.id || null);
    setOpen(true);
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
      closed: false,
    };
    if (editingId) {
      await updateDuesPool(clubId, editingId, body);
      flash('정산이 수정되었습니다');
    } else {
      await addDuesPool(clubId, { ...body, paid: {} });
      flash('정산이 개설되었습니다');
    }
    return close();
  };

  const toggleMember = (id) => setDraft((d) => ({
    ...d,
    participants: d.participants.includes(id)
      ? d.participants.filter((x) => x !== id)
      : [...d.participants, id],
  }));

  /** 미납자에게 개별 송금 요청 — 정기 회비 독촉과 같은 원칙(개별·클럽 이름) */
  const request = (pool) => {
    const s = poolSummary(pool, byId);
    if (!s.unpaid.length) return flash('미납자가 없습니다');
    const sample = requestMessage(pool, s.unpaid[0].amount, { clubName: club?.name, account });
    return Alert.alert(
      '송금 요청',
      `미납 ${s.unpaid.length}명에게 개별로 보냅니다.\n`
      + '(단체 공지가 아니라 각자에게만 갑니다)\n\n'
      + `예시 — ${s.unpaid[0].name}\n${sample.body}`,
      [
        { text: '취소', style: 'cancel' },
        { text: '보내기', onPress: () => flash(`${s.unpaid.length}명에게 요청을 보냈습니다`) },
      ],
    );
  };

  const shareAll = async (pool) => {
    try {
      await Share.share({ message: shareText(pool, byId, { clubName: club?.name, account }) });
    } catch (_) { /* 사용자가 취소 */ }
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
      {pools.length === 0 ? (
        <EmptyState
          title="일회성 정산이 없습니다"
          body={'대회 참가비 · 캠프 · 회식처럼 그때그때 걷는 돈을 여기서 관리합니다.\n참여자만 골라서 1/N 로 나누거나, 사람마다 다른 금액을 매길 수 있습니다.'}
          action={isAdmin ? <Btn onPress={() => start()}>새 정산 만들기</Btn> : null}
        />
      ) : pools.map((p) => {
        const s = poolSummary(p, byId);
        const isOpen = expanded === p.id;
        return (
          <Card key={p.id} style={{ marginBottom: 10 }}>
            <Pressable onPress={() => setExpanded(isOpen ? null : p.id)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={F.bodyBold} numberOfLines={1}>{p.title}</Text>
                    <Chip tone="outline">{p.category}</Chip>
                    {s.done && <Chip tone="green">완료</Chip>}
                  </View>
                  <Text style={[F.caption, { marginTop: 3 }]}>
                    {p.date} · {s.count}명 · 총 {won(s.total)}
                    {p.dueDate ? ` · 기한 ${p.dueDate}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{
                    fontSize: 13, fontWeight: '700',
                    color: s.done ? C.green : C.danger,
                  }}>
                    {s.paidCount}/{s.count}
                  </Text>
                  <Text style={{ fontSize: 10.5, color: C.faint, marginTop: 2 }}>
                    {s.done ? '전원 완료' : `${won(s.outstanding)} 남음`}
                  </Text>
                </View>
              </View>
            </Pressable>

            {isOpen && (
              <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12 }}>
                {!!p.memo && (
                  <Text style={{ fontSize: 12, color: C.sub, marginBottom: 10 }}>{p.memo}</Text>
                )}
                <View style={{ flexDirection: 'row', gap: S.sm, marginBottom: 12 }}>
                  <StatCard value={(s.collected / 10000).toFixed(0)} label="걷힘(만원)" />
                  <StatCard value={(s.outstanding / 10000).toFixed(0)} label="남음(만원)" />
                  <StatCard value={s.count} label="인원" />
                </View>

                <Label hint={isAdmin ? '이름을 누르면 납부 처리됩니다' : ''}>참여자</Label>
                {s.rows.map((r, i) => (
                  <Pressable
                    key={r.id}
                    disabled={!isAdmin}
                    onPress={() => setPoolPaid(clubId, p.id, r.id, !r.paid)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                      paddingVertical: 9, borderTopWidth: i ? 1 : 0, borderTopColor: C.border,
                    }}
                  >
                    <Text style={{ fontSize: 13, color: C.text }}>{r.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={{ fontSize: 12.5, color: C.sub }}>{won(r.amount)}</Text>
                      <View style={{
                        paddingHorizontal: 11, paddingVertical: 4, borderRadius: R.pill,
                        backgroundColor: r.paid ? C.green : '#fee2e2',
                      }}>
                        <Text style={{
                          fontSize: 11.5, fontWeight: '700',
                          color: r.paid ? '#fff' : '#b91c1c',
                        }}>
                          {r.paid ? '납부' : '미납'}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                ))}

                {isAdmin && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, marginTop: 14 }}>
                    <Btn small disabled={s.done} onPress={() => request(p)}>송금 요청</Btn>
                    <Btn small tone="ghost" onPress={() => shareAll(p)}>내역 공유</Btn>
                    <Btn small tone="ghost" onPress={() => start(p)}>수정</Btn>
                    <Pressable onPress={() => remove(p)} style={{ justifyContent: 'center', marginLeft: 'auto' }}>
                      <Text style={{ fontSize: 11.5, color: C.danger, fontWeight: '700' }}>삭제</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            )}
          </Card>
        );
      })}

      {isAdmin && pools.length > 0 && (
        <Fab icon="＋" label="새 정산" onPress={() => start()} />
      )}

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
                <Label>정산 이름</Label>
                <Field
                  placeholder="예: 9월 정기 회식 / 가을 대회 참가비"
                  value={draft.title}
                  onChangeText={(v) => setDraft({ ...draft, title: v })}
                />

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
