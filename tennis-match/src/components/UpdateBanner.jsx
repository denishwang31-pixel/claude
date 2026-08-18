/* ============================================================
   업데이트 대기 알림 — 받아 놨는데 아직 적용 전일 때만 뜬다

   expo-updates 는 앱을 켤 때 새 코드를 뒤에서 내려받고, 다음에 켤 때
   적용한다. 시작을 빠르게 하려는 설계라 그 자체는 맞다. 문제는 사용자
   입장에서 "껐다 켰는데 그대로다"로 보인다는 것 — 두 번 껐다 켜야
   한다는 걸 외우고 있어야 한다.

   그래서 받아 놓은 것이 있을 때만 한 줄 띄우고, 누르면 바로 적용한다.
   평소에는 아무것도 그리지 않는다. 항상 떠 있는 배너는 곧 안 보인다.
   ============================================================ */
import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { C, R } from '../lib/theme';

/* 옛 빌드에는 이 모듈이 없다. 그때도 화면이 죽으면 안 된다. */
let Updates = null;
try {
  // eslint-disable-next-line global-require
  Updates = require('expo-updates');
} catch (e) {
  Updates = null;
}

export function UpdateBanner() {
  const [applying, setApplying] = useState(false);

  /* useUpdates 가 없는 버전이면 배너를 아예 쓰지 않는다.
     훅은 조건부로 호출할 수 없으므로, 이 컴포넌트를 통째로 비활성화한다. */
  if (!Updates || typeof Updates.useUpdates !== 'function') return null;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { isUpdatePending } = Updates.useUpdates();
  if (!isUpdatePending) return null;

  return (
    <Pressable
      onPress={async () => {
        setApplying(true);
        try { await Updates.reloadAsync(); } catch (e) { setApplying(false); }
      }}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: C.greenSoft,
        borderWidth: 1, borderColor: C.green,
        borderRadius: R.md,
        paddingHorizontal: 12, paddingVertical: 10,
        marginBottom: 12,
      }}>
      <Text style={{ fontSize: 14 }}>⬇️</Text>
      <Text style={{ flex: 1, fontSize: 12.5, color: C.green, fontWeight: '700' }}>
        {applying ? '적용하는 중…' : '새 버전이 준비되었습니다'}
      </Text>
      {!applying && (
        <Text style={{ fontSize: 12, color: C.green, fontWeight: '800' }}>지금 적용 →</Text>
      )}
    </Pressable>
  );
}

export default UpdateBanner;
