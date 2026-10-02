/* ============================================================
   약관 · 개인정보처리방침

   계정 삭제는 [내 프로필] 맨 아래로 옮겼다(2026-10-02 앱 주인 — 여기선 찾기 어렵다).
     스토어 심사는 "가입할 수 있으면 지울 수도 있어야 한다"와 그 길을 찾을 수
     있는지를 본다. 약관을 읽다 찾는 사람도 있으니 여기엔 가는 길만 한 줄 남긴다.

   빈칸 경고
     법적 문서에 [[대괄호]] 가 남은 채로 스토어에 올라가면 그대로
     심사에 걸리고, 걸리지 않아도 이용자가 본다. 그래서 남아 있으면
     화면 맨 위에 크게 띄운다 — 개발 중에는 눈에 걸리도록.
   ============================================================ */
import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { TERMS, PRIVACY, pendingBlanks } from '../lib/legalText';
import { Card, Chip } from './ui';
import { C } from '../lib/theme';

export function Legal() {
  const [tab, setTab] = useState('privacy');   // privacy | terms
  const blanks = useMemo(() => pendingBlanks(), []);
  const body = tab === 'privacy' ? PRIVACY : TERMS;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      {blanks.length > 0 && (
        <Card style={{ backgroundColor: C.warnBg, marginBottom: 10 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: C.warn }}>
            아직 채우지 않은 곳이 {blanks.length}군데 있습니다
          </Text>
          <Text style={{ fontSize: 11, color: C.text, marginTop: 6, lineHeight: 17 }}>
            이 상태로 스토어에 올리면 안 됩니다. `src/lib/legalText.js` 에서
            아래 자리를 채워 주세요.
          </Text>
          <View style={{ marginTop: 8 }}>
            {blanks.map((b) => (
              <Text key={b} style={{ fontSize: 11, color: C.warn, marginTop: 2 }}>· {b}</Text>
            ))}
          </View>
        </Card>
      )}

      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
        <Chip tone={tab === 'privacy' ? 'green' : 'outline'} onPress={() => setTab('privacy')}>
          개인정보처리방침
        </Chip>
        <Chip tone={tab === 'terms' ? 'green' : 'outline'} onPress={() => setTab('terms')}>
          이용약관
        </Chip>
      </View>

      <Card>
        <Text selectable style={{ fontSize: 12.5, color: C.text, lineHeight: 21 }}>
          {body}
        </Text>
      </Card>

      <Text style={{ fontSize: 11.5, color: C.faint, marginTop: 14, lineHeight: 17 }}>
        계정 삭제는 [더보기] → [내 프로필] 맨 아래에 있습니다.
      </Text>
    </ScrollView>
  );
}

export default Legal;
