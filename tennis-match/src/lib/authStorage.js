/* ============================================================
   로그인 상태를 기기에 남기는 저장소

   무엇을 고치는 것인가
     앱을 껐다 켜면 로그인이 풀렸다. Firebase 의 getAuth() 는 React
     Native 에서 **메모리에만** 저장하기 때문이다. 앱이 죽으면 같이
     사라진다. 로그인은 매번 다시 해야 하는 것이 아니다.

   왜 AsyncStorage 를 안 쓰나
     Firebase 문서는 @react-native-async-storage/async-storage 를
     권한다. 맞는 말이지만 그건 **네이티브 모듈**이라 새로 설치하면
     APK 를 다시 빌드해야 한다. 빌드는 한참 걸리고, 이 프로젝트는
     태블릿 하나로 돌리고 있어서 한 번의 빌드가 비싸다.

     expo-file-system 은 expo 에 딸려 와서 **이미 설치된 앱 안에
     들어 있다**. 그래서 새 빌드 없이, 업데이트(OTA)만으로 로그인
     유지가 켜진다. Firebase 가 요구하는 것은 getItem/setItem/
     removeItem 세 가지뿐이라 그대로 맞춰 주면 된다.

   안전한가
     documentDirectory 는 안드로이드에서 그 앱만 읽을 수 있는 영역이다
     (AsyncStorage 도 같은 영역을 쓴다). 즉 권장 방식과 보호 수준이
     같다. 루팅된 기기라면 둘 다 뚫린다 — 그건 이 선택과 무관하다.

   ⚠️ 여기 담기는 것은 로그인 토큰이다. 절대 로그로 찍지 말 것.
      값을 확인하고 싶더라도 "있다/없다"까지만 본다.

   ⚠️ 어떤 호출도 앱을 죽이면 안 된다. 저장이 실패하는 것은
      "로그인이 안 남는다"로 끝나야지, 앱이 꺼지는 일이 되면 안 된다.
      그래서 전부 try 로 감싸고 실패는 null 로 돌려보낸다.
   ============================================================ */

/* 파일 이름에 그대로 쓸 수 없는 글자를 걷어낸다.
   Firebase 의 키는 `firebase:authUser:…:[DEFAULT]` 처럼 생겨서
   콜론과 대괄호가 들어 있다. 안드로이드는 견디지만 iOS·경로 규칙에
   기대지 않는 편이 낫다. 바꾼 뒤에도 키마다 다른 이름이어야 하므로
   1:1 로 치환한다(해시가 아니라 치환이라 충돌이 없다). */
const safeName = (key) =>
  `auth_${String(key).replace(/[^A-Za-z0-9_.-]/g, (c) => `_${c.charCodeAt(0)}_`)}`;

let FS = null;
let dir = '';

/* expo-file-system 을 쓸 때 불러온다.
   ⚠️ 맨 위에서 부르지 않는다 — 이 파일은 앱이 뜨는 길에 있고,
      네이티브 모듈을 맨 위에서 부르다 실패하면 앱이 시작도 못 하고
      닫힌다. 소셜 로그인에서 한 번 당한 것과 같은 함정이다. */
async function fs() {
  if (FS) return FS;
  const mod = await import('expo-file-system');
  FS = mod;
  dir = mod.documentDirectory || '';
  return FS;
}

export const authStorage = {
  async getItem(key) {
    try {
      const m = await fs();
      if (!dir) return null;
      const path = dir + safeName(key);
      const info = await m.getInfoAsync(path);
      if (!info?.exists) return null;
      return await m.readAsStringAsync(path);
    } catch (e) {
      return null;            // 못 읽으면 "로그인 안 된 상태"로 시작한다
    }
  },

  async setItem(key, value) {
    try {
      const m = await fs();
      if (!dir) return;
      await m.writeAsStringAsync(dir + safeName(key), String(value));
    } catch (e) {
      /* 저장 실패는 이번 실행에서만 로그인이 안 남는다는 뜻이다.
         앱을 멈출 이유가 없다. */
    }
  },

  async removeItem(key) {
    try {
      const m = await fs();
      if (!dir) return;
      await m.deleteAsync(dir + safeName(key), { idempotent: true });
    } catch (e) {
      /* 이미 없으면 지울 것도 없다 */
    }
  },
};

export default authStorage;
