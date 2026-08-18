/* 대진표를 한눈에 보는 두 가지 표
   1) MatchGrid     : 가로=코트, 세로=타임 매트릭스 (동호회 대진표 양식)
   2) AttendanceGrid: 가로=타임, 세로=참석자 — 누가 언제 뛰고 쉬는지 + 총 경기수
   좁은 화면을 위해 가로 스크롤을 지원한다. */
import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { C } from '../lib/theme';

const TYPE_TONE = {
  혼복: { bg: '#ecfccb', fg: '#3f6212' },
  남복: { bg: '#f0f9ff', fg: '#075985' },
  여복: { bg: '#fff1f2', fg: '#be123c' },
  잡복: { bg: '#fef3c7', fg: '#92400e' },
  남단식: { bg: '#f0f9ff', fg: '#075985' },
  여단식: { bg: '#fff1f2', fg: '#be123c' },
  혼성단식: { bg: '#fef3c7', fg: '#92400e' },
};

const CELL_W = 132;   // 코트 열 너비
const HEAD_W = 46;    // 타임 열 너비

/* 이름 색 — 남녀를 한눈에 가른다.

   혼복인지 남복인지는 칸 위 꼬리표로 알 수 있지만, 잡복이나 단식이
   섞이면 "이 코트에 여자가 몇 명이지"를 이름마다 떠올려야 했다.
   색을 입히면 표를 훑는 것만으로 구성이 보인다. */
const nameColor = (gender) => (gender === 'F' ? C.female : gender === 'M' ? C.male : C.text);

