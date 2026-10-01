/* ============================================================
   토너먼트 대진표 — 사다리 모양 (위·아래에서 가운데 결승으로)

   위쪽 절반은 위에서 아래로, 아래쪽 절반은 아래에서 위로 올라가 가운데 결승에서
   만난다. 휴대폰은 세로가 길어서 좌우로 펼치면 8강만 돼도 화면을 넘는다 — 위아래로
   펼치면 한 줄에 경기 수의 절반만 놓이므로 16강까지 한 화면 폭에 들어간다.
   이긴 팀이 올라간 길은 굵은 초록 선, 진 팀 칸은 흐리게.
   그림 라이브러리 없이 View 로 선을 긋는다(앱 크기를 늘리지 않으려고).

   bracket: tournament.js 의 { rounds:[{ matches:[{ id,a,b,score,winner }] }] }
     r 라운드 i 번째 경기의 승자 → r+1 라운드 floor(i/2) 번째 경기
   ============================================================ */
import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { roundName } from '../lib/tournament';
import { C, R } from '../lib/theme';

const ROW = 25;          // 한 팀 줄 높이
const H = ROW * 2 + 2;   // 경기 상자 높이
const VG = 34;           // 위아래 줄 사이(선이 지나가는 곳)
const HG = 8;            // 옆 상자 사이
const TOP = 18;          // 첫 줄 위 라운드 이름 자리
const MIN_SLOT = 78;     // 상자 하나 최소 폭(이보다 좁으면 옆으로 넘긴다) — 16강까지 한 폭에
const THIN = 1.5;
const THICK = 3.5;

/* 한 팀 줄 — 이긴 팀은 초록 굵게, 진 팀은 흐리게 */
function TeamRow({ name, score, state, top }) {
  const win = state === 'win';
  const lose = state === 'lose';
  return (
    <View style={{
      height: ROW, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6,
      backgroundColor: win ? C.greenSoft : lose ? C.fill : C.surface,
      borderTopWidth: top ? 0 : 1, borderTopColor: C.border,
    }}>
      {win && <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: C.green }} />}
      <Text numberOfLines={1} style={{
        flex: 1, fontSize: 10.5, fontWeight: win ? '800' : '500',
        color: win ? C.green : lose ? C.faint : name ? C.text : C.faint,
      }}>{name || '—'}</Text>
      {score != null && (
        <Text style={{ fontSize: 11, fontWeight: '800', color: win ? C.green : C.faint, marginLeft: 3 }}>{score}</Text>
      )}
    </View>
  );
}

function MatchBox({ m, firstRound, nameOf, x, y, w, onPress, selected, isFinal }) {
  /* 부전승은 첫 라운드에서 상대 자리가 비어 있을 때만 — 뒤 라운드의 빈칸은 "아직" */
  const bye = firstRound && ((m.a && !m.b) || (!m.a && m.b));
  const st = (side) => (!m.winner ? '' : m.winner === m[side] ? 'win' : 'lose');
  return (
    <Pressable onPress={onPress ? () => onPress(m) : undefined} disabled={!onPress || !m.a || !m.b}
      style={{
        position: 'absolute', left: x, top: y, width: w, height: H,
        borderRadius: 7, overflow: 'hidden', backgroundColor: C.surface,
        borderWidth: selected || isFinal ? 2 : 1,
        borderColor: selected || isFinal ? C.green : C.border,
      }}>
      <TeamRow top name={m.a ? nameOf(m.a) : (bye ? '부전승' : '')} score={m.score ? m.score.a : null} state={st('a')} />
      <TeamRow name={m.b ? nameOf(m.b) : (bye ? '부전승' : '')} score={m.score ? m.score.b : null} state={st('b')} />
    </Pressable>
  );
}

/** 선 하나 (가로 또는 세로) */
const Line = ({ x, y, w = 0, h = 0, thick }) => {
  const t = thick ? THICK : THIN;
  return (
    <View style={{
      position: 'absolute', left: x - (w ? 0 : t / 2), top: y - (h ? 0 : t / 2),
      width: w ? w + (thick ? t / 2 : 0) : t, height: h ? h + (thick ? t / 2 : 0) : t,
      backgroundColor: thick ? C.green : C.border, borderRadius: thick ? 2 : 0,
    }} />
  );
};

/**
 * @param onPressMatch  운영진 — 경기를 누르면 결과 입력(양 팀이 정해진 경기만)
 * @param selectedId    지금 고른 경기(테두리 강조)
 * @param champion      우승 이름(있으면 결승 줄 이름 옆에 🏆)
 */
