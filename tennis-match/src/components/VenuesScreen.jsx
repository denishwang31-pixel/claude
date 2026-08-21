/* 코트장 관리 — 클럽이 여러 곳을 운영할 때
   코트장별 면수 · 운영시간 · 타임 길이 · 리드(담당자) 지정 */
import React, { useState, useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import {
  addVenue, updateVenue, deleteVenue, publishClubDirectory,
  saveVenueFee, saveVenueNotify,
} from '../lib/firestore';
import { feeScopeOf, FEE_SCOPE } from '../lib/scope';
import { NotifyPrefs, VenueFeeOverride, VenueOverrideBadges } from './ScopeControls';
import { roundsFromSettings, toMinutes, DEFAULT_SETTINGS } from '../lib/schedule';
import { normalizeRoundMinutes, roundMinutesLabel } from '../lib/constants';
import { RoundMinutesPicker } from './RoundMinutesPicker';
import { Card, SectionTitle, Chip, Btn, Field } from './ui';
import { C } from '../lib/theme';

const blankVenue = (settings) => ({
  name: '',
  courts: String(settings?.courts ?? 2),
  startTime: settings?.startTime ?? '10:00',
  endTime: settings?.endTime ?? '13:00',
  roundMinutes: settings?.roundMinutes ?? 40,
  leadId: null,
  addr: '',
});

function VenueForm({ draft, setDraft, members, onSubmit, submitLabel, onCancel }) {
  const rounds = roundsFromSettings(draft);
  const timeOk = toMinutes(draft.startTime) != null && toMinutes(draft.endTime) != null;
  return (
    <Card>
      <Text style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>코트장 이름</Text>
      <Field placeholder="예: 올림픽공원 테니스장" value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} />

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>면수</Text>
          <Field keyboardType="number-pad" value={String(draft.courts)} onChangeText={(v) => setDraft({ ...draft, courts: v })} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>시작</Text>
          <Field placeholder="10:00" value={draft.startTime} onChangeText={(v) => setDraft({ ...draft, startTime: v })} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>종료</Text>
          <Field placeholder="13:00" value={draft.endTime} onChangeText={(v) => setDraft({ ...draft, endTime: v })} />
        </View>
      </View>

      <Text style={{ fontSize: 11, color: C.sub, marginTop: 8, marginBottom: 4 }}>한 타임 길이</Text>
      <RoundMinutesPicker
        value={draft.roundMinutes}
        onChange={(v) => setDraft({ ...draft, roundMinutes: v })}
      />

      <Text style={{ fontSize: 11, color: C.sub, marginTop: 10, marginBottom: 4 }}>
        리드 담당자 <Text style={{ color: C.faint }}>(이 코트장 운영을 맡는 회원)</Text>
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Chip tone={!draft.leadId ? 'green' : 'outline'} onPress={() => setDraft({ ...draft, leadId: null })}>미지정</Chip>
        {members.map((m) => (
          <Chip key={m.id} tone={draft.leadId === m.id ? 'green' : 'outline'}
            onPress={() => setDraft({ ...draft, leadId: m.id })}>{m.name}</Chip>
        ))}
      </View>

      <View style={{ marginTop: 8 }}>
        <Text style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>주소 (선택)</Text>
        <Field placeholder="서울 송파구 올림픽로 424" value={draft.addr || ''} onChangeText={(v) => setDraft({ ...draft, addr: v })} />
      </View>

      {timeOk && (
        <Text style={{ fontSize: 11, color: C.green2, marginTop: 8 }}>
          → {draft.startTime}~{draft.endTime} · {draft.courts}면 · {rounds}타임 (한 타임 최대 {(Number(draft.courts) || 0) * 4}명)
        </Text>
      )}

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <Btn disabled={!draft.name || !timeOk} onPress={onSubmit}>{submitLabel}</Btn>
        {onCancel && <Btn tone="ghost" onPress={onCancel}>취소</Btn>}
      </View>
    </Card>
  );
}

