/* 등급 배정 — 더보기 › 클럽 운영 › 등급 배정 (회원 목록 안에도 같은 판이 있다)

   운영진이 회원에게 등급을 매긴다. 두 가지를 쓴다.
     부수  1부(가장 높음) ~ 5부, 오픈부. 대회 참가 자격의 기준.
           가입할 때 본인이 적은 값은 신청값이고, 여기서 운영진이 확정한다.
     조    A(가장 높음) ~ F. 클럽 안에서 나누는 반.
   NTRP 가 없는 회원은 대진 실력 매칭에 조 → 부수 순으로 이 값을 쓴다.
   대회 등급은 이것과 따로 대회를 열 때 매긴다(클럽 대회 › 새 대회 개설). */
import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { updateMemberProfile } from '../lib/firestore';
import { effectiveNtrp } from '../lib/ntrp';
import { gradeCountFor, gradeSummary, schemeOf } from '../lib/grades';
import { GradeRows } from './GradeRows';
import { Card, Chip } from './ui';
import { Segmented } from './native';
import { C } from '../lib/theme';

export function GradeAssign({ clubId, members, venues = [], flash, embedded }) {
  const [scheme, setScheme] = useState('busu');
  const [count, setCount] = useState(() => gradeCountFor(members.map((m) => m.grade)));
  const [venue, setVenue] = useState('');
  const [onlyNone, setOnlyNone] = useState(false);
  const sc = schemeOf(scheme);
  const field = sc.field;
  const people = members.filter((m) => m.status !== '탈퇴'
    && (!venue || (m.venueIds || []).includes(venue))
    && (!onlyNone || !sc.keys.includes(m[field])));

  return (
    <View>
      {!embedded && (
        <Card style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.text }}>지금 우리 클럽</Text>
          <Text style={{ fontSize: 12, color: C.sub, marginTop: 4, lineHeight: 18 }}>
            부수 · {gradeSummary(members, (m) => m.busu, 'busu') || '아직 없음'}{'\n'}
            조 · {gradeSummary(members, (m) => m.grade, 'grade') || '아직 없음'}
          </Text>
        </Card>
      )}
      <Card>
        <Segmented
          options={[{ key: 'busu', label: '부수 (1부~)' }, { key: 'grade', label: '조 (A~)' }]}
          value={scheme}
          onChange={setScheme}
        />
        <Text style={{ fontSize: 11, color: C.sub, lineHeight: 16, marginTop: 10, marginBottom: 10 }}>
          {scheme === 'busu'
            ? '1부가 가장 높습니다. 대회 참가 자격의 기준이 됩니다. 가입할 때 본인이 적은 부수가 미리 들어 있으니, 맞지 않는 사람만 고치세요.'
            : 'A 가 가장 높습니다. 클럽 안에서 나누는 반입니다. 쓸 칸 수는 오른쪽 －/＋로 정합니다.'}
          {' '}누르면 바로 저장되고, 한 번 더 누르면 지워집니다.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
          {venues.length > 0 && (
            <>
              <Chip tone={!venue ? 'green' : 'outline'} onPress={() => setVenue('')}>전체</Chip>
              {venues.map((v) => (
                <Chip key={v.id} tone={venue === v.id ? 'green' : 'outline'} onPress={() => setVenue(v.id)}>{v.name}</Chip>
              ))}
            </>
          )}
          <Chip tone={onlyNone ? 'green' : 'outline'} onPress={() => setOnlyNone(!onlyNone)}>미배정만</Chip>
        </View>
        <GradeRows
          scheme={scheme}
          people={people}
          value={Object.fromEntries(members.map((m) => [m.id, m[field] || '']))}
          onPick={(id, g) => updateMemberProfile(clubId, id, { [field]: g }).catch(() => flash('저장하지 못했습니다'))}
          count={count}
          onCount={setCount}
          note={(m) => {
            const eff = effectiveNtrp(m);
            const other = scheme === 'busu' ? (m.grade ? `${m.grade}조` : '') : (m.busu || '');
            return [other, eff.value != null ? `NTRP ${eff.value.toFixed(1)}` : ''].filter(Boolean).join(' · ');
          }}
        />
        {people.length === 0 && (
          <Text style={{ fontSize: 12, color: C.faint, marginTop: 6 }}>해당하는 회원이 없습니다.</Text>
        )}
      </Card>
    </View>
  );
}

export default GradeAssign;
