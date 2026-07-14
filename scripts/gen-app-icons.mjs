// 앱 아이콘·스플래시 원본 PNG 생성기 (외부 이미지 라이브러리 없이 순수 Node)
//
// @capacitor/assets 가 읽는 assets/ 폴더에 아이콘/스플래시 원본을 만든다.
// 이후 사용자가 로컬에서 `npx capacitor-assets generate` 를 실행하면 iOS/Android
// 모든 해상도가 자동 생성된다.
//
// 실행: node scripts/gen-app-icons.mjs

import { deflateSync } from "zlib";
import { writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "assets");
mkdirSync(OUT, { recursive: true });

// ── 색상 (따뜻한 가계부 브랜드: 성장/재정을 뜻하는 에메랄드 그린) ──
const BRAND = [15, 138, 95]; // #0F8A5F
const BRAND_DARK = [9, 61, 44]; // #093D2C
const WHITE = [255, 255, 255];
const COIN = [255, 213, 128]; // 살짝의 금색 포인트

// ── 초경량 캔버스 (RGBA) ───────────────────────────────────────
function canvas(w, h) {
  return { w, h, buf: new Uint8Array(w * h * 4) };
}
function blend(c, x, y, [r, g, b], a) {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h || a <= 0) return;
  const i = (y * c.w + x) * 4;
  const ia = 1 - a;
  c.buf[i] = r * a + c.buf[i] * ia;
  c.buf[i + 1] = g * a + c.buf[i + 1] * ia;
  c.buf[i + 2] = b * a + c.buf[i + 2] * ia;
  c.buf[i + 3] = Math.min(255, a * 255 + c.buf[i + 3] * ia);
}
// 모서리가 둥근 사각형 (모서리만 안티에일리어싱)
function roundRect(c, x0, y0, w, h, r, color) {
  const x1 = x0 + w, y1 = y0 + h;
  for (let y = Math.floor(y0); y < y1; y++) {
    for (let x = Math.floor(x0); x < x1; x++) {
      let cov = 1;
      // 네 모서리 원 안쪽 판정
      const cx = x < x0 + r ? x0 + r : x > x1 - r ? x1 - r : x;
      const cy = y < y0 + r ? y0 + r : y > y1 - r ? y1 - r : y;
      if (cx !== x || cy !== y) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        cov = Math.max(0, Math.min(1, r - d + 0.5));
      }
      blend(c, x, y, color, cov);
    }
  }
}
function disc(c, cx, cy, r, color) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) {
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      blend(c, x, y, color, Math.max(0, Math.min(1, r - d + 0.5)));
    }
  }
}

// ── PNG 인코딩 ─────────────────────────────────────────────────
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(c) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(c.w, 0);
  ihdr.writeUInt32BE(c.h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // rows with filter byte 0
  const raw = Buffer.alloc((c.w * 4 + 1) * c.h);
  for (let y = 0; y < c.h; y++) {
    raw[y * (c.w * 4 + 1)] = 0;
    Buffer.from(c.buf.buffer, y * c.w * 4, c.w * 4).copy(raw, y * (c.w * 4 + 1) + 1);
  }
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// ── 로고(막대그래프) 그리기: 오름차순 3개 막대 + 금색 코인 포인트 ──
function drawLogo(c, cx, cy, scale) {
  // scale = 로고 전체 폭(px) 기준. 막대 3개 + 간격.
  const barW = scale * 0.2;
  const gap = scale * 0.1;
  const totalW = barW * 3 + gap * 2;
  const left = cx - totalW / 2;
  const baseY = cy + scale * 0.42;
  const heights = [scale * 0.42, scale * 0.62, scale * 0.84];
  heights.forEach((hh, i) => {
    const x = left + i * (barW + gap);
    roundRect(c, x, baseY - hh, barW, hh, barW * 0.28, WHITE);
  });
  // 가장 큰 막대 위 금색 코인
  const lastX = left + 2 * (barW + gap) + barW / 2;
  disc(c, lastX, baseY - heights[2] - barW * 0.5, barW * 0.42, COIN);
}

function makeIcon() {
  const c = canvas(1024, 1024);
  roundRect(c, 0, 0, 1024, 1024, 230, BRAND); // iOS 마스크가 알아서 둥글게 하지만 여유 곡률
  drawLogo(c, 512, 512, 620);
  return encodePNG(c);
}
function makeForeground() {
  // Android 적응형 아이콘용: 배경 투명, 로고를 안전영역(약 62%)에 배치
  const c = canvas(1024, 1024);
  drawLogo(c, 512, 512, 470);
  return encodePNG(c);
}
function makeBackground() {
  const c = canvas(1024, 1024);
  roundRect(c, 0, 0, 1024, 1024, 0, BRAND);
  return encodePNG(c);
}
function makeSplash(dark) {
  const c = canvas(2732, 2732);
  roundRect(c, 0, 0, 2732, 2732, 0, dark ? BRAND_DARK : BRAND);
  drawLogo(c, 1366, 1366, 760);
  return encodePNG(c);
}

const files = {
  "logo.png": makeIcon(),
  "icon-only.png": makeIcon(),
  "icon-foreground.png": makeForeground(),
  "icon-background.png": makeBackground(),
  "splash.png": makeSplash(false),
  "splash-dark.png": makeSplash(true),
};
for (const [name, data] of Object.entries(files)) {
  writeFileSync(path.join(OUT, name), data);
  console.log(`생성: assets/${name} (${(data.length / 1024).toFixed(1)} KB)`);
}
console.log("\n완료. 로컬에서 `npx capacitor-assets generate` 로 iOS/Android 리소스를 생성하세요.");
