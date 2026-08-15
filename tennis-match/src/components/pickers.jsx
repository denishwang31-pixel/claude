/* ============================================================
   날짜 / 시간 입력 — 플랫폼 표준 피커

   @react-native-community/datetimepicker 를 쓴다. 이게 각 OS 의 진짜
   위젯을 띄운다 — 안드로이드는 Material 다이얼로그, iOS 는 휠/캘린더.
   직접 만든 달력보다 손에 익고, 접근성·다국어·큰 글씨 설정도 OS 가 챙긴다.

   iOS 는 인라인(화면 안에 펼침), 안드로이드는 모달 다이얼로그가 관례라
   그대로 따랐다.
   ============================================================ */
import React, { useState, useMemo } from 'react';
import { View, Text, Modal, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Touchable, AppButton, isAndroid, isIOS, HIT } from './native';
import { C, R } from '../lib/theme';

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

const toDate = (s, fallback = new Date()) => {
  if (!s) return fallback;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? fallback : d;
};
const toTimeDate = (s) => {
  const d = new Date();
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''));
  if (m) { d.setHours(Number(m[1]), Number(m[2]), 0, 0); } else { d.setHours(10, 0, 0, 0); }
  return d;
};

/** 값이 들어가는 눌림 박스 — 두 피커가 공유 */
function ValueBox({ text, placeholder, onPress, icon }) {
  return (
    <Touchable onPress={onPress}
      style={{
        minHeight: HIT, paddingHorizontal: 14,
        backgroundColor: C.fill, borderRadius: R.md,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      }}>
      <Text style={{ fontSize: 15, color: text ? C.text : C.faint }}>{text || placeholder}</Text>
      <Text style={{ fontSize: 15 }}>{icon}</Text>
    </Touchable>
  );
}

/** 안드로이드용 — 값 확정 버튼이 있는 시트(iOS 인라인 피커를 감쌀 때도 씀) */
function PickerModal({ visible, onClose, onConfirm, children, title }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.32)', justifyContent: 'flex-end' }}>
        <View style={{
          backgroundColor: C.surface,
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          padding: 20, paddingBottom: 30,
        }}>
          {!!title && (
            <Text style={{ fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 10 }}>{title}</Text>
          )}
          {children}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <View style={{ flex: 1 }}><AppButton full variant="text" onPress={onClose}>취소</AppButton></View>
            <View style={{ flex: 1 }}><AppButton full onPress={onConfirm}>확인</AppButton></View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------
   DateField
   ------------------------------------------------------------ */
export function DateField({ value, onChange, placeholder = '날짜 선택', minDate, maxDate }) {
  const [show, setShow] = useState(false);
  const [temp, setTemp] = useState(null);

  const label = useMemo(() => {
    if (!value) return '';
    const d = toDate(value, null);
    if (!d) return value;
    return `${value} (${DOW[d.getDay()]})`;
  }, [value]);

  const min = minDate ? toDate(minDate, undefined) : undefined;
  const max = maxDate ? toDate(maxDate, undefined) : undefined;

  /* 안드로이드는 OS 다이얼로그가 자체 확인 버튼을 갖고 있어 바로 확정된다 */
  const onAndroidChange = (event, picked) => {
    setShow(false);
    if (event.type === 'set' && picked) onChange(ymd(picked));
  };

  return (
    <View>
      <ValueBox text={label} placeholder={placeholder} icon="📅"
        onPress={() => { setTemp(toDate(value)); setShow(true); }} />

      {show && isAndroid && (
        <DateTimePicker
          value={toDate(value)}
          mode="date"
          display="default"
          minimumDate={min}
          maximumDate={max}
          onChange={onAndroidChange}
        />
      )}

      {isIOS && (
        <PickerModal
          visible={show}
          title="날짜 선택"
          onClose={() => setShow(false)}
          onConfirm={() => { if (temp) onChange(ymd(temp)); setShow(false); }}>
          <DateTimePicker
            value={temp || toDate(value)}
            mode="date"
            display="inline"
            locale="ko-KR"
            minimumDate={min}
            maximumDate={max}
            themeVariant="light"
            onChange={(_, picked) => picked && setTemp(picked)}
          />
        </PickerModal>
      )}
    </View>
  );
}

/* ------------------------------------------------------------
   TimeField
   ------------------------------------------------------------ */
export function TimeField({ value, onChange, placeholder = '시간 선택' }) {
  const [show, setShow] = useState(false);
  const [temp, setTemp] = useState(null);

  const fmt = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  const onAndroidChange = (event, picked) => {
    setShow(false);
    if (event.type === 'set' && picked) onChange(fmt(picked));
  };

  return (
    <View>
      <ValueBox text={value} placeholder={placeholder} icon="🕐"
        onPress={() => { setTemp(toTimeDate(value)); setShow(true); }} />

      {show && isAndroid && (
        <DateTimePicker
          value={toTimeDate(value)}
          mode="time"
          display="default"
          is24Hour
          minuteInterval={5}
          onChange={onAndroidChange}
        />
      )}

      {isIOS && (
        <PickerModal
          visible={show}
          title="시간 선택"
          onClose={() => setShow(false)}
          onConfirm={() => { if (temp) onChange(fmt(temp)); setShow(false); }}>
          <DateTimePicker
            value={temp || toTimeDate(value)}
            mode="time"
            display="spinner"
            locale="ko-KR"
            minuteInterval={5}
            themeVariant="light"
            onChange={(_, picked) => picked && setTemp(picked)}
          />
        </PickerModal>
      )}
    </View>
  );
}

/* ------------------------------------------------------------
   MonthField — 테니스 시작 년월처럼 "월까지만" 받는 입력
   ------------------------------------------------------------ */
export function MonthField({ value, onChange, placeholder = '년월 선택', maxDate }) {
  const [show, setShow] = useState(false);
  const [temp, setTemp] = useState(null);

  const asDate = value ? toDate(/^\d{4}-\d{2}$/.test(value) ? `${value}-01` : value) : new Date();
  const label = value ? value.slice(0, 7).replace('-', '년 ') + '월' : '';
  const emit = (d) => onChange(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`);

  return (
    <View>
      <ValueBox text={label} placeholder={placeholder} icon="📆"
        onPress={() => { setTemp(asDate); setShow(true); }} />

      {show && isAndroid && (
        <DateTimePicker
          value={asDate}
          mode="date"
          display="spinner"
          maximumDate={maxDate ? toDate(maxDate) : new Date()}
          onChange={(event, picked) => {
            setShow(false);
            if (event.type === 'set' && picked) emit(picked);
          }}
        />
      )}

      {isIOS && (
        <PickerModal
          visible={show}
          title="테니스 시작 년월"
          onClose={() => setShow(false)}
          onConfirm={() => { if (temp) emit(temp); setShow(false); }}>
          <DateTimePicker
            value={temp || asDate}
            mode="date"
            display="spinner"
            locale="ko-KR"
            maximumDate={maxDate ? toDate(maxDate) : new Date()}
            themeVariant="light"
            onChange={(_, picked) => picked && setTemp(picked)}
          />
        </PickerModal>
      )}
    </View>
  );
}

/** 입력 라벨 */
export const Label = ({ children, hint }) => (
  <Text style={{
    fontSize: 12, fontWeight: '700', color: C.sub, marginBottom: 6,
    letterSpacing: Platform.OS === 'android' ? 0.1 : 0,
  }}>
    {children}{hint ? <Text style={{ fontWeight: '400', color: C.faint }}>  {hint}</Text> : null}
  </Text>
);
