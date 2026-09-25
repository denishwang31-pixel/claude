/* ============================================================
   앱으로 들어오는 주소 거르기 (expo-router)

   로그인 창이 끝나면 앱 주소로 돌아온다
     구글   com.donghyun.tennismatch:/oauthredirect?code=…
     카카오·네이버  com.donghyun.tennismatch://oauth?token=…
   이 주소는 로그인 창(expo-web-browser)이 받아서 처리한다. 그런데 화면 라우터도
   같은 주소를 받아 "/oauth" 라는 없는 화면으로 가려 한다 — 그러면 로그인은 됐는데
   「화면을 찾을 수 없음」이 번쩍 뜬다. 그래서 여기서 화면 이동만 뺀다.

   ⚠️ 판단은 src/lib/authReturn.js (검사 있음). 여기는 연결만.
   ============================================================ */
import { routeForIncoming } from '../src/lib/authReturn';

export function redirectSystemPath({ path, initial }) {
  return routeForIncoming(path, initial);
}
