/* ============================================================
   대회 되돌리기 — 운영진 버튼 (서버 백업, 최근 7일)

   2026-10-06 앱 주인: "백업을 되돌리려면 깃허브에서 돌리는 수밖에 없어? 앱 안에 버튼 만들어서 운영진은 쓸 수 있게".
   휴대폰은 지난 시각의 데이터를 못 읽는다 → 일감(restoreJobs)을 만들면 서버가 처리하고 결과를 적는다.
     ① 시각 고르기(N분 전 · 직접)  ② [미리 보기] 그 시각 숫자  ③ [이 시각으로 되돌리기]  ④ [방금 되돌리기 취소]
   판단은 lib/restoreJob.js, 서버는 functions/index.js onRestoreJobCreated.
   ============================================================ */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Alert } from 'react-native';
import { Card, Chip, Btn } from './ui';
import { Label, TimeField } from './pickers';
import { Fold } from './MatchBoard';
import { C, S } from '../lib/theme';
import { requestRestore, subRestoreJob, subTournamentTrash } from '../lib/firestore';
import {
  RESTORE_AGO, RESTORE_KEEP_DAYS, agoLabel, atFromClock, countsText, clockText, restoreReadTime,
  trashRestoreAt, trashList,
} from '../lib/restoreJob';
import { breadcrumb } from '../lib/crashReport';
import { auth } from '../../firebaseConfig';

const WAIT_MS = 90 * 1000;
const TYPE_NAME = { preview: '미리 보기', restore: '되돌리기', undo: '되돌리기 취소' };

export function TournamentRestore({ clubId, t, flash }) {
  const [open, setOpen] = useState(false);
  const [ago, setAgo] = useState(15);          // 분 — null 이면 직접 고른 시각
  const [day, setDay] = useState(0);           // 0 오늘 · -1 어제
  const [clock, setClock] = useState('');
  const [job, setJob] = useState(null);        // { type, status, ...서버 결과 }
  const unsub = useRef(null);
  const timer = useRef(null);
  useEffect(() => () => { unsub.current?.(); clearTimeout(timer.current); }, []);

  const busy = job?.status === 'queued';
  const atMs = () => (ago != null ? Date.now() - ago * 60000 : atFromClock(day, clock));

  const run = async (type) => {
    const uid = auth?.currentUser?.uid;
    if (!uid) return flash('로그인이 풀렸습니다. 다시 로그인해 주세요');
    let at = null;
    if (type !== 'undo') {
      const a = atMs();
      if (a == null) return flash('되돌릴 시각을 골라 주세요');
      const rt = restoreReadTime(a);
      if (!rt.ok) return flash(rt.error);
      at = rt.readMs;
    }
    breadcrumb(`대회 ${TYPE_NAME[type]} 요청`);
    unsub.current?.(); clearTimeout(timer.current);
    setJob({ type, at, status: 'queued' });
    try {
      const ref = await requestRestore(clubId, { type, tournamentId: t.id, at, by: uid });
      unsub.current = subRestoreJob(clubId, ref.id, (d) => {
        if (!d || d.status === 'queued') return;
        unsub.current?.(); unsub.current = null; clearTimeout(timer.current);
        setJob({ ...d, type, at });
        if (d.status === 'done' && type !== 'preview') flash(type === 'undo' ? '되돌리기를 취소했습니다' : `${clockText(at)} 상태로 되돌렸습니다`);
      });
      timer.current = setTimeout(() => {
        unsub.current?.(); unsub.current = null;
        setJob((j) => (j?.status === 'queued' ? { ...j, status: 'failed', reason: '서버가 응답하지 않습니다. 잠시 뒤 다시 해 주세요.' } : j));
      }, WAIT_MS);
    } catch (e) {
      setJob({ type, at, status: 'failed', reason: '요청을 보내지 못했습니다. 인터넷 연결을 확인해 주세요.' });
    }
    return undefined;
  };

  const confirmRestore = () => {
    const a = atMs();
    const rt = a == null ? { ok: false, error: '되돌릴 시각을 골라 주세요' } : restoreReadTime(a);
    if (!rt.ok) return flash(rt.error);
    const seen = job?.type === 'preview' && job.status === 'done' && job.readMs === rt.readMs ? `\n\n그 시각: ${countsText(job.then)}\n지금: ${countsText(job.now)}` : '';
    return Alert.alert(`${clockText(rt.readMs)} 상태로 되돌릴까요?`,
      `대진·결과·참가자가 모두 그 시각으로 돌아갑니다. 그 뒤에 넣은 결과는 사라집니다.\n지금 상태는 따로 남겨 두어 [방금 되돌리기 취소]로 다시 살릴 수 있습니다.${seen}`, [
        { text: '취소', style: 'cancel' },
        { text: '되돌리기', style: 'destructive', onPress: () => run('restore') },
      ]);
  };
  const confirmUndo = () => Alert.alert('방금 되돌리기를 취소할까요?', '되돌리기 바로 전 상태로 돌아갑니다.', [
    { text: '아니요', style: 'cancel' },
    { text: '취소하기', style: 'destructive', onPress: () => run('undo') },
  ]);

  return (
    <Fold title="되돌리기 (서버 백업)" open={open} onToggle={() => setOpen(!open)}
      summary={`실수로 대진·결과를 지웠을 때 — 최근 ${RESTORE_KEEP_DAYS}일 안의 시각으로 되돌립니다`}>
      <Card>
        <Label hint="그 시각의 대진·결과·참가자로 돌아갑니다">언제로 되돌릴까요</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {RESTORE_AGO.map((m) => (
            <Chip key={m} tone={ago === m ? 'green' : 'outline'} onPress={() => setAgo(m)}>{agoLabel(m)}</Chip>
          ))}
          <Chip tone={ago == null ? 'green' : 'outline'} onPress={() => setAgo(null)}>시각 직접</Chip>
        </View>
        {ago == null && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
            {[[0, '오늘'], [-1, '어제']].map(([d, l]) => (
              <Chip key={d} tone={day === d ? 'green' : 'outline'} onPress={() => setDay(d)}>{l}</Chip>
            ))}
            <View style={{ flex: 1 }}><TimeField value={clock} onChange={setClock} placeholder="시각 선택" /></View>
          </View>
        )}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: S.lg }}>
          <Btn small tone="ghost" disabled={busy} onPress={() => run('preview')}>미리 보기</Btn>
          <Btn small tone="danger" disabled={busy} onPress={confirmRestore}>이 시각으로 되돌리기</Btn>
          <Btn small tone="outline" disabled={busy} onPress={confirmUndo}>방금 되돌리기 취소</Btn>
        </View>

        {!!job && (
          <View style={{ marginTop: S.md, padding: 10, borderRadius: 10, backgroundColor: job.status === 'failed' ? '#fef2f2' : '#f5f5f4' }}>
            {job.status === 'queued' && <Text style={{ fontSize: 12.5, color: C.sub }}>서버에서 {TYPE_NAME[job.type]} 중…</Text>}
            {job.status === 'failed' && <Text style={{ fontSize: 12.5, color: C.danger }}>{TYPE_NAME[job.type]} 실패 — {job.reason || '알 수 없는 오류'}</Text>}
            {job.status === 'done' && job.type === 'preview' && (
              <>
                <Text style={{ fontSize: 12.5, fontWeight: '700' }}>{clockText(job.readMs)} 그 시각: {countsText(job.then)}</Text>
                <Text style={{ fontSize: 12.5, color: C.sub, marginTop: 2 }}>지금: {countsText(job.now)}</Text>
              </>
            )}
            {job.status === 'done' && job.type !== 'preview' && (
              <Text style={{ fontSize: 12.5, fontWeight: '700' }}>
                {job.type === 'undo' ? '되돌리기를 취소했습니다' : `${clockText(job.readMs)} 상태로 되돌렸습니다`} — {countsText(job.now)}
              </Text>
            )}
          </View>
        )}

        <Text style={{ fontSize: 11.5, color: C.faint, marginTop: S.md, lineHeight: 17 }}>
          · 먼저 [미리 보기]로 그 시각에 경기·결과가 몇 개였는지 확인하세요.{'\n'}
          · 되돌리면 그 뒤에 넣은 결과는 사라집니다(되돌리기 전 상태는 따로 남겨 [방금 되돌리기 취소]로 살릴 수 있습니다).{'\n'}
          · 서버 백업은 2026년 10월 6일 오후 2시 32분부터, 최근 {RESTORE_KEEP_DAYS}일만 남습니다.
        </Text>
      </Card>
    </Fold>
  );
}

