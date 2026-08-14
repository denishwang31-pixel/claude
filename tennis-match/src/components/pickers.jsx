/* 날짜/시간 입력 위젯 (외부 패키지 없이 직접 구현 — 빌드 리스크 없음)
   - DateField : 탭하면 달력이 펼쳐지고, 직접 타이핑도 가능
   - TimeField : 탭하면 30분 단위 목록이 펼쳐지고, 직접 타이핑도 가능 */
import React, { useState, useMemo } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Field } from './ui';
import { C } from '../lib/theme';

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/** 달력 그리드 (일요일 시작) */
function Calendar({ value, onPick, minDate }) {
  const base = useMemo(() => {
    const d = value ? new Date(value) : new Date();
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }, [value]);
  const [cursor, setCursor] = useState(new Date(base.getFullYear(), base.getMonth(), 1));

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const todayStr = ymd(new Date());

  const move = (delta) => setCursor(new Date(year, month + delta, 1));

  return (
    <View style={{ backgroundColor: '#fafaf9', borderRadius: 12, padding: 10, marginTop: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Pressable onPress={() => move(-1)} hitSlop={10} style={{ padding: 4 }}>
          <Text style={{ fontSize: 16, fontWeight: '900', color: C.green }}>‹</Text>
        </Pressable>
        <Text style={{ fontSize: 14, fontWeight: '800' }}>{year}년 {month + 1}월</Text>
        <Pressable onPress={() => move(1)} hitSlop={10} style={{ padding: 4 }}>
          <Text style={{ fontSize: 16, fontWeight: '900', color: C.green }}>›</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row' }}>
        {DOW.map((d, i) => (
          <Text key={d} style={{
            flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '700',
            color: i === 0 ? '#dc2626' : i === 6 ? '#2563eb' : C.faint, marginBottom: 4,
          }}>{d}</Text>
        ))}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((day, i) => {
          if (day === null) return <View key={`e${i}`} style={{ width: `${100 / 7}%`, height: 34 }} />;
          const ds = `${year}-${pad(month + 1)}-${pad(day)}`;
          const selected = value === ds;
          const isToday = ds === todayStr;
          const disabled = minDate && ds < minDate;
          const dow = (firstDow + day - 1) % 7;
          return (
            <Pressable key={ds} disabled={disabled} onPress={() => onPick(ds)}
              style={{ width: `${100 / 7}%`, height: 34, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{
                width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                backgroundColor: selected ? C.green : isToday ? '#ecfccb' : 'transparent',
              }}>
                <Text style={{
                  fontSize: 12, fontWeight: selected ? '900' : '600',
                  color: disabled ? '#d6d3d1'
                    : selected ? C.lime
                    : dow === 0 ? '#dc2626' : dow === 6 ? '#2563eb' : C.text,
                }}>{day}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** 날짜 입력 — 탭하면 달력, 직접 타이핑도 가능 */
export function DateField({ value, onChange, placeholder = 'YYYY-MM-DD', minDate }) {
  const [open, setOpen] = useState(false);
  const dowLabel = (() => {
    const d = new Date(value);
    return value && !Number.isNaN(d.getTime()) ? ` (${DOW[d.getDay()]})` : '';
  })();
  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Field placeholder={placeholder} value={value} onChangeText={onChange} style={{ flex: 1 }} />
        <Pressable onPress={() => setOpen(!open)}
          style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: open ? C.green : '#f5f5f4' }}>
          <Text style={{ fontSize: 16, color: open ? C.lime : C.sub }}>📅</Text>
        </Pressable>
      </View>
      {!!dowLabel && <Text style={{ fontSize: 11, color: C.green2, marginTop: 4 }}>{value}{dowLabel}</Text>}
      {open && (
        <Calendar value={value} minDate={minDate}
          onPick={(d) => { onChange(d); setOpen(false); }} />
      )}
    </View>
  );
}

/** 시간 입력 — 탭하면 30분 단위 목록, 직접 타이핑도 가능 */
export function TimeField({ value, onChange, placeholder = 'HH:MM', from = 6, to = 23 }) {
  const [open, setOpen] = useState(false);
  const options = [];
  for (let h = from; h <= to; h++) { options.push(`${pad(h)}:00`); options.push(`${pad(h)}:30`); }
  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Field placeholder={placeholder} value={value} onChangeText={onChange} style={{ flex: 1 }} />
        <Pressable onPress={() => setOpen(!open)}
          style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: open ? C.green : '#f5f5f4' }}>
          <Text style={{ fontSize: 16, color: open ? C.lime : C.sub }}>🕐</Text>
        </Pressable>
      </View>
      {open && (
        <View style={{ backgroundColor: '#fafaf9', borderRadius: 12, marginTop: 6, maxHeight: 180 }}>
          <ScrollView nestedScrollEnabled>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 8, gap: 6 }}>
              {options.map((t) => (
                <Pressable key={t} onPress={() => { onChange(t); setOpen(false); }}
                  style={{
                    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
                    backgroundColor: value === t ? C.green : '#fff',
                    borderWidth: value === t ? 0 : 1, borderColor: C.border,
                  }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: value === t ? C.lime : C.sub }}>{t}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  );
}

/** 입력 라벨 (헤더) */
export const Label = ({ children, hint }) => (
  <Text style={{ fontSize: 12, fontWeight: '700', color: C.sub, marginBottom: 4 }}>
    {children}{hint ? <Text style={{ fontWeight: '400', color: C.faint }}>  {hint}</Text> : null}
  </Text>
);
