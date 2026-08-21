/* ============================================================
   PHASE 3·4 — Cloud Functions (v2, Node 20)
   푸시 트리거 4종 + 기상청 단기예보 수집.
   배포: firebase deploy --only functions   (Blaze 요금제 필요 — 무료 쿼터 내 사용)
   날씨 키(선택): functions/.env 에 KMA_SERVICE_KEY=공공데이터포털_일반인증키
                 없어도 배포된다. 날씨 예보만 쉰다.
   ============================================================ */
const {
  onDocumentCreated, onDocumentUpdated, onDocumentDeleted, onDocumentWritten,
} = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions/v2');

initializeApp();
const db = getFirestore();
/* 기상청 키는 배포를 막지 않는다.

   예전에는 defineSecret + secrets:[…] 로 묶었다. 그러면 그 시크릿이
   Secret Manager 에 없을 때 배포가 통째로 실패한다. 실제로 그렇게 됐다 —
   쓰지도 않는 날씨 키 하나 때문에 참석 투표 알림도, 교류전 초대 푸시도
   올라가지 못했다. 곁가지 기능이 본 기능의 배포를 막으면 안 된다.

   그래서 런타임에 환경변수로 읽고, 없으면 그 함수만 조용히 쉰다.
   키를 넣는 방법은 두 가지이고 둘 다 process.env 로 들어온다.
     · functions/.env 파일에  KMA_SERVICE_KEY=발급키
     · 또는 시크릿을 만든 뒤 이 함수에 secrets 로 다시 묶는다 */
const kmaKey = () => process.env.KMA_SERVICE_KEY || '';

const REGION = { region: 'asia-northeast3' }; // 서울

const {
  normalizeAsk, isAskDue, pendingVoters, askMessage, changeMessage, changedAnswers,
} = require('./rsvpAsk');
const { inviteMessage, responseMessage } = require('./clubMatch');
const { planAutoSend, unpaidMembers, summaryForManager } = require('./dunning');
const {
  billingScopes, membersInScope, feeDocKey, notifyRule,
} = require('./scope');

/** 운영 담당 — 참석 변경·미납 현황 같은 운영 알림을 받는 사람 */
const isStaff = (role) => role === '회장' || role === '총무' || role === '운영진';

/* ---------------- Expo Push 발송 헬퍼 ----------------

   응답을 읽어 죽은 토큰을 지운다.

   앱을 지우거나 기기를 바꾸면 그 토큰은 영영 못 받는 것이 된다.
   그런데 회원 문서에는 그대로 남아 있어서, 다음 발송 때도 그 토큰에
   또 쏜다. 쌓이면 "20명에게 보냈다"는데 실제로 받는 사람은 12명인
   상태가 되고, 발송 통계가 거짓말을 하기 시작한다.

   Expo 는 토큰마다 결과를 돌려주고, 못 쓰는 토큰에는
   DeviceNotRegistered 를 준다. 그걸 보고 지운다.
   토큰이 어느 회원 것인지 모르므로 컬렉션 그룹으로 찾아 지운다. */
async function dropDeadToken(token) {
  try {
    const hits = await db.collectionGroup('members')
      .where('pushToken', '==', token).get();
    await Promise.all(hits.docs.map((d) =>
      d.ref.update({ pushToken: FieldValue.delete() })));
    if (hits.size) logger.info('죽은 푸시 토큰 정리', hits.size, '건');
  } catch (e) {
    logger.warn('죽은 토큰 정리 실패', e);
  }
}

async function sendPush(tokens, title, body, data = {}) {
  const valid = [...new Set(tokens)].filter((t) => typeof t === 'string' && t.startsWith('ExponentPushToken'));
  if (!valid.length) return;
  for (let i = 0; i < valid.length; i += 100) {
    const batch = valid.slice(i, i + 100);
    const chunk = batch.map((to) => ({ to, title, body, data, sound: 'default' }));
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk),
      });
      if (!res.ok) { logger.warn('push send non-200', await res.text()); continue; }

      /* 응답은 보낸 순서대로 온다. 실패한 자리의 토큰을 그대로 짚을 수 있다. */
      const json = await res.json().catch(() => null);
      const tickets = (json && json.data) || [];
      for (let k = 0; k < tickets.length; k += 1) {
        const t = tickets[k];
        if (!t || t.status !== 'error') continue;
        const reason = t.details && t.details.error;
        if (reason === 'DeviceNotRegistered') await dropDeadToken(batch[k]);
        else logger.warn('push 실패', reason || t.message);
      }
    } catch (e) { logger.error('push send failed', e); }
  }
}

