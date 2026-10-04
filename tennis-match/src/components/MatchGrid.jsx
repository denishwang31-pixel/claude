/* 대진표를 한눈에 보는 두 가지 표
   1) MatchGrid     : 가로=코트, 세로=타임 매트릭스 (동호회 대진표 양식)
   2) AttendanceGrid: 가로=타임, 세로=참석자 — 누가 언제 뛰고 쉬는지 + 총 경기수
   좁은 화면을 위해 가로 스크롤을 지원한다. */
import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { C } from '../lib/theme';
import { courtLabel } from '../lib/courtNames';

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

/* 팀 꼬리표 — 청백전(2팀·3팀)·팀 리그에서 칸마다 어느 팀인지(청·백·홍).
   이름 색은 남녀 구분에 쓰고 있어서, 팀은 이름 위 작은 꼬리표로 따로 보인다(2026-10-04 앱 주인).
   백팀처럼 바탕이 흰 팀도 보이게 테두리를 팀 색으로 두른다. */
/* 팀 표시는 꽉 찬 색 상자 — 연한 바탕에 글자색만 다르면 청팀(파랑)과 백팀(회색)이 잘 안 갈렸다
   (2026-10-04 앱 주인). 백팀은 흰 상자에 검은 테두리·글자, 나머지는 팀 색 상자에 흰 글자. */
const WHITE_TEAM = /^(백|흰|하양|화이트|white)/i;
export function teamSolid(side) {
  if (!side) return { bg: '#fff', fg: C.sub, border: C.border };
  if (WHITE_TEAM.test(String(side.name || ''))) return { bg: '#ffffff', fg: '#111827', border: '#111827' };
  return { bg: side.color || C.sub, fg: '#ffffff', border: side.color || C.sub };
}

function SideTag({ side }) {
  if (!side) return null;
  const t = teamSolid(side);
  return (
    <View style={{ alignItems: 'center', marginBottom: 1 }}>
      <View style={{
        backgroundColor: t.bg, borderColor: t.border, borderWidth: 1,
        borderRadius: 4, paddingHorizontal: 5, paddingVertical: 0,
      }}>
        <Text numberOfLines={1} style={{ fontSize: 9, fontWeight: '800', color: t.fg }}>{side.name}</Text>
      </View>
    </View>
  );
}

/* sideOf(m, 'A'|'B') → { name, color, bg } — 주면 칸마다 팀 꼬리표를 단다(없으면 예전과 같다)

   venue 를 받는 이유는 코트 이름 때문이다. 경기 문서의 court 는 계속
   1·2·3 숫자이고, 그 코트장이 실제로 부르는 이름(A·B·C, 9·10·11)으로
   **보여 줄 때만** 바꾼다. 저장된 값을 바꾸면 쌓인 대진과 전적이
   어긋난다 — src/lib/courtNames.js 머리말 참고. */
/* roundCount·courtCount 를 주면 1..N 을 모두 그린다 — 경기를 지워도 그 타임 줄·코트 칸이
   사라지지 않고 빈칸으로 남는다(청백전·팀 리그, 2026-10-04 앱 주인). 안 주면 예전처럼 경기 있는 곳만.
   onPressEmpty(round, court) — 빈칸을 눌렀을 때(그 자리에 경기 넣기).
   selected — 고른 경기 id 목록(여러 경기 지우기). */
