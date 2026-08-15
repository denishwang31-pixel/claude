/* 회원 관리 — 프로필 수정(성별·부수·조·지역·구력), 역할 임명(회장 전용), 소속 코트장, 삭제

   구력 확인제도
     테니스 시작 년월은 한 번 저장되면 본인도 못 바꾼다. 대회 참가 자격이
     "구력 3년 이하부"처럼 걸려 있어서, 대회 앞두고 슬쩍 늦추는 걸 막기 위한
     장치다. 잘못 넣었으면 회장만 풀어 줄 수 있다. */
import React, { useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import {
  updateMemberProfile, addMember, deleteMember, setMemberRole,
} from '../lib/firestore';
import {
  ROLES, ASSIGNABLE_ROLES, ROLE_DESC, GRADES, BUSU, BUSU_KEYS,
  roleTone, isStaffRole, normalizeRole,
} from '../lib/constants';
import { effectiveNtrp, careerText } from '../lib/ntrp';
import { Label, MonthField } from './pickers';
import { RegionPicker } from './RegionPicker';
import { Segmented, AppButton, Touchable } from './native';
import { Card, SectionTitle, Chip, Btn, Field, Divider } from './ui';
import { C, S, R, F } from '../lib/theme';

const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function Members({ clubId, members, venues, stats, me, isAdmin, canAppoint, flash }) {
  const [openId, setOpenId] = useState(null);
  const [d, setD] = useState({});
  const [adding, setAdding] = useState(false);
  const [nm, setNm] = useState({ name: '', gender: 'M', busu: '', grade: '', region: '', startedAt: '' });

  const openEdit = (m) => {
    if (openId === m.id) return setOpenId(null);
    setOpenId(m.id);
    setD({
      name: m.name || '',
      gender: m.gender || 'M',
      busu: m.busu || '',
      grade: m.grade || '',
      region: m.region || '',
      startedAt: m.startedAt || '',
      venueIds: m.venueIds || [],
      status: m.status || '활동',
    });
  };

  const save = (m) => {
    const patch = {
      name: d.name.trim() || m.name,
      gender: d.gender,
      busu: d.busu,            // '' = 부수 미입력
      grade: d.grade,          // '' = 조 선택 안함
      region: d.region || '',
      venueIds: d.venueIds,
      status: d.status,
    };
    // 구력 확인제도 — 이미 기록돼 있으면 덮어쓰지 않는다(회장이 초기화한 경우만 다시 받음)
    const startLocked = !!m.startedAt;
    const v = (d.startedAt || '').trim();
    if (!startLocked && v) {
      const norm = /^\d{4}-\d{2}$/.test(v) ? `${v}-01` : v;
      if (Number.isNaN(new Date(norm).getTime())) return flash('시작일 형식을 확인하세요');
      patch.startedAt = norm;
    }
    updateMemberProfile(clubId, m.id, patch);
    setOpenId(null);
    return flash('저장되었습니다');
  };

  /** 회장만 — 잘못 입력된 구력을 풀어 준다 */
  const unlockCareer = (m) => {
    Alert.alert('구력 초기화',
      `${m.name} 님의 테니스 시작 년월을 지웁니다.\n`
      + '다시 입력하면 그때부터 또 잠깁니다. 대회 자격과 직결되니 신중히 처리하세요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '초기화',
          style: 'destructive',
          onPress: () => {
            updateMemberProfile(clubId, m.id, { startedAt: '' });
            setD({ ...d, startedAt: '' });
            flash('구력을 초기화했습니다');
          },
        },
      ]);
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
    if (m.id === me && normalizeRole(m.role) === ROLES.PRESIDENT && role !== ROLES.PRESIDENT) {
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
        <Text style={{ fontSize: 12, fontWeight: '700', marginBottom: 6 }}>운영 담당 ({staff.length}명)</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {staff.map((m) => (
            <Chip key={m.id} tone={roleTone(m.role)}>{m.name} · {normalizeRole(m.role)}</Chip>
          ))}
          {staff.length === 0 && <Text style={{ fontSize: 11, color: C.faint }}>지정된 운영 담당이 없습니다.</Text>}
        </View>
        <Text style={{ fontSize: 10, color: C.faint, marginTop: 8 }}>
          임명은 <Text style={{ fontWeight: '700' }}>회장</Text>만 할 수 있습니다. 인원 제한은 없습니다.
        </Text>
      </Card>

      {/* 역할이 뭘 할 수 있는지 — 임명하기 전에 확인 */}
      <SectionTitle>역할별 권한</SectionTitle>
      <Card>
        {ASSIGNABLE_ROLES.map((r, i) => (
          <View
            key={r}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7,
              borderTopWidth: i ? 1 : 0, borderTopColor: '#f5f5f4',
            }}
          >
            <View style={{ width: 54 }}><Chip tone={roleTone(r)}>{r}</Chip></View>
            <Text style={{ flex: 1, fontSize: 11, color: C.sub, lineHeight: 16 }}>{ROLE_DESC[r]}</Text>
          </View>
        ))}
        <Text style={{ fontSize: 10, color: C.faint, marginTop: 8, lineHeight: 15 }}>
          회비·지출 내역은 회장·총무만 볼 수 있습니다. 리드는 배정된 코트장의 일정·대진만 다룹니다.
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
                    <Text style={{ fontSize: 12, fontWeight: '700', color: m.gender === 'F' ? C.female : C.male }}>{m.name?.[0]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                      <Text style={{ fontSize: 14, fontWeight: '700' }}>{m.name}</Text>
                      {isStaffRole(m.role) && <Chip tone={roleTone(m.role)}>{m.role}</Chip>}
                      {!!m.busu && <Chip tone="soft">{m.busu}</Chip>}
                      {eff.value != null && <Chip tone="outline">NTRP {eff.value.toFixed(1)}</Chip>}
                    </View>
                    <Text style={{ fontSize: 10.5, color: C.faint, marginTop: 2 }}>
                      {m.gender === 'M' ? '남' : '여'}
                      {m.grade ? ` · ${m.grade}조` : ''}
                      {m.startedAt ? ` · 구력 ${careerText(m.startedAt)}` : ''}
                      {m.region ? ` · ${m.region}` : ''}
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

                  <View style={{ marginTop: S.md }}>
                    <Label>성별</Label>
                    <Segmented
                      options={[{ key: 'M', label: '남' }, { key: 'F', label: '여' }]}
                      value={d.gender}
                      onChange={(v) => setD({ ...d, gender: v })}
                    />
                  </View>

                  <View style={{ marginTop: S.md }}>
                    <Label hint="대회 참가 자격의 기준이 됩니다">부수</Label>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                      <Chip tone={!d.busu ? 'green' : 'outline'} onPress={() => setD({ ...d, busu: '' })}>미입력</Chip>
                      {BUSU_KEYS.map((b) => (
                        <Chip key={b} tone={d.busu === b ? 'green' : 'outline'} onPress={() => setD({ ...d, busu: b })}>{b}</Chip>
                      ))}
                    </View>
                    {!!d.busu && (
                      <Text style={{ fontSize: 11, color: C.green2, marginTop: 5 }}>
                        {BUSU.find((b) => b.key === d.busu)?.desc}
                      </Text>
                    )}
                  </View>

                  <View style={{ marginTop: S.md }}>
                    <Label hint="조를 쓰지 않는 클럽은 '선택 안함'">클럽 내부 조</Label>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                      <Chip tone={!d.grade ? 'green' : 'outline'} onPress={() => setD({ ...d, grade: '' })}>선택 안함</Chip>
                      {GRADES.map((g) => (
                        <Chip key={g} tone={d.grade === g ? 'lime' : 'outline'} onPress={() => setD({ ...d, grade: g })}>{g}조</Chip>
                      ))}
                    </View>
                  </View>

                  <View style={{ marginTop: S.md }}>
                    <Label hint="게스트 모집·클럽 검색에 쓰입니다">활동 지역</Label>
                    <RegionPicker value={d.region} onChange={(v) => setD({ ...d, region: v })} labels={false} />
                  </View>

                  <View style={{ marginTop: S.md }}>
                    <Label hint={m.startedAt ? '한 번 입력하면 변경할 수 없습니다' : '입력 후에는 변경할 수 없습니다'}>
                      테니스 시작 년월 (구력)
                    </Label>
                    {m.startedAt ? (
                      <View style={{
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                        backgroundColor: C.fill, borderRadius: R.md, paddingHorizontal: 14, paddingVertical: 12,
                      }}>
                        <Text style={{ fontSize: 15, color: C.text }}>
                          🔒 {m.startedAt.slice(0, 7)} · 구력 {careerText(m.startedAt)}
                        </Text>
                        {canAppoint && (
                          <Touchable onPress={() => unlockCareer(m)} hitSlop={8}>
                            <Text style={{ fontSize: 12, color: C.danger, fontWeight: '700' }}>초기화</Text>
                          </Touchable>
                        )}
                      </View>
                    ) : (
                      <MonthField value={d.startedAt} onChange={(v) => setD({ ...d, startedAt: v })} />
                    )}
                    <Text style={{ fontSize: 10.5, color: C.faint, marginTop: 5, lineHeight: 15 }}>
                      공정한 대회 운영을 위한 구력 확인제도입니다.
                      {canAppoint ? ' 잘못 입력된 경우 회장이 초기화할 수 있습니다.' : ' 잘못 입력했다면 회장에게 문의하세요.'}
                    </Text>
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
                          <Chip
                            key={r}
                            tone={normalizeRole(m.role) === r ? 'green' : 'outline'}
                            onPress={() => appoint(m, r)}
                          >{r}</Chip>
                        ))}
                      </View>
                      <Text style={{ fontSize: 10, color: C.faint, marginTop: 6, lineHeight: 15 }}>
                        {ROLE_DESC[normalizeRole(m.role)]}
                      </Text>
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
              <View style={{ marginTop: S.md }}>
                <Label>성별</Label>
                <Segmented
                  options={[{ key: 'M', label: '남' }, { key: 'F', label: '여' }]}
                  value={nm.gender}
                  onChange={(v) => setNm({ ...nm, gender: v })}
                />
              </View>
              <View style={{ marginTop: S.md }}>
                <Label hint="대회 참가 자격 기준">부수</Label>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                  <Chip tone={!nm.busu ? 'green' : 'outline'} onPress={() => setNm({ ...nm, busu: '' })}>미입력</Chip>
                  {BUSU_KEYS.map((b) => (
                    <Chip key={b} tone={nm.busu === b ? 'green' : 'outline'} onPress={() => setNm({ ...nm, busu: b })}>{b}</Chip>
                  ))}
                </View>
              </View>
              <View style={{ marginTop: S.md }}>
                <Label hint="선택">활동 지역</Label>
                <RegionPicker value={nm.region} onChange={(v) => setNm({ ...nm, region: v })} labels={false} />
              </View>
              <View style={{ marginTop: S.md }}>
                <Label>클럽 내부 조</Label>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
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
                  const data = {
                    name: nm.name.trim(), gender: nm.gender, grade: nm.grade,
                    busu: nm.busu || '', region: nm.region || '',
                  };
                  const s = (nm.startedAt || '').trim();
                  if (s) data.startedAt = /^\d{4}-\d{2}$/.test(s) ? `${s}-01` : s;
                  addMember(clubId, 'local:' + rid(), data);
                  setNm({ name: '', gender: 'M', busu: '', grade: '', region: '', startedAt: '' });
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
