/* ============================================================
   플레이 스토어 그래픽 이미지(1024×500) — 앱 아이콘과 같은 공 마크 + 이름 + 한 줄 소개
   쓰는 법: PW_CORE=… PW_CHROME=… node scripts/build-store.mjs
   결과: assets/store/feature-graphic.png  (STORE.md 참고)
   ============================================================ */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ball, INK, CREAM } from './build-icons.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const W = 1024; const H = 500;
const html = `<html><body style="margin:0">
<div style="width:${W}px;height:${H}px;background:${INK};display:flex;align-items:center;gap:56px;padding:0 84px;box-sizing:border-box;font-family:'Noto Sans CJK KR','Noto Sans KR','Apple SD Gothic Neo',sans-serif">
  <svg width="220" height="220" viewBox="0 0 220 220"><circle cx="110" cy="110" r="110" fill="#26311F"/>${ball(110, 110, 70)}</svg>
  <div>
    <div style="color:#fff;font-size:92px;font-weight:800;letter-spacing:-2px;line-height:1">Court<span style="color:#9BE15D">.</span></div>
    <div style="color:${CREAM};font-size:34px;font-weight:700;margin-top:22px">테니스 클럽 운영 올인원</div>
    <div style="color:rgba(246,244,236,0.72);font-size:24px;font-weight:500;margin-top:14px">참석 투표 · 대진 자동 편성 · 출석 · 회비</div>
  </div>
</div></body></html>`;

const { chromium } = await import(process.env.PW_CORE || 'playwright-core');
const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
mkdirSync(resolve(ROOT, 'assets/store'), { recursive: true });
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await p.setContent(html);
await p.waitForTimeout(300);
await p.screenshot({ path: resolve(ROOT, 'assets/store/feature-graphic.png'), clip: { x: 0, y: 0, width: W, height: H } });
await b.close();
console.log('만듦 assets/store/feature-graphic.png');
