/* ============================================================
   일정 — 달력 보기와 대회·게스트 카드

   왜 여기 따로 두나
     일정 화면은 이미 길다. 모임 카드 하나에 참석 투표·날씨·대진·수정
     메뉴가 다 붙어 있어서, 달력까지 같은 파일에 넣으면 어디를 고치는지
     알 수 없게 된다. 모임 카드는 그 화면에 두고, 새로 생긴 것만 여기로.

   달력이 지켜야 하는 것
     · 한 칸은 하루다. 빈칸도 칸이다 — null 로 두면 요일이 밀린다.
     · 점은 종류당 하나. 모임 5건이면 점 다섯 개가 아니라 초록 점 하나.
     · 날짜를 누르면 그날 목록이 아래에 뜬다. 화면을 옮기지 않는다 —
       달력을 보는 이유가 "여기저기 안 옮겨 다니려고"이기 때문이다.
   ============================================================ */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import {
  KIND, KINDS, T_STATE, calendarGrid, monthLabel, dateHead, ddayOf,
} from '../lib/agenda';
import { Card, Chip, Btn, EmptyState } from './ui';
import { Icon } from './Icon';
import { C, S, R, F } from '../lib/theme';

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const won = (n) => `${Number(n || 0).toLocaleString()}원`;

const dotColor = (kind) => KINDS.find((k) => k.key === kind)?.dot || C.faint;

/* ---------------- 보기 전환 · 종류 거르기 ---------------- */

