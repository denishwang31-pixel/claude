/* ============================================================
   약관 · 개인정보처리방침 + 계정 삭제로 가는 길

   왜 계정 삭제를 여기 붙였나
     스토어 심사는 "가입할 수 있으면 지울 수도 있어야 한다"를 본다.
     그리고 이용자가 그 길을 실제로 찾을 수 있어야 한다. 약관을 읽다가
     "그만두고 싶다"고 생각하는 자리가 바로 여기다.

   빈칸 경고
     법적 문서에 [[대괄호]] 가 남은 채로 스토어에 올라가면 그대로
     심사에 걸리고, 걸리지 않아도 이용자가 본다. 그래서 남아 있으면
     화면 맨 위에 크게 띄운다 — 개발 중에는 눈에 걸리도록.
   ============================================================ */
import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { TERMS, PRIVACY, pendingBlanks } from '../lib/legalText';
import { Card, SectionTitle, Chip, Btn } from './ui';
import { C, F } from '../lib/theme';

export function Legal() {
  const [tab, setTab] = useState('privacy');   // privacy | terms
  const router = useRouter();
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

      <SectionTitle>계정</SectionTitle>
      <Card>
        <Text style={{ fontSize: 12, color: C.sub, lineHeight: 18 }}>
          계정을 지우면 로그인 정보와 개인정보가 삭제됩니다. 되돌릴 수 없습니다.
        </Text>
        <View style={{ marginTop: 12 }}>
          <Btn full tone="outline"
            onPress={() => router.setParams({ open: 'deleteaccount', from: 'more' })}>
            계정 삭제
          </Btn>
        </View>
      </Card>
    </ScrollView>
  );
}

export default Legal;
