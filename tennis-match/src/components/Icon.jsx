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
  more: 'grid-outline',
  moreActive: 'grid',

  // 기능
  guest: 'person-add-outline',
  chat: 'chatbubble-ellipses-outline',
  polls: 'stats-chart-outline',
  rank: 'podium-outline',
  tournament: 'trophy-outline',
  ntrp: 'speedometer-outline',
  members: 'people-outline',
  board: 'megaphone-outline',
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
