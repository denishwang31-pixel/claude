/* ============================================================
   업데이트 상태 — 지금 어떤 버전이 돌고 있는지 보이게

   왜 필요한가
     `eas update` 로 새 코드를 올려도 앱에서는 확인할 길이 없었다.
     "앱을 껐다 켰는데 그대로다"가 되면 원인이 셋인데 구분이 안 된다.
       1. 이 APK 가 expo-updates 없이 빌드됐다 (OTA 를 아예 못 받는다)
       2. 받긴 받았는데 아직 적용 전이다
       3. 업데이트가 실제로 발행되지 않았다

     expo-updates 는 기본적으로 "앱을 켤 때 뒤에서 내려받고, 다음에 켤 때
     적용"한다. 그래서 껐다 켜는 것을 두 번 해야 바뀐다 — 이걸 모르면
     계속 안 바뀐다고 느낀다. 여기서 [지금 확인]을 누르면 내려받고
     바로 다시 시작한다.

   expo-updates 가 없는 빌드(옛 APK)에서도 죽지 않아야 한다.
   그래서 require 를 try 로 감싸고, 없으면 그 사실 자체를 알려 준다.
   ============================================================ */
import React, { useEffect, useState } from 'react';
import { View, Text, Alert, Platform } from 'react-native';
import Constants from 'expo-constants';
import { Card, Btn, Chip } from './ui';
import { C, S, F } from '../lib/theme';

/* 옛 빌드에는 이 모듈이 아예 없다. 그때 화면이 죽으면 안 된다. */
let Updates = null;
try {
  // eslint-disable-next-line global-require
  Updates = require('expo-updates');
} catch (e) {
  Updates = null;
}

const shortId = (id) => (id ? String(id).slice(0, 8) : '—');

export function UpdateStatus({ flash }) {
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState(null);

  const appVersion = Constants.expoConfig?.version || '?';
  const supported = !!Updates && typeof Updates.checkForUpdateAsync === 'function';

  useEffect(() => {
    if (!supported) return;
    setInfo({
      channel: Updates.channel || '(없음)',
      runtimeVersion: Updates.runtimeVersion || '?',
      updateId: Updates.updateId,
      /* embedded = APK 에 같이 들어 있던 원본. 즉 아직 OTA 를 한 번도
         받지 않은 상태다. 이걸 구분해 주지 않으면 "받았는데 왜 그대로냐"
         와 "아직 못 받았다"가 같아 보인다. */
      embedded: Updates.isEmbeddedLaunch,
      createdAt: Updates.createdAt,
    });
  }, [supported]);

  const check = async () => {
    if (!supported) return;
    setBusy(true);
    try {
      const res = await Updates.checkForUpdateAsync();
      if (!res.isAvailable) {
        setBusy(false);
        flash?.('이미 최신입니다');
        return;
      }
      await Updates.fetchUpdateAsync();
      Alert.alert(
        '업데이트를 받았습니다',
        '앱을 다시 시작하면 적용됩니다.',
        [
          { text: '나중에', style: 'cancel', onPress: () => setBusy(false) },
          { text: '지금 다시 시작', onPress: () => Updates.reloadAsync() },
        ],
      );
    } catch (e) {
      setBusy(false);
      flash?.(`업데이트 확인 실패: ${e?.message || e}`);
    }
  };

  /* OTA 를 못 받는 빌드 — 원인을 정확히 알려 준다.
     "안 된다"만 알면 며칠을 헤맨다. */
  if (!supported) {
    return (
      <Card>
        <Text style={[F.bodyBold, { color: C.warn }]}>이 앱은 자동 업데이트를 받을 수 없습니다</Text>
        <Text style={{ fontSize: 12, color: C.sub, marginTop: 6, lineHeight: 18 }}>
          지금 설치된 앱은 자동 업데이트 기능이 들어가기 전에 만들어졌습니다.
          `eas update` 로 올린 변경은 이 앱에 오지 않습니다.
          {'\n\n'}
          한 번만 새로 빌드해서 설치하면, 그 뒤로는 앱을 껐다 켜는 것만으로
          바뀐 내용이 들어옵니다.
        </Text>
        <Text style={{ fontSize: 11, color: C.faint, marginTop: 8 }}>
          앱 버전 {appVersion} · {Platform.OS}
        </Text>
      </Card>
    );
  }

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={[F.bodyBold, { flex: 1 }]}>업데이트</Text>
        <Chip tone={info?.embedded ? 'default' : 'green'}>
          {info?.embedded ? '설치 그대로' : '업데이트 적용됨'}
        </Chip>
      </View>

      <Text style={{ fontSize: 11.5, color: C.sub, marginTop: 8, lineHeight: 17 }}>
        앱 버전 {appVersion} · 채널 {info?.channel}
        {'\n'}
        번들 {shortId(info?.updateId)}
        {info?.createdAt ? ` · ${new Date(info.createdAt).toLocaleString('ko-KR')}` : ''}
      </Text>

      <Text style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 16 }}>
        새 내용은 앱을 켤 때 뒤에서 내려받고 다음에 켤 때 적용됩니다.
        지금 바로 받으려면 아래를 누르세요.
      </Text>

      <View style={{ marginTop: S.md }}>
        <Btn full disabled={busy} onPress={check}>
          {busy ? '확인 중…' : '지금 업데이트 확인'}
        </Btn>
      </View>
    </Card>
  );
}

export default UpdateStatus;
