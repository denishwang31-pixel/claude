/* 회원 관리 — 프로필 수정(성별·조·구력), 역할 임명(회장 전용), 소속 코트장, 삭제 */
import React, { useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import {
  updateMemberProfile, addMember, deleteMember, setMemberRole,
} from '../lib/firestore';
import {
  ROLES, ASSIGNABLE_ROLES, GRADES, roleTone, isStaffRole,
} from '../lib/constants';
import { effectiveNtrp, careerText } from '../lib/ntrp';
import { Label } from './pickers';
import { Card, SectionTitle, Chip, Btn, Field } from './ui';
import { C } from '../lib/theme';

const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function Members({ clubId, members, venues, stats, me, isAdmin, canAppoint, flash }) {
  const [openId, setOpenId] = useState(null);
  const [d, setD] = useState({});
  const [adding, setAdding] = useState(false);
  const [nm, setNm] = useState({ name: '', gender: 'M', grade: '', startedAt: '' });

  const openEdit = (m) => {
    if (openId === m.id) return setOpenId(null);
    setOpenId(m.id);
    setD({
      name: m.name || '',
      gender: m.gender || 'M',
      grade: m.grade || '',
      startedAt: m.startedAt || '',
      venueIds: m.venueIds || [],
      status: m.status || '활동',
    });
  };

  const save = (m) => {
    const patch = {
      name: d.name.trim() || m.name,
      gender: d.gender,
      grade: d.grade,          // '' = 조 선택 안함
      venueIds: d.venueIds,
      status: d.status,
    };
    const s = (d.startedAt || '').trim();
    if (s) {
      const norm = /^\d{4}-\d{2}$/.test(s) ? `${s}-01` : s;
      if (Number.isNaN(new Date(norm).getTime())) return flash('시작일 형식을 확인하세요 (YYYY-MM-DD)');
      patch.startedAt = norm;
    }
    updateMemberProfile(clubId, m.id, patch);
    setOpenId(null);
    flash('저장되었습니다');
  };

  const remove = (m) => {
    if (m.id === me) return flash('본인은 삭제할 수 없습니다');
    Alert.alert(
      '회원 삭제',
      `${m.name} 님을 클럽에서 삭제할까요?\n지난 경기 기록은 남지만 명단에서 제외됩니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제', style: 'destructive',
          onPress: () => { deleteMember(clubId, m.id); setOpenId(null); flash(`${m.name} 삭제됨`); },
        },
      ],
    );
  };

  const appoint = (m, role) => {
    if (m.id === me && m.role === ROLES.PRESIDENT && role !== ROLES.PRESIDENT) {
      return Alert.alert('확인', '본인의 회장 권한을 내려놓으면 다시 임명할 수 없습니다. 먼저 다른 회원을 회장으로 임명하세요.');
    }
    setMemberRole(clubId, m.id, role);
    flash(`${m.name} → ${role}`);
  };

  const staff = members.filter((m) => isStaffRole(m.role));

  return (
    <View>
      {/* 운영진 요약 */}
      <Card>
        <Text style={{ fontSize: 12, fontWeight: '700', marginBottom: 6 }}>운영진 ({staff.length}명)</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {staff.map((m) => <Chip key={m.id} tone={roleTone(m.role)}>{m.name} · {m.role}</Chip>)}
          {staff.length === 0 && <Text style={{ fontSize: 11, color: C.faint }}>지정된 운영진이 없습니다.</Text>}
        </View>
        <Text style={{ fontSize: 10, color: C.faint, marginTop: 8 }}>
          회장·총무·책임리더는 인원 제한이 없습니다. 임명은 <Text style={{ fontWeight: '700' }}>회장</Text>만 할 수 있습니다.
        </Text>
      </Card>

      <SectionTitle>전체 회원 ({members.length}명)</SectionTitle>
      <Card>
        {members.map((m, i) => {
          const eff = effectiveNtrp(m);
          const open = openId === m.id;
          const canEdit = isAdmin || m.id === me;
          return (
            <View key={m.id} style={{ paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: '#f5f5f4' }}>
              <Pressable onPress={() => canEdit && openEdit(m)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: m.gender === 'F' ? C.femaleBg : C.maleBg, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 12, fontWeight: '900', color: m.gender === 'F' ? C.female : C.male }}>{m.name?.[0]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                      <Text style={{ fontSize: 14, fontWeight: '700' }}>{m.name}</Text>
                      {isStaffRole(m.role) && <Chip tone={roleTone(m.role)}>{m.role}</Chip>}
                      {eff.value != null && <Chip tone="outline">{eff.value.toFixed(1)}</Chip>}
                    </View>
                    <Text style={{ fontSize: 10, color: C.faint, marginTop: 1 }}>
                      {m.gender === 'M' ? '남' : '여'}
                      {m.grade ? ` · ${m.grade}조` : ''}
                      {m.startedAt ? ` · 구력 ${careerText(m.startedAt)}` : ''}
                      {m.status && m.status !== '활동' ? ` · ${m.status}` : ''}
                    </Text>
                  </View>
                </View>
                {stats?.[m.id] && (
                  <Text style={{ fontSize: 11, color: C.faint }}>{stats[m.id].wins}승{stats[m.id].games - stats[m.id].wins}패</Text>
                )}
              </Pressable>

              {open && (
                <View style={{ marginTop: 10, backgroundColor: '#fafaf9', borderRadius: 12, padding: 12 }}>
                  <Label>이름</Label>
                  <Field value={d.name} onChangeText={(v) => setD({ ...d, name: v })} />

                  <View style={{ marginTop: 10 }}>
                    <Label>성별</Label>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {[['M', '남'], ['F', '여']].map(([g, label]) => (
                        <Chip key={g} tone={d.gender === g ? 'green' : 'outline'} onPress={() => setD({ ...d, gender: g })}>{label}</Chip>
                      ))}
                    </View>
                  </View>

                  <View style={{ marginTop: 10 }}>
                    <Label hint="조를 쓰지 않는 클럽은 '선택 안함'">조</Label>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      <Chip tone={!d.grade ? 'green' : 'outline'} onPress={() => setD({ ...d, grade: '' })}>선택 안함</Chip>
                      {GRADES.map((g) => (
                        <Chip key={g} tone={d.grade === g ? 'lime' : 'outline'} onPress={() => setD({ ...d, grade: g })}>{g}조</Chip>
                      ))}
                    </View>
                  </View>

                  <View style={{ marginTop: 10 }}>
                    <Label hint="YYYY-MM 또는 YYYY-MM-DD">테니스 시작일(구력)</Label>
                    <Field placeholder="2019-03" value={d.startedAt} onChangeText={(v) => setD({ ...d, startedAt: v })} />
                  </View>

                  {isAdmin && venues.length > 0 && (
                    <View style={{ marginTop: 10 }}>
                      <Label hint="여기 지정된 그룹의 일정만 이 회원 홈에 보입니다">정기 운동 그룹(코트장)</Label>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {venues.map((v) => {
                          const on = (d.venueIds || []).includes(v.id);
                          return (
                            <Chip key={v.id} tone={on ? 'green' : 'outline'}
                              onPress={() => setD({
                                ...d,
                                venueIds: on ? d.venueIds.filter((x) => x !== v.id) : [...(d.venueIds || []), v.id],
                              })}>
                              {v.name} {v.startTime}
                            </Chip>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {isAdmin && (
                    <View style={{ marginTop: 10 }}>
                      <Label>상태</Label>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {['활동', '휴면', '탈퇴'].map((st) => (
                          <Chip key={st} tone={d.status === st ? 'green' : 'outline'} onPress={() => setD({ ...d, status: st })}>{st}</Chip>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* 역할 임명 — 회장만 */}
                  {canAppoint && (
                    <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#e7e5e4', paddingTop: 10 }}>
                      <Label hint="회장만 변경 가능">역할</Label>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {ASSIGNABLE_ROLES.map((r) => (
                          <Chip key={r} tone={m.role === r ? 'green' : 'outline'} onPress={() => appoint(m, r)}>{r}</Chip>
                        ))}
                      </View>
                    </View>
                  )}

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                    <Btn small onPress={() => save(m)}>저장</Btn>
                    <Btn small tone="ghost" onPress={() => setOpenId(null)}>취소</Btn>
                    {isAdmin && m.id !== me && (
                      <Pressable onPress={() => remove(m)} style={{ marginLeft: 'auto', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 12, color: C.danger, fontWeight: '700' }}>회원 삭제</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </Card>

      {isAdmin && (
        <>
          <SectionTitle right={
            <Chip tone={adding ? 'green' : 'outline'} onPress={() => setAdding(!adding)}>{adding ? '닫기' : '+ 추가'}</Chip>
          }>회원 추가 (오프라인 등록)</SectionTitle>
          {adding && (
            <Card>
              <Label>이름</Label>
              <Field value={nm.name} onChangeText={(v) => setNm({ ...nm, name: v })} />
              <View style={{ marginTop: 10 }}>
                <Label>성별</Label>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {[['M', '남'], ['F', '여']].map(([g, label]) => (
                    <Chip key={g} tone={nm.gender === g ? 'green' : 'outline'} onPress={() => setNm({ ...nm, gender: g })}>{label}</Chip>
                  ))}
                </View>
              </View>
              <View style={{ marginTop: 10 }}>
                <Label>조</Label>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  <Chip tone={!nm.grade ? 'green' : 'outline'} onPress={() => setNm({ ...nm, grade: '' })}>선택 안함</Chip>
                  {GRADES.map((g) => (
                    <Chip key={g} tone={nm.grade === g ? 'lime' : 'outline'} onPress={() => setNm({ ...nm, grade: g })}>{g}조</Chip>
                  ))}
                </View>
              </View>
              <View style={{ marginTop: 10 }}>
                <Label hint="선택">테니스 시작일</Label>
                <Field placeholder="2019-03" value={nm.startedAt} onChangeText={(v) => setNm({ ...nm, startedAt: v })} />
              </View>
              <View style={{ marginTop: 12 }}>
                <Btn full disabled={!nm.name} onPress={() => {
                  const data = { name: nm.name.trim(), gender: nm.gender, grade: nm.grade };
                  const s = (nm.startedAt || '').trim();
                  if (s) data.startedAt = /^\d{4}-\d{2}$/.test(s) ? `${s}-01` : s;
                  addMember(clubId, 'local:' + rid(), data);
                  setNm({ name: '', gender: 'M', grade: '', startedAt: '' });
                  flash('회원이 추가되었습니다');
                }}>추가</Btn>
              </View>
            </Card>
          )}
        </>
      )}
    </View>
  );
}