/** 클럽 멤버들의 푸시 토큰 (filterFn 으로 대상 축소) */
async function clubTokens(clubId, filterFn = () => true) {
  const snap = await db.collection('clubs').doc(clubId).collection('members').get();
  return snap.docs
    .filter((d) => filterFn({ id: d.id, ...d.data() }))
    .map((d) => d.data().pushToken)
    .filter(Boolean);
}

/* ---------------- 1) 모임 생성 → 전체 알림 ---------------- */
exports.onMeetingCreated = onDocumentCreated({ ...REGION, document: 'clubs/{clubId}/meetings/{meetingId}' }, async (event) => {
  const mt = event.data?.data();
  if (!mt) return;
  const tokens = await clubTokens(event.params.clubId, (m) => m.status === '활동');
  await sendPush(tokens, '📅 새 모임 등록', `${mt.date} ${mt.time || ''} · ${mt.place || ''} — 참석 여부를 알려주세요!`, { type: 'meeting', meetingId: event.params.meetingId });
});

/* ---------------- 2) 모임 갱신 → 대진 발표 / 우천 취소 ---------------- */
exports.onMeetingUpdated = onDocumentUpdated({ ...REGION, document: 'clubs/{clubId}/meetings/{meetingId}' }, async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;
  const { clubId, meetingId } = event.params;

  // 우천/기타 취소
  if (!before.canceled && after.canceled) {
    const tokens = await clubTokens(clubId, (m) => m.status === '활동');
    await sendPush(tokens, '🌧 모임 취소', `${after.date} 모임이 취소되었습니다.`, { type: 'canceled', meetingId });
    return;
  }

  /* 참석 여부를 나중에 바꾼 사람 → 운영진에게.
     대진을 다 짠 뒤 당일 아침에 한 명이 빠지는 것이 가장 큰 사고였다.
     첫 응답은 알리지 않는다(정상적인 흐름이고, 회원 수만큼 알림이
     쏟아지면 운영진이 알림을 꺼 버린다). */
  const changes = changedAnswers(before, after);
  if (changes.length) {
    const club = (await db.collection('clubs').doc(clubId).get()).data() || {};
    const memberSnap = await db.collection('clubs').doc(clubId).collection('members').get();
    const nameById = {};
    const staffTokens = [];
    memberSnap.docs.forEach((d) => {
      const m = d.data();
      nameById[d.id] = m.name || '';
      if (isStaff(m.role) && m.pushToken) staffTokens.push(m.pushToken);
    });
    if (staffTokens.length) {
      for (const ch of changes) {
        const msg = changeMessage(club.name, nameById[ch.id], ch.from, ch.to, after);
        await sendPush(staffTokens, msg.title, msg.body,
          { type: 'rsvpChanged', meetingId, memberId: ch.id });
      }
    }
  }

  // 대진 발표(0 → n)
  if ((before.matches || []).length === 0 && (after.matches || []).length > 0) {
    const attendeeIds = new Set([
      ...Object.entries(after.rsvp || {}).filter(([, v]) => v === 'yes').map(([id]) => id),
      ...(after.guests || []).map((g) => g.uid).filter(Boolean),
    ]);
    const tokens = await clubTokens(clubId, (m) => attendeeIds.has(m.id));
    // 게스트(타 클럽) 토큰: users 프로필의 clubId 로 조회
    for (const g of after.guests || []) {
      if (!g.uid || tokens.length > 500) break;
      const u = await db.collection('users').doc(g.uid).get();
      const gClub = u.exists ? u.data().clubId : null;
      if (gClub) {
        const md = await db.collection('clubs').doc(gClub).collection('members').doc(g.uid).get();
        if (md.exists && md.data().pushToken) tokens.push(md.data().pushToken);
      }
    }
    await sendPush(tokens, '🎾 대진표 발표', `${after.date} 모임 대진이 확정되었습니다. 코트 배정을 확인하세요!`, { type: 'matches', meetingId });
  }
});

