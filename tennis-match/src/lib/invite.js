/* ============================================================
   초대 링크 — 초대코드를 링크로 감싸서 카톡·문자로 바로 보낸다.

   초대코드란?
     클럽마다 하나씩 발급되는 6자리 문자열. 이 코드를 아는 사람은
     운영진 승인 없이 곧바로 그 클럽 회원이 된다(= 코드 자체가 초대장).
     그래서 코드는 아무 데나 공개하지 말고 초대할 사람에게만 보낸다.
     코드를 모르는 사람은 클럽 검색 → 가입 신청 → 운영진 승인 경로를 쓴다.

   링크 형식
     앱 설치자용 : tennismatch://join?code=ABC234   ← 누르면 앱이 열리며 코드 자동 입력
     미설치자용 : 안내 문구 + 코드 (앱 설치 후 코드 입력)
   ============================================================ */
import { Share, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';

/** 앱을 여는 딥링크. Expo Go / 개발 빌드에서도 알맞은 prefix 로 생성된다. */
export function inviteUrl(code) {
  const c = String(code || '').toUpperCase();
  try {
    return Linking.createURL('/join', { queryParams: { code: c } });
  } catch (e) {
    return `tennismatch://join?code=${c}`;
  }
}

/** 카톡·문자에 그대로 붙는 초대 문구 */
export function inviteMessage(clubName, code) {
  const c = String(code || '').toUpperCase();
  return [
    `🎾 '${clubName || '테니스클럽'}' 에 초대합니다.`,
    '',
    `초대코드: ${c}`,
    inviteUrl(c),
    '',
    '앱이 설치돼 있으면 위 링크를 누르면 바로 가입됩니다.',
    '설치 전이라면 "테니스매치" 앱을 받은 뒤 초대코드를 입력하세요.',
  ].join('\n');
}

/** 공유 시트 열기 (카톡·문자·메일 등) */
export async function shareInvite(clubName, code) {
  const message = inviteMessage(clubName, code);
  try {
    const res = await Share.share(
      Platform.OS === 'ios' ? { message, url: inviteUrl(code) } : { message },
      { dialogTitle: '초대 링크 보내기' },
    );
    return res.action !== Share.dismissedAction;
  } catch (e) {
    return false;
  }
}

/** 링크만 클립보드에 복사 */
export async function copyInviteUrl(code) {
  await Clipboard.setStringAsync(inviteUrl(code));
}

/** 초대 문구 전체를 클립보드에 복사 */
export async function copyInviteMessage(clubName, code) {
  await Clipboard.setStringAsync(inviteMessage(clubName, code));
}

/** 코드만 복사 */
export async function copyCode(code) {
  await Clipboard.setStringAsync(String(code || '').toUpperCase());
}
