/* ============================================================
   엑셀로 불러오기 — 대회 참가자·팀·대진(점수는 선택)을 엑셀 양식으로 (운영진)

   2026-10-15 앱 주인 요청. 흐름: [양식 받기] → PC 엑셀에서 고쳐 .xlsx 로 저장 → 휴대폰으로 받아
   [엑셀 파일 고르기] → 미리 보기(문제는 줄 번호와 함께) → [이대로 저장].
   판단·검사는 lib/tourneyImport.js, 파일 읽기·쓰기는 lib/xlsxLite.js.

   2026-10-17 앱 주인: "앱 등록용 빌드 말고 지금 깔린 앱에서 쓰게" — 파일은 웹에서 다룬다(지금 앱에서 됨):
     [엑셀 작업 링크 만들기] → 링크를 PC 로 보내 열기 → 양식 내려받기·고쳐 올리기(/excel 페이지)
     → 올라오면 이 화면에 미리 보기가 저절로 뜬다(lib/excelJob.js 머리말).
   아래 휴대폰에서 바로 고르기·보내기는 새 앱에서만 덧붙는 길이다.

   ⚠️ 파일 고르기(expo-document-picker)·보내기(expo-sharing)는 새 앱 빌드에 들어간 기능이다.
      그 전에 설치한 앱(OTA 로 이 화면만 받은 앱)에는 없어서, 부르면 앱이 꺼진다 —
      먼저 있는지 보고(requireOptionalNativeModule), 없으면 버튼 대신 "새 버전 설치" 안내를 띄운다.
      모듈은 누를 때만 불러온다(import 를 맨 위에 두면 화면을 여는 순간 꺼진다).
   ============================================================ */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Alert, Share, Linking } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Card, Btn } from './ui';
import { Fold } from './MatchBoard';
import { C, S } from '../lib/theme';
import { rosterPerson } from './TournamentRoster';
import { buildTemplate, parseImport, templateFileName } from '../lib/tourneyImport';
import { readXlsx, writeXlsx, base64ToBytes, bytesToBase64, XlsxError } from '../lib/xlsxLite';
import { breadcrumb, later } from '../lib/crashReport';
import { createExcelJob, subExcelJob } from '../lib/firestore';
import { excelUrl, EXCEL_JOB_HOURS } from '../lib/excelJob';
import { auth, firebaseConfig } from '../../firebaseConfig';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_BYTES = 5 * 1024 * 1024;
const hasPicker = () => !!requireOptionalNativeModule('ExpoDocumentPicker');
const hasSharing = () => !!requireOptionalNativeModule('ExpoSharing');

export function TournamentImport({ clubId, t, members = [], onPatch, flash }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [preview, setPreview] = useState(null);     // parseImport 결과 + fileName
  const [job, setJob] = useState(null);             // { id, url, expiresAt }
  const ready = hasPicker() && hasSharing();
  const seenUpload = useRef(0);
  /* 올라온 파일은 그때의 대회·회원으로 읽는다(구독은 링크를 만들 때 한 번) */
  const latest = useRef({ t, members });
  latest.current = { t, members };

  /* 웹에서 올라오면 미리 보기를 띄운다(다시 올리면 새 파일로) */
  useEffect(() => {
    if (!job?.id) return undefined;
    return subExcelJob(clubId, job.id, (d) => {
      if (!d || d.status !== 'uploaded' || !d.sheetsJson || d.uploadedAt === seenUpload.current) return;
      seenUpload.current = d.uploadedAt;
      try {
        const { t: tt, members: ms } = latest.current;
        const r = parseImport(JSON.parse(d.sheetsJson), { t: tt, members: ms, personOf: (m) => rosterPerson(m, tt) });
        setPreview({ ...r, fileName: d.upName || '' });
        setOpen(true);
        flash('엑셀이 올라왔습니다 — 미리 보기를 확인하세요');
      } catch (e) {
        flash('올라온 파일을 읽지 못했습니다. 다시 올려 주세요');
      }
    });
  }, [job?.id]);

  const makeLink = async () => {
    const uid = auth?.currentUser?.uid;
    if (!uid) { flash('로그인이 풀렸습니다. 다시 로그인해 주세요'); return; }
    breadcrumb('엑셀 작업 링크 만들기');
    setBusy('link');
    try {
      const expiresAt = Date.now() + EXCEL_JOB_HOURS * 3600 * 1000;
      const ref = await createExcelJob(clubId, {
        by: uid, tournamentId: t.id, tournamentName: String(t.name || '').slice(0, 60), fileName: templateFileName(t),
        template: bytesToBase64(writeXlsx(buildTemplate(t))), expiresAt,
      });
      seenUpload.current = 0;
      setPreview(null);
      setJob({ id: ref.id, url: excelUrl(firebaseConfig.projectId, clubId, ref.id), expiresAt });
    } catch (e) {
      flash('링크를 만들지 못했습니다. 인터넷 연결을 확인해 주세요');
    } finally {
      setBusy('');
    }
  };
  const shareLink = () => Share.share({
    message: `[${t.name}] 대회 엑셀 — PC에서 열어 양식을 내려받고, 고친 파일을 올려 주세요(${EXCEL_JOB_HOURS}시간)\n${job.url}`,
  }).catch(() => {});

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
        <Text style={{ fontSize: 12, color: C.sub, lineHeight: 18 }}>
          ① [엑셀 작업 링크 만들기] → [링크 보내기]로 카톡 「나와의 채팅」 등에 보내 PC에서 엽니다{'\n'}
          ② 그 페이지에서 양식을 내려받아 엑셀로 고치고(.xlsx 로 저장) 같은 페이지에서 올립니다{'\n'}
          ③ 이 화면에 미리 보기가 저절로 뜹니다 — 확인하고 [이대로 저장]
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: S.md }}>
          <Btn small disabled={!!busy} onPress={makeLink}>{busy === 'link' ? '만드는 중…' : job ? '새 링크 만들기' : '엑셀 작업 링크 만들기'}</Btn>
          {!!job && <Btn small tone="ghost" onPress={shareLink}>링크 보내기</Btn>}
          {!!job && <Btn small tone="ghost" onPress={() => Linking.openURL(job.url).catch(() => flash('브라우저를 열지 못했습니다'))}>브라우저로 열기</Btn>}
        </View>
        {!!job && (
          <Text selectable style={{ fontSize: 11.5, color: C.faint, marginTop: 6, lineHeight: 16 }}>
            {job.url}{'\n'}올리기를 기다리는 중 · {new Date(job.expiresAt).getHours()}시 {String(new Date(job.expiresAt).getMinutes()).padStart(2, '0')}분까지
          </Text>
        )}

        {/* 새 앱(파일 고르기·보내기 모듈이 있는 앱)에서만 — 휴대폰에서 바로 */}
        {ready && (
          <View style={{ marginTop: S.md }}>
            <Text style={{ fontSize: 11.5, color: C.faint }}>휴대폰에서 바로</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              <Btn small tone="ghost" disabled={!!busy} onPress={sendTemplate}>{busy === 'template' ? '만드는 중…' : '양식 받기'}</Btn>
              <Btn small tone="ghost" disabled={!!busy} onPress={pickFile}>{busy === 'pick' ? '읽는 중…' : '엑셀 파일 고르기'}</Btn>
            </View>
          </View>
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
