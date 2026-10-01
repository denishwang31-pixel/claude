/* 내 프로필 — 더보기 › 내 활동 맨 위, 홈의 내 이름을 눌러도 온다

   예전엔 내 정보를 고치려면 [회원 목록]에서 내 이름을 찾아 눌러야 했다.
   아무도 거기서 찾지 않는다(앱 주인: "내 프로필 조회 및 수정이 없어").

   본인이 고치는 것: 이름 · 성별 · 활동 지역 · 테니스 시작 년월(처음 한 번)
   보기만 하는 것: 부수 · 조 · 역할 · 소속 코트장(운영진이 정한다) · NTRP · 로그인 방법
   생년월일·전화번호는 받지 않는다 — 클럽 운영에 필요 없고, 받으면 가입을 망설이게 된다. */
import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { updateMemberProfile } from '../lib/firestore';
import { saveMyProfile } from '../lib/auth';
import { auth } from '../../firebaseConfig';
import { BUSU, memberRoles, isStaffRole } from '../lib/constants';
import { effectiveNtrp, careerText } from '../lib/ntrp';
import { loginMethodOf, profilePatch } from '../lib/profile';
import { Label, MonthField } from './pickers';
import { RegionPicker } from './RegionPicker';
import { Segmented } from './native';
import { Card, SectionTitle, Chip, Btn, Field } from './ui';
import { C, S, R, F } from '../lib/theme';

const Row = ({ k, v, onPress, first }) => (
  <View style={{
    flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 12,
    borderTopWidth: first ? 0 : 1, borderTopColor: C.border,
  }}>
    <Text style={{ width: 84, fontSize: 13, color: C.sub }}>{k}</Text>
    <Text style={{ flex: 1, fontSize: 14, color: C.text, fontWeight: '600' }}>{v || '—'}</Text>
    {onPress && <Btn small tone="ghost" onPress={onPress}>보기</Btn>}
  </View>
);

