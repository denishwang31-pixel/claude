/* ============================================================
   오늘 날짜 'YYYY-MM-DD' — 휴대폰의 현지 날짜(한국이면 한국 날짜)

   ⚠️ 예전에는 곳곳에서 new Date().toISOString().slice(0, 10) 을 썼다.
      toISOString 은 **세계 표준시(UTC)** 라서 한국 새벽 0시~9시에는 "어제"가 나온다.
      그래서 아침 일찍 일정 탭을 열면 이미 지난 어제 모임이 맨 위에 남아 있었다
      (앱 주인: "지난 일정이 사라지고 나면 임의의 날짜 일정이 보인다").
      날짜가 필요한 곳은 전부 이것을 쓴다.
   ============================================================ */
const pad = (n) => String(n).padStart(2, '0');

/** 기기 현지 시각 기준 오늘 */
export function todayYmd(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export default todayYmd;
