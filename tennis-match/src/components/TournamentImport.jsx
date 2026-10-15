/* ============================================================
   엑셀로 불러오기 — 대회 참가자·팀·대진(점수는 선택)을 엑셀 양식으로 (운영진)

   2026-10-15 앱 주인 요청. 흐름: [양식 받기] → PC 엑셀에서 고쳐 .xlsx 로 저장 → 휴대폰으로 받아
   [엑셀 파일 고르기] → 미리 보기(문제는 줄 번호와 함께) → [이대로 저장].
   판단·검사는 lib/tourneyImport.js, 파일 읽기·쓰기는 lib/xlsxLite.js.

   ⚠️ 파일 고르기(expo-document-picker)·보내기(expo-sharing)는 새 앱 빌드에 들어간 기능이다.
      그 전에 설치한 앱(OTA 로 이 화면만 받은 앱)에는 없어서, 부르면 앱이 꺼진다 —
      먼저 있는지 보고(requireOptionalNativeModule), 없으면 버튼 대신 "새 버전 설치" 안내를 띄운다.
      모듈은 누를 때만 불러온다(import 를 맨 위에 두면 화면을 여는 순간 꺼진다).
   ============================================================ */
import React, { useState } from 'react';
import { View, Text, Alert } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Card, Btn } from './ui';
import { Fold } from './MatchBoard';
import { C, S } from '../lib/theme';
import { rosterPerson } from './TournamentRoster';
import { buildTemplate, parseImport, templateFileName } from '../lib/tourneyImport';
import { readXlsx, writeXlsx, base64ToBytes, bytesToBase64, XlsxError } from '../lib/xlsxLite';
import { breadcrumb, later } from '../lib/crashReport';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_BYTES = 5 * 1024 * 1024;
const hasPicker = () => !!requireOptionalNativeModule('ExpoDocumentPicker');
const hasSharing = () => !!requireOptionalNativeModule('ExpoSharing');

