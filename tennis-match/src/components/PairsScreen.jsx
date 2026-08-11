/* 커플 / 고정 페어 등록 — 대진 편성 제약으로 사용됨
   커플     : 함께 오고 가야 하는 관계 → 출전 라운드 동기화(같은 타임에 함께 뛰거나 함께 쉼)
   고정 페어 : 대회 준비 등 항상 같은 팀 → 동기화 + 같은 팀 배정 */
import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { setPairs } from '../lib/firestore';
import { Card, SectionTitle, Chip, Btn } from './ui';
import { C } from '../lib/theme';

export function Pairs({ clubId, members, pairs, isAdmin, flash }) {
  const [kind, setKind] = useState('couples'); // couples | fixedPairs
  const [sel, setSel] = useState([]);

  const nameOf = (id) => members.find((m) => m.id === id)?.name || '?';
  const list = pairs?.[kind] || [];
  const other = kind === 'couples' ? 'fixedPairs' : 'couples';

  const toggle = (id) => {
    if (sel.includes(id)) setSel(sel.filter((x) => x !== id));
    else if (sel.length < 2) setSel([...sel, id]);
    else setSel([sel[1], id]);
  };

  const add = () => {
    if (sel.length !== 2) return flash('두 명을 선택하세요');
    const exists = list.some(([a, b]) => (a === sel[0] && b === sel[1]) || (a === sel[1] && b === sel[0]));
    if (exists) return flash('이미 등록된 조합입니다');
    // 한 사람이 여러 조합에 묶이면 편성이 불가능해질 수 있어 1인 1조합으로 제한
    const busy = [...(pairs?.couples || []), ...(pairs?.fixedPairs || [])]
      .some(([a, b]) => sel.includes(a) || sel.includes(b));
    if (busy) return flash('이미 다른 커플/페어에 등록된 회원이 있습니다');

    setPairs(clubId, { ...pairs, [kind]: [...list, sel], [other]: pairs?.[other] || [] });
    setSel([]);
    flash(kind === 'couples' ? '커플 등록됨' : '고정 페어 등록됨');
  };

  const remove = (idx) => {
    setPairs(clubId, { ...pairs, [kind]: list.filter((_, i) => i !== idx) });
    flash('삭제됨');
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        {[['couples', '💑 커플'], ['fixedPairs', '🎾 고정 페어']].map(([k, label]) => (
          <Pressable key={k} onPress={() => { setKind(k); setSel([]); }}
            style={{ flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: 'center', backgroundColor: kind === k ? C.green : '#fff', borderWidth: kind === k ? 0 : 1, borderColor: C.border }}>
            <Text style={{ fontWeight: '700', fontSize: 13, color: kind === k ? C.lime : C.sub }}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <Card>
        <Text style={{ fontSize: 12, color: C.sub, lineHeight: 18 }}>
          {kind === 'couples'
            ? '커플로 등록하면 두 사람이 항상 같은 타임에 함께 출전하거나 함께 쉽니다. 한 사람만 일찍 나오거나 늦게까지 기다리는 일이 없어집니다. (같은 팀일 필요는 없습니다)'
            : '고정 페어는 항상 같은 팀으로 편성됩니다. 대회 준비를 위해 특정 조합으로 계속 연습할 때 사용하세요. 출전 타임도 자동으로 함께 맞춰집니다.'}
        </Text>
      </Card>

      <SectionTitle>등록된 목록 ({list.length})</SectionTitle>
      <Card>
        {list.map(([a, b], i) => (
          <View key={`${a}-${b}`} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: '#f5f5f4' }}>
            <Text style={{ fontSize: 14, fontWeight: '600' }}>
              {nameOf(a)} <Text style={{ color: C.faint }}>·</Text> {nameOf(b)}
            </Text>
            {isAdmin && (
              <Pressable onPress={() => remove(i)}><Text style={{ color: C.danger, fontSize: 12 }}>삭제</Text></Pressable>
            )}
          </View>
        ))}
        {list.length === 0 && <Text style={{ fontSize: 12, color: C.faint }}>등록된 항목이 없습니다.</Text>}
      </Card>

      {isAdmin && (
        <>
          <SectionTitle>새로 등록 (2명 선택)</SectionTitle>
          <Card>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {members.map((m) => (
                <Chip key={m.id} tone={sel.includes(m.id) ? 'green' : 'outline'} onPress={() => toggle(m.id)}>
                  {m.name}
                </Chip>
              ))}
            </View>
            <View style={{ marginTop: 12 }}>
              <Btn full disabled={sel.length !== 2} onPress={add}>
                {sel.length === 2 ? `${nameOf(sel[0])} · ${nameOf(sel[1])} 등록` : '두 명을 선택하세요'}
              </Btn>
            </View>
          </Card>
        </>
      )}
    </View>
  );
}