/* ================= 참석 투표 요청 =================
   총무가 단톡방에서 "아직 답 안 주신 분?"을 손으로 세지 않게 한다.

   두 갈래로 들어온다.
     자동 — 모임 N일 전 지정한 시각 (clubs/{id}.settings.rsvpAsk)
     수동 — 총무가 [투표 요청]을 누름 (pushJobs 문서가 생김)

   어느 쪽이든 아직 답하지 않은 사람에게만 간다. 이미 참석이라고 한
   사람에게 또 물으면 알림이 성가신 것이 되고, 그러면 알림 자체를
   꺼 버린다 — 그 순간 이 기능은 죽는다. */

/** 대상에게 실제로 쏘고, 모임에 발송 기록을 남긴다 */
async function sendRsvpAsk(clubRef, meetingRef, meeting, targetIds, { auto } = {}) {
  const memberSnap = await clubRef.collection('members').get();
  const wanted = targetIds ? new Set(targetIds) : null;
  const tokens = memberSnap.docs
    .filter((d) => {
      const m = { id: d.id, ...d.data() };
      if (wanted && !wanted.has(d.id)) return false;
      if (m.status && m.status !== '활동') return false;
      // 요청서가 만들어진 뒤 답한 사람은 빼 준다 — 답한 사람에게 보내지 않는다
      const v = (meeting.rsvp || {})[d.id];
      return v === undefined || v === null || v === '';
    })
    .map((d) => d.data().pushToken)
    .filter(Boolean);

  if (!tokens.length) return 0;

  const club = (await clubRef.get()).data() || {};
  const msg = askMessage(club.name, meeting);
  await sendPush(tokens, msg.title, msg.body,
    { type: 'rsvpAsk', meetingId: meetingRef.id });

  const patch = {
    'rsvpAsk.lastAt': new Date(),
    'rsvpAsk.count': FieldValue.increment(1),
    'rsvpAsk.lastTo': tokens.length,
  };
  if (auto) patch['rsvpAsk.auto'] = auto;
  await meetingRef.update(patch);
  return tokens.length;
}

/** 수동 — 총무가 [투표 요청]을 누르면 요청서 한 장이 생긴다 */
/* ---------------- 테스트 알림 ----------------

   왜 필요한가
     "알림이 안 와요"의 원인은 앱 쪽(토큰을 못 받음)일 수도, 서버 쪽
     (토큰을 못 찾음)일 수도, Expo 쪽(토큰이 죽음)일 수도 있다. 앱만 보면
     어느 쪽인지 알 수 없어서 며칠을 헤매게 된다.

     여기서는 서버가 "그 회원 문서에서 실제로 무엇을 읽었는지"를 결과에
     그대로 적어 돌려준다. 토큰이 없으면 없다고, Expo 가 거절하면 그
     사유를 적는다. 앱은 그걸 화면에 띄운다.

   보내는 대상은 요청한 본인뿐이다. 이 통로로 남에게 알림을 쏠 수 없다. */
async function runTestPush(clubRef, uid) {
  const snap = await clubRef.collection('members').doc(uid).get();
  if (!snap.exists) return { status: 'failed', reason: 'no-member', detail: '회원 문서를 찾을 수 없습니다' };

  const token = snap.data().pushToken;
  if (!token) {
    return {
      status: 'failed',
      reason: 'no-token',
      detail: '서버가 이 회원 문서에서 pushToken 을 찾지 못했습니다. '
        + '앱에서 [알림 확인]을 눌러 토큰을 저장하세요.',
    };
  }
  if (!String(token).startsWith('ExponentPushToken')) {
    return { status: 'failed', reason: 'bad-token', detail: `토큰 모양이 이상합니다: ${String(token).slice(0, 24)}…` };
  }

  /* sendPush 는 실패를 로그로만 남긴다. 여기서는 Expo 응답을 그대로 받아야
     하므로 직접 호출한다 — 화면에 사유를 보여 주는 것이 이 기능의 전부다. */
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{
        to: token,
        title: '🎾 테스트 알림',
        body: '이 알림이 보이면 푸시가 정상입니다.',
        data: { type: 'test' },
        sound: 'default',
      }]),
    });
    const text = await res.text();
    if (!res.ok) return { status: 'failed', reason: 'expo-http', detail: `${res.status} ${text.slice(0, 300)}` };

    const json = JSON.parse(text);
    const ticket = json && json.data && json.data[0];
    if (ticket && ticket.status === 'error') {
      const why = (ticket.details && ticket.details.error) || ticket.message || 'unknown';
      if (why === 'DeviceNotRegistered') await dropDeadToken(token);
      return { status: 'failed', reason: `expo-${why}`, detail: ticket.message || why };
    }
    return {
      status: 'done',
      sent: 1,
      detail: `Expo 접수 완료 (${(ticket && ticket.id) || 'ok'}). 몇 초 안에 도착합니다.`,
      tokenTail: String(token).slice(-10),
    };
  } catch (e) {
    return { status: 'failed', reason: 'exception', detail: String((e && e.message) || e) };
  }
}

