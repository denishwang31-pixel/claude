/* ============================================================
   기기에 남기는 작은 설정 (최근 찾은 말 같은 것)

   authStorage.js 와 같은 이유로 expo-file-system 을 쓴다 — 이미 앱에
   들어 있어 새 빌드가 필요 없다. 로그인 토큰과 섞이지 않게 파일 이름
   앞머리를 따로 둔다.

   ⚠️ 여기 담는 것은 잃어도 되는 것만. 실패하면 조용히 기본값으로
      돌아간다. 앱을 멈추게 해서는 안 된다.
   ============================================================ */
const mem = new Map();
let FS = null;
let dir = '';

async function fs() {
  if (FS) return FS;
  const mod = await import('expo-file-system');
  FS = mod;
  dir = mod.documentDirectory || '';
  return FS;
}

const fileOf = (name) => `pref_${String(name).replace(/[^A-Za-z0-9_.-]/g, '_')}.json`;

export async function getJSON(name, fallback) {
  if (mem.has(name)) return mem.get(name);
  try {
    const m = await fs();
    if (!dir) return fallback;
    const path = dir + fileOf(name);
    const info = await m.getInfoAsync(path);
    if (!info?.exists) return fallback;
    const v = JSON.parse(await m.readAsStringAsync(path));
    mem.set(name, v);
    return v;
  } catch (e) {
    return fallback;
  }
}

export async function setJSON(name, value) {
  mem.set(name, value);
  try {
    const m = await fs();
    if (!dir) return;
    await m.writeAsStringAsync(dir + fileOf(name), JSON.stringify(value));
  } catch (e) {
    /* 이번 실행 동안은 메모리에 남아 있다 */
  }
}

export default { getJSON, setJSON };
