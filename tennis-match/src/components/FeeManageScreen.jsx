/* ============================================================
   회비 관리 — 회비 현황 · 정기 회비 · 지출 · 일회성 정산을 한 화면에서

   예전엔 홈에 「회비·지출」「회비 알림」「입금 대사」가 따로 있었다. 총무가
   회비 일을 하려면 아이콘 셋을 오가야 했다. 한 칸으로 묶고, 안에서는
   맨 위 드롭다운으로 고른다(탭을 네 개 늘어놓으면 휴대폰에서 글자가 잘린다).

   「회비 알림」은 「회비 현황」으로 이름을 바꿨다 — 그 화면에서 제일 먼저
   보는 것이 납부/미납 숫자이고, 알림은 그 아래에서 보내는 것이다.
   ============================================================ */
import React, { useState } from 'react';
import { View } from 'react-native';
import { Dropdown } from './Dropdown';
import { Dunning } from './DunningScreen';
import { Fees } from './FeesScreen';

export const FEE_SECTIONS = [
  { key: 'status', label: '회비 현황 · 미납 알림' },
  { key: 'income', label: '정기 회비 · 납부 체크' },
  { key: 'expense', label: '지출' },
  { key: 'pool', label: '일회성 정산 (대회·회식)' },
];

export function FeeManage({ dunningProps, feesProps, initial = 'status' }) {
  const [sec, setSec] = useState(initial);
  return (
    <View>
      <Dropdown big title="회비 관리" a11y="회비 관리 항목" value={sec} options={FEE_SECTIONS} onChange={setSec} />
      <View style={{ marginTop: 12 }}>
        {sec === 'status'
          ? <Dunning {...dunningProps} />
          : <Fees {...feesProps} tab={sec} onGoStatus={() => setSec('status')} />}
      </View>
    </View>
  );
}

export default FeeManage;