export function Profile({ clubId, club, me, meVal, venues = [], flash, onOpen }) {
  const [editing, setEditing] = useState(false);
  const [d, setD] = useState({});
  const [saving, setSaving] = useState(false);
  const m = meVal || {};
  const eff = effectiveNtrp(m);
  const method = loginMethodOf(auth?.currentUser);
  const email = auth?.currentUser?.email || '';
  const myVenues = (m.venueIds || []).map((id) => venues.find((v) => v.id === id)?.name).filter(Boolean);

  const start = () => {
    setD({
      name: m.name || '', gender: m.gender || 'M',
      region: m.region || '', startedAt: m.startedAt ? m.startedAt.slice(0, 7) : '',
    });
    setEditing(true);
  };

  const save = async () => {
    const { patch, error } = profilePatch(d, m);
    if (error) return flash(error);
    setSaving(true);
    try {
      if (clubId && meVal) await updateMemberProfile(clubId, me, patch);
      await saveMyProfile(me, patch);
      setEditing(false);
      flash('저장했습니다');
    } catch (e) {
      flash('저장하지 못했습니다. 잠시 뒤 다시 해 주세요');
    }
    return setSaving(false);
  };

  return (
    <View>
      {/* 머리 — 나는 누구인가 */}
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{
          width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
          backgroundColor: m.gender === 'F' ? C.femaleBg : C.maleBg,
        }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: m.gender === 'F' ? C.female : C.male }}>{(m.name || '?')[0]}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[F.h2, { fontSize: 20 }]}>{m.name || '이름 없음'}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
            {memberRoles(m).filter(isStaffRole).map((r) => <Chip key={r} tone="green">{r}</Chip>)}
            {!!m.grade && <Chip tone="lime">{m.grade}조</Chip>}
            {!!m.busu && <Chip tone="soft">{m.busu}</Chip>}
            {eff.value != null && <Chip tone="outline">NTRP {eff.value.toFixed(1)}</Chip>}
          </View>
        </View>
        {!editing && <Btn small onPress={start}>수정</Btn>}
      </Card>

      {!editing ? (
        <>
          <SectionTitle>내 정보</SectionTitle>
          <Card style={{ paddingVertical: 4 }}>
            <Row first k="이름" v={m.name} />
            <Row k="성별" v={m.gender === 'F' ? '여' : m.gender === 'M' ? '남' : ''} />
            <Row k="활동 지역" v={m.region} />
            <Row k="구력" v={m.startedAt ? `${m.startedAt.slice(0, 7)} 시작 · ${careerText(m.startedAt)}` : '미입력'} />
          </Card>

          <SectionTitle hint="운영진이 정합니다">클럽에서</SectionTitle>
          <Card style={{ paddingVertical: 4 }}>
            <Row first k="클럽" v={club?.name} />
            <Row k="역할" v={memberRoles(m).join(' · ')} />
            <Row k="부수" v={m.busu ? `${m.busu} · ${BUSU.find((b) => b.key === m.busu)?.desc || ''}` : '미배정'} />
            <Row k="클럽 조" v={m.grade ? `${m.grade}조` : '미배정'} />
            <Row k="소속 코트장" v={myVenues.join(', ') || '전체'} />
            <Row k="NTRP" v={eff.value != null ? eff.value.toFixed(1) : '미설정'} onPress={() => onOpen?.('ntrp')} />
          </Card>

          <SectionTitle>로그인</SectionTitle>
          <Card style={{ paddingVertical: 4 }}>
            <Row first k="로그인 방법" v={method} />
            {!!email && <Row k="이메일" v={email} />}
          </Card>
          <Text style={{ fontSize: 11, color: C.faint, marginTop: 10, lineHeight: 16 }}>
            생년월일·전화번호는 받지 않습니다. 부수·조·역할·소속 코트장은 운영진이 정합니다. 바꿔야 하면 운영진에게 요청하세요.
          </Text>
        </>
      ) : (
        <>
          <SectionTitle>내 정보 수정</SectionTitle>
          <Card>
            <Label hint="클럽 안에서 보일 이름 · 별명도 됩니다">이름</Label>
            <Field value={d.name} onChangeText={(v) => setD({ ...d, name: v })} maxLength={20} />

            <View style={{ marginTop: S.md }}>
              <Label hint="혼합복식 대진에 씁니다">성별</Label>
              <Segmented options={[{ key: 'M', label: '남' }, { key: 'F', label: '여' }]}
                value={d.gender} onChange={(v) => setD({ ...d, gender: v })} />
            </View>

            <View style={{ marginTop: S.md }}>
              <Label hint="가까운 클럽·게스트 모집을 찾는 기준">활동 지역</Label>
              <RegionPicker value={d.region} onChange={(v) => setD({ ...d, region: v })} labels={false} />
            </View>

            <View style={{ marginTop: S.md }}>
              <Label hint={m.startedAt ? '한 번 입력하면 바꿀 수 없습니다' : '입력하면 그 뒤로는 바꿀 수 없습니다'}>테니스 시작 년월</Label>
              {m.startedAt ? (
                <View style={{ backgroundColor: C.fill, borderRadius: R.md, paddingHorizontal: 14, paddingVertical: 12 }}>
                  <Text style={{ fontSize: 15, color: C.text }}>🔒 {m.startedAt.slice(0, 7)} · 구력 {careerText(m.startedAt)}</Text>
                </View>
              ) : (
                <MonthField value={d.startedAt} onChange={(v) => setD({ ...d, startedAt: v })} />
              )}
              <Text style={{ fontSize: 10.5, color: C.faint, marginTop: 5, lineHeight: 15 }}>
                대회 참가 자격 때문에 잠급니다. 잘못 넣었다면 회장에게 초기화를 요청하세요.
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: S.lg }}>
              <Btn onPress={save} disabled={saving}>{saving ? '저장 중…' : '저장'}</Btn>
              <Btn tone="ghost" onPress={() => setEditing(false)}>취소</Btn>
            </View>
          </Card>
        </>
      )}
    </View>
  );
}

export default Profile;