const range = (n) => Array.from({ length: Math.max(0, n) }, (_, i) => i + 1);
export function MatchGrid({
  matches, nameOf, genderOf, me, roundTimes = [], onPressMatch, venue = null, pending, sideOf = null,
  roundCount = 0, courtCount = 0, onPressEmpty, selected = null,
}) {
  const list = matches || [];
  const fixed = roundCount > 0 && courtCount > 0;
  if (!list.length && !fixed) return null;
  matches = list;

  const rounds = fixed
    ? [...new Set([...range(roundCount), ...matches.map((m) => m.round)])].sort((a, b) => a - b)
    : [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  const courts = fixed
    ? [...new Set([...range(courtCount), ...matches.map((m) => m.court)])].sort((a, b) => a - b)
    : [...new Set(matches.map((m) => m.court))].sort((a, b) => a - b);
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
              <Text style={{ color: C.lime, fontSize: 12, fontWeight: '700' }}>코트 {courtLabel(venue, c)}</Text>
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
                  const cell = (
                    <View style={{
                      width: CELL_W, minHeight: 62, backgroundColor: '#fafaf9',
                      borderWidth: 1, borderColor: onPressEmpty ? '#d6d3d1' : '#f5f5f4',
                      borderStyle: onPressEmpty ? 'dashed' : 'solid',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ fontSize: 10, color: C.faint }}>{onPressEmpty ? '＋ 경기 넣기' : '—'}</Text>
                    </View>
                  );
                  return onPressEmpty
                    ? <Pressable key={c} onPress={() => onPressEmpty(r, c)}>{cell}</Pressable>
                    : <View key={c}>{cell}</View>;
                }
                const tone = TYPE_TONE[m.type] || { bg: '#fff', fg: C.sub };
                const aWin = m.score && m.score.a > m.score.b;
                const bWin = m.score && m.score.b > m.score.a;
                /* 내가 뛰는 칸 — 표가 넓어도 내 경기부터 눈에 들어와야 한다 */
                const isMine = !!me && [...m.teamA, ...m.teamB].includes(me);
                const picked = !!selected && selected.includes(m.id);
                return (
                  <Pressable key={c} onPress={() => onPressMatch?.(m)}
                    style={{
                      width: CELL_W, minHeight: 62,
                      backgroundColor: picked ? C.dangerBg : isMine ? C.greenSoft : '#fff',
                      borderWidth: picked || isMine ? 2 : 1,
                      borderColor: picked ? C.danger : isMine ? C.green : '#f5f5f4',
                      padding: picked || isMine ? 5 : 6,
                    }}>
                    {picked && (
                      <Text style={{ position: 'absolute', right: 4, bottom: 2, fontSize: 10, fontWeight: '900', color: C.danger }}>✓ 지움</Text>
                    )}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ backgroundColor: tone.bg, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 }}>
                        <Text style={{ fontSize: 9, fontWeight: '800', color: tone.fg }}>{m.type}</Text>
                      </View>
                      {/* ⚠️ 세 가지 상태를 구별해 보여 준다. 확정과 "확인
                          대기"가 똑같이 '기록전'으로 보이면, 상대가 이미
                          넣어 둔 점수를 아무도 확인하러 오지 않는다 —
                          두 팀이 확인하는 방식 자체가 여기서 무너진다.
                          pending 을 안 넘기면 예전과 똑같이 동작한다. */}
                      {m.score
                        ? <Text style={{ fontSize: 10, fontWeight: '700', color: C.green }}>{m.score.a}:{m.score.b}</Text>
                        : pending?.[m.id]
                          ? (
                            <Text style={{ fontSize: 9, fontWeight: '800', color: C.warn }}>
                              {pending[m.id].a}:{pending[m.id].b} 확인
                            </Text>
                          )
                          : <Text style={{ fontSize: 9, color: C.faint }}>기록전</Text>}
                    </View>
                    <View style={{ marginTop: 4 }}>
                      {!!sideOf && <SideTag side={sideOf(m, 'A')} />}
                      <TeamText ids={m.teamA} nameOf={nameOf} genderOf={genderOf} me={me}
                        win={aWin} dim={m.score && !aWin} />
                      <Text style={{ fontSize: 8, color: C.faint, textAlign: 'center', marginVertical: 1 }}>vs</Text>
                      {!!sideOf && <SideTag side={sideOf(m, 'B')} />}
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
/* typeOf(m) 를 주면 줄 끝에 유형별(남복·여복·혼복…) 경기 수 칸과, 맨 아래 전체 합계 줄을 단다.
   tagOf(p) → { name, color } 를 주면 이름 앞에 팀 색 점. roundCount 를 주면 1..N 타임을 모두 그린다.
   (청백전·팀 리그, 2026-10-04 앱 주인 — "타임별 참가 여부와 총 몇 경기, 남복·여복·혼복 몇 경기씩") */
/* groups — [{ key, name, color, bg, players }] 를 주면 팀별로 묶어 보여 준다(팀 이름 머리줄 + 그 팀 선수).
   청백전·팀 리그에서 "어느 팀인지 보이고, 팀별로 모아 두면 보기 좋다"(2026-10-04 앱 주인). */
