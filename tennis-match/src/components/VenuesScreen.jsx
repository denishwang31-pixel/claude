/* 코트장 관리 — 클럽이 여러 곳을 운영할 때
   코트장별 면수 · 운영시간 · 타임 길이 · 리드(담당자) 지정 */
import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { addVenue, updateVenue, deleteVenue } from '../lib/firestore';
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

  const nameOf = (id) => members.find((m) => m.id === id)?.name;

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
                onSubmit={() => { updateVenue(clubId, v.id, normalize(editDraft)); setEditId(null); flash('코트장 수정됨'); }}
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
              </View>
              {isAdmin && (
                <View style={{ gap: 6 }}>
                  <Btn small tone="ghost" onPress={() => { setEditId(v.id); setEditDraft({ ...v, courts: String(v.courts) }); }}>수정</Btn>
                  <Pressable onPress={() => { deleteVenue(clubId, v.id); flash('삭제됨'); }}>
                    <Text style={{ fontSize: 11, color: C.danger, textAlign: 'center' }}>삭제</Text>
                  </Pressable>
                </View>
              )}
            </View>
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
                addVenue(clubId, normalize(draft));
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