export function BracketTree({ bracket, nameOf, onPressMatch, selectedId, champion }) {
  const [avail, setAvail] = useState(330);
  const rounds = bracket?.rounds || [];
  const RN = rounds.length;
  if (!RN) return null;

  const n0 = rounds[0].matches.length;
  const twoSided = RN >= 2;
  const perRow = twoSided ? Math.max(1, n0 / 2) : 1;
  const slotW = Math.max(MIN_SLOT, Math.floor(avail / perRow));
  const boxW = Math.min(slotW - HG, 170);
  const width = Math.max(avail, perRow * slotW);
  const rows = twoSided ? 2 * (RN - 1) + 1 : 1;
  const rowY = (row) => TOP + row * (H + VG);
  const height = rowY(rows - 1) + H + 4;

  /* 경기 위치 — 결승은 가운데 줄, 위쪽 절반은 위 줄들, 아래쪽 절반은 거울처럼 */
  const posOf = (r, i) => {
    if (r === RN - 1) return { side: 'final', row: twoSided ? RN - 1 : 0, cx: width / 2 };
    const n = rounds[r].matches.length;
    const top = i < n / 2;
    const j = top ? i : i - n / 2;
    const span = width / (n / 2);      // 이 라운드 한 경기가 차지하는 폭
    return { side: top ? 'top' : 'bottom', row: top ? r : 2 * (RN - 1) - r, cx: (j + 0.5) * span };
  };

  const lines = [];
  const boxes = [];
  const labels = [];

  rounds.forEach((round, r) => {
    round.matches.forEach((m, i) => {
      const p = posOf(r, i);
      const y = rowY(p.row);
      boxes.push(<MatchBox key={m.id} m={m} firstRound={r === 0} nameOf={nameOf} x={p.cx - boxW / 2} y={y} w={boxW}
        onPress={onPressMatch} selected={selectedId === m.id} isFinal={p.side === 'final'} />);
      if (r === RN - 1) return;
      /* 다음 경기로 잇는 선 — 이긴 팀이 있으면 그 길이 굵어진다 */
      const pp = posOf(r + 1, Math.floor(i / 2));
      const py = rowY(pp.row);
      const thick = !!m.winner;
      const k = m.id;
      if (p.side === 'top') {
        const y0 = y + H; const ym = y0 + VG / 2;
        lines.push(<Line key={`${k}-a`} x={p.cx} y={y0} h={VG / 2} thick={thick} />);
        lines.push(<Line key={`${k}-b`} x={Math.min(p.cx, pp.cx)} y={ym} w={Math.abs(pp.cx - p.cx)} thick={thick} />);
        lines.push(<Line key={`${k}-c`} x={pp.cx} y={ym} h={py - ym} thick={thick} />);
      } else {
        const y0 = y; const ym = y0 - VG / 2;
        lines.push(<Line key={`${k}-a`} x={p.cx} y={ym} h={VG / 2} thick={thick} />);
        lines.push(<Line key={`${k}-b`} x={Math.min(p.cx, pp.cx)} y={ym} w={Math.abs(pp.cx - p.cx)} thick={thick} />);
        lines.push(<Line key={`${k}-c`} x={pp.cx} y={py + H} h={ym - (py + H)} thick={thick} />);
      }
    });
    /* 라운드 이름 — 그 줄 왼쪽 위 */
    const name = roundName(r, RN);
    const rowsOf = r === RN - 1 ? [twoSided ? RN - 1 : 0] : [r, 2 * (RN - 1) - r];
    rowsOf.forEach((row) => labels.push(
      <Text key={`l-${r}-${row}`} style={{
        position: 'absolute', left: 2, top: rowY(row) - 16,
        fontSize: 10.5, fontWeight: '800', color: r === RN - 1 ? C.green : C.faint,
      }}>{r === RN - 1 && champion ? `${name} · 🏆 ${champion}` : name}</Text>,
    ));
  });

  return (
    <View onLayout={(e) => { const w = Math.floor(e.nativeEvent.layout.width); if (w > 0 && Math.abs(w - avail) > 2) setAvail(w); }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} scrollEnabled={width > avail}>
        <View style={{ width, height }}>
          {/* 가는 선을 먼저, 굵은 선을 나중에 — 겹치는 곳에서 회색이 초록 위로 올라오지 않게 */}
          {[...lines].sort((a, b) => Number(!!a.props.thick) - Number(!!b.props.thick))}
          {boxes}
          {labels}
        </View>
      </ScrollView>
    </View>
  );
}

export default BracketTree;