export function AttendanceGrid({
  attendees, matches, roundTimes = [], me, venue = null, typeOf = null, tagOf = null, roundCount = 0, groups = null,
}) {
  if (!attendees?.length) return null;
  matches = matches || [];
  const rounds = [...new Set([...range(roundCount), ...matches.map((m) => m.round)])].sort((a, b) => a - b);
  if (!rounds.length) return null;

  /* 유형별 — 사람마다 · 전체 */
  const TYPE_COLS = ['남복', '여복', '혼복', '잡복', '남단식', '여단식', '혼성단식'];
  const perType = {};
  const allType = {};
  if (typeOf) {
    matches.forEach((m) => {
      const t = typeOf(m);
      allType[t] = (allType[t] || 0) + 1;
      [...m.teamA, ...m.teamB].forEach((id) => { ((perType[id] ||= {})[t] = (perType[id]?.[t] || 0) + 1); });
    });
  }
  const typeCols = typeOf ? TYPE_COLS.filter((t) => allType[t]) : [];
  const TYPE_W = 30;

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

  const byGames = (list) => [...list].sort((a, b) => total(b.id) - total(a.id));
  const sections = groups?.length
    ? groups.map((g) => ({ ...g, players: byGames(g.players || []) }))
    : [{ key: 'all', players: byGames(attendees) }];

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
            {typeCols.map((t) => (
              <View key={t} style={{ width: TYPE_W, alignItems: 'center', paddingBottom: 4 }}>
                <Text style={{ fontSize: 9, fontWeight: '800', color: (TYPE_TONE[t] || {}).fg || C.sub }}>{t.replace('단식', '단')}</Text>
              </View>
            ))}
          </View>

          {sections.map((sec) => {
            const t = teamSolid(sec);
            /* 팀마다 테두리 상자 — 위에 팀 이름 띠. 이름 앞 점 대신 상자로 묶는다(2026-10-04 앱 주인) */
            return (
            <View key={sec.key} style={sec.name ? {
              marginTop: 10, borderWidth: 2, borderColor: t.border, borderRadius: 8, overflow: 'hidden',
            } : undefined}>
              {!!sec.name && (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  backgroundColor: t.bg, paddingHorizontal: 8, paddingVertical: 4,
                  borderBottomWidth: t.bg === '#ffffff' ? 1 : 0, borderBottomColor: t.border,
                }}>
                  <Text style={{ fontSize: 12.5, fontWeight: '900', color: t.fg }}>{sec.name}</Text>
                  <Text style={{ fontSize: 10.5, color: t.fg, opacity: 0.85 }}>
                    {sec.players.length}명{sec.games != null ? ` · 팀 경기 ${sec.games}` : ''}
                  </Text>
                </View>
              )}
              {sec.players.map((p, i) => {
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
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        {!groups?.length && !!tagOf && !!tagOf(p) && (
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tagOf(p).color }} />
                        )}
                        <Text numberOfLines={1} style={{
                          flexShrink: 1,
                          fontSize: 11, fontWeight: mine ? '900' : '700',
                          color: nameColor(p.gender),
                        }}>{mine ? `${p.name} (나)` : p.name}</Text>
                      </View>
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
                              <Text style={{ fontSize: 10, fontWeight: '700', color: C.lime }}>{courtLabel(venue, court)}</Text>
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
                    {typeCols.map((t) => (
                      <View key={t} style={{ width: TYPE_W, alignItems: 'center' }}>
                        <Text style={{ fontSize: 11, color: perType[p.id]?.[t] ? C.text : '#d6d3d1' }}>{perType[p.id]?.[t] || 0}</Text>
                      </View>
                    ))}
                  </View>
                );
              })}
            </View>
            );
          })}

          {/* 맨 아래 — 전체 경기 수 · 유형별 */}
          {!!typeOf && (
            <View style={{
              flexDirection: 'row', alignItems: 'center', marginTop: 4,
              borderTopWidth: 1.5, borderTopColor: C.border, paddingTop: 4,
            }}>
              <View style={{ width: NAME_W + COL_W * rounds.length, paddingLeft: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: C.text }}>전체 경기</Text>
              </View>
              <View style={{ width: 38, alignItems: 'center' }}>
                <Text style={{ fontSize: 12, fontWeight: '900', color: C.green }}>{matches.length}</Text>
              </View>
              {typeCols.map((t) => (
                <View key={t} style={{ width: TYPE_W, alignItems: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: C.text }}>{allType[t]}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
      {!!typeOf && matches.length > 0 && (
        <Text style={{ fontSize: 12, fontWeight: '800', color: C.text, marginTop: 8 }}>
          총 {matches.length}경기 · {typeCols.map((t) => `${t} ${allType[t]}`).join(' · ')}
        </Text>
      )}

      <Text style={{ fontSize: 9, color: C.faint, marginTop: 6 }}>
        숫자 = 배정된 코트 번호 · 회색 "휴" = 그 타임 휴식
        {maxGames !== minGames ? ` · 최다 ${maxGames}경기 / 최소 ${minGames}경기` : ` · 전원 ${maxGames}경기 균등`}
      </Text>
    </View>
  );
}
