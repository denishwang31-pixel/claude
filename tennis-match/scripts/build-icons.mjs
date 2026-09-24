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

/** 공 하나 — 중심 (cx,cy), 반지름 r.
    솔기는 공 안쪽에서만 보이게 잘라 낸다(테두리 밖으로 삐져나오면 공이 아니라 기호처럼 보인다). */
let clipSeq = 0;
export function ball(cx, cy, r, color = '#FFFFFF') {
  const w = r * 0.13;             // 테두리 굵기 (시안 비율)
  const id = `in${clipSeq += 1}`;
  const x0 = cx - r * 1.1;
  const x1 = cx + r * 1.1;
  return `
  <defs><clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${r - w * 0.6}"/></clipPath></defs>
  <circle cx="${cx}" cy="${cy}" r="${r - w / 2}" fill="none" stroke="${color}" stroke-width="${w}"/>
  <g clip-path="url(#${id})">
    <path d="M ${x0} ${cy - r * 0.34} Q ${cx} ${cy + r * 0.18} ${x1} ${cy - r * 0.34}" fill="none" stroke="${color}" stroke-width="${w}"/>
    <path d="M ${x0} ${cy + r * 0.34} Q ${cx} ${cy - r * 0.18} ${x1} ${cy + r * 0.34}" fill="none" stroke="${color}" stroke-width="${w}"/>
  </g>`;
}

const svg = (w, h, body, bg = null) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bg ? `<rect width="100%" height="100%" fill="${bg}"/>` : ''}${body}</svg>`;

export const ICONS = {
  'assets/icon.png': { w: 1024, h: 1024, svg: svg(1024, 1024, ball(512, 512, 230), INK) },
  'assets/adaptive-icon.png': { w: 1024, h: 1024, svg: svg(1024, 1024, ball(512, 512, 215)) },
  'assets/splash.png': {
    w: 1242, h: 1242,
    svg: svg(1242, 1242, `<circle cx="621" cy="621" r="200" fill="${INK}"/>${ball(621, 621, 78)}`, CREAM),
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
