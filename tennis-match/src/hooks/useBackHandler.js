/* ============================================================
   안드로이드 하드웨어 뒤로가기 처리

   안드로이드는 화면 아래(또는 제스처) 뒤로 버튼이 OS 차원에서 항상 있다.
   그런데 이 앱의 [더보기]처럼 한 화면 안에서 상태로 서브화면을 여는 곳은
   expo-router 가 그 이동을 모르기 때문에, 뒤로를 누르면 서브화면이 닫히는
   대신 앱이 그대로 종료돼 버린다. 이 훅으로 그 경우를 가로챈다.

   iOS 에는 하드웨어 뒤로 버튼이 없으므로 화면 안에 뒤로 버튼이 반드시
   있어야 한다 → ScreenHeader 의 onBack 이 그 역할을 한다.
   같은 핸들러를 두 곳에 연결하면 플랫폼별 동작이 어긋나지 않는다.

   사용:
     useBackHandler(() => {
       if (sub) { setSub(null); return true; }  // true = 내가 처리함
       return false;                            // false = OS 기본 동작(앱 종료/이전 화면)
     });
   ============================================================ */
import { useCallback, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';

/** 화면이 보이는 동안에만 하드웨어 뒤로가기를 가로챈다.
 *  탭을 옮기면 자동으로 해제되므로 다른 탭의 핸들러와 충돌하지 않는다. */
export function useBackHandler(handler) {
  const ref = useRef(handler);
  ref.current = handler;

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => !!ref.current?.());
      return () => sub.remove();
    }, []),
  );
}

export default useBackHandler;
