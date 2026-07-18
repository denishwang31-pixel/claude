/* ============================================================
   PHASE 3·4 — Cloud Functions (v2, Node 20)
   푸시 트리거 4종 + 기상청 단기예보 수집.
   배포: firebase deploy --only functions   (Blaze 요금제 필요 — 무료 쿼터 내 사용)
   시크릿: firebase functions:secrets:set KMA_SERVICE_KEY  (공공데이터포털 일반 인증키)
   ============================================================ */
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions/v2');

initializeApp();
const db = getFirestore();
const KMA_SERVICE_KEY = defineSecret('KMA_SERVICE_KEY');

const REGION = { region: 'asia-northeast3' }; // 서울

/* ---------------- Expo Push 발송 헬퍼 ---------------- */
async function sendPush(tokens, title, body, data = {}) {
  const valid = [...new Set(tokens)].filter((t) => typeof t === 'string' && t.startsWith('ExponentPushToken'));
  if (!valid.length) return;
  for (let i = 0; i < valid.length; i += 100) {
    const chunk = valid.slice(i, i + 100).map((to) => ({ to, title, body, data, sound: 'default' }));
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk),
      });
      if (!res.ok) logger.warn('push send non-200', await res.text());
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
exports.monthlyFeeReminder = onSchedule({ ...REGION, schedule: '0 9 1 * *', timeZone: 'Asia/Seoul' }, async () => {
  const month = new Date().toISOString().slice(0, 7);
  const clubs = await db.collection('clubs').get();
  for (const club of clubs.docs) {
    const feeDoc = await club.ref.collection('fees').doc(month).get();
    const paid = feeDoc.exists ? feeDoc.data().paid || {} : {};
    const amount = (feeDoc.exists && feeDoc.data().amount) || club.data().settings?.feeAmount || 30000;
    const tokens = await clubTokens(club.id, (m) => m.status === '활동' && !paid[m.id]);
    await sendPush(tokens, '💳 회비 안내', `${month} 회비 ${amount.toLocaleString()}원 납부 부탁드립니다.`, { type: 'fee', month });
  }
});

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
  { ...REGION, schedule: 'every 12 hours', timeZone: 'Asia/Seoul', secrets: [KMA_SERVICE_KEY] },
  async () => {
    const key = KMA_SERVICE_KEY.value();
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
