/* 회원 관리 — 프로필 수정(성별·부수·조·지역·구력), 역할 지정, 소속 코트장, 삭제

   역할 지정
     운영진·리드·회원은 운영 담당이 정한다. 회장·총무는 회장만 정한다.
     (회장 한 명만 임명할 수 있으면 리드 한 명 세우는 데도 회장을 불러야 하고,
      아무나 회장·총무를 세우면 권한이 위로 새어 나간다)

   구력 확인제도
     테니스 시작 년월은 한 번 저장되면 본인도 못 바꾼다. 대회 참가 자격이
     "구력 3년 이하부"처럼 걸려 있어서, 대회 앞두고 슬쩍 늦추는 걸 막기 위한
     장치다. 잘못 넣었으면 회장만 풀어 줄 수 있다.

   오프라인 회원 합치기
     앱이 없어 오프라인으로 등록해 두었던 사람이 나중에 앱에 가입하면
     한 사람이 둘로 갈라진다. 회장·총무가 [합치기]를 누르면 서버가 참석·
     대진·점수·회비 기록을 앱 계정으로 옮기고 오프라인 회원을 지운다
     (functions/mergeMember.js). 이름이 같은 짝은 위에서 먼저 권한다 —
     동명이인이 있을 수 있어 자동으로 합치지는 않는다. */
import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import {
  updateMemberProfile, addMember, deleteMember, setMemberRole, setMemberRoles,
  assignVenuesBulk, requestMemberMerge, subMemberJob,
} from '../lib/firestore';
import {
  isOfflineId, onlineMembers, mergeCandidates, mergeConfirmText,
} from '../lib/mergeMember';
import {
  ROLES, ASSIGNABLE_ROLES, ROLE_DESC, GRADES, BUSU, BUSU_KEYS,
  roleTone, isStaffRole, normalizeRole, assignableRolesFor, canAssignRole,
  memberRoles, rolesPayload, rolesLabel, isStaffMember, primaryRole, canSeeFees,
  POSITION_ROLES, positionOf, isTreasurer, staffScope, positionPayload, canEditRolesOf, TOP_ROLES,
} from '../lib/constants';
import { effectiveNtrp, careerText } from '../lib/ntrp';
import { Label, MonthField } from './pickers';
import { RegionPicker } from './RegionPicker';
import { GradeAssign } from './GradeAssignScreen';
import { gradeSummary } from '../lib/grades';
import { Segmented, AppButton, Touchable } from './native';
import { Card, SectionTitle, Chip, Btn, Field, Divider } from './ui';
import { C, S, R, F } from '../lib/theme';

