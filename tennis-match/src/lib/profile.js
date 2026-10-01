/* 내 프로필 — 화면(ProfileScreen)이 쓰는 판단만 모았다 */

/** 어떤 방법으로 로그인했나 — 카카오·네이버는 커스텀 토큰이라 uid 앞머리로 안다 */
export function loginMethodOf(user) {
  if (!user) return '';
  const uid = String(user.uid || '');
  if (uid.startsWith('kakao:')) return '카카오';
  if (uid.startsWith('naver:')) return '네이버';
  if (user.isAnonymous) return '둘러보기(계정 없음)';
  const ids = (user.providerData || []).map((p) => p?.providerId);
  if (ids.includes('google.com')) return '구글';
  if (ids.includes('apple.com')) return 'Apple';
  if (ids.includes('password')) return '이메일';
  return '';
}

/**
 * 저장할 값 만들기. 본인이 고칠 수 있는 칸만 담는다(부수·조·역할·코트장은 운영진 몫).
 * @returns { patch } 또는 { error }
 */
export function profilePatch(draft, member) {
  const name = String(draft?.name || '').trim();
  if (!name) return { error: '이름을 입력하세요' };
  if (name.length > 20) return { error: '이름은 20자까지입니다' };
  const patch = {
    name,
    gender: draft.gender === 'F' ? 'F' : 'M',
    region: draft.region || '',
  };
  /* 구력은 한 번 들어가면 잠긴다(대회 자격) — 비어 있을 때만 받는다 */
  const v = String(draft.startedAt || '').trim();
  if (!member?.startedAt && v) {
    const norm = /^\d{4}-\d{2}$/.test(v) ? `${v}-01` : v;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(norm) || Number.isNaN(new Date(norm).getTime())) return { error: '테니스 시작 년월을 확인하세요' };
    patch.startedAt = norm;
  }
  return { patch };
}

export default { loginMethodOf, profilePatch };
