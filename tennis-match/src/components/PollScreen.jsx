/* ============================================================
   참가투표 — 일정 참석 체크와는 별개의 "물어보고 집계하기"

   왜 따로 두나
     일정 RSVP 는 "이 날 코트에 나오냐"만 물을 수 있다. 실제 운영에서는
     회식 날짜, 대회 참가 의사, 유니폼 색처럼 일정과 무관한 걸 물어야 할 때가
     훨씬 많고, 지금까지는 그걸 단톡방에서 손으로 세고 있었다.

   두 가지 형태
     참가 여부 : 참가 / 미정 / 불참
     선택지    : 운영진이 항목을 직접 적는다 (최대 6개)
   ============================================================ */
import React, { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import {
  addPoll, votePoll, unvotePoll, closePoll, deletePoll,
} from '../lib/firestore';
import { POLL_TYPE, POLL_ATTEND_OPTIONS } from '../lib/constants';
import { DateField, Label } from './pickers';
import { AppButton, Segmented, Touchable, ListSection, ListItem, useOptionSheet } from './native';
import { Card, SectionTitle, Chip, Field, EmptyState, Divider } from './ui';
import { C, S, R, F } from '../lib/theme';

const today = () => new Date().toISOString().slice(0, 10);

function PollCard({ poll, clubId, me, members, isAdmin, flash }) {
  const sheet = useOptionSheet();
  const options = poll.type === POLL_TYPE.ATTEND
    ? POLL_ATTEND_OPTIONS
    : (poll.options || []).map((o, i) => ({ key: String(i), label: o }));

  const votes = poll.votes || {};
  const myVote = votes[me];
  const total = Object.keys(votes).length;
  const expired = poll.deadline && poll.deadline < today();
  const locked = poll.closed || expired;

  const countOf = (key) => Object.values(votes).filter((v) => v === key).length;
  const votersOf = (key) => Object.entries(votes)
    .filter(([, v]) => v === key)
    .map(([uid]) => members.find((m) => m.id === uid)?.name || '?');

  const pick = (key) => {
    if (locked) return flash('마감된 투표입니다');
    if (myVote === key) { unvotePoll(clubId, poll.id, me); return flash('투표를 취소했습니다'); }
    votePoll(clubId, poll.id, me, key);
    return flash('투표했습니다');
  };

  const manage = () => sheet.open({
    title: poll.title,
    options: [
      { key: 'close', label: poll.closed ? '투표 다시 열기' : '투표 마감하기', icon: poll.closed ? '🔓' : '🔒' },
      { key: 'delete', label: '투표 삭제', icon: '🗑', destructive: true },
    ],
    destructiveIndex: 1,
    onSelect: (o) => {
      if (o.key === 'close') { closePoll(clubId, poll.id, !poll.closed); flash(poll.closed ? '다시 열었습니다' : '마감했습니다'); }
      if (o.key === 'delete') { deletePoll(clubId, poll.id); flash('삭제했습니다'); }
    },
  });

  return (
    <Card style={{ marginBottom: S.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={F.h3}>{poll.title}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
            <Chip tone={locked ? 'default' : 'soft'}>{locked ? '마감' : '투표중'}</Chip>
            <Chip tone="outline">{total}명 참여</Chip>
            {!!poll.deadline && <Chip tone={expired ? 'red' : 'outline'}>~{poll.deadline.slice(5)}</Chip>}
          </View>
        </View>
        {isAdmin && (
          <Touchable onPress={manage} hitSlop={10} borderless
            style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 18, color: C.faint }}>⋯</Text>
          </Touchable>
        )}
      </View>

      {!!poll.body && (
        <Text style={{ fontSize: 13, color: C.sub, marginTop: 8, lineHeight: 19 }}>{poll.body}</Text>
      )}

      <View style={{ marginTop: S.md, gap: 8 }}>
        {options.map((o) => {
          const n = countOf(o.key);
          const pct = total ? Math.round((n / total) * 100) : 0;
          const mine = myVote === o.key;
          return (
            <Touchable key={o.key} onPress={() => pick(o.key)} disabled={locked}
              style={{
                borderRadius: R.md, overflow: 'hidden',
                borderWidth: 1.5, borderColor: mine ? C.green : C.border,
                backgroundColor: C.surface,
              }}>
              {/* 득표율 막대를 배경으로 깐다 */}
              <View style={{
                position: 'absolute', left: 0, top: 0, bottom: 0,
                width: `${pct}%`, backgroundColor: mine ? C.greenSoft : C.fill,
              }} />
              <View style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                paddingHorizontal: 14, paddingVertical: 12,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <Text style={{ fontSize: 14, color: mine ? C.green : C.faint }}>{mine ? '●' : '○'}</Text>
                  <Text numberOfLines={1} style={{
                    fontSize: 14.5, fontWeight: mine ? '800' : '600', color: C.text, flex: 1,
                  }}>
                    {o.label}
                  </Text>
                </View>
                <Text style={{ fontSize: 13, fontWeight: '800', color: mine ? C.green : C.sub }}>
                  {n}명 · {pct}%
                </Text>
              </View>
            </Touchable>
          );
        })}
      </View>

      {/* 누가 뭘 골랐는지 — 운영진 확인용 */}
      {isAdmin && total > 0 && (
        <>
          <Divider style={{ marginVertical: S.md }} />
          {options.filter((o) => countOf(o.key) > 0).map((o) => (
            <Text key={o.key} style={{ fontSize: 11.5, color: C.sub, marginBottom: 3, lineHeight: 17 }}>
              <Text style={{ fontWeight: '800', color: C.text }}>{o.label}</Text>{' '}
              {votersOf(o.key).join(', ')}
            </Text>
          ))}
          {members.length > total && (
            <Text style={{ fontSize: 11.5, color: C.faint, marginTop: 4 }}>
              미투표 {members.length - total}명:{' '}
              {members.filter((m) => votes[m.id] === undefined).map((m) => m.name).join(', ')}
            </Text>
          )}
        </>
      )}
      {sheet.node}
    </Card>
  );
}

const BLANK = { type: POLL_TYPE.ATTEND, title: '', body: '', deadline: '', options: ['', ''] };

export function Polls({ clubId, polls, members, me, isAdmin, flash }) {
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState(BLANK);
  const [tab, setTab] = useState('open');

  const list = useMemo(() => {
    const open = (p) => !p.closed && (!p.deadline || p.deadline >= today());
    return (polls || []).filter((p) => (tab === 'open' ? open(p) : !open(p)));
  }, [polls, tab]);

  const submit = () => {
    const opts = f.options.map((o) => o.trim()).filter(Boolean);
    if (f.type === POLL_TYPE.CHOICE && opts.length < 2) return flash('선택지를 2개 이상 적어주세요');
    addPoll(clubId, {
      type: f.type,
      title: f.title.trim(),
      body: f.body.trim(),
      deadline: f.deadline || '',
      options: f.type === POLL_TYPE.CHOICE ? opts : [],
      authorId: me,
    });
    setF(BLANK);
    setAdding(false);
    return flash('투표를 만들었습니다');
  };

  const setOpt = (i, v) => {
    const next = [...f.options];
    next[i] = v;
    setF({ ...f, options: next });
  };

  return (
    <View>
      <Segmented
        options={[{ key: 'open', label: '진행중' }, { key: 'done', label: '마감' }]}
        value={tab}
        onChange={setTab}
      />

      {isAdmin && (
        <View style={{ marginTop: S.md }}>
          <AppButton full variant={adding ? 'outlined' : 'tonal'} icon={adding ? '' : '＋'}
            onPress={() => setAdding(!adding)}>
            {adding ? '닫기' : '새 투표 만들기'}
          </AppButton>
        </View>
      )}

      {adding && (
        <Card style={{ marginTop: S.md }}>
          <Label>투표 종류</Label>
          <Segmented
            options={[
              { key: POLL_TYPE.ATTEND, label: '참가 여부' },
              { key: POLL_TYPE.CHOICE, label: '선택지' },
            ]}
            value={f.type}
            onChange={(v) => setF({ ...f, type: v })}
          />

          <View style={{ marginTop: S.md }}>
            <Label>질문</Label>
            <Field placeholder={f.type === POLL_TYPE.ATTEND ? '예: 3월 정기 대회 참가하시나요?' : '예: 단체 유니폼 색상'}
              value={f.title} onChangeText={(v) => setF({ ...f, title: v })} />
          </View>

          <View style={{ marginTop: S.md }}>
            <Label hint="선택">설명</Label>
            <Field placeholder="참가비·장소 등 추가 안내" value={f.body} onChangeText={(v) => setF({ ...f, body: v })} />
          </View>

          {f.type === POLL_TYPE.CHOICE && (
            <View style={{ marginTop: S.md }}>
              <Label hint="2~6개">선택지</Label>
              {f.options.map((o, i) => (
                <View key={i} style={{ marginBottom: 8 }}>
                  <Field placeholder={`선택지 ${i + 1}`} value={o} onChangeText={(v) => setOpt(i, v)} />
                </View>
              ))}
              {f.options.length < 6 && (
                <AppButton small variant="text" onPress={() => setF({ ...f, options: [...f.options, ''] })}>
                  ＋ 선택지 추가
                </AppButton>
              )}
            </View>
          )}

          <View style={{ marginTop: S.md }}>
            <Label hint="선택 · 이 날짜가 지나면 자동 마감">마감일</Label>
            <DateField value={f.deadline} onChange={(v) => setF({ ...f, deadline: v })} minDate={today()} />
          </View>

          <View style={{ marginTop: S.lg }}>
            <AppButton full disabled={!f.title.trim()} onPress={submit}>투표 만들기</AppButton>
          </View>
        </Card>
      )}

      <View style={{ marginTop: S.lg }}>
        {list.map((p) => (
          <PollCard key={p.id} {...{ poll: p, clubId, me, members, isAdmin, flash }} />
        ))}
        {list.length === 0 && (
          <EmptyState
            icon="🗳"
            title={tab === 'open' ? '진행 중인 투표가 없습니다' : '마감된 투표가 없습니다'}
            body={isAdmin
              ? '회식 날짜, 대회 참가 의사처럼 물어볼 게 있으면 여기서 투표를 만드세요. 누가 뭘 골랐는지 운영진에게만 보입니다.'
              : '운영진이 투표를 올리면 여기에 표시됩니다.'}
          />
        )}
      </View>
    </View>
  );
}

export default Polls;