const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function Members({ clubId, members, venues, stats, me, isAdmin, canAppoint, myRole, seeFees, flash }) {
  const [openId, setOpenId] = useState(null);
  const [d, setD] = useState({});
  const [adding, setAdding] = useState(false);
  const [bulkOn, setBulkOn] = useState(false);      // 코트장 일괄 배정 패널
  const [picked, setPicked] = useState({});
  /* 등급 배정 패널(부수·조) — 한 줄에 한 사람, 누르면 바로 저장 */
  const [gradeOn, setGradeOn] = useState(false);
  const [nm, setNm] = useState({
    name: '', gender: 'M', busu: '', grade: '', region: '', startedAt: '',
    role: ROLES.MEMBER, venueIds: [],
  });

  /* ---- 오프라인 회원 합치기 (회장·총무) ---- */
  const canMerge = seeFees ?? canSeeFees(myRole);
  const [mergeJob, setMergeJob] = useState(null);   // { id, label, status, detail, slow }
  useEffect(() => {
    if (!mergeJob?.id) return undefined;
    const slow = setTimeout(() => setMergeJob((j) => (j && j.status === 'queued' ? { ...j, slow: true } : j)), 20000);
    const off = subMemberJob(clubId, mergeJob.id, (job) => {
      if (!job) return;
      setMergeJob((j) => (j ? { ...j, status: job.status, detail: job.detail || '' } : j));
    });
    return () => { clearTimeout(slow); off(); };
  }, [clubId, mergeJob?.id]);

  const askMerge = (off, on) => {
    Alert.alert('같은 사람으로 합칠까요?', mergeConfirmText(off, on), [
      { text: '취소', style: 'cancel' },
      {
        text: '합치기', style: 'destructive',
        onPress: async () => {
          try {
            const ref = await requestMemberMerge(clubId, off.id, on.id, me);
            setMergeJob({ id: ref.id, label: `${off.name} → ${on.name}`, status: 'queued' });
            setOpenId(null);
          } catch (e) {
            flash('합치기를 시작하지 못했습니다');
          }
        },
      },
    ]);
  };
  const candidates = canMerge ? mergeCandidates(members) : [];

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
      ...(isAdmin ? { busu: d.busu } : {}),     // 부수도 운영진이 정한다('' = 미입력)
      ...(isAdmin ? { grade: d.grade } : {}),   // 조는 운영진만 정한다('' = 선택 안함)
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

  /* 역할 — 직책(회원·운영진·운영진 대표·회장) 하나 + 총무 켜기 + 운영 범위(코트장 전체/선택).
     누르면 바로 저장한다. 임명은 회장과 운영진 대표만(대표는 회장·대표 자리는 못 건드림). */
  const applyRoles = (m, position, { treasurer, venueIds } = {}) => {
    if (!canEditRolesOf(myRole, m) || (TOP_ROLES.includes(position) && !canAssignRole(myRole, m.role, position))) {
      return flash('회장·운영진 대표 지정은 회장만 할 수 있습니다');
    }
    /* 본인의 회장 권한을 스스로 내려놓으면 다시 올릴 사람이 없다 */
    if (m.id === me && positionOf(m) === ROLES.PRESIDENT && position !== ROLES.PRESIDENT) {
      return Alert.alert('확인',
        '본인의 회장 권한을 내려놓으면 다시 임명할 수 없습니다.\n'
        + '먼저 다른 회원을 회장으로 임명하세요.');
    }
    const sc = staffScope(m, venues);
    const payload = positionPayload(position, {
      treasurer: treasurer ?? isTreasurer(m),
      venueIds: venueIds ?? (sc.all ? [] : sc.venueIds),
    });
    setMemberRoles(clubId, m.id, payload);
    return flash(`${m.name} → ${payload.roles.join(' · ')}${payload.staffVenueIds.length ? ` (${payload.staffVenueIds.map((id) => venues.find((v) => v.id === id)?.name || '').filter(Boolean).join(', ')})` : ''}`);
  };

  /** 화면 표시 — '운영진 · 총무 · 한강' */
  const scopeLabel = (m) => {
    if (positionOf(m) !== ROLES.STAFF) return '';
    const sc = staffScope(m, venues);
    return sc.all ? '코트장 전체' : sc.venueIds.map((id) => venues.find((v) => v.id === id)?.name).filter(Boolean).join(', ');
  };
  const roleText = (m) => {
    const pos = positionOf(m);
    return [pos, isTreasurer(m) && pos !== ROLES.MEMBER ? '총무' : '', scopeLabel(m)].filter(Boolean).join(' · ');
  };

  const staff = members.filter(isStaffMember);

  const pickedIds = Object.keys(picked).filter((k) => picked[k]);
  const bulkAssign = (venueIds, mode) => {
    if (!pickedIds.length) return flash('회원을 먼저 고르세요');
    const label = venueIds.length
      ? venues.filter((v) => venueIds.includes(v.id)).map((v) => v.name).join(', ')
      : '배정 해제';
    return Alert.alert(
      '코트장 일괄 배정',
      `${pickedIds.length}명을 ${label}${mode === 'add' ? '에 추가' : '(으)로 설정'}합니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '적용',
          onPress: async () => {
            try {
              const n = await assignVenuesBulk(clubId, pickedIds, venueIds, mode);
              setPicked({});
              flash(`${n}명 배정 완료`);
            } catch (e) {
              flash('배정에 실패했습니다');
            }
          },
        },
      ],
    );
  };

  return (
    <View>
      {/* 운영진 요약 */}
      <Card>
        <Text style={{ fontSize: 12, fontWeight: '700', marginBottom: 6 }}>운영 담당 ({staff.length}명)</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {staff.map((m) => (
            <Chip key={m.id} tone={roleTone(positionOf(m))}>{m.name} · {roleText(m)}</Chip>
          ))}
          {staff.length === 0 && <Text style={{ fontSize: 11, color: C.faint }}>지정된 운영 담당이 없습니다.</Text>}
        </View>
        <Text style={{ fontSize: 10, color: C.faint, marginTop: 8, lineHeight: 15 }}>
          역할 임명은 <Text style={{ fontWeight: '700' }}>회장</Text>과 회장이 세운 <Text style={{ fontWeight: '700' }}>운영진 대표</Text>가 합니다.
          운영진 대표는 운영진·총무·회원을 정하고, 회장·운영진 대표 자리는 회장만 정합니다. 인원 제한은 없습니다.
        </Text>
      </Card>

      {/* 역할이 뭘 할 수 있는지 — 임명하기 전에 확인 */}
      <SectionTitle>역할별 권한</SectionTitle>
      <Card>
        {[ROLES.PRESIDENT, ROLES.HEAD, ROLES.STAFF, ROLES.MANAGER, ROLES.MEMBER].map((r, i) => (
          <View
            key={r}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7,
              borderTopWidth: i ? 1 : 0, borderTopColor: '#f5f5f4',
            }}
          >
            <View style={{ width: 104 }}><Chip tone={roleTone(r)}>{r}</Chip></View>
            <Text style={{ flex: 1, fontSize: 11, color: C.sub, lineHeight: 16 }}>{ROLE_DESC[r]}</Text>
          </View>
        ))}
        <Text style={{ fontSize: 10, color: C.faint, marginTop: 8, lineHeight: 15 }}>
          총무는 따로 있는 자리가 아니라 운영진(또는 운영진 대표)에게 켜는 회비 관리 권한입니다.
          운영진은 「코트장 전체」 또는 「선택한 코트장만」 맡습니다(예전 '리드' = 선택한 코트장만).
        </Text>
      </Card>

      {/* 코트장 일괄 배정 — 200명을 한 명씩 누를 수는 없다.
         이 지정이 비어 있으면 일정·투표가 전원에게 가므로 반드시 채워야 한다. */}
      {isAdmin && venues.length > 0 && (
        <>
          <SectionTitle right={
            <Chip tone={bulkOn ? 'green' : 'outline'} onPress={() => { setBulkOn(!bulkOn); setPicked({}); }}>
              {bulkOn ? '닫기' : '열기'}
            </Chip>
          }>코트장 일괄 배정</SectionTitle>

          {bulkOn && (
            <Card>
              <Text style={{ fontSize: 11, color: C.sub, lineHeight: 16 }}>
                회원을 고르고 코트장을 누르면 한 번에 배정됩니다.
                배정이 없는 회원은 모든 코트장의 일정·투표를 받습니다.
              </Text>

              {/* 아직 배정 안 된 사람부터 — 이게 가장 급하다 */}
              {(() => {
                const none = members.filter((m) => !(m.venueIds || []).length);
                if (!none.length) return null;
                return (
                  <View style={{ marginTop: 10 }}>
                    <Btn small tone="ghost"
                      onPress={() => setPicked(Object.fromEntries(none.map((m) => [m.id, true])))}>
                      미배정 {none.length}명 고르기
                    </Btn>
                  </View>
                );
              })()}

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
                {members.map((m) => {
                  const on = !!picked[m.id];
                  const where = (m.venueIds || [])
                    .map((id) => venues.find((v) => v.id === id)?.name).filter(Boolean);
                  return (
                    <Chip key={m.id} tone={on ? 'green' : 'outline'}
                      onPress={() => setPicked({ ...picked, [m.id]: !on })}>
                      {m.name}{where.length ? ` · ${where.join('/')}` : ''}
                    </Chip>
                  );
                })}
              </View>

              <View style={{
                marginTop: 12, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10,
              }}>
                <Label hint={`${pickedIds.length}명 선택됨`}>이 코트장으로</Label>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {venues.map((v) => (
                    <Chip key={v.id} tone="soft" onPress={() => bulkAssign([v.id], 'set')}>
                      {v.name}
                    </Chip>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {venues.map((v) => (
                    <Chip key={v.id} tone="outline" onPress={() => bulkAssign([v.id], 'add')}>
                      ＋{v.name} 추가
                    </Chip>
                  ))}
                  <Chip tone="red" onPress={() => bulkAssign([], 'set')}>배정 해제</Chip>
                </View>
                <Text style={{ fontSize: 10, color: C.faint, marginTop: 8, lineHeight: 15 }}>
                  [코트장]은 기존 배정을 덮어쓰고, [＋추가]는 겸소속으로 더합니다.
                </Text>
              </View>
            </Card>
          )}
        </>
      )}

      {/* 등급 배정 — 부수(1부~)와 조(A~). 더보기 › 클럽 운영 › [등급 배정]과 같은 판.
         예전엔 회원 상세를 하나씩 열어야만 바꿀 수 있어서 "등급이 없다"로 보였다. */}
      {isAdmin && (
        <>
          <SectionTitle right={
            <Chip tone={gradeOn ? 'green' : 'outline'} onPress={() => setGradeOn(!gradeOn)}>
              {gradeOn ? '닫기' : '열기'}
            </Chip>
          }>등급 배정 (부수 · 조)</SectionTitle>
          {!gradeOn && (
            <Text style={{ fontSize: 11.5, color: C.faint, marginTop: -4, lineHeight: 17 }}>
              부수 · {gradeSummary(members, (m) => m.busu, 'busu') || '아직 없음'}{'\n'}
              조 · {gradeSummary(members, (m) => m.grade, 'grade') || '아직 없음'}
            </Text>
          )}
          {gradeOn && <GradeAssign embedded {...{ clubId, members, venues, flash }} />}
        </>
      )}

      {!!mergeJob && (
        <Card style={{ marginTop: 12, backgroundColor: mergeJob.status === 'failed' ? C.dangerBg : C.greenSoft }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: C.text }}>
            {mergeJob.status === 'done' ? '합쳤습니다' : mergeJob.status === 'failed' ? '합치지 못했습니다' : '합치는 중…'} · {mergeJob.label}
          </Text>
          {!!mergeJob.detail && <Text style={{ fontSize: 13, color: C.sub, marginTop: 4 }}>{mergeJob.detail}</Text>}
          {mergeJob.status === 'queued' && mergeJob.slow && (
            <Text style={{ fontSize: 13, color: C.warn, marginTop: 4, lineHeight: 19 }}>
              시간이 오래 걸립니다. 서버 기능(Cloud Functions)이 아직 배포되지 않았을 수 있어요 —
              배포 후 자동으로 처리됩니다.
            </Text>
          )}
          {mergeJob.status !== 'queued' && (
            <Pressable onPress={() => setMergeJob(null)} style={{ marginTop: 8, minHeight: 40, justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.green }}>닫기</Text>
            </Pressable>
          )}
        </Card>
      )}

      {candidates.length > 0 && (
        <>
          <SectionTitle hint="이름이 같은 오프라인 회원 ↔ 앱 회원">앱에 가입한 오프라인 회원</SectionTitle>
          <Card>
            <Text style={{ fontSize: 13, color: C.sub, lineHeight: 19, marginBottom: 6 }}>
              같은 사람이면 합쳐 주세요. 예전 참석·대진·점수·회비 기록이 앱 계정으로 옮겨집니다.
            </Text>
            {candidates.map(({ offline: off, online: on }, i) => (
              <View key={off.id} style={{
                flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48,
                borderTopWidth: i ? 1 : 0, borderTopColor: C.border,
              }}>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: C.text }}>
                  {off.name} <Text style={{ color: C.sub, fontWeight: '600' }}>(오프라인)</Text>
                  {'  →  '}{on.name} <Text style={{ color: C.sub, fontWeight: '600' }}>(앱)</Text>
                </Text>
                <Btn small onPress={() => askMerge(off, on)}>합치기</Btn>
              </View>
            ))}
          </Card>
        </>
      )}

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
                      {isStaffMember(m) && <Chip tone={roleTone(positionOf(m))}>{[positionOf(m), isTreasurer(m) ? '총무' : ''].filter(Boolean).join(' · ')}</Chip>}
                      {!!m.grade && <Chip tone="lime">{m.grade}조</Chip>}
                      {!!m.busu && <Chip tone="soft">{m.busu}</Chip>}
                      {eff.value != null && <Chip tone="outline">NTRP {eff.value.toFixed(1)}</Chip>}
                    </View>
                    <Text style={{ fontSize: 10.5, color: C.faint, marginTop: 2 }}>
                      {m.gender === 'M' ? '남' : '여'}
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

                  {isAdmin && (
                  <View style={{ marginTop: S.md }}>
                    <Label hint="대회 참가 자격의 기준이 됩니다 · 운영진이 정합니다">부수</Label>
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
                  )}

                  {isAdmin && (
                  <View style={{ marginTop: S.md }}>
                    <Label hint="조를 쓰지 않는 클럽은 '선택 안함'">클럽 내부 조</Label>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                      <Chip tone={!d.grade ? 'green' : 'outline'} onPress={() => setD({ ...d, grade: '' })}>선택 안함</Chip>
                      {GRADES.map((g) => (
                        <Chip key={g} tone={d.grade === g ? 'lime' : 'outline'} onPress={() => setD({ ...d, grade: g })}>{g}조</Chip>
                      ))}
                    </View>
                  </View>
                  )}

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

                  {/* 오프라인 회원 → 앱에 가입한 회원과 합치기 (회장·총무) */}
                  {canMerge && isOfflineId(m.id) && (
                    <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#e7e5e4', paddingTop: 10 }}>
                      <Label hint="이 사람이 앱에 가입했다면">앱 회원과 합치기</Label>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {onlineMembers(members).map((on) => (
                          <Chip key={on.id} tone="outline" onPress={() => askMerge(m, on)}>{on.name}</Chip>
                        ))}
                      </View>
                      <Text style={{ fontSize: 10.5, color: C.faint, marginTop: 6, lineHeight: 15 }}>
                        고른 앱 회원에게 이 사람의 참석·대진·점수·회비 기록을 옮기고, 오프라인 회원은 지웁니다.
                      </Text>
                    </View>
                  )}

                  {/* 역할 — 직책 하나 + (운영진이면) 운영 범위 + 총무 켜기. 누르면 바로 저장 */}
                  {canAppoint && canEditRolesOf(myRole, m) && (() => {
                    const pos = positionOf(m);
                    const sc = staffScope(m, venues);
                    const tre = isTreasurer(m);
                    const positions = POSITION_ROLES.filter((r) => !TOP_ROLES.includes(r) || canAssignRole(myRole, m.role, r));
                    return (
                      <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#e7e5e4', paddingTop: 10 }}>
                        <Label hint="누르면 바로 바뀝니다">직책</Label>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                          {positions.map((r) => (
                            <Chip key={r} tone={pos === r ? 'green' : 'outline'} onPress={() => pos !== r && applyRoles(m, r)}>{r}</Chip>
                          ))}
                        </View>

                        {pos === ROLES.STAFF && venues.length > 0 && (
                          <View style={{ marginTop: 10 }}>
                            <Label hint="이 운영진이 맡는 코트장">운영 범위</Label>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                              <Chip tone={sc.all ? 'green' : 'outline'} onPress={() => !sc.all && applyRoles(m, pos, { venueIds: [] })}>코트장 전체</Chip>
                              {venues.map((v) => {
                                const on = !sc.all && sc.venueIds.includes(v.id);
                                return (
                                  <Chip key={v.id} tone={on ? 'green' : 'outline'}
                                    onPress={() => {
                                      const cur = sc.all ? [] : sc.venueIds;
                                      applyRoles(m, pos, { venueIds: on ? cur.filter((x) => x !== v.id) : [...cur, v.id] });
                                    }}>{v.name}</Chip>
                                );
                              })}
                            </View>
                            <Text style={{ fontSize: 10, color: C.faint, marginTop: 5, lineHeight: 15 }}>
                              코트장을 고르면 그 코트장의 일정·대진·회원만 다룹니다. 모두 끄면 코트장 전체입니다.
                            </Text>
                          </View>
                        )}

                        {(pos === ROLES.STAFF || pos === ROLES.HEAD) && (
                          <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.text }}>총무 (회비 관리)</Text>
                              <Text style={{ fontSize: 10.5, color: C.faint, marginTop: 2, lineHeight: 15 }}>켜면 회비·지출·정산을 보고 관리합니다</Text>
                            </View>
                            <Chip tone={tre ? 'green' : 'outline'} onPress={() => applyRoles(m, pos, { treasurer: !tre })}>{tre ? '켜짐' : '꺼짐'}</Chip>
                          </View>
                        )}

                        <Text style={{ fontSize: 10, color: C.faint, marginTop: 8, lineHeight: 15 }}>
                          {[ROLE_DESC[pos], tre && pos !== ROLES.MEMBER ? ROLE_DESC[ROLES.MANAGER] : ''].filter(Boolean).join('\n')}
                        </Text>
                      </View>
                    );
                  })()}

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

              {/* 직책 — 등록할 때 같이 정한다.
                 예전에는 무조건 '회원'으로 들어가서, 운영진을 추가해 놓고
                 목록에서 역할을 다시 바꿔야 했다. 그 "다시"가 매번 빠졌다. */}
              <View style={{ marginTop: 12 }}>
                <Label hint="나중에 회원 목록에서 바꿀 수 있습니다">직책</Label>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                  {(canAppoint ? POSITION_ROLES.filter((r) => canAssignRole(myRole, ROLES.MEMBER, r)) : [ROLES.MEMBER]).map((r) => (
                    <Chip key={r} tone={nm.role === r ? 'green' : 'outline'}
                      onPress={() => setNm({ ...nm, role: r })}>{r}</Chip>
                  ))}
                </View>
              </View>

              {/* 소속 코트장 — 200명 클럽에서 이게 없으면 일정·투표가
                 전원에게 간다. 등록 시점에 정하는 것이 가장 안 빠진다. */}
              {venues.length > 0 && (
                <View style={{ marginTop: 12 }}>
                  <Label hint="여러 곳 선택 가능 · 일정·투표 대상이 여기서 갈립니다">
                    소속 코트장
                  </Label>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                    {venues.map((v) => {
                      const on = (nm.venueIds || []).includes(v.id);
                      return (
                        <Chip key={v.id} tone={on ? 'green' : 'outline'}
                          onPress={() => setNm({
                            ...nm,
                            venueIds: on
                              ? nm.venueIds.filter((x) => x !== v.id)
                              : [...(nm.venueIds || []), v.id],
                          })}>
                          {v.name}
                        </Chip>
                      );
                    })}
                  </View>
                  {(nm.venueIds || []).length === 0 && (
                    <Text style={{ fontSize: 10.5, color: C.warn, marginTop: 5 }}>
                      지정하지 않으면 모든 코트장의 일정·투표를 받습니다.
                    </Text>
                  )}
                </View>
              )}
              <View style={{ marginTop: 12 }}>
                <Btn full disabled={!nm.name} onPress={() => {
                  const data = {
                    name: nm.name.trim(), gender: nm.gender, grade: nm.grade,
                    busu: nm.busu || '', region: nm.region || '',
                    ...(() => {
                      const r = canAppoint && canAssignRole(myRole, ROLES.MEMBER, nm.role) ? nm.role : ROLES.MEMBER;
                      const pl = rolesPayload([r]);
                      return { role: pl.role, roles: pl.roles };
                    })(),
                    venueIds: nm.venueIds || [],
                  };
                  const s = (nm.startedAt || '').trim();
                  if (s) data.startedAt = /^\d{4}-\d{2}$/.test(s) ? `${s}-01` : s;
                  addMember(clubId, 'local:' + rid(), data);
                  const where = (nm.venueIds || [])
                    .map((id) => venues.find((v) => v.id === id)?.name)
                    .filter(Boolean).join(', ');
                  setNm({
                    name: '', gender: 'M', busu: '', grade: '', region: '', startedAt: '',
                    role: ROLES.MEMBER, venueIds: [],
                  });
                  flash(`${data.name} 추가${where ? ` · ${where}` : ''}`);
                }}>추가</Btn>
              </View>
            </Card>
          )}
        </>
      )}
    </View>
  );
}
