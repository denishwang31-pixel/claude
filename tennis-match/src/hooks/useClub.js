/* ============================================================
   FIX-01 — 클럽 전체 실시간 구독 훅.
   모든 탭 화면이 이 훅 하나로 데이터 + 파생값을 받는다.

   반환:
     { club, members, meetings, posts, guestPosts, courts, rules, fee,
       meVal, isAdmin, nameOf, loading }

   핵심: rules 는 Firestore 에 "키 문자열 배열"로 저장되지만(setRules),
   화면·엔진은 "{key,name,desc} 객체 배열"을 기대하므로 여기서 변환(hydrateRules).
   ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import {
  subClub, subMembers, subMeetings, subPosts, subGuestPosts,
  subCourts, subRules, subFee, subPairs, subTournaments, subVenues, subMatchConfig,
  subPolls,
} from '../lib/firestore';
import { DEFAULT_RULES } from '../lib/matchmaking';
import { isStaffRole, canAppointRole, isGuestId, guestUid, ROLES } from '../lib/constants';

const RULE_BY_KEY = Object.fromEntries(DEFAULT_RULES.map((r) => [r.key, r]));

/** 저장된 키 순서를 DEFAULT_RULES 객체 배열로 복원.
 *  - null/빈값 → 기본 순서
 *  - 알 수 없는 키는 무시, 앱 업데이트로 새로 생긴 기준(누락 키)은 기본 순서로 뒤에 보충 */
export function hydrateRules(orderKeys) {
  if (!Array.isArray(orderKeys) || orderKeys.length === 0) return DEFAULT_RULES;
  const seen = new Set();
  const ordered = [];
  orderKeys.forEach((k) => {
    if (RULE_BY_KEY[k] && !seen.has(k)) { ordered.push(RULE_BY_KEY[k]); seen.add(k); }
  });
  DEFAULT_RULES.forEach((r) => { if (!seen.has(r.key)) ordered.push(r); });
  return ordered;
}

const monthKeyNow = () => new Date().toISOString().slice(0, 7);

export function useClub(clubId, me, opts = {}) {
  const feeMonth = opts.feeMonth || monthKeyNow();
  const viewMode = opts.viewMode || null; // 'staff' | 'member' | null(실제 역할)

  const [club, setClub] = useState(null);
  const [members, setMembers] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [posts, setPosts] = useState([]);
  const [guestPosts, setGuestPosts] = useState([]);
  const [courts, setCourts] = useState([]);
  const [ruleKeys, setRuleKeys] = useState(null);
  const [fee, setFee] = useState({ paid: {} });
  const [pairs, setPairsState] = useState({ couples: [], fixedPairs: [] });
  const [tournaments, setTournaments] = useState([]);
  const [venues, setVenues] = useState([]);
  const [matchConfig, setMatchConfig] = useState(null);
  const [polls, setPolls] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clubId) { setLoading(false); return; }
    setLoading(true);
    const unsubs = [
      subClub(clubId, setClub),
      subMembers(clubId, (v) => { setMembers(v); setLoading(false); }),
      subMeetings(clubId, setMeetings),
      subPosts(clubId, setPosts),
      subCourts(clubId, setCourts),
      subRules(clubId, setRuleKeys),
      subFee(clubId, feeMonth, setFee),
      subPairs(clubId, (p) => setPairsState({ couples: p?.couples || [], fixedPairs: p?.fixedPairs || [] })),
      subTournaments(clubId, setTournaments),
      subVenues(clubId, setVenues),
      subMatchConfig(clubId, setMatchConfig),
      subPolls(clubId, setPolls),
    ];
    return () => unsubs.forEach((u) => u && u());
  }, [clubId, feeMonth]);

  // 게스트 모집은 루트 공개 컬렉션(FIX-05) — clubId 무관하게 구독
  useEffect(() => {
    const unsub = subGuestPosts(setGuestPosts);
    return () => unsub && unsub();
  }, []);

  const rules = useMemo(() => hydrateRules(ruleKeys), [ruleKeys]);

  const meVal = useMemo(
    () => members.find((m) => m.id === me) || null,
    [members, me],
  );
  /* 권한 —
     realStaff  : 실제 역할 기준 운영진(회장·총무·책임리더) 여부
     isAdmin    : 화면에서 쓰는 값. 보기 모드가 켜져 있으면 그 모드를 따름
     canAppoint : 역할 임명(회장 전용) */
  const realStaff = !!meVal && isStaffRole(meVal.role);
  const isAdmin = viewMode === 'member' ? false
    : (viewMode === 'staff' || viewMode === 'lead') ? true : realStaff;
  const canAppoint = !!meVal && canAppointRole(meVal.role) && !viewMode;
  const isPresident = meVal?.role === ROLES.PRESIDENT;

  /* 내가 리드로 지정된 코트장 / 내가 소속(정기 운동)된 코트장 */
  const myLeadVenues = useMemo(
    () => venues.filter((v) => v.leadId === me),
    [venues, me],
  );
  const myVenues = useMemo(
    () => venues.filter((v) => (meVal?.venueIds || []).includes(v.id)),
    [venues, meVal],
  );

  /* 보기 모드에 따라 "내가 볼 수 있는 코트장" 범위를 정한다
     staff  : 전체
     lead   : 내가 리드인 코트장(없으면 전체 — 리드 지정 전 테스트 대비)
     member : 내가 소속된 코트장
     null   : 실제 역할대로 */
  const scopeVenues = useMemo(() => {
    const mode = viewMode || (realStaff ? 'staff' : 'member');
    if (mode === 'staff') return venues;
    if (mode === 'lead') return myLeadVenues.length ? myLeadVenues : venues;
    return myVenues;
  }, [viewMode, realStaff, venues, myLeadVenues, myVenues]);

  // 게스트 ID('g:<uid>')는 저장된 표시명을 우선 사용(타 클럽 회원일 수 있음)
  const nameOf = useMemo(() => {
    const byId = Object.fromEntries(members.map((m) => [m.id, m]));
    const guestNames = {};
    meetings.forEach((mt) => (mt.guests || []).forEach((g) => {
      if (g.uid) guestNames[g.uid] = g.name;
    }));
    return (id) => {
      if (isGuestId(id)) {
        const uid = guestUid(id);
        return (guestNames[uid] || byId[uid]?.name || uid) + '(G)';
      }
      return byId[id]?.name || '?';
    };
  }, [members, meetings]);

  return {
    club, members, meetings, posts, guestPosts, courts, rules, fee,
    pairs, tournaments, venues, matchConfig, polls, meVal,
    isAdmin, realStaff, canAppoint, isPresident, viewMode, nameOf, loading,
    myLeadVenues, myVenues, scopeVenues,
  };
}