exports.onPushJobCreated = onDocumentCreated(
  { ...REGION, document: 'clubs/{clubId}/pushJobs/{jobId}' },
  async (event) => {
    const job = event.data?.data();
    if (!job) return;
    const { clubId } = event.params;

    if (job.type === 'test') {
      const result = await runTestPush(db.collection('clubs').doc(clubId), job.by);
      await event.data.ref.update({ ...result, doneAt: new Date() }).catch(() => {});
      return;
    }

    if (job.type !== 'rsvpAsk' || !job.meetingId) return;
    const clubRef = db.collection('clubs').doc(clubId);
    const meetingRef = clubRef.collection('meetings').doc(job.meetingId);
    try {
      const snap = await meetingRef.get();
      if (!snap.exists) {
        await event.data.ref.update({ status: 'skipped', reason: 'no-meeting' });
        return;
      }
      const meeting = snap.data();
      if (meeting.canceled) {
        await event.data.ref.update({ status: 'skipped', reason: 'canceled' });
        return;
      }
      const sent = await sendRsvpAsk(clubRef, meetingRef, meeting, job.targets);
      await event.data.ref.update({ status: 'done', sent, doneAt: new Date() });
    } catch (e) {
      logger.error('rsvpAsk job failed', clubId, event.params.jobId, e);
      await event.data.ref.update({ status: 'failed' }).catch(() => {});
    }
  },
);

/* 자동 — 30분마다 돌면서 "오늘이 그날인가"를 본다.

   정각 한 번만 보는 방식이면 그 시각에 실행이 밀리거나 배포 중이면
   그날 발송이 통째로 사라진다. 예정 시각을 지났으면 같은 날 안에서는
   늦게라도 보내고, 이미 보낸 날은 rsvpAsk.auto 로 걸러 중복을 막는다. */
exports.autoRsvpAsk = onSchedule(
  { ...REGION, schedule: 'every 30 minutes', timeZone: 'Asia/Seoul' },
  async () => {
    const kst = new Date(Date.now() + 9 * 3600000);
    const nowYmd = kst.toISOString().slice(0, 10);
    const nowHHMM = kst.toISOString().slice(11, 16);
    const clubs = await db.collection('clubs').get();

    for (const club of clubs.docs) {
      try {
        const cfg = normalizeAsk((club.data().settings || {}).rsvpAsk);
        if (!cfg.enabled) continue;
        // 물어볼 날은 하루뿐이므로 그날 열리는 모임만 꺼내면 된다
        const target = await club.ref.collection('meetings')
          .where('date', '==', shiftDays(nowYmd, cfg.daysBefore)).get();
        for (const mdoc of target.docs) {
          const mt = mdoc.data();
          if (!isAskDue(mt, cfg, nowYmd, nowHHMM)) continue;
          const n = await sendRsvpAsk(club.ref, mdoc.ref, mt, null, { auto: nowYmd });
          logger.info('rsvpAsk auto', club.id, mdoc.id, 'sent', n);
        }
      } catch (e) {
        logger.error('autoRsvpAsk failed for club', club.id, e);
      }
    }
  },
);

/** 'YYYY-MM-DD' 에 일수를 더한다 (표준시 계산이라 시차를 타지 않는다) */
function shiftDays(ymd, delta) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/* ================= 클럽 교류전 =================
   초대를 보내도 상대가 앱을 열어 보지 않으면 아무 일도 안 일어난다.
   그래서 초대와 응답을 양쪽 운영진에게 밀어 준다. */

/** 그 클럽 운영 담당의 푸시 토큰 */
async function staffTokens(clubId) {
  if (!clubId) return [];
  const snap = await db.collection('clubs').doc(clubId).collection('members').get();
  return snap.docs
    .filter((d) => isStaff(d.data().role))
    .map((d) => d.data().pushToken)
    .filter(Boolean);
}

