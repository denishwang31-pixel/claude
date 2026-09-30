/* ============================================================
   출석부 — 판단만 모았다 (화면: components/AttendanceScreen.jsx, 검사: scripts/test-attendance.mjs)

   예전엔 모임마다 회원 전원을 하나씩 [출석]/[결석] 눌러야 했다. 그런데 이미
   참석 투표가 있다 — 참석이라 한 사람은 대개 왔고, 불참이라 한 사람은 안 왔다.
   그래서 투표로 **미리 채워 두고**, 운영진은 실제와 다른 사람만 고친 뒤 [확정]한다
   (앱 주인). 확정한 출석부는 목록에서 빠진다.

   meeting.attendance          { memberId: true|false } — 운영진이 직접 고친 값(확정하면 전원 기록)
   meeting.attendanceConfirmed true 면 확정된 출석부
   ============================================================ */
import { membersForMeeting } from './scheduleView.js';

/**
 * 한 사람의 출석 — 직접 적은 값이 있으면 그것, 없으면 참석 투표로.
 * 미응답은 결석으로 둔다(오겠다는 말이 없었다). 고칠 수 있다.
 * @returns {{ present: boolean, source: 'record'|'yes'|'no'|'none' }}
 */
export function effectiveAttendance(meeting, memberId) {
  const rec = meeting?.attendance?.[memberId];
  if (rec === true || rec === false) {
    return { present: rec, source: 'record' };
  }
  const v = meeting?.rsvp?.[memberId];
  if (v === 'yes') return { present: true, source: 'yes' };
  if (v === 'no') return { present: false, source: 'no' };
  return { present: false, source: 'none' };
}

/** 투표와 다르게 고친 사람인가 — 화면에 「고침」 표시 */
export function changedFromVote(meeting, memberId) {
  const rec = meeting?.attendance?.[memberId];
  if (rec !== true && rec !== false) return false;
  return rec !== (meeting?.rsvp?.[memberId] === 'yes');
}

/**
 * 이 모임의 출석부에 올릴 사람 — 그 코트장 회원(코트장 미지정이면 전원).
 * 코트장 밖이라도 참석 투표를 했거나 출석이 적힌 사람은 빼지 않는다(예외로 온 사람).
 * 이름순.
 */
export function attendanceTargets(members, meeting) {
  const base = membersForMeeting(members, meeting);
  const ids = new Set(base.map((m) => m.id));
  const extra = (members || []).filter((m) => m && m.id && !ids.has(m.id)
    && (meeting?.rsvp?.[m.id] === 'yes' || meeting?.attendance?.[m.id] === true));
  return [...base, ...extra].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko'));
}

/** 확정할 때 저장할 전체 출석 — 출석부에 오른 모든 사람의 값을 적어 둔다 */
export function confirmMap(members, meeting) {
  const map = {};
  attendanceTargets(members, meeting).forEach((m) => { map[m.id] = effectiveAttendance(meeting, m.id).present; });
  return map;
}

/** 출석 · 결석 수 */
export function attendanceCount(members, meeting) {
  let yes = 0; let no = 0;
  attendanceTargets(members, meeting).forEach((m) => {
    if (effectiveAttendance(meeting, m.id).present) yes += 1; else no += 1;
  });
  return { yes, no };
}

/**
 * 아직 확정하지 않은 출석부 — 오늘까지의 모임, 취소·확정 빼고, 최근 것부터 limit 개.
 */
export function openAttendance(meetings, today, limit = 20) {
  return (meetings || [])
    .filter((m) => m && m.date && !m.canceled && m.date <= today && !m.attendanceConfirmed)
    .sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')))
    .slice(0, limit);
}

/** 최근 확정한 출석부(다시 열기용) */
export function confirmedAttendance(meetings, limit = 5) {
  return (meetings || [])
    .filter((m) => m && m.attendanceConfirmed && !m.canceled)
    .sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')))
    .slice(0, limit);
}
