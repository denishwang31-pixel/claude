/* 코트장 선택 드롭다운 — 홈·대진에서 공용.
   보기 범위(scopeVenues)에 따라 선택지가 달라진다.
   코트장이 1곳뿐이면 드롭다운 대신 이름만 표시. */
import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { C } from '../lib/theme';

export function VenuePicker({ venues, value, onChange, allowAll = true, dark = false, label = '코트장' }) {
  const [open, setOpen] = useState(false);
  const list = venues || [];
  const current = list.find((v) => v.id === value);
  const title = value === null || value === undefined
    ? (allowAll ? '전체 코트' : '선택') : (current?.name || '알 수 없음');

  // 선택지가 없거나 하나뿐이면 드롭다운을 열 필요가 없다
  const single = list.length <= 1 && !allowAll;

  const fg = dark ? C.lime : C.ink;
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
          <Text style={{ fontSize: 11, color: dark ? '#6ee7b7' : C.faint, fontWeight: '700' }}>{label}</Text>
          <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '800', color: fg, flex: 1 }}>
            {title}
            {current ? <Text style={{ fontSize: 11, fontWeight: '600', color: dark ? '#a7f3d0' : C.sub }}>  {current.startTime}~{current.endTime} · {current.courts}면</Text> : null}
          </Text>
        </View>
        {!single && <Text style={{ fontSize: 12, color: dark ? '#a7f3d0' : C.sub }}>{open ? '▲' : '▼'}</Text>}
      </Pressable>

      {open && (
        <View style={{
          position: 'absolute', top: 44, left: 0, right: 0,
          backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: C.border,
          shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
          elevation: 6, overflow: 'hidden',
        }}>
          {allowAll && (
            <Pressable onPress={() => { onChange(null); setOpen(false); }}
              style={{ paddingHorizontal: 12, paddingVertical: 10, backgroundColor: value == null ? '#ecfccb' : '#fff' }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>전체 코트</Text>
            </Pressable>
          )}
          {list.map((v) => (
            <Pressable key={v.id} onPress={() => { onChange(v.id); setOpen(false); }}
              style={{
                paddingHorizontal: 12, paddingVertical: 10,
                backgroundColor: value === v.id ? '#ecfccb' : '#fff',
                borderTopWidth: 1, borderTopColor: '#f5f5f4',
              }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>{v.name}</Text>
              <Text style={{ fontSize: 11, color: C.sub, marginTop: 1 }}>
                {v.startTime}~{v.endTime} · 코트 {v.courts}면
              </Text>
            </Pressable>
          ))}
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