export function TournamentImport({ t, members = [], onPatch, flash }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [preview, setPreview] = useState(null);     // parseImport 결과 + fileName
  const ready = hasPicker() && hasSharing();

  const sendTemplate = async () => {
    breadcrumb('엑셀 양식 받기');
    setBusy('template');
    try {
      const FS = await import('expo-file-system/legacy');
      const Sharing = await import('expo-sharing');
      const uri = `${FS.cacheDirectory}${templateFileName(t)}`;
      await FS.writeAsStringAsync(uri, bytesToBase64(writeXlsx(buildTemplate(t))), { encoding: FS.EncodingType.Base64 });
      await Sharing.shareAsync(uri, { mimeType: XLSX_MIME, dialogTitle: '대회 양식 보내기', UTI: 'org.openxmlformats.spreadsheetml.sheet' });
    } catch (e) {
      flash('양식을 만들지 못했습니다. 잠시 뒤 다시 해 주세요');
    } finally {
      setBusy('');
    }
  };

  const pickFile = async () => {
    breadcrumb('엑셀 파일 고르기');
    setBusy('pick');
    try {
      const Picker = await import('expo-document-picker');
      const res = await Picker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
      const file = res?.canceled ? null : res?.assets?.[0];
      if (!file?.uri) return;
      if (file.size && file.size > MAX_BYTES) { flash('파일이 너무 큽니다(5MB까지). 양식 파일인지 확인해 주세요'); return; }
      const FS = await import('expo-file-system/legacy');
      const bytes = base64ToBytes(await FS.readAsStringAsync(file.uri, { encoding: FS.EncodingType.Base64 }));
      const r = parseImport(readXlsx(bytes), { t, members, personOf: (m) => rosterPerson(m, t) });
      setPreview({ ...r, fileName: file.name || '' });
    } catch (e) {
      flash(e instanceof XlsxError ? e.message : '파일을 읽지 못했습니다. 받은 양식에 적어 .xlsx 로 저장해 올려 주세요');
    } finally {
      setBusy('');
    }
  };

  const save = () => {
    if (!preview?.patch || preview.errors.length) return;
    const s = preview.summary;
    Alert.alert('엑셀 내용으로 바꿀까요?',
      `참가자 ${s.people}명 · 대진 ${s.games}경기${s.done ? `(결과 ${s.done})` : ''}로 이 대회의 참가자·팀·대진을 바꿉니다.\n`
      + '잘못 올렸으면 같은 화면의 [되돌리기 (서버 백업)]로 되돌릴 수 있습니다.', [
        { text: '취소', style: 'cancel' },
        {
          text: '바꾸기', style: 'destructive',
          onPress: () => later(async () => {
            breadcrumb('엑셀 불러오기 저장');
            try {
              await onPatch(preview.patch);
              setPreview(null);
              flash(`엑셀 내용으로 바꿨습니다 — 참가자 ${s.people}명 · 대진 ${s.games}경기`);
            } catch (e) {
              flash('저장하지 못했습니다. 인터넷 연결을 확인해 주세요');
            }
          }, '엑셀 불러오기 저장', () => flash('저장하지 못했습니다')),
        },
      ]);
  };

  const s = preview?.summary;
  return (
    <Fold title="엑셀로 불러오기" open={open} onToggle={() => setOpen(!open)}
      summary="참가자·팀·대진(점수)을 엑셀 양식으로 한꺼번에 넣습니다">
      <Card>
        {!ready ? (
          <Text style={{ fontSize: 12.5, color: C.sub, lineHeight: 19 }}>
            이 기능은 새 버전 앱에서 쓸 수 있습니다. 스토어(Play 스토어)에서 Court 를 새로 설치하면 이 자리에
            [양식 받기]·[엑셀 파일 고르기] 버튼이 생깁니다.
          </Text>
        ) : (
          <>
            <Text style={{ fontSize: 12, color: C.sub, lineHeight: 18 }}>
              ① [양식 받기]로 지금 대회 내용이 채워진 엑셀을 받아 카톡·메일로 PC에 보냅니다{'\n'}
              ② PC 엑셀에서 고쳐 .xlsx 로 저장한 뒤 휴대폰으로 다시 받습니다{'\n'}
              ③ [엑셀 파일 고르기] → 미리 보기를 확인하고 [이대로 저장]
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: S.md }}>
              <Btn small tone="ghost" disabled={!!busy} onPress={sendTemplate}>{busy === 'template' ? '만드는 중…' : '양식 받기'}</Btn>
              <Btn small disabled={!!busy} onPress={pickFile}>{busy === 'pick' ? '읽는 중…' : '엑셀 파일 고르기'}</Btn>
            </View>
          </>
        )}

        {!!preview && (
          <View style={{ marginTop: S.md, padding: 10, borderRadius: 10, backgroundColor: preview.errors.length ? '#fef2f2' : '#f5f5f4' }}>
            <Text style={{ fontSize: 12.5, fontWeight: '800' }}>미리 보기{preview.fileName ? ` — ${preview.fileName}` : ''}</Text>
            {preview.errors.length ? (
              <>
                <Text style={{ fontSize: 12, color: C.danger, marginTop: 6, fontWeight: '700' }}>
                  고칠 곳 {preview.errors.length}{preview.errors.length >= 40 ? '+' : ''}개 — 엑셀에서 고쳐 다시 올려 주세요
                </Text>
                {preview.errors.slice(0, 15).map((e, i) => (
                  <Text key={i} style={{ fontSize: 11.5, color: C.danger, marginTop: 3, lineHeight: 16 }}>· {e}</Text>
                ))}
                {preview.errors.length > 15 && <Text style={{ fontSize: 11.5, color: C.danger, marginTop: 3 }}>외 {preview.errors.length - 15}개</Text>}
              </>
            ) : (
              <>
                <Text style={{ fontSize: 12, color: C.text, marginTop: 6, lineHeight: 18 }}>
                  참가자 {s.people}명 (회원 {s.members} · 게스트 {s.guests})
                  {s.added || s.removed ? ` · 새로 ${s.added}명 · 빠짐 ${s.removed}명` : ''}{'\n'}
                  {s.teams.map((x) => `${x.name} ${x.n}명`).join(' · ')}{s.unassigned ? ` · 미배정 ${s.unassigned}명` : ''}{'\n'}
                  대진 {s.games}경기{s.done ? ` · 결과 ${s.done}` : ''}
                  {s.switched ? `\n${s.kind === 'league' ? '3팀 이상이라 3팀 화면으로 바뀝니다' : '2팀 화면으로 바뀝니다'}` : ''}
                </Text>
                {preview.warnings.slice(0, 10).map((w, i) => (
                  <Text key={i} style={{ fontSize: 11.5, color: '#92400e', marginTop: 3, lineHeight: 16 }}>· {w}</Text>
                ))}
              </>
            )}
            <View style={{ flexDirection: 'row', gap: 6, marginTop: S.md }}>
              <Btn small tone="danger" disabled={!!preview.errors.length} onPress={save}>이대로 저장</Btn>
              <Btn small tone="ghost" onPress={() => setPreview(null)}>닫기</Btn>
            </View>
          </View>
        )}
      </Card>
    </Fold>
  );
}

export default TournamentImport;