export function Venues({ clubId, club, venues, members, isAdmin, flash }) {
  const settings = { ...DEFAULT_SETTINGS, ...(club?.settings || {}) };
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(blankVenue(settings));
  const [editId, setEditId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  /* 어느 코트장의 "따로 정하기"를 펼쳐 두었나 */
  const [tuning, setTuning] = useState(null);
  const [feeDraft, setFeeDraft] = useState({ feeAmount: '', feeDueDay: '', feeAccount: '' });
  const feeByVenue = feeScopeOf(club) === FEE_SCOPE.VENUE;

  /* 펼칠 때마다 그 코트장의 현재 값을 담는다.
     ⚠️ 빈 문자열은 "안 정함"이다 — 0 으로 채우면 회비 0원인 코트장이
        되어 버린다(scope.resolve 참고). */
  useEffect(() => {
    const v = venues.find((x) => x.id === tuning);
    const txt = (n) => (n === undefined || n === null || n === '' ? '' : String(n));
    setFeeDraft({
      feeAmount: txt(v?.feeAmount),
      feeDueDay: txt(v?.feeDueDay),
      feeAccount: v?.feeAccount || '',
    });
  }, [tuning]);

  /* 빈칸은 저장하지 않고 지운다. 그래야 다시 전체 설정을 따라간다.
     (지우기와 0 저장을 나누는 일은 saveVenueFee 안에서 한다) */
  const saveFee = async (v) => {
    try {
      await saveVenueFee(clubId, v.id, feeDraft);
      flash(`${v.name} 회비 설정을 저장했습니다`);
    } catch (e) { flash('저장하지 못했습니다'); }
  };

  const nameOf = (id) => members.find((m) => m.id === id)?.name;

  /* 코트장이 바뀌면 공개 목록에도 반영한다.
     코트 검색 화면이 "이 코트를 쓰는 클럽"을 이 값으로 찾기 때문이다.
     여기서 안 밀어 주면 코트장을 등록해도 코트 검색에는 영영 안 나온다.
     이름과 주소만 나가고 리드·시간표는 클럽 안에 남는다. */
  const syncDirectory = (next) => {
    if (!clubId || !club?.name) return;
    publishClubDirectory(clubId, {
      name: club.name,
      region: club.region || '',
      memberCount: members.length,
      searchable: club.searchable !== false,
      image: club.image || '',
      hasPassword: !!club.joinPassword,
      venues: next,
    }).catch(() => {});
  };

  const normalize = (d) => ({
    name: d.name.trim(),
    courts: Math.max(1, Math.min(20, Number(d.courts) || 1)),
    startTime: d.startTime,
    endTime: d.endTime,
    roundMinutes: normalizeRoundMinutes(d.roundMinutes),
    leadId: d.leadId || null,
    addr: (d.addr || '').trim(),
  });

  return (
    <View>
      <Card>
        <Text style={{ fontSize: 12, color: C.sub, lineHeight: 18 }}>
          클럽이 여러 코트장을 운영하면 여기에 등록하세요. 코트장마다
          <Text style={{ fontWeight: '700' }}> 면수·운영시간·리드 담당자</Text>를 따로 관리합니다.
          모임을 등록할 때 코트장을 고르면 그 값이 자동으로 채워집니다.
        </Text>
      </Card>

      <SectionTitle>등록된 코트장 ({venues.length})</SectionTitle>
      {venues.map((v) => {
        const editing = editId === v.id;
        if (editing) {
          return (
            <View key={v.id} style={{ marginBottom: 8 }}>
              <VenueForm
                draft={editDraft} setDraft={setEditDraft} members={members}
                submitLabel="저장"
                onSubmit={() => {
                  const n = normalize(editDraft);
                  updateVenue(clubId, v.id, n);
                  syncDirectory(venues.map((x) => (x.id === v.id ? { ...x, ...n } : x)));
                  setEditId(null);
                  flash('코트장 수정됨');
                }}
                onCancel={() => setEditId(null)}
              />
            </View>
          );
        }
        return (
          <Card key={v.id} style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '800' }}>{v.name}</Text>
                <Text style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>
                  {v.startTime}~{v.endTime} · {v.courts}면 · {roundMinutesLabel(v.roundMinutes)}/타임 → {roundsFromSettings(v)}타임
                </Text>
                {v.addr ? <Text style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>{v.addr}</Text> : null}
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                  <Chip tone={v.leadId ? 'lime' : 'outline'}>
                    리드: {nameOf(v.leadId) || '미지정'}
                  </Chip>
                </View>
                <VenueOverrideBadges club={club} venue={v} />
              </View>
              {isAdmin && (
                <View style={{ gap: 6 }}>
                  <Btn small tone="ghost" onPress={() => { setEditId(v.id); setEditDraft({ ...v, courts: String(v.courts) }); }}>수정</Btn>
                  <Pressable onPress={() => {
                    deleteVenue(clubId, v.id);
                    syncDirectory(venues.filter((x) => x.id !== v.id));
                    flash('삭제됨');
                  }}>
                    <Text style={{ fontSize: 11, color: C.danger, textAlign: 'center' }}>삭제</Text>
                  </Pressable>
                </View>
              )}
            </View>

            {/* 이 코트장만 다르게 — 회비·알림.
               접어 두는 이유: 대부분의 코트장은 전체 설정을 그대로 쓴다.
               항상 펼쳐 두면 "여기도 뭔가 정해야 하나" 싶어진다. */}
            {isAdmin && (
              <Pressable onPress={() => setTuning(tuning === v.id ? null : v.id)}
                style={{
                  marginTop: 10, paddingTop: 10,
                  borderTopWidth: 1, borderTopColor: C.border,
                  flexDirection: 'row', alignItems: 'center',
                }}>
                <Text style={{ flex: 1, fontSize: 12, color: C.sub, fontWeight: '700' }}>
                  이 코트장만 다르게 (회비 · 알림)
                </Text>
                <Text style={{ fontSize: 12, color: C.faint }}>
                  {tuning === v.id ? '접기' : '펼치기'}
                </Text>
              </Pressable>
            )}

            {isAdmin && tuning === v.id && (
              <View style={{ marginTop: 10 }}>
                {feeByVenue ? (
                  <>
                    <VenueFeeOverride club={club} draft={feeDraft} setDraft={setFeeDraft} />
                    <View style={{ marginTop: 10 }}>
                      <Btn small onPress={() => saveFee(v)}>회비 저장</Btn>
                    </View>
                  </>
                ) : (
                  <Text style={{ fontSize: 11.5, color: C.sub, lineHeight: 18 }}>
                    지금은 회비를 <Text style={{ fontWeight: '700' }}>클럽 하나로</Text> 걷고 있어서
                    코트장별 금액을 쓰지 않습니다. 나누려면 [설정] → [회비 청구 단위]에서
                    "코트장마다"를 고르세요.
                  </Text>
                )}

                <SectionTitle>알림</SectionTitle>
                <NotifyPrefs
                  club={club} venue={v}
                  onChange={async (key, value) => {
                    try {
                      await saveVenueNotify(clubId, v.id, key, value);
                      flash(value === null ? '전체 설정을 따릅니다'
                        : value ? '켰습니다' : '껐습니다');
                    } catch (e) { flash('바꾸지 못했습니다'); }
                  }}
                />
              </View>
            )}
          </Card>
        );
      })}
      {venues.length === 0 && (
        <Card><Text style={{ fontSize: 12, color: C.sub }}>
          등록된 코트장이 없습니다. 한 곳만 쓰는 클럽은 등록하지 않아도 됩니다
          (클럽 설정의 기본 코트/시간이 사용됩니다).
        </Text></Card>
      )}

      {isAdmin && (
        adding ? (
          <View style={{ marginTop: 12 }}>
            <SectionTitle>새 코트장</SectionTitle>
            <VenueForm
              draft={draft} setDraft={setDraft} members={members}
              submitLabel="추가"
              onSubmit={() => {
                const n = normalize(draft);
                addVenue(clubId, n);
                syncDirectory([...venues, n]);
                setDraft(blankVenue(settings)); setAdding(false); flash('코트장 추가됨');
              }}
              onCancel={() => setAdding(false)}
            />
          </View>
        ) : (
          <View style={{ marginTop: 12 }}>
            <Btn full onPress={() => { setDraft(blankVenue(settings)); setAdding(true); }}>+ 코트장 추가</Btn>
          </View>
        )
      )}
    </View>
  );
}