/** 팀 이름 표기 (단식이면 한 명). 내 이름은 배경까지 칠해 도드라지게 한다 */
function TeamText({ ids, nameOf, genderOf, me, win, dim }) {
  return (
    <View style={{
      flexDirection: 'row', flexWrap: 'wrap',
      justifyContent: 'center', alignItems: 'center',
    }}>
      {ids.map((id, i) => {
        const mine = !!me && id === me;
        const g = genderOf ? genderOf(id) : '';
        return (
          <View key={id} style={{ flexDirection: 'row', alignItems: 'center' }}>
            {i > 0 && <Text style={{ fontSize: 10, color: C.faint }}> · </Text>}
            <Text
              numberOfLines={1}
              style={{
                fontSize: 11,
                fontWeight: mine || win ? '900' : '600',
                /* 내 이름은 초록 알약으로 덮어 칠한다.
                   칸 배경(연초록) 위에서도 확실히 떠올라야 하므로
                   성별 색 대신 흰 글씨를 쓴다 — 내 이름을 찾는 것이
                   먼저고, 내 성별은 이미 알고 있다. */
                color: mine ? '#fff' : dim ? C.faint : win ? C.green : nameColor(g),
                backgroundColor: mine ? C.green : 'transparent',
                borderRadius: mine ? 4 : 0,
                paddingHorizontal: mine ? 4 : 0,
                overflow: 'hidden',
              }}>
              {nameOf(id)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export function MatchGrid({ matches, nameOf, genderOf, me, roundTimes = [], onPressMatch }) {
  if (!matches?.length) return null;

  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  const courts = [...new Set(matches.map((m) => m.court))].sort((a, b) => a - b);
  const at = (r, c) => matches.find((m) => m.round === r && m.court === c);
  const timeOf = (r) => roundTimes.find((t) => t.round === r);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View>
        {/* 헤더: 코트 번호 */}
        <View style={{ flexDirection: 'row' }}>
          <View style={{ width: HEAD_W }} />
          {courts.map((c) => (
            <View key={c} style={{
              width: CELL_W, paddingVertical: 6, alignItems: 'center',
              backgroundColor: C.ink, borderTopLeftRadius: c === courts[0] ? 10 : 0,
              borderTopRightRadius: c === courts[courts.length - 1] ? 10 : 0,
              borderLeftWidth: c === courts[0] ? 0 : 1, borderLeftColor: 'rgba(255,255,255,0.15)',
            }}>
              <Text style={{ color: C.lime, fontSize: 12, fontWeight: '700' }}>코트 {c}</Text>
            </View>
          ))}
        </View>

        {/* 본문: 타임 × 코트 */}
        {rounds.map((r) => {
          const t = timeOf(r);
          return (
            <View key={r} style={{ flexDirection: 'row' }}>
              {/* 타임 헤더 */}
              <View style={{
                width: HEAD_W, alignItems: 'center', justifyContent: 'center',
                backgroundColor: C.green, paddingVertical: 8,
                borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)',
              }}>
                <Text style={{ color: C.lime, fontSize: 12, fontWeight: '700' }}>{r}T</Text>
                {t && <Text style={{ color: '#BFE3D3', fontSize: 8, marginTop: 1 }}>{t.start}</Text>}
              </View>

              {courts.map((c) => {
                const m = at(r, c);
                if (!m) {
                  return (
                    <View key={c} style={{
                      width: CELL_W, minHeight: 62, backgroundColor: '#fafaf9',
                      borderWidth: 1, borderColor: '#f5f5f4', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ fontSize: 10, color: C.faint }}>—</Text>
                    </View>
                  );
                }
                const tone = TYPE_TONE[m.type] || { bg: '#fff', fg: C.sub };
                const aWin = m.score && m.score.a > m.score.b;
                const bWin = m.score && m.score.b > m.score.a;
                /* 내가 뛰는 칸 — 표가 넓어도 내 경기부터 눈에 들어와야 한다 */
                const isMine = !!me && [...m.teamA, ...m.teamB].includes(me);
                return (
                  <Pressable key={c} onPress={() => onPressMatch?.(m)}
                    style={{
                      width: CELL_W, minHeight: 62,
                      backgroundColor: isMine ? C.greenSoft : '#fff',
                      borderWidth: isMine ? 2 : 1,
                      borderColor: isMine ? C.green : '#f5f5f4',
                      padding: isMine ? 5 : 6,
                    }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ backgroundColor: tone.bg, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 }}>
                        <Text style={{ fontSize: 9, fontWeight: '800', color: tone.fg }}>{m.type}</Text>
                      </View>
                      {m.score
                        ? <Text style={{ fontSize: 10, fontWeight: '700', color: C.green }}>{m.score.a}:{m.score.b}</Text>
                        : <Text style={{ fontSize: 9, color: C.faint }}>기록전</Text>}
                    </View>
                    <View style={{ marginTop: 4 }}>
                      <TeamText ids={m.teamA} nameOf={nameOf} genderOf={genderOf} me={me}
                        win={aWin} dim={m.score && !aWin} />
                      <Text style={{ fontSize: 8, color: C.faint, textAlign: 'center', marginVertical: 1 }}>vs</Text>
                      <TeamText ids={m.teamB} nameOf={nameOf} genderOf={genderOf} me={me}
                        win={bWin} dim={m.score && !bWin} />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

/** 참석자별 출전 현황 — 언제 뛰고 언제 쉬는지 한눈에 */
export function AttendanceGrid({ attendees, matches, roundTimes = [], me }) {
  if (!attendees?.length) return null;
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  if (!rounds.length) return null;

  /* playing[playerId][round] = 코트번호 */
  const playing = {};
  matches.forEach((m) => {
    [...m.teamA, ...m.teamB].forEach((id) => {
      (playing[id] ||= {})[m.round] = m.court;
    });
  });

  const NAME_W = 62;
  const COL_W = 34;
  const total = (id) => Object.keys(playing[id] || {}).length;
  const maxGames = Math.max(...attendees.map((p) => total(p.id)), 0);
  const minGames = Math.min(...attendees.map((p) => total(p.id)), 99);

  const sorted = [...attendees].sort((a, b) => total(b.id) - total(a.id));

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          {/* 헤더 */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
            <View style={{ width: NAME_W }} />
            {rounds.map((r) => {
              const t = roundTimes.find((x) => x.round === r);
              return (
                <View key={r} style={{ width: COL_W, alignItems: 'center', paddingBottom: 4 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: C.ink }}>{r}T</Text>
                  {t && <Text style={{ fontSize: 7, color: C.faint }}>{t.start}</Text>}
                </View>
              );
            })}
            <View style={{ width: 38, alignItems: 'center', paddingBottom: 4 }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: C.sub }}>합계</Text>
            </View>
          </View>

          {sorted.map((p, i) => {
            const n = total(p.id);
            /* 내 줄 — 참석자가 스무 명 넘으면 내 이름을 찾는 것부터 일이다 */
            const mine = !!me && p.id === me;
            return (
              <View key={p.id} style={{
                flexDirection: 'row', alignItems: 'center',
                backgroundColor: mine ? C.greenSoft : i % 2 ? '#fafaf9' : '#fff',
                borderRadius: 6,
                borderWidth: mine ? 1.5 : 0, borderColor: C.green,
              }}>
                <View style={{ width: NAME_W, paddingVertical: 5, paddingLeft: 4 }}>
                  <Text numberOfLines={1} style={{
                    fontSize: 11, fontWeight: mine ? '900' : '700',
                    color: nameColor(p.gender),
                  }}>{mine ? `${p.name} (나)` : p.name}</Text>
                </View>

                {rounds.map((r) => {
                  const court = playing[p.id]?.[r];
                  return (
                    <View key={r} style={{ width: COL_W, alignItems: 'center', paddingVertical: 4 }}>
                      {court ? (
                        <View style={{
                          width: 22, height: 22, borderRadius: 11, backgroundColor: C.green,
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: C.lime }}>{court}</Text>
                        </View>
                      ) : (
                        <View style={{
                          width: 22, height: 22, borderRadius: 11, backgroundColor: '#f5f5f4',
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Text style={{ fontSize: 10, color: '#d6d3d1' }}>휴</Text>
                        </View>
                      )}
                    </View>
                  );
                })}

                <View style={{ width: 38, alignItems: 'center' }}>
                  <Text style={{
                    fontSize: 12, fontWeight: '700',
                    color: n === maxGames && maxGames !== minGames ? C.green2
                      : n === minGames && maxGames !== minGames ? '#b45309' : C.sub,
                  }}>{n}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <Text style={{ fontSize: 9, color: C.faint, marginTop: 6 }}>
        숫자 = 배정된 코트 번호 · 회색 "휴" = 그 타임 휴식
        {maxGames !== minGames ? ` · 최다 ${maxGames}경기 / 최소 ${minGames}경기` : ` · 전원 ${maxGames}경기 균등`}
      </Text>
    </View>
  );
}
