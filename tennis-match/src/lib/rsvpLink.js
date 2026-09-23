/* ============================================================
   카톡 참석 링크 — 앱 쪽

   총무가 [카톡으로 보내기]를 누르면 휴대폰 공유창이 뜨고, 카카오톡에서
   받는 사람을 여러 명 고르면 각자에게 1:1 로 간다. 받은 사람은 링크에서
   자기 이름을 고르고 참석/불참을 누른다(web/rsvp.html). 그 답을 서버
   함수(functions/rsvpLink.js)가 명단에 적는다.

   왜 카카오 친구 목록과 자동으로 짝짓지 않나
     카카오는 **우리 앱에 카카오로 로그인한 친구**만 목록에 내준다. 앱이
     없는 오프라인 회원은 애초에 목록에 없다 — 보내고 싶은 바로 그
     사람들이 빠지는 구조라 짝을 지을 수 없다. 그래서 카카오톡 자체의
     "받는 사람 고르기"를 쓴다. 카카오 SDK·키·새 빌드가 필요 없다.
   ============================================================ */
import { membersForMeeting } from './scheduleView.js';

export const TOKEN_LEN = 32;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** 서버와 같은 모양이어야 한다(functions/rsvpLink.js 의 TOKEN_RE) */
export const validToken = (t) => typeof t === 'string' && /^[A-Za-z0-9]{24,64}$/.test(t);

/**
 * 링크의 열쇠를 만든다.
 * @param bytes 0~255 숫자 배열(길이 TOKEN_LEN 이상). 안전한 난수가 있으면
 *              그걸 넘긴다. 없으면 Math.random 으로 채운다.
 *
 * ⚠️ 이 열쇠를 아는 사람은 오프라인 회원의 참석을 바꿀 수 있다. 추측으로
 *    맞힐 수 없을 만큼 길게(32자, 62가지 글자) 만든다.
 */
export function makeToken(bytes) {
  const b = Array.isArray(bytes) || ArrayBuffer.isView(bytes) ? Array.from(bytes) : [];
  let out = '';
  for (let i = 0; i < TOKEN_LEN; i += 1) {
    const r = b.length > i ? b[i] : Math.floor(Math.random() * 256);
    out += ALPHABET[r % ALPHABET.length];
  }
  return out;
}

/** 링크 주소. 약관과 같은 Firebase 웹 주소를 쓴다. */
export function linkUrl(projectId, clubId, token, meetingId = '') {
  const q = `c=${encodeURIComponent(clubId)}&t=${encodeURIComponent(token)}`
    + (meetingId ? `&m=${encodeURIComponent(meetingId)}` : '');
  return `https://${projectId}.web.app/rsvp?${q}`;
}

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
function whenText(mt) {
  const [y, mo, d] = String(mt?.date || '').split('-').map(Number);
  if (!y) return '';
  const dow = DOW[new Date(y, mo - 1, d).getDay()];
  const t = mt.time ? ` ${mt.time}${mt.endTime ? `~${mt.endTime}` : ''}` : '';
  return `${mo}/${d}(${dow})${t}`;
}

/**
 * 카톡으로 보낼 글.
 * ⚠️ 첫 줄에 **무엇을 해 달라는지**를 쓴다. 카톡 알림 미리보기에는 첫
 *    줄만 보인다 — 거기서 "참석 여부"가 안 보이면 열어 보지 않는다.
 * ⚠️ "이름을 고르라"는 말을 미리 해 둔다. 링크를 열자마자 이름 목록이
 *    나오면 "이게 뭐지?" 하고 닫는다.
 */
export function shareMessage({ clubName, meeting, url }) {
  const head = `🎾 ${clubName ? `[${clubName}] ` : ''}참석 여부를 알려 주세요`;
  const line = [whenText(meeting), meeting?.place].filter(Boolean).join(' · ');
  return [
    head,
    line,
    '',
    '아래 링크에서 이름을 고르고 [참석] / [불참]을 눌러 주세요.',
    '(한 번 고르면 다음부터는 이름을 안 골라도 됩니다)',
    url,
  ].filter((x, i) => x !== '' || i === 2).join('\n');
}

const isOffline = (id) => String(id || '').startsWith('local:');

/** 이 모임에서 링크로 답할 사람 — 앱이 없는 오프라인 회원 */
export function offlineTargets(members, meeting) {
  return membersForMeeting(members, meeting).filter((m) => isOffline(m.id));
}

/**
 * 링크로 들어온 답인가.
 * 오프라인 회원은 앱에서 스스로 누를 방법이 없다. 그러니 오프라인 회원의
 * 답이 **본인 이름으로** 적혀 있으면 링크로 온 것이다. 운영진이 대신
 * 눌렀으면 운영진 이름이 적힌다. 따로 필드를 두지 않고 이걸로 구별한다.
 */
export function answeredViaLink(meeting, id) {
  if (!isOffline(id)) return false;
  const v = (meeting?.rsvp || {})[id];
  if (v !== 'yes' && v !== 'no') return false;
  return (meeting?.rsvpBy || {})[id] === id;
}

/** 오프라인 대상 중 아직 답이 없는 사람 수 — 버튼 옆에 적어 준다 */
export function offlineUnanswered(members, meeting) {
  return offlineTargets(members, meeting)
    .filter((m) => {
      const v = (meeting?.rsvp || {})[m.id];
      return v !== 'yes' && v !== 'no';
    }).length;
}

export default {
  TOKEN_LEN, validToken, makeToken, linkUrl, shareMessage,
  offlineTargets, answeredViaLink, offlineUnanswered,
};
