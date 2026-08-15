/* 스크롤 화면의 하단 여백.

   탭바(고정 높이)와 기기 제스처바(세이프에어리어)를 합쳐서 돌려준다.
   이걸 안 쓰고 paddingBottom 을 숫자로 박아 두면 기기에 따라
   마지막 카드가 탭바에 잘려 보인다. */
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_SPACE } from '../lib/theme';

export const useBottomPad = (extra = 24) => useSafeAreaInsets().bottom + TAB_BAR_SPACE + extra;