/* ============================================================
   최근 지운 대회 — 대회 목록 아래(운영진). [되살리기] = 지운 그 분의 상태로(서버 백업)
   ============================================================ */
export function TournamentTrash({ clubId, flash }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);      // 되살리는 중인 대회 id
  const unsubs = useRef([]);
  useEffect(() => subTournamentTrash(clubId, setItems), [clubId]);
  useEffect(() => () => unsubs.current.forEach((u) => u?.()), []);
  const list = trashList(items);
  if (!list.length) return null;

  const revive = (x) => Alert.alert(`[${x.name || '이름 없는 대회'}]를 되살릴까요?`,
    `${clockText(x.deletedAt)}에 지운 대회를 지우기 직전 상태로 되살립니다.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '되살리기',
        onPress: async () => {
          const uid = auth?.currentUser?.uid;
          if (!uid) return flash('로그인이 풀렸습니다. 다시 로그인해 주세요');
          const rt = restoreReadTime(trashRestoreAt(x.deletedAt));
          if (!rt.ok) return flash(rt.error);
          breadcrumb('지운 대회 되살리기 요청');
          setBusy(x.id);
          try {
            const ref = await requestRestore(clubId, { type: 'restore', tournamentId: x.id, at: rt.readMs, by: uid });
            const u = subRestoreJob(clubId, ref.id, (d) => {
              if (!d || d.status === 'queued') return;
              u(); setBusy(null);
              flash(d.status === 'done' ? `[${x.name || '대회'}]를 되살렸습니다` : `되살리지 못했습니다 — ${d.reason || '알 수 없는 오류'}`);
            });
            unsubs.current.push(u);
          } catch (e) {
            setBusy(null);
            flash('요청을 보내지 못했습니다. 인터넷 연결을 확인해 주세요');
          }
          return undefined;
        },
      },
    ]);

  return (
    <Fold title={`최근 지운 대회 (${list.length})`} open={open} onToggle={() => setOpen(!open)}
      summary={`실수로 지웠다면 ${RESTORE_KEEP_DAYS}일 안에 되살릴 수 있습니다`}>
      <Card>
        {list.map((x) => (
          <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13.5, fontWeight: '700' }}>{x.name || '이름 없는 대회'}</Text>
              <Text style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>{x.date ? `${x.date} · ` : ''}{clockText(x.deletedAt)} 지움</Text>
            </View>
            <Btn small tone="outline" disabled={!!busy} onPress={() => revive(x)}>{busy === x.id ? '되살리는 중…' : '되살리기'}</Btn>
          </View>
        ))}
      </Card>
    </Fold>
  );
}

export default TournamentRestore;
