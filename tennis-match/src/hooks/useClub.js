/* ============================================================
   FIX-01 — 클럽 전체 실시간 구독 훅.
   모든 탭 화면이 이 훅 하나로 데이터 + 파생값을 받는다.

   반환:
     { club, members, meetings, posts, guestPosts, courts, rules, fee,
       meVal, isAdmin, nameOf, genderOf, loading }

   핵심: rules 는 Firestore 에 "키 문자열 배열"로 저장되지만(setRules),
   화면·엔진은 "{key,name,desc} 객체 배열"을 기대하므로 여기서 변환(hydrateRules).
   ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import {
  subClub, subMembers, subMeetings, subPosts, subGuestPosts,
  subCourts, subRules, subFee, subPairs, subTournaments, subVenues, subMatchConfig,
  subPolls, setMemberRole,
} from '../lib/firestore';
import { DEFAULT_RULES } from '../lib/matchmaking';
import { feeDocKey } from '../lib/scope';
import {
  isStaffRole, canAppointRole, isGuestId, guestUid, ROLES,
  normalizeRole, canSeeFees, canSeeAllVenues, VIEW_MODE_ROLE,
  memberRoles, primaryRole,
} from '../lib/constants';

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
  /* 회비를 코트장별로 걷는 클럽이면 청구 단위마다 문서가 따로 있다.
     feeDocKey(월, null) 은 월 그대로라서, 코트장을 안 쓰는 클럽은
     지금까지 쌓인 문서를 그대로 읽는다 — 이전과 완전히 같다. */
  const feeScopeId = opts.feeScopeId || null;

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
      subFee(clubId, feeDocKey(feeMonth, feeScopeId), setFee),
      subPairs(clubId, (p) => setPairsState({ couples: p?.couples || [], fixedPairs: p?.fixedPairs || [] })),
      subTournaments(clubId, setTournaments),
      subVenues(clubId, setVenues),
      subMatchConfig(clubId, setMatchConfig),
      subPolls(clubId, setPolls),
    ];
    return () => unsubs.forEach((u) => u && u());
  }, [clubId, feeMonth, feeScopeId]);

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
     realStaff  : 실제 역할 기준 운영 담당(회장·총무·운영진·리드) 여부
     isAdmin    : 화면에서 쓰는 값. 보기 모드가 켜져 있으면 그 모드를 따름
     canAppoint : 역할 임명(회장 전용) */
  /* 클럽을 만든 사람은 언제나 회장이다.

     예전 버전은 클럽 생성자에게 '총무'를 줬다. 그 시절에 만든 클럽은
     회장이 아무도 없는데 임명은 회장만 할 수 있어서, 아무도 회장이 될 수
     없는 교착에 빠진다. 그래서 ownerId 는 저장된 역할과 무관하게 회장으로
     인정하고, 아래에서 회원 문서도 조용히 회장으로 올려 준다. */
  const isOwner = !!club && !!me && club.ownerId === me;

  /* 역할은 겸임될 수 있다 — 운영진이면서 리드. 권한 판단은 목록 전체로
     하고, 화면 표시는 그중 가장 넓은 것(대표 역할)으로 한다. */
  const myRoles = useMemo(() => {
    const list = memberRoles(meVal);
    return isOwner && !list.includes(ROLES.PRESIDENT) ? [ROLES.PRESIDENT, ...list] : list;
  }, [meVal, isOwner]);
  const realRole = isOwner ? ROLES.PRESIDENT : primaryRole(meVal);
  const realStaff = !!meVal && myRoles.some(isStaffRole);

  /* 자가 치유 — 소유자인데 역할이 회장이 아니면 한 번만 올려 준다 */
  useEffect(() => {
    if (!clubId || !isOwner || !meVal) return;
    if (normalizeRole(meVal.role) === ROLES.PRESIDENT) return;
    setMemberRole(clubId, me, ROLES.PRESIDENT).catch(() => {});
  }, [clubId, isOwner, meVal?.role]);

  /* 보기 모드가 켜져 있으면 그 역할인 척한다.
     실제 역할보다 넓은 권한은 절대 주지 않는다 — 회원이 회장 모드를 켜도
     아무것도 열리지 않게. (규칙에서도 막히지만 화면에서 먼저 거른다) */
  const viewRole = viewMode ? VIEW_MODE_ROLE[viewMode] : null;
  const effectiveRole = viewRole && realStaff ? viewRole : realRole;

  const isAdmin = isStaffRole(effectiveRole);
  /* 겸임 중 하나라도 회비 권한이 있으면 본다.
     보기 모드로 낮춰 봤을 때는 그 모드를 따른다. */
  const seeFees = canSeeFees(effectiveRole) && myRoles.some(canSeeFees);
  const seeAllVenues = canSeeAllVenues(effectiveRole);
  const canAppoint = canAppointRole(realRole) && !viewMode;
  const isPresident = realRole === ROLES.PRESIDENT;

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
    if (seeAllVenues) return venues;                    // 회장·총무·운영진
    if (effectiveRole === ROLES.LEAD) {                 // 리드 — 내가 맡은 코트장
      return myLeadVenues.length ? myLeadVenues : venues;
    }
    /* 겸임 리드 — 대표 역할이 운영진이라도 맡은 코트가 있으면 같이 본다 */
    if (myRoles.includes(ROLES.LEAD) && myLeadVenues.length) {
      return [...new Set([...myVenues, ...myLeadVenues])];
    }
    return myVenues;                                    // 회원 — 내가 속한 코트장
  }, [seeAllVenues, effectiveRole, venues, myLeadVenues, myVenues, myRoles]);

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

  /* 성별 — 대진표 이름 색에 쓴다. nameOf 와 같은 규칙으로 게스트까지 본다.
     게스트는 회원 문서가 없을 수 있어(타 클럽 사람) 모임에 적힌 값을 쓴다. */
  const genderOf = useMemo(() => {
    const byId = Object.fromEntries(members.map((m) => [m.id, m]));
    const guestGender = {};
    meetings.forEach((mt) => (mt.guests || []).forEach((g) => {
      const key = g.uid || g.name;
      if (key) guestGender[key] = g.gender;
    }));
    return (id) => {
      if (isGuestId(id)) {
        const uid = guestUid(id);
        return guestGender[uid] || byId[uid]?.gender || '';
      }
      return byId[id]?.gender || '';
    };
  }, [members, meetings]);

  return {
    club, members, meetings, posts, guestPosts, courts, rules, fee,
    pairs, tournaments, venues, matchConfig, polls, meVal,
    isAdmin, realStaff, canAppoint, isPresident, viewMode, nameOf, genderOf, loading,
    myLeadVenues, myVenues, scopeVenues,
    realRole, myRoles, effectiveRole, seeFees, seeAllVenues, isOwner,
  };
}
