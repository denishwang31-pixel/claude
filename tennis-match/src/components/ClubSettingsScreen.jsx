/* ============================================================
   클럽 설정

   v2에서 고친 불일치
     · "코트 면수/운영 시간"이 어느 코트에 대한 것인지 표시가 없었다.
       → 코트장(venues)이 등록돼 있으면: 코트장별 설정은 [코트장 관리]가
         담당한다고 명시하고, 등록된 코트장 목록 + 바로가기를 보여준다.
         이 화면의 값은 "코트장을 지정하지 않은 모임의 기본값"으로 못박는다.
     · 잡복 기본 허용이 [대진 설정]과 이중으로 존재 → 여기서 제거, 안내로 대체.
     · 클럽 이름·지역·대표 이미지·가입 비밀번호를 만들 때만 넣을 수 있고
       이후 수정 불가 + 이름을 바꿔도 검색 목록(clubDirectory)에 옛 값이 남음
       → 여기서 수정 가능하게 하고 저장 시 공개 목록을 함께 동기화.
   ============================================================ */
import React, { useState, useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { updateClubSettings, saveClubProfile, updateVenue } from '../lib/firestore';
import {
  DEFAULT_SETTINGS, roundsFromSettings, roundTimes, toMinutes,
} from '../lib/schedule';
import { normalizeRoundMinutes, roundMinutesLabel, screenRef } from '../lib/constants';
import { RegionPicker } from './RegionPicker';
import { Icon } from './Icon';
import { Label } from './pickers';
import { RoundMinutesPicker } from './RoundMinutesPicker';
import { Card, SectionTitle, Chip, Btn, Field } from './ui';
import { C, S, R, F } from '../lib/theme';

export function ClubSettings({ clubId, club, venues = [], members = [], isAdmin, flash, onOpenVenues, onOpenMatchConfig }) {
  const [s, setS] = useState({ ...DEFAULT_SETTINGS, ...(club?.settings || {}) });
  const [profile, setProfile] = useState({
    name: club?.name || '',
    image: club?.image || '',
    joinPassword: club?.joinPassword || '',
  });
  useEffect(() => {
    setS({ ...DEFAULT_SETTINGS, ...(club?.settings || {}) });
    setProfile({ name: club?.name || '', image: club?.image || '', joinPassword: club?.joinPassword || '' });
  }, [club?.id]);

  /* 어느 코트장의 값을 고치고 있는가.
     '' = 코트장 미지정 모임에 쓰이는 클럽 기본값.

     예전에는 위에 코트장 목록을 읽기 전용으로 늘어놓고, 그 아래 면수·
     운영시간 조절기가 있었다. 둘이 이어져 보이는데 실제로는 아래 값이
     클럽 기본값이라 "어느 코트 설정인지" 알 수 없었다.
     이제 위에서 대상을 고르면 아래 값이 그 대상의 것으로 바뀐다. */
  const [target, setTarget] = useState('');
  const venue = venues.find((v) => v.id === target) || null;

  /* 고른 대상이 바뀌면 편집값을 그 대상의 것으로 갈아 끼운다 */
  useEffect(() => {
    if (venue) {
      setS((prev) => ({
        ...prev,
        courts: venue.courts,
        startTime: venue.startTime,
        endTime: venue.endTime,
        roundMinutes: venue.roundMinutes,
      }));
    } else {
      setS({ ...DEFAULT_SETTINGS, ...(club?.settings || {}) });
    }
  }, [target, venue?.id]);

  const hasVenues = venues.length > 0;
  const startOk = toMinutes(s.startTime) != null;
  const endOk = toMinutes(s.endTime) != null;
  const rounds = startOk && endOk ? roundsFromSettings(s) : 0;
  const times = rounds ? roundTimes(s, rounds) : [];

  const save = async () => {
    if (!startOk || !endOk) return flash('시간 형식을 확인하세요 (예: 10:00)');
    if (!profile.name.trim()) return flash('클럽 이름을 입력하세요');
    const courts = Math.max(1, Math.min(20, Number(s.courts) || 1));
    const roundMinutes = normalizeRoundMinutes(s.roundMinutes);
    try {
      /* 코트장을 고른 상태면 그 코트장의 면수·시간을 고친다.
         클럽 기본값은 건드리지 않는다 — 서로 다른 값이다. */
      if (venue) {
        await updateVenue(clubId, venue.id, {
          courts, roundMinutes, startTime: s.startTime, endTime: s.endTime,
        });
        flash(`${venue.name} 설정이 저장되었습니다`);
        return undefined;
      }
      await updateClubSettings(clubId, { ...s, courts, roundMinutes });
      // 이름·이미지·비밀번호 + 공개 검색 목록 동기화
      await saveClubProfile(clubId, {
        name: profile.name.trim(),
        image: profile.image.trim(),
        joinPassword: profile.joinPassword.trim(),
        region: (s.region || '').trim(),
        memberCount: members.length,
      });
      return flash('클럽 설정이 저장되었습니다');
    } catch (e) {
      return flash('저장에 실패했습니다. 잠시 후 다시 시도하세요');
    }
  };

  const set = (k, v) => setS({ ...s, [k]: v });

  if (!isAdmin) {
    return (
      <View>
        <Card>
          <Text style={[F.bodyBold, { marginBottom: 8 }]}>현재 클럽 운영 설정</Text>
          <Text style={{ fontSize: 13, color: C.sub }}>운영 시간: {s.startTime} ~ {s.endTime}</Text>
          <Text style={{ fontSize: 13, color: C.sub, marginTop: 2 }}>코트: {s.courts}면 · 한 타임 {s.roundMinutes}분</Text>
          <Text style={{ fontSize: 13, color: C.green2, marginTop: 6, fontWeight: '700' }}>→ 총 {rounds}타임 진행</Text>
          {hasVenues && (
            <Text style={{ fontSize: 11.5, color: C.faint, marginTop: 8 }}>
              코트장별 설정은 {screenRef('venues')}에 있습니다: {venues.map((v) => v.name).join(' · ')}
            </Text>
          )}
          <Text style={{ fontSize: 11, color: C.faint, marginTop: 8 }}>설정 변경은 총무·운영진만 가능합니다.</Text>
        </Card>
      </View>
    );
  }

  return (
    <View>
      {/* ---------- 클럽 정보 ---------- */}
      <SectionTitle hint="여기서 바꾸면 클럽 검색 결과에도 바로 반영됩니다.">클럽 정보</SectionTitle>
      <Card>
        <Label>클럽 이름</Label>
        <Field value={profile.name} onChangeText={(v) => setProfile({ ...profile, name: v })} />

        <View style={{ marginTop: S.md }}>
          <Label hint="다른 사람이 검색하는 기준">활동 지역</Label>
          <RegionPicker value={s.region || ''} onChange={(v) => set('region', v)} labels={false} />
        </View>

        <View style={{ marginTop: S.md }}>
          <Label hint="선택 · 검색 결과에 표시">대표 이미지 URL</Label>
          <Field placeholder="https://..." autoCapitalize="none"
            value={profile.image} onChangeText={(v) => setProfile({ ...profile, image: v })} />
        </View>

        <View style={{ marginTop: S.md }}>
          <Label hint="아는 사람은 승인 없이 바로 입장 · 비우면 승인제만">클럽 가입 비밀번호</Label>
          <Field placeholder="비워두면 가입 신청(승인)만 가능"
            value={profile.joinPassword} onChangeText={(v) => setProfile({ ...profile, joinPassword: v })} />
        </View>
      </Card>

      {/* ---------- 코트/시간 — 어떤 코트에 대한 값인지 명시 ---------- */}
      <SectionTitle
        hint={venue
          ? '이 코트장에서 여는 모임의 기본값입니다.'
          : hasVenues
          ? '코트장을 지정하지 않은 모임에만 쓰이는 기본값입니다.'
          : `새 모임 등록의 기본값이 됩니다. 코트장이 여러 곳이면 ${screenRef('venues')}에 등록하세요.`}>
        {venue ? `${venue.name} — 코트·운영 시간`
          : hasVenues ? '기본 코트 설정 (코트장 미지정 모임용)' : '코트·운영 시간'}
      </SectionTitle>

      {/* 코트장이 여러 곳이면 어느 것을 고칠지 먼저 고른다 */}
      {hasVenues && (
        <Card style={{ marginBottom: S.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Icon name="venues" size={16} color={C.green} />
            <Text style={[F.bodyBold, { flex: 1 }]}>어느 코트의 설정인가요?</Text>
            {!!onOpenVenues && (
              <Chip tone="soft" onPress={onOpenVenues}>코트장 추가·삭제</Chip>
            )}
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Chip tone={target === '' ? 'green' : 'outline'} onPress={() => setTarget('')}>
              기본값 (코트장 미지정)
            </Chip>
            {venues.map((v) => (
              <Chip key={v.id} tone={target === v.id ? 'green' : 'outline'} onPress={() => setTarget(v.id)}>
                {v.name}
              </Chip>
            ))}
          </View>

          <Text style={{ fontSize: 11.5, color: C.sub, marginTop: 10, lineHeight: 17 }}>
            {venue
              ? `아래 면수·운영시간은 "${venue.name}"의 값입니다. 저장하면 이 코트장에만 반영됩니다.`
              : '아래 값은 코트장을 고르지 않고 등록한 모임에만 쓰입니다.'}
          </Text>

          {/* 지금 고르지 않은 코트장들도 한눈에 — 값이 서로 다르다는 걸 보여 준다 */}
          <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 8 }}>
            {venues.map((v, i) => (
              <View key={v.id} style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderTopColor: C.border,
              }}>
                <Text style={{
                  fontSize: 12.5, fontWeight: target === v.id ? '700' : '500',
                  color: target === v.id ? C.green : C.text,
                }}>
                  {v.name}
                </Text>
                <Text style={{ fontSize: 11.5, color: C.sub }}>
                  {v.startTime}~{v.endTime} · {v.courts}면 · {roundMinutesLabel(v.roundMinutes)}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      )}

      <Card>
        <Label>코트 면수</Label>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
          <Pressable onPress={() => set('courts', Math.max(1, (Number(s.courts) || 1) - 1))}
            style={{ width: 42, height: 42, borderRadius: R.md, backgroundColor: C.fill, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: C.sub }}>−</Text>
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 26, fontWeight: '700', color: C.text }}>
              {s.courts}<Text style={{ fontSize: 14, color: C.sub }}>면</Text>
            </Text>
          </View>
          <Pressable onPress={() => set('courts', Math.min(20, (Number(s.courts) || 1) + 1))}
            style={{ width: 42, height: 42, borderRadius: R.md, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: '#fff' }}>＋</Text>
          </Pressable>
        </View>

        <View style={{ marginTop: S.lg }}>
          <Label>운영 시간</Label>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Field placeholder="10:00" value={s.startTime} onChangeText={(v) => set('startTime', v)} />
            </View>
            <Text style={{ fontSize: 15, color: C.faint }}>~</Text>
            <View style={{ flex: 1 }}>
              <Field placeholder="13:00" value={s.endTime} onChangeText={(v) => set('endTime', v)} />
            </View>
          </View>
          {(!startOk || !endOk) && (
            <Text style={{ fontSize: 11, color: C.danger, marginTop: 6 }}>24시간 형식으로 입력하세요 (예: 09:30, 18:00)</Text>
          )}
        </View>

        <View style={{ marginTop: S.md }}>
          <Label>한 타임(게임) 길이</Label>
          <RoundMinutesPicker
            value={s.roundMinutes}
            onChange={(v) => set('roundMinutes', v)}
            hint="자주 쓰는 값은 버튼으로, 그 밖의 값은 [직접 지정]에서 5분 단위로 고릅니다."
          />
        </View>

        {rounds > 0 && (
          <View style={{ marginTop: S.md, backgroundColor: C.fill, borderRadius: R.md, padding: 12 }}>
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.green }}>
              총 {rounds}타임 · 한 타임 최대 {s.courts * 4}명 (복식 기준)
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
              {times.map((t) => (
                <View key={t.round} style={{ backgroundColor: C.surface, borderRadius: R.sm, paddingHorizontal: 7, paddingVertical: 3 }}>
                  <Text style={{ fontSize: 10.5, fontWeight: '600', color: C.sub }}>{t.round}T {t.start}~{t.end}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </Card>

      {/* ---------- 대진 기본값은 대진 설정 한 곳으로 (이중 설정 제거) ---------- */}
      <SectionTitle>대진 편성 기본값</SectionTitle>
      <Card onPress={onOpenMatchConfig}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icon name="matchcfg" size={18} color={C.green} />
          <View style={{ flex: 1 }}>
            <Text style={F.bodyBold}>{screenRef('matchcfg')}에서 관리합니다</Text>
            <Text style={[F.caption, { marginTop: 2, lineHeight: 16 }]}>
              잡복 허용 · 기본 타임 유형 · 실력 매칭 · 편성 우선순위.
              같은 값이 두 곳에 있으면 어긋나기 쉬워 한 곳으로 모았습니다.
            </Text>
          </View>
          <Icon name="forward" size={15} color={C.faint} />
        </View>
      </Card>

      {/* ---------- 회비 ---------- */}
      <SectionTitle>회비</SectionTitle>
      <Card>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Label>월 회비</Label>
            <Field keyboardType="number-pad" suffix="원"
              value={String(s.feeAmount ?? '')} onChangeText={(v) => set('feeAmount', Number(v) || 0)} />
          </View>
          <View style={{ flex: 1 }}>
            <Label>게스트비</Label>
            <Field keyboardType="number-pad" suffix="원"
              value={String(s.guestFee ?? '')} onChangeText={(v) => set('guestFee', Number(v) || 0)} />
          </View>
        </View>
        <View style={{ marginTop: S.md }}>
          <Label hint="선택">송금 링크</Label>
          <Field placeholder="https://…" autoCapitalize="none" value={s.payLink || ''} onChangeText={(v) => set('payLink', v)} />
        </View>
      </Card>

      <View style={{ marginTop: S.lg }}>
        <Btn full onPress={save}>{venue ? `${venue.name} 설정 저장` : '설정 저장'}</Btn>
      </View>
    </View>
  );
}