exports.onClubMatchCreated = onDocumentCreated(
  { ...REGION, document: 'clubMatches/{matchId}' },
  async (event) => {
    const m = event.data?.data();
    // 미등록 상대는 받을 사람이 없다 — 주최 클럽이 혼자 진행한다
    if (!m || !m.guestClubId || m.status !== 'pending') return;
    const tokens = await staffTokens(m.guestClubId);
    if (!tokens.length) return;
    const msg = inviteMessage(m);
    await sendPush(tokens, msg.title, msg.body,
      { type: 'clubMatchInvite', matchId: event.params.matchId });
  },
);

exports.onClubMatchUpdated = onDocumentUpdated(
  { ...REGION, document: 'clubMatches/{matchId}' },
  async (event) => {
    const b = event.data?.before.data();
    const a = event.data?.after.data();
    if (!b || !a) return;
    const { matchId } = event.params;

    // 수락·거절 → 주최 클럽에게
    if (b.status === 'pending' && (a.status === 'accepted' || a.status === 'declined')) {
      const tokens = await staffTokens(a.hostClubId);
      if (tokens.length) {
        const msg = responseMessage(a, a.status === 'accepted');
        await sendPush(tokens, msg.title, msg.body, { type: 'clubMatchAnswer', matchId });
      }
      return;
    }

    // 대진 발표(0 → n) → 양 클럽 운영진에게
    if ((b.matches || []).length === 0 && (a.matches || []).length > 0) {
      const tokens = [
        ...await staffTokens(a.hostClubId),
        ...await staffTokens(a.guestClubId),
      ];
      if (tokens.length) {
        await sendPush(tokens, '🎾 교류전 대진 발표',
          `${a.hostClubName || ''} vs ${a.guestClubName || ''} ${a.date || ''} 대진이 확정되었습니다.`,
          { type: 'clubMatchDraw', matchId });
      }
    }
  },
);

/* ---------------- 3) 게스트 확정 → 본인 알림 ---------------- */
exports.onApplicantConfirmed = onDocumentUpdated({ ...REGION, document: 'guestPosts/{postId}/applicants/{uid}' }, async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;
  if (before.status === 'confirmed' || after.status !== 'confirmed') return;

  const { uid } = event.params;
  const post = (await db.collection('guestPosts').doc(event.params.postId).get()).data() || {};
  // 신청자 소속 클럽에서 토큰 조회(신청 시 clubId 저장됨, 없으면 users 프로필)
  let clubId = after.clubId;
  if (!clubId) {
    const u = await db.collection('users').doc(uid).get();
    clubId = u.exists ? u.data().clubId : null;
  }
  if (!clubId) return;
  const md = await db.collection('clubs').doc(clubId).collection('members').doc(uid).get();
  const token = md.exists ? md.data().pushToken : null;
  if (token) {
    await sendPush([token], '✅ 게스트 확정', `${post.clubName || ''} ${post.date || ''} 게스트로 확정되었습니다!`, { type: 'guestConfirmed', postId: event.params.postId });
  }
});

/* ---------------- 4) 매월 1일 회비 리마인드 ---------------- */
/* ================= 회비 독촉 =================
   총무가 "형, 회비요..." 를 보내지 않아도 되게 하는 것이 목적이다.
   매일 09시에 돌면서 오늘이 어느 단계인지 보고, 해당하는 사람에게만 보낸다.

   단계·문구·대상 판단은 functions/dunning.js 에 있다. 그 파일은
   src/lib/dunning.js 의 사본이고, scripts/test-manager.mjs 가 둘을
   대조한다. 예전에는 이 로직이 여기 손으로 적혀 있었고 대조가 없어서
   실제로 어긋나 있었다 — 앱은 최종 단계에 "사정이 있으시면 운영진에게
   알려 주세요"를 쓰는데 서버는 2차 문구를 그대로 다시 보냈다.

   여기서는 Firestore 를 읽고 쓰는 일만 한다. 판단은 하지 않는다.  */

const seoulToday = () =>
  new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

