/* ============================================================
   앱 아이콘 만들기 — Claude Design 시안의 공 심볼

   진한 원 안의 흰 테니스공(가는 테두리 + 가운데로 모이는 두 줄의 솔기).
   원본은 이 파일 안의 SVG 하나다. 여기서 PNG 들을 뽑는다 — 그림 파일을
   손으로 고치면 크기마다 모양이 조금씩 달라진다.

     assets/icon.png            1024 — 아이폰·스토어·예전 안드로이드
     assets/adaptive-icon.png   1024 — 안드로이드 앞면(투명). 뒷면 색은 app.json
     assets/splash.png          1242 — 시작 화면(밝은 바탕 + 진한 원 심볼)
     assets/favicon.png         48   — 웹
     assets/notification-icon.png 96 — 알림(흰 윤곽)
     assets/brand/src/mark.svg  원본

   ⚠️ 안드로이드 적응형 아이콘은 기기마다 동그라미·둥근 네모 등으로 잘린다.
      가운데 66% 안쪽만 안전하므로 공을 그 안에 둔다.
   ⚠️ 런처 아이콘은 **새로 빌드한 앱(APK)** 부터 바뀐다. 업데이트(OTA)로는
      안 바뀐다 — 아이콘은 설치 파일 안에 들어 있다.

   쓰는 법: node scripts/build-icons.mjs  (크로미움 필요 — PW_CHROME 로 경로 지정)
   ============================================================ */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const INK = '#1C2318';     // 시안의 진한 원
export const CREAM = '#F6F4EC';   // 시안의 바탕

/** 공 하나 — 중심 (cx,cy), 바깥 반지름 r. (2026-09-25 시안에 맞춰 다시 그림)
    시안: 두 솔기가 **왼쪽 테두리에서 시작해 가운데를 조금 지나 둥근 끝으로 열린 채 끝난다**
    — 위는 살짝 처졌다가 위로, 아래는 그 거울. "Ɛ" 처럼 보인다.
    예전 판은 솔기가 좌우 끝까지 가로질러 "Ξ" 처럼 보였다(앱 주인: 시안과 다르다).
    솔기의 왼쪽 끝은 공 안쪽에서만 보이게 잘라 테두리와 이어 붙인다. */
let clipSeq = 0;
export function ball(cx, cy, r, color = '#FFFFFF') {
  const ring = r * 0.15;          // 테두리 굵기 (시안 비율)
  const seam = r * 0.105;         // 솔기는 테두리보다 조금 가늘다
  const id = `in${clipSeq += 1}`;
  const P = (x, y) => `${(cx + x * r).toFixed(1)} ${(cy + y * r).toFixed(1)}`;
  const seamPath = (s) => `M ${P(-0.98, 0.40 * s)} Q ${P(-0.25, 0.18 * s)} ${P(0.21, 0.36 * s)}`;
  return `
  <defs><clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${r - ring * 0.5}"/></clipPath></defs>
  <circle cx="${cx}" cy="${cy}" r="${r - ring / 2}" fill="none" stroke="${color}" stroke-width="${ring}"/>
  <g clip-path="url(#${id})" fill="none" stroke="${color}" stroke-width="${seam}" stroke-linecap="round">
    <path d="${seamPath(-1)}"/>
    <path d="${seamPath(1)}"/>
  </g>`;
}

const svg = (w, h, body, bg = null) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bg ? `<rect width="100%" height="100%" fill="${bg}"/>` : ''}${body}</svg>`;

export const ICONS = {
  /* 시안 비율: 공 = 어두운 원 지름의 약 38% */
  'assets/icon.png': { w: 1024, h: 1024, svg: svg(1024, 1024, ball(512, 512, 196), INK) },
  /* 안드로이드 적응형 아이콘 — 바탕(INK)은 app.json 의 backgroundColor, 이건 앞 그림.
     런처가 가운데 약 2/3 만 둥글게 보여 주므로 그 안에서 38% 가 되게 */
  'assets/adaptive-icon.png': { w: 1024, h: 1024, svg: svg(1024, 1024, ball(512, 512, 132)) },
  /* 시작 화면 — 시안 그대로: 크림 바탕, 진한 원 + 공, 아래 COURT */
  'assets/splash.png': {
    w: 1242, h: 1242,
    svg: svg(1242, 1242, `<circle cx="621" cy="540" r="200" fill="${INK}"/>${ball(621, 540, 77)}
      <text x="621" y="900" text-anchor="middle" fill="${INK}"
        font-family="Liberation Sans, Arial, Helvetica, sans-serif" font-weight="700"
        font-size="132" letter-spacing="6">COURT</text>`, CREAM),
  },
  /* 알림 아이콘 — 안드로이드는 흰색 윤곽만 쓴다(색은 시스템이 칠한다) */
  'assets/notification-icon.png': { w: 96, h: 96, svg: svg(96, 96, ball(48, 48, 40)) },
  'assets/favicon.png': { w: 48, h: 48, svg: svg(48, 48, `<circle cx="24" cy="24" r="24" fill="${INK}"/>${ball(24, 24, 11)}`) },
};

async function main() {
  const { chromium } = await import(process.env.PW_CORE || 'playwright-core');
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  mkdirSync(resolve(ROOT, 'assets/brand/src'), { recursive: true });
  writeFileSync(resolve(ROOT, 'assets/brand/src/mark.svg'),
    svg(512, 512, `<circle cx="256" cy="256" r="256" fill="${INK}"/>${ball(256, 256, 96)}`));
  for (const [out, it] of Object.entries(ICONS)) {
    const p = await b.newPage({ viewport: { width: it.w, height: it.h }, deviceScaleFactor: 1 });
    await p.setContent(`<html><body style="margin:0;background:transparent">${it.svg}</body></html>`);
    await p.screenshot({ path: resolve(ROOT, out), omitBackground: true, clip: { x: 0, y: 0, width: it.w, height: it.h } });
    await p.close();
    console.log('만듦', out);
  }
  await b.close();
}
if (process.argv[1] && process.argv[1].endsWith('build-icons.mjs')) main();