export function AgendaControls({
  view, setView, kinds, setKinds, counts, monthKey, onShiftMonth,
}) {
  const toggle = (k) => {
    const on = kinds.includes(k);
    /* 마지막 하나를 끄면 빈 화면이 된다. 그때는 "전부 보기"로 되돌린다 —
       사용자가 원한 것은 "아무것도 안 보기"가 아니다. */
    const next = on ? kinds.filter((x) => x !== k) : [...kinds, k];
    setKinds(next.length ? next : KINDS.map((x) => x.key));
  };

  return (
    <View style={{ marginBottom: S.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {view === 'calendar' ? (
          <View style={{
            flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4,
          }}>
            <Pressable onPress={() => onShiftMonth(-1)} hitSlop={10}
              style={{ paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ fontSize: 18, color: C.sub }}>‹</Text>
            </Pressable>
            <Text style={[F.h3, { minWidth: 100, textAlign: 'center' }]}>
              {monthLabel(monthKey)}
            </Text>
            <Pressable onPress={() => onShiftMonth(1)} hitSlop={10}
              style={{ paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ fontSize: 18, color: C.sub }}>›</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <Pressable onPress={() => setView(view === 'list' ? 'calendar' : 'list')}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 5,
            paddingHorizontal: 11, paddingVertical: 7,
            borderRadius: R.md, backgroundColor: C.fill,
          }}>
          <Icon name={view === 'list' ? 'calendar' : 'list'} size={14} color={C.sub} />
          <Text style={{ fontSize: 12, fontWeight: '700', color: C.sub }}>
            {view === 'list' ? '달력' : '목록'}
          </Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
        {KINDS.map((k) => (
          <Chip key={k.key} tone={kinds.includes(k.key) ? 'green' : 'outline'}
            onPress={() => toggle(k.key)}>
            {k.label} {counts[k.key] || 0}
          </Chip>
        ))}
      </View>
    </View>
  );
}

/* ---------------- 달력 격자 ---------------- */

export function CalendarView({ monthKey, items, today, selected, onSelect }) {
  const weeks = calendarGrid(monthKey, items, today);

  return (
    <Card style={{ paddingHorizontal: 6, paddingVertical: 10 }}>
      <View style={{ flexDirection: 'row' }}>
        {WEEK.map((w, i) => (
          <Text key={w} style={{
            flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700',
            color: i === 0 ? C.danger : i === 6 ? C.info : C.faint,
            marginBottom: 6,
          }}>{w}</Text>
        ))}
      </View>

      {weeks.map((week, wi) => (
        <View key={wi} style={{ flexDirection: 'row' }}>
          {week.map((cell, ci) => {
            if (cell.blank) {
              /* 빈칸도 자리를 차지해야 요일이 안 밀린다 */
              return <View key={`b${ci}`} style={{ flex: 1, height: 46 }} />;
            }
            const on = selected === cell.date;
            return (
              <Pressable key={cell.date} onPress={() => onSelect(on ? null : cell.date)}
                style={{
                  flex: 1, height: 46, alignItems: 'center', justifyContent: 'center',
                  borderRadius: R.sm,
                  backgroundColor: on ? C.greenSoft : 'transparent',
                }}>
                <View style={{
                  width: 24, height: 24, borderRadius: 12,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: cell.today ? C.green : 'transparent',
                }}>
                  <Text style={{
                    fontSize: 12.5,
                    fontWeight: cell.today || on ? '800' : '500',
                    color: cell.today ? '#fff'
                      : cell.past ? C.faint
                        : ci === 0 ? C.danger : ci === 6 ? C.info : C.text,
                  }}>{cell.day}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 2, height: 6, marginTop: 2 }}>
                  {cell.kinds.map((k) => (
                    <View key={k} style={{
                      width: 5, height: 5, borderRadius: 2.5, backgroundColor: dotColor(k),
                    }} />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}

      <View style={{
        flexDirection: 'row', gap: 12, marginTop: 10, paddingTop: 9,
        borderTopWidth: 1, borderTopColor: C.border, justifyContent: 'center',
      }}>
        {KINDS.map((k) => (
          <View key={k.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: k.dot }} />
            <Text style={{ fontSize: 10.5, color: C.faint }}>{k.label}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

/* ---------------- 대회 카드 ----------------
   다른 카드와 달리 현황을 항상 달고 다닌다. 몇 자리 남았는지 모르면
   신청할지 말지 판단할 수 없다. */

export function TournamentCard({ item, apply, cancel, onOpen, today }) {
  const t = item.raw;
  const live = item.state === T_STATE.LIVE;
  const fee = Number(t?.signup?.fee) || 0;
  const dday = ddayOf(item.date, today);

  return (
    <Card style={{
      marginBottom: 10,
      borderColor: live ? C.danger : C.green,
      borderWidth: 1,
    }}>
      <Pressable onPress={onOpen}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <Icon name="tournament" size={19} color={live ? C.danger : C.green} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={{ fontWeight: '700', fontSize: 14.5 }}>{item.title}</Text>
              <Chip tone={item.tone}>{item.status}</Chip>
              {item.mine && <Chip tone="soft">신청함</Chip>}
            </View>
            <Text style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>
              {item.date ? dateHead(item.date) : '날짜 미정'}
              {item.time ? ` ${item.time}` : ''}
              {dday ? ` · ${dday}` : ''}
              {fee ? ` · 참가비 ${won(fee)}` : ''}
            </Text>
            <Text style={{ fontSize: 12, color: live ? C.danger : C.green2, marginTop: 4, fontWeight: '600' }}>
              {item.sub}
            </Text>
            {!!t?.signup?.deadline && item.state === T_STATE.OPEN && (
              <Text style={{ fontSize: 11, color: C.faint, marginTop: 3 }}>
                신청 마감 {dateHead(t.signup.deadline)}
              </Text>
            )}
          </View>
          <Icon name="forward" size={15} color={C.faint} />
        </View>
      </Pressable>

      {(apply || cancel) && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 11 }}>
          {item.mine
            ? <Btn small tone="ghost" onPress={cancel}>신청 취소</Btn>
            : <Btn small onPress={apply}>참가 신청</Btn>}
          {live && (
            <Btn small tone="outline" onPress={onOpen}>대진·중계 보기</Btn>
          )}
        </View>
      )}
    </Card>
  );
}

/* ---------------- 게스트 모집 카드 ---------------- */

export function GuestCard({ item, onOpen, today }) {
  const dday = ddayOf(item.date, today);
  return (
    <Card style={{ marginBottom: 10 }} onPress={onOpen}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon name="members" size={18} color={C.info} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontWeight: '700', fontSize: 14 }}>{item.title}</Text>
            {item.ours && <Chip tone="soft">우리 클럽</Chip>}
          </View>
          <Text style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>
            {dateHead(item.date)}{item.time ? ` ${item.time}` : ''}
            {dday ? ` · ${dday}` : ''} · {item.sub}
          </Text>
        </View>
        <Icon name="forward" size={15} color={C.faint} />
      </View>
    </Card>
  );
}

/* ---------------- 고른 날짜의 목록 ---------------- */

export function DayList({ date, items, today, renderItem }) {
  if (!date) return null;
  return (
    <View style={{ marginTop: S.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Text style={F.h3}>{dateHead(date)}</Text>
        {!!ddayOf(date, today) && <Chip tone="soft">{ddayOf(date, today)}</Chip>}
        <Text style={{ fontSize: 11.5, color: C.faint }}>{items.length}건</Text>
      </View>
      {items.length === 0 ? (
        <Card flat>
          <Text style={{ fontSize: 12, color: C.faint, textAlign: 'center', paddingVertical: 8 }}>
            이 날은 일정이 없습니다
          </Text>
        </Card>
      ) : items.map(renderItem)}
    </View>
  );
}

export default {
  AgendaControls, CalendarView, TournamentCard, GuestCard, DayList,
};
