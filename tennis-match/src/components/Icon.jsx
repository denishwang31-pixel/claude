/* ============================================================
   벡터 아이콘 — Ionicons (@expo/vector-icons, Expo 내장)

   이모지를 UI 아이콘으로 쓰면 기기·OS 버전마다 모양이 제각각이고
   장난스러워 보인다. 상용 앱처럼 단색 벡터 아이콘으로 통일한다.

   화면 코드는 의미 이름만 쓴다: <Icon name="schedule" />
   실제 Ionicons 글리프 매핑은 여기 한 곳에서만 관리한다.
   ============================================================ */
import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../lib/theme';

/** 의미 이름 → Ionicons 글리프 */
const MAP = {
  // 탭
  home: 'home-outline',
  homeActive: 'home',
  schedule: 'calendar-outline',
  scheduleActive: 'calendar',
  match: 'tennisball-outline',
  matchActive: 'tennisball',
  gear: 'bag-handle-outline',
  gearActive: 'bag-handle',
  tips: 'play-circle-outline',
  tipsActive: 'play-circle',
  /* 입금 대사 — 통장 입금과 회비를 맞춰 보는 일. 영수증 모양.
     ⚠️ 이 줄이 빠져 있어서 홈의 「입금 대사」 아이콘이 **「?」 상자**로
        나오고 있었다. 에러가 안 나서 아무도 몰랐다. 이제 test-imports 가
        앱이 쓰는 아이콘 이름을 전부 대조한다. */
  reconcile: 'receipt-outline',
  /* 레벨업 탭 — "오른다". ▶ 재생 버튼은 "영상 모음"이라는 뜻이라
     용품·코치까지 담는 칸에는 맞지 않는다. */
  levelup: 'arrow-up-circle-outline',
  levelupActive: 'arrow-up-circle',
  more: 'grid-outline',
  moreActive: 'grid',

  // 기능
  guest: 'person-add-outline',
  polls: 'stats-chart-outline',
  rank: 'podium-outline',
  tournament: 'trophy-outline',
  ntrp: 'speedometer-outline',
  members: 'people-outline',
  board: 'clipboard-outline',      // 공지 전용이 아니라 게시판 전체다 — 확성기는 공지처럼 보인다
  courts: 'location-outline',
  joinreq: 'person-circle-outline',
  fees: 'card-outline',
  attendance: 'checkbox-outline',
  venues: 'business-outline',
  matchcfg: 'options-outline',
  settings: 'settings-outline',
  invite: 'mail-outline',
  pairs: 'link-outline',

  // 범용
  back: 'chevron-back',
  forward: 'chevron-forward',
  close: 'close',
  add: 'add',
  check: 'checkmark',
  search: 'search-outline',
  time: 'time-outline',
  calendar: 'calendar-clear-outline',
  list: 'list-outline',
  lock: 'lock-closed-outline',
  share: 'share-social-outline',
  copy: 'copy-outline',
  trash: 'trash-outline',
  edit: 'create-outline',
  alert: 'alert-circle-outline',
  info: 'information-circle-outline',
  crown: 'ribbon-outline',
  weather: 'partly-sunny-outline',
  logout: 'log-out-outline',
  club: 'shield-outline',
  ball: 'tennisball',
  ballOutline: 'tennisball-outline',
  send: 'arrow-up',
  manage: 'briefcase-outline',
};

export function Icon({ name, size = 20, color = C.sub, style }) {
  const glyph = MAP[name] || name;   // 매핑에 없으면 Ionicons 이름 직접 사용
  return <Ionicons name={glyph} size={size} color={color} style={style} />;
}

export default Icon;
