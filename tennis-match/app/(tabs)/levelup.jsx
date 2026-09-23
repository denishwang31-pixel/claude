/* ============================================================
   레벨업 — 원포인트 · 용품 · 코치

   왜 한 탭으로 묶었나
     하단 탭이 여섯 개(홈·일정·대진·용품·원포인트·더보기)였다. 휴대폰
     권장은 다섯 개까지다. 여섯 칸이면 글자가 좁아지고 누르기도 어렵다.

     셋은 "클럽 일"이 아니라 **내 테니스가 나아지는 것**이라는 공통점이
     있다. 홈·일정·대진이 "우리 클럽"이라면 이 탭은 "나"다.

   왜 이름이 「레벨업」인가 — 사용자와 여러 번 고쳐 정했다
     · 「레슨」이 들어가면 **영업으로 읽혀** 안 들어온다. 부담 없이 들어와
       자기 부족한 걸 보다가 레슨으로 이어지게 하려는 것이라, 입구는
       공짜로 얻는 것만 약속해야 한다.
     · 「원포인트」는 좋은 말이지만 **부모 이름으로는 좁다**. 원포인트는
       용품·코치와 같은 층의 한 갈래라, 그 둘을 품으면 계층이 틀린다.
     · 영어 Level Up 은 한글 탭들 사이에서 혼자 튀어 광고처럼 보인다.

   ⚠️ 코치는 여기서 **맨 뒤**다. 영상을 보다 "나 이거 안 되는데" 하는
      순간이 코치가 가장 반가운 순간이다. 코치를 앞세우면 이 탭 전체가
      레슨 광고로 읽힌다.

   영상을 보다 [코치 보기 ›]를 누르면 이 칸이 「코치」로 바뀐다(새 화면을
   쌓지 않는다). 영상이 없을 때 [용품 둘러보기 ›]도 같은 식이다.

   처음 열면 늘 원포인트 — 사람을 불러들이는 쪽이다. 앱이 켜져 있는
   동안은 탭 화면이 살아 있으므로 보던 칸이 그대로 남는다.
   ============================================================ */
import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { useApp } from '../_layout';
import { GearScreen } from '../../src/components/GearScreen';
import { OnePointScreen } from '../../src/components/onepoint/OnePointScreen';
import { CoachScreen } from '../../src/components/CoachScreen';
import { LevelupTop } from '../../src/components/LevelupTop';
import { C, R } from '../../src/lib/theme';

export const LEVELUP_TABS = [
  { key: 'tips', label: '원포인트' },
  { key: 'gear', label: '용품' },
  { key: 'coach', label: '코치' },
];

export default function LevelUp() {
  const { me } = useApp();
  const [tab, setTab] = useState('tips');
  const [toast, setToast] = useState(null);
  /* 원포인트 영상의 [코치 보기 ›]로 올 때 바로 열 코치 */
  const [coachOpen, setCoachOpen] = useState(null);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2200); };

  /* 칸 나누기가 화면 첫 줄이다(제목·부제 없음 — 탭바에 이미 「레벨업」이
     보인다). 세 칸이 같은 머리를 쓰고, 각 칸은 오른쪽 버튼만 채운다. */
  const renderTop = ({ right = null, beside = null } = {}) => (
    <LevelupTop options={LEVELUP_TABS} value={tab} onChange={setTab} right={right} beside={beside} />
  );

  if (tab === 'gear') return <GearScreen title="용품" renderTop={renderTop} />;
  if (tab === 'tips') {
    return (
      <OnePointScreen
        renderTop={renderTop}
        onGoCoach={(coachId) => { setCoachOpen(coachId || null); setTab('coach'); }}
        onGoGear={() => setTab('gear')}
      />
    );
  }

  /* 코치 화면은 상세·내 프로필에서 자기 머리(‹ 뒤로)를 쓰므로 머리를 넘겨준다 */
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <CoachScreen uid={me} flash={flash} renderTop={renderTop}
        openId={coachOpen} onOpened={() => setCoachOpen(null)} />
      {toast && (
        <View style={{
          position: 'absolute', bottom: 24, alignSelf: 'center', backgroundColor: C.ink,
          paddingHorizontal: 16, paddingVertical: 11, borderRadius: R.md,
        }}>
          <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '700' }}>{toast}</Text>
        </View>
      )}
    </View>
  );
}
