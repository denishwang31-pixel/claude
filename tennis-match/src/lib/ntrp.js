/* ============================================================
   NTRP (National Tennis Rating Program) 관리
   - 공식 NTRP는 자가평가 가이드라인 기반. 국내 동호회는 기준이 모호해
     ①셀프평가 ②운영진 인증 ③회원 투표 3가지를 병행 관리한다.
   - 최종 표시 점수(effectiveNtrp) 우선순위: 운영진 인증 > 투표 중앙값 > 셀프
   저장 위치:
     members/{uid}.ntrpSelf      셀프 평가 (본인)
     members/{uid}.ntrpCertified 운영진 인증 (총무/운영진)
     members/{uid}.ntrpVotes     { voterUid: number }  회원 투표
   ============================================================ */

/** 0.5 단위 등급 (국내 동호회 실사용 구간: 2.0 ~ 5.0) */
export const NTRP_LEVELS = [
  {
    v: 2.0,
    label: '2.0 입문',
    short: '랠리 시작 단계',
    desc: '코트에서 공을 맞히는 데 집중하는 단계. 랠리가 2~3회 이상 이어지기 어렵고, 서브는 넣는 것 자체가 목표입니다.',
    checks: ['라켓 그립·기본 스윙을 배우는 중', '포핸드로 공을 넘길 수 있음', '경기 규칙·점수 세는 법을 익히는 중'],
  },
  {
    v: 2.5,
    label: '2.5 초급',
    short: '느린 랠리 가능',
    desc: '느린 속도의 공은 주고받을 수 있습니다. 코트 위치 감각이 생기기 시작하지만 방향 조절은 아직 어렵습니다.',
    checks: ['느린 랠리를 4회 이상 이어감', '언더/오버 서브를 절반 정도 성공', '복식에서 서 있을 위치를 앎'],
  },
  {
    v: 3.0,
    label: '3.0 초중급',
    short: '중간 속도 랠리 안정',
    desc: '중간 속도의 공에 대해 포핸드는 비교적 안정적입니다. 백핸드와 발리는 아직 편차가 큽니다.',
    checks: ['포핸드 랠리가 안정적', '백핸드는 되지만 일관성 부족', '첫 서브 성공률 50% 내외', '복식 기본 전형(평행/일자) 이해'],
  },
  {
    v: 3.5,
    label: '3.5 중급',
    short: '방향 조절 가능',
    desc: '공의 방향을 어느 정도 의도대로 보낼 수 있고, 발리·스매시를 시도합니다. 동호회 주력 구간입니다.',
    checks: ['포/백 모두 코스 조절 시도 가능', '네트 플레이에 부담이 적음', '세컨 서브에 회전을 시도', '경기 중 전술적 선택을 함'],
  },
  {
    v: 4.0,
    label: '4.0 중상급',
    short: '안정+공격 전환',
    desc: '랠리 중 기회를 만들어 공격으로 전환할 수 있습니다. 스핀·슬라이스 등 구질 변화를 활용합니다.',
    checks: ['긴 랠리에서 실책이 적음', '스핀/슬라이스 구사', '서브 앤 발리 또는 리턴 대시 가능', '상대 약점을 공략'],
  },
  {
    v: 4.5,
    label: '4.5 상급',
    short: '구질·전술 완성도',
    desc: '파워와 컨트롤을 동시에 갖추고, 상황에 맞는 구질 선택이 자연스럽습니다. 지역 대회 입상권입니다.',
    checks: ['강한 첫 서브 + 안정적 세컨', '높은 타점 처리 능숙', '경기 운영(페이스 조절) 가능'],
  },
  {
    v: 5.0,
    label: '5.0 최상급',
    short: '준선수급',
    desc: '전국 단위 대회에서 경쟁 가능한 수준. 전 구질을 안정적으로 구사하며 약점이 거의 없습니다.',
    checks: ['모든 샷을 의도대로 구사', '경기 전체를 설계', '대회 상위 입상 경험'],
  },
];

export const NTRP_MIN = 2.0;
export const NTRP_MAX = 5.0;

export const levelInfo = (v) =>
  NTRP_LEVELS.find((l) => Math.abs(l.v - Number(v)) < 0.001) || null;

/** 투표 중앙값(이상치에 강함). 표는 {voterUid: number} */
export function voteMedian(votes) {
  const arr = Object.values(votes || {}).map(Number).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b);
  if (!arr.length) return null;
  const mid = Math.floor(arr.length / 2);
  const med = arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
  return Math.round(med * 2) / 2; // 0.5 단위로 정규화
}

/** 회원 문서 → 최종 표시 점수와 근거 */
export function effectiveNtrp(member) {
  if (!member) return { value: null, source: 'none', label: '미설정' };
  if (member.ntrpCertified != null) {
    return { value: member.ntrpCertified, source: 'certified', label: '운영진 인증' };
  }
  const med = voteMedian(member.ntrpVotes);
  if (med != null) {
    return { value: med, source: 'vote', label: `회원 투표(${Object.keys(member.ntrpVotes).length}명)` };
  }
  if (member.ntrpSelf != null) {
    return { value: member.ntrpSelf, source: 'self', label: '셀프 평가' };
  }
  return { value: null, source: 'none', label: '미설정' };
}

/** 구력(테니스 시작일 → "N년 M개월") */
export function careerText(startedAt) {
  if (!startedAt) return null;
  const s = new Date(startedAt);
  if (Number.isNaN(s.getTime())) return null;
  const now = new Date();
  let months = (now.getFullYear() - s.getFullYear()) * 12 + (now.getMonth() - s.getMonth());
  if (now.getDate() < s.getDate()) months -= 1;
  if (months < 0) return '시작 예정';
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m}개월`;
  return m === 0 ? `${y}년` : `${y}년 ${m}개월`;
}

/** 대회 참가자격 등에 쓰는 구력 개월 수 */
export function careerMonths(startedAt) {
  if (!startedAt) return null;
  const s = new Date(startedAt);
  if (Number.isNaN(s.getTime())) return null;
  const now = new Date();
  let months = (now.getFullYear() - s.getFullYear()) * 12 + (now.getMonth() - s.getMonth());
  if (now.getDate() < s.getDate()) months -= 1;
  return Math.max(0, months);
}