exports.dailyFeeDunning = onSchedule(
  { ...REGION, schedule: '0 9 * * *', timeZone: 'Asia/Seoul' },
  async () => {
    const today = seoulToday();
    const month = today.slice(0, 7);
    const clubs = await db.collection('clubs').get();

    for (const club of clubs.docs) {
      try {
        const clubData = { id: club.id, ...club.data() };

        const logRef = club.ref.collection('meta').doc('dunning');
        const [logDoc, memberSnap, venueSnap] = await Promise.all([
          logRef.get(),
          club.ref.collection('members').get(),
          club.ref.collection('venues').get(),
        ]);
        const sent = logDoc.exists ? (logDoc.data().sent || {}) : {};
        const members = memberSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const venues = venueSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

        /* ---------- 청구 단위마다 한 번씩 ----------
           코트장을 안 쓰는 클럽은 단위가 하나(id=null)뿐이고, 그때 문서
           이름은 기간 그대로라서 예전과 완전히 같은 문서를 읽는다.
           코트장마다 걷는 클럽은 금액·납부일·대상자·발송 기록이 단위마다
           따로 간다 — 염곡 1차를 보냈다고 수도공고까지 보낸 것으로
           기록되면 그 코트는 영영 안내를 못 받는다. */
        for (const scope of billingScopes(clubData, venues)) {
          const venue = venues.find((v) => v.id === scope.id) || null;

          /* 이 코트장에서 회비 알림을 꺼 두었으면 보내지 않는다.
             끄고도 자동 발송이 나가면 끈 의미가 없다. */
          if (!notifyRule(clubData, venue, 'fee').on) continue;

          const docKey = feeDocKey(month, scope.id);
          const feeDoc = await club.ref.collection('fees').doc(docKey).get();
          const paid = feeDoc.exists ? (feeDoc.data().paid || {}) : {};
          const amount = (feeDoc.exists && feeDoc.data().amount) || scope.amount;
          const scoped = membersInScope(members, scope.id);

          /* 보낼지 말지, 누구에게, 무슨 문구로 — 전부 공용 모듈이 정한다.
             auto:false 단계(최종 안내)와 중복 발송도 여기서 걸러진다. */
          const plan = planAutoSend({
            clubName: scope.id ? `${clubData.name || '클럽'} ${scope.name}` : clubData.name,
            monthKey: month,
            today,
            dueDay: scope.dueDay,
            amount,
            members: scoped,
            paidMap: paid,
            sent,
            account: scope.account,
          });
          if (!plan.recipients.length || !plan.message) continue;

          const wanted = new Set(plan.recipients.map((m) => m.id));
          const tokens = scoped
            .filter((m) => wanted.has(m.id))
            .map((m) => m.pushToken)
            .filter(Boolean);
          if (!tokens.length) continue;

          await sendPush(tokens, plan.message.title, plan.message.body,
            { type: 'fee', month, scope: scope.id || '', stage: plan.stage.key });
          await logRef.set(
            { sent: { [docKey]: { [plan.stage.key]: today } } },
            { merge: true },
          );

          // 2차 단계에서는 총무에게 현황을 요약해 준다
          if (plan.stage.key === 'second') {
            const staff = members.filter((m) => m.role === '회장' || m.role === '총무');
            const staffPush = staff.map((m) => m.pushToken).filter(Boolean);
            if (staffPush.length) {
              const unpaid = unpaidMembers(scoped, paid);
              const sum = summaryForManager(
                scope.id ? `${clubData.name || '클럽'} ${scope.name}` : clubData.name,
                month, unpaid, amount,
              );
              await sendPush(staffPush, sum.title, sum.body, { type: 'fee-summary', month });
            }
          }
        }
      } catch (e) {
        logger.error('dunning failed for club', club.id, e);
      }
    }
  },
);

/* ================= PHASE 4 — 기상청 단기예보 =================
   12시간마다: 3일 내 모임 → 장소를 코트 DB와 매칭해 좌표 획득 → 격자 변환 →
   getVilageFcst 호출 → meeting.forecast 저장 → 강수확률 60%↑면 총무 푸시 */

/* 기상청 격자 변환(위경도 → nx, ny) — 표준 dfs_xy_conv */
function toGrid(lat, lon) {
  const RE = 6371.00877, GRID = 5.0, SLAT1 = 30.0, SLAT2 = 60.0, OLON = 126.0, OLAT = 38.0, XO = 43, YO = 136;
  const DEGRAD = Math.PI / 180.0;
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD, slat2 = SLAT2 * DEGRAD, olon = OLON * DEGRAD, olat = OLAT * DEGRAD;
  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);
  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lon * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;
  return { nx: Math.floor(ra * Math.sin(theta) + XO + 0.5), ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5) };
}

