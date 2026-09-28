/* 코트장 선택 드롭다운 — 홈·대진에서 공용.
   보기 범위(scopeVenues)에 따라 선택지가 달라진다.
   코트장이 1곳뿐이면 드롭다운 대신 이름만 표시.

   mineIds(내가 나가는 코트장)를 주면 그 코트장을 맨 위로 올리고 「내 코트」를
   붙인다 — 운영진은 코트장이 여럿 보여 자기 코트를 찾기 어려웠다(앱 주인). */
import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { C } from '../lib/theme';
import { splitMine } from '../lib/scheduleView';

export function VenuePicker({ venues, value, onChange, allowAll = true, dark = false, label = '코트장', mineIds }) {
  const [open, setOpen] = useState(false);
  const { mine, others } = splitMine(venues, mineIds);
  const list = [...mine, ...others];
  const isMine = (id) => mine.some((v) => v.id === id);
  const current = list.find((v) => v.id === value);
  const title = value === null || value === undefined
    ? (allowAll ? '전체 코트' : '선택') : (current?.name || '알 수 없음');

  // 선택지가 없거나 하나뿐이면 드롭다운을 열 필요가 없다
  const single = list.length <= 1 && !allowAll;

  const fg = dark ? C.lime : C.ink;

  const option = (v, my, first = false) => (
    <Pressable key={v.id} onPress={() => { onChange(v.id); setOpen(false); }}
      style={{
        paddingHorizontal: 12, paddingVertical: 10,
        backgroundColor: value === v.id ? '#ecfccb' : '#fff',
        borderTopWidth: first ? 0 : 1, borderTopColor: '#f5f5f4',
        borderLeftWidth: my ? 4 : 0, borderLeftColor: C.green,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ fontSize: 13, fontWeight: my ? '800' : '700', color: my ? C.ink : C.sub }}>{v.name}</Text>
        {my && (
          <Text style={{
            fontSize: 10.5, fontWeight: '800', color: C.green, backgroundColor: C.greenSoft,
            paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, overflow: 'hidden',
          }}>내 코트</Text>
        )}
      </View>
      <Text style={{ fontSize: 11, color: C.sub, marginTop: 1 }}>
        {v.startTime}~{v.endTime} · 코트 {v.courts}면
      </Text>
    </Pressable>
  );
  const bg = dark ? 'rgba(255,255,255,0.12)' : '#f5f5f4';

  return (
    <View style={{ zIndex: 10 }}>
      <Pressable
        onPress={() => !single && setOpen(!open)}
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          backgroundColor: bg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9,
        }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <Text style={{ fontSize: 11, color: dark ? '#BFE3D3' : C.faint, fontWeight: '700' }}>{label}</Text>
          <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '800', color: fg, flex: 1 }}>
            {title}
            {current && isMine(current.id) ? <Text style={{ fontSize: 11, fontWeight: '800', color: dark ? C.lime : C.green }}>  내 코트</Text> : null}
            {current ? <Text style={{ fontSize: 11, fontWeight: '600', color: dark ? '#BFE3D3' : C.sub }}>  {current.startTime}~{current.endTime} · {current.courts}면</Text> : null}
          </Text>
        </View>
        {!single && <Text style={{ fontSize: 12, color: dark ? '#BFE3D3' : C.sub }}>{open ? '▲' : '▼'}</Text>}
      </Pressable>

      {open && (
        <View style={{
          position: 'absolute', top: 44, left: 0, right: 0,
          backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: C.border,
          shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
          elevation: 6, overflow: 'hidden',
        }}>
          {mine.map((v, i) => option(v, true, i === 0))}
          {allowAll && (
            <Pressable onPress={() => { onChange(null); setOpen(false); }}
              style={{
                paddingHorizontal: 12, paddingVertical: 10, backgroundColor: value == null ? '#ecfccb' : '#fff',
                borderTopWidth: mine.length ? 1 : 0, borderTopColor: '#f5f5f4',
              }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>전체 코트</Text>
            </Pressable>
          )}
          {others.map((v, i) => option(v, false, !allowAll && !mine.length && i === 0))}
          {list.length === 0 && (
            <View style={{ padding: 12 }}>
              <Text style={{ fontSize: 12, color: C.faint }}>등록된 코트장이 없습니다.</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
