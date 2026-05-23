/**
 * 카테고리 매핑 규칙 시드 스크립트
 * 실행: npm run db:seed
 *
 * 지정 userId에 기본 매핑 규칙 101개를 삽입합니다.
 * 이미 같은 키워드가 있으면 DUPLICATE KEY로 무시됩니다.
 */

import { getDb } from "../server/db";
import { sql } from "drizzle-orm";

const USER_ID = 1; // 시드할 사용자 ID

const SEED_RULES: { keyword: string; category: string; isExact: boolean }[] = [
  // 식비
  { keyword: "스타벅스", category: "카페", isExact: false },
  { keyword: "이디야", category: "카페", isExact: false },
  { keyword: "할리스", category: "카페", isExact: false },
  { keyword: "투썸", category: "카페", isExact: false },
  { keyword: "맥도날드", category: "식비", isExact: false },
  { keyword: "버거킹", category: "식비", isExact: false },
  { keyword: "롯데리아", category: "식비", isExact: false },
  { keyword: "KFC", category: "식비", isExact: false },
  { keyword: "편의점", category: "식비", isExact: false },
  { keyword: "CU", category: "식비", isExact: true },
  { keyword: "GS25", category: "식비", isExact: true },
  { keyword: "세븐일레븐", category: "식비", isExact: false },
  { keyword: "이마트", category: "식비", isExact: false },
  { keyword: "홈플러스", category: "식비", isExact: false },
  { keyword: "롯데마트", category: "식비", isExact: false },
  { keyword: "코스트코", category: "식비", isExact: false },
  { keyword: "배달의민족", category: "식비", isExact: false },
  { keyword: "쿠팡이츠", category: "식비", isExact: false },
  { keyword: "요기요", category: "식비", isExact: false },
  // 교통
  { keyword: "티머니", category: "교통", isExact: false },
  { keyword: "카카오택시", category: "교통", isExact: false },
  { keyword: "우티", category: "교통", isExact: false },
  { keyword: "타다", category: "교통", isExact: false },
  { keyword: "코레일", category: "교통", isExact: false },
  { keyword: "SRT", category: "교통", isExact: false },
  { keyword: "KTX", category: "교통", isExact: false },
  { keyword: "주유", category: "교통", isExact: false },
  { keyword: "GS칼텍스", category: "교통", isExact: false },
  { keyword: "SK에너지", category: "교통", isExact: false },
  // 쇼핑
  { keyword: "쿠팡", category: "쇼핑", isExact: false },
  { keyword: "11번가", category: "쇼핑", isExact: false },
  { keyword: "G마켓", category: "쇼핑", isExact: false },
  { keyword: "옥션", category: "쇼핑", isExact: false },
  { keyword: "위메프", category: "쇼핑", isExact: false },
  { keyword: "티몬", category: "쇼핑", isExact: false },
  { keyword: "무신사", category: "쇼핑", isExact: false },
  { keyword: "29CM", category: "쇼핑", isExact: false },
  { keyword: "SSF샵", category: "쇼핑", isExact: false },
  { keyword: "H&M", category: "쇼핑", isExact: false },
  { keyword: "자라", category: "쇼핑", isExact: false },
  { keyword: "유니클로", category: "쇼핑", isExact: false },
  // 의료
  { keyword: "병원", category: "의료", isExact: false },
  { keyword: "의원", category: "의료", isExact: false },
  { keyword: "약국", category: "의료", isExact: false },
  { keyword: "치과", category: "의료", isExact: false },
  { keyword: "한의원", category: "의료", isExact: false },
  // 문화
  { keyword: "CGV", category: "문화", isExact: false },
  { keyword: "롯데시네마", category: "문화", isExact: false },
  { keyword: "메가박스", category: "문화", isExact: false },
  { keyword: "YES24", category: "문화", isExact: false },
  { keyword: "교보문고", category: "문화", isExact: false },
  { keyword: "알라딘", category: "문화", isExact: false },
  { keyword: "밀라노", category: "문화", isExact: false },
  // 교육
  { keyword: "학원", category: "교육", isExact: false },
  { keyword: "인강", category: "교육", isExact: false },
  { keyword: "클래스101", category: "교육", isExact: false },
  { keyword: "클래스유", category: "교육", isExact: false },
  { keyword: "패스트캠퍼스", category: "교육", isExact: false },
  { keyword: "유데미", category: "교육", isExact: false },
  // 구독
  { keyword: "넷플릭스", category: "구독", isExact: false },
  { keyword: "왓챠", category: "구독", isExact: false },
  { keyword: "웨이브", category: "구독", isExact: false },
  { keyword: "티빙", category: "구독", isExact: false },
  { keyword: "유튜브프리미엄", category: "구독", isExact: false },
  { keyword: "멜론", category: "구독", isExact: false },
  { keyword: "스포티파이", category: "구독", isExact: false },
  { keyword: "애플뮤직", category: "구독", isExact: false },
  { keyword: "밀리의서재", category: "구독", isExact: false },
  { keyword: "리디", category: "구독", isExact: false },
  // 통신
  { keyword: "SK텔레콤", category: "통신", isExact: false },
  { keyword: "KT", category: "통신", isExact: false },
  { keyword: "LG유플러스", category: "통신", isExact: false },
  // 주거
  { keyword: "관리비", category: "주거", isExact: false },
  { keyword: "전기요금", category: "주거", isExact: false },
  { keyword: "가스요금", category: "주거", isExact: false },
  { keyword: "수도요금", category: "주거", isExact: false },
  { keyword: "월세", category: "주거", isExact: false },
  // 저축
  { keyword: "적립식", category: "저축", isExact: false },
  { keyword: "주택청약", category: "저축", isExact: false },
  { keyword: "청약저축", category: "저축", isExact: false },
  { keyword: "정기적금", category: "저축", isExact: false },
  // 투자
  { keyword: "주식", category: "투자", isExact: false },
  { keyword: "펀드", category: "투자", isExact: false },
  { keyword: "ETF", category: "투자", isExact: false },
  { keyword: "ISA", category: "투자", isExact: false },
  { keyword: "IRP", category: "투자", isExact: false },
  { keyword: "연금저축", category: "투자", isExact: false },
];

async function main() {
  const db = await getDb();
  if (!db) {
    console.error("DB 연결 실패. DATABASE_URL을 확인하세요.");
    process.exit(1);
  }

  let inserted = 0;
  for (const rule of SEED_RULES) {
    try {
      await db.execute(sql.raw(
        `INSERT IGNORE INTO category_rules (userId, keyword, category, isExact)
         VALUES (${USER_ID}, '${rule.keyword.replace(/'/g, "''")}', '${rule.category}', ${rule.isExact ? 1 : 0})`
      ));
      inserted++;
    } catch (err) {
      console.warn(`건너뜀: ${rule.keyword}`, err);
    }
  }

  console.log(`시드 완료: ${inserted}/${SEED_RULES.length}개 규칙 삽입`);
  process.exit(0);
}

main();