const rainIcon = (rain) => (rain >= 60 ? '🌧' : rain >= 30 ? '⛅' : '☀️');

async function fetchKmaForecast(serviceKey, nx, ny, targetDate) {
  const now = new Date(Date.now() + 9 * 3600 * 1000); // KST
  const baseDate = now.toISOString().slice(0, 10).replace(/-/g, '');
  const url = 'http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst'
    + `?serviceKey=${encodeURIComponent(serviceKey)}&dataType=JSON&numOfRows=1000&pageNo=1`
    + `&base_date=${baseDate}&base_time=0500&nx=${nx}&ny=${ny}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('KMA http ' + res.status);
  const json = await res.json();
  const items = json?.response?.body?.items?.item || [];
  const target = targetDate.replace(/-/g, '');
  const day = items.filter((i) => i.fcstDate === target);
  if (!day.length) return null;
  const pops = day.filter((i) => i.category === 'POP').map((i) => +i.fcstValue);
  const noonTmp = day.find((i) => i.category === 'TMP' && i.fcstTime === '1200');
  const rain = pops.length ? Math.max(...pops) : 0;
  const temp = noonTmp ? +noonTmp.fcstValue : null;
  return { rain, temp, icon: rainIcon(rain), txt: rain >= 60 ? '비 예보' : rain >= 30 ? '구름 많음' : '맑음' };
}

exports.updateForecasts = onSchedule(
  { ...REGION, schedule: 'every 12 hours', timeZone: 'Asia/Seoul' },
  async () => {
    const key = kmaKey();
    if (!key) { logger.warn('KMA_SERVICE_KEY 미설정 — 예보 스킵'); return; }

    const today = new Date().toISOString().slice(0, 10);
    const limit = new Date(Date.now() + 3 * 86400 * 1000).toISOString().slice(0, 10);
    const clubs = await db.collection('clubs').get();

    for (const club of clubs.docs) {
      const meetings = await club.ref.collection('meetings')
        .where('date', '>=', today).where('date', '<=', limit).get();
      if (meetings.empty) continue;
      const courts = (await club.ref.collection('courts').get()).docs.map((d) => d.data());

      for (const mdoc of meetings.docs) {
        const mt = mdoc.data();
        if (mt.canceled) continue;
        // 모임 자체 좌표 우선, 없으면 코트 DB에서 장소명 매칭
        let { lat, lng } = mt;
        if (!lat || !lng) {
          const court = courts.find((c) => c.lat && c.lng && mt.place && (mt.place.includes(c.name) || c.name.includes(mt.place)));
          if (court) { lat = court.lat; lng = court.lng; }
        }
        if (!lat || !lng) continue;

        try {
          const { nx, ny } = toGrid(lat, lng);
          const forecast = await fetchKmaForecast(key, nx, ny, mt.date);
          if (!forecast) continue;
          const prevRain = mt.forecast?.rain ?? -1;
          await mdoc.ref.update({ forecast });
          // 강수확률 60% 이상 최초 감지 시 총무·운영진 알림
          if (forecast.rain >= 60 && prevRain < 60) {
            const tokens = await clubTokens(club.id, (m) => m.role === '총무' || m.role === '운영진');
            await sendPush(tokens, '🌧 우천 예보', `${mt.date} ${mt.place || ''} 강수확률 ${forecast.rain}% — 취소 여부를 결정하세요.`, { type: 'weather', meetingId: mdoc.id });
          }
        } catch (e) { logger.error('forecast failed', club.id, mdoc.id, e); }
      }
    }
  },
);


/* ============================================================
   공개 클럽 목록 동기화 — 회원 수·남녀 비율

   왜 서버에서 하나
     회원이 가입해도 clubDirectory 는 운영진만 쓸 수 있어서, 새로 들어온
     사람이 스스로 인원수를 고칠 수 없다. 그래서 검색 목록의 "회원 12명"이
     한동안 옛날 값으로 남아 있었다. 회원 문서가 생기거나 지워질 때
     서버가 대신 세어 준다.

   FieldValue.increment 대신 실제로 세는 이유: 중간에 어긋난 값이 있어도
   한 번 쓸 때마다 정확한 수로 맞춰지기 때문. 회원 수 규모(수십~수백)라
   비용도 문제되지 않는다.
   ============================================================ */
async function syncClubDirectory(clubId) {
  const [clubSnap, memberSnap] = await Promise.all([
    db.collection('clubs').doc(clubId).get(),
    db.collection('clubs').doc(clubId).collection('members').get(),
  ]);
  if (!clubSnap.exists) return;
  const club = clubSnap.data();

  let male = 0;
  let female = 0;
  memberSnap.docs.forEach((d) => {
    const g = d.data().gender;
    if (g === 'F') female += 1; else male += 1;
  });

  const name = club.name || '';
  const region = club.settings?.region || '';
  const normalize = (v) => String(v || '').trim().toLowerCase().replace(/\s+/g, '');

  await db.collection('clubDirectory').doc(clubId).set({
    name,
    nameLower: normalize(name),
    region,
    regionLower: normalize(region),
    image: club.image || '',
    hasPassword: !!club.joinPassword,
    memberCount: memberSnap.size,
    maleCount: male,
    femaleCount: female,
    updatedAt: new Date(),
  }, { merge: true });
}

/** 회원이 들어오거나 나갈 때 공개 목록을 다시 센다 */
exports.onMemberWritten = onDocumentWritten(
  { ...REGION, document: 'clubs/{clubId}/members/{memberId}' },
  async (event) => {
    const before = event.data?.before?.exists;
    const after = event.data?.after?.exists;
    // 인원수·성별이 바뀔 때만 — 이름·부수만 고친 경우는 건너뛴다
    if (before && after) {
      const b = event.data.before.data();
      const a = event.data.after.data();
      if (b.gender === a.gender) return;
    }
    try {
      await syncClubDirectory(event.params.clubId);
    } catch (e) {
      logger.error('syncClubDirectory failed', event.params.clubId, e);
    }
  },
);

/** 클럽 이름·지역·비밀번호가 바뀌면 공개 목록도 따라간다 */
exports.onClubUpdated = onDocumentUpdated(
  { ...REGION, document: 'clubs/{clubId}' },
  async (event) => {
    const b = event.data.before.data();
    const a = event.data.after.data();
    const changed = b.name !== a.name
      || b.image !== a.image
      || !!b.joinPassword !== !!a.joinPassword
      || (b.settings?.region || '') !== (a.settings?.region || '');
    if (!changed) return;
    try {
      await syncClubDirectory(event.params.clubId);
    } catch (e) {
      logger.error('syncClubDirectory failed', event.params.clubId, e);
    }
  },
);

/* ---------------- 서비스 전체 현황 카운터 ----------------
   온보딩·홈에 보여주는 "클럽 N개 · 회원 M명 · 누적 경기 K건".
   클럽/회원이 생기거나 사라질 때 증감시킨다. */

exports.onClubCreatedStat = onDocumentCreated(
  { ...REGION, document: 'clubs/{clubId}' },
  async () => {
    await db.collection('stats').doc('service')
      .set({ clubs: FieldValue.increment(1) }, { merge: true });
  },
);

exports.onClubDeletedStat = onDocumentDeleted(
  { ...REGION, document: 'clubs/{clubId}' },
  async (event) => {
    await db.collection('stats').doc('service')
      .set({ clubs: FieldValue.increment(-1) }, { merge: true });
    await db.collection('clubDirectory').doc(event.params.clubId).delete().catch(() => {});
  },
);

exports.onMemberCountStat = onDocumentWritten(
  { ...REGION, document: 'clubs/{clubId}/members/{memberId}' },
  async (event) => {
    const before = event.data?.before?.exists;
    const after = event.data?.after?.exists;
    if (before === after) return;               // 수정은 무시, 생성/삭제만
    await db.collection('stats').doc('service')
      .set({ members: FieldValue.increment(after ? 1 : -1) }, { merge: true });
  },
);

/** 대진에 스코어가 기록되면 누적 경기 수를 올린다 */
exports.onMatchesRecorded = onDocumentUpdated(
  { ...REGION, document: 'clubs/{clubId}/meetings/{meetingId}' },
  async (event) => {
    const scored = (m) => (m.matches || []).filter((x) => x && x.score).length;
    const delta = scored(event.data.after.data()) - scored(event.data.before.data());
    if (delta <= 0) return;
    await db.collection('stats').doc('service')
      .set({ matches: FieldValue.increment(delta) }, { merge: true });
  },
);
