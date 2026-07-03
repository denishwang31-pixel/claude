import React, { useState } from "react";
import { cn } from "../lib/utils";

interface Section {
  title: string;
  content: React.ReactNode;
}

function SectionBlock({ title, content }: Section) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-cream-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-cream-50 hover:bg-cream-100 transition-colors text-left"
      >
        <span className="font-semibold text-cream-800 text-sm">{title}</span>
        <span className="text-cream-400 text-sm">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-5 py-4 bg-white text-sm text-cream-700 space-y-3 leading-relaxed">
          {content}
        </div>
      )}
    </div>
  );
}

export function UsageGuide() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-cream-50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">📖</span>
          <span className="font-semibold text-cream-800">가계부 사용법 &amp; 데이터 반영 안내</span>
        </div>
        <span className="text-cream-400 text-sm">{expanded ? "접기 ▲" : "펼치기 ▼"}</span>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-3 border-t border-cream-100">
          <p className="text-xs text-cream-500 pt-3">
            이 앱은 <strong>뱅크샐러드</strong> CSV 내보내기 파일을 기반으로 동작합니다. 아래에서 각 기능의 역할과 데이터가 어떻게 처리되는지 확인하세요.
          </p>

          {/* Quick start */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              { step: "1", title: "CSV 업로드", desc: "우상단 「+ 데이터 업로드」로 뱅크샐러드 파일을 올립니다. 중복은 자동 제외." },
              { step: "2", title: "카테고리 정리", desc: "「전체 내역」에서 잘못 분류된 거래의 카테고리 뱃지를 클릭해 바로잡습니다." },
              { step: "3", title: "대시보드 확인", desc: "KPI · 파이 차트 · 월별 피벗이 자동 갱신됩니다. 메모로 특이사항을 기록하세요." },
            ].map((s) => (
              <div key={s.step} className="flex gap-2.5 p-3 bg-cream-50 rounded-lg">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cream-700 text-white text-xs font-bold flex items-center justify-center">{s.step}</span>
                <div>
                  <p className="text-xs font-semibold text-cream-800">{s.title}</p>
                  <p className="text-[11px] text-cream-500 mt-0.5 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* 1. 데이터 업로드 */}
          <SectionBlock
            title="1. 데이터 업로드 방법"
            content={
              <ul className="space-y-2 list-disc list-inside">
                <li>대시보드 화면 우상단 <strong>「+ 데이터 업로드」</strong> 버튼을 눌러 파일 업로드 영역을 엽니다.</li>
                <li>뱅크샐러드 앱 → 내보내기 → CSV 형식으로 저장한 파일을 드래그하거나 클릭해서 업로드합니다.</li>
                <li>업로드 시 중복된 거래는 자동으로 건너뛰고, 새로운 거래만 추가됩니다.</li>
                <li>업로드 후 모든 통계·차트·집계가 즉시 새로고침됩니다.</li>
              </ul>
            }
          />

          {/* 2. 카테고리 분류 로직 */}
          <SectionBlock
            title="2. 카테고리 분류 — 어떻게 결정되나요?"
            content={
              <>
                <p>각 거래의 <strong>유효 카테고리(effectiveCategory)</strong>는 다음 우선순위로 결정됩니다:</p>
                <ol className="list-decimal list-inside space-y-1 mt-2">
                  <li><strong>사용자가 직접 변경한 카테고리</strong> (customCategory) — 최우선 적용</li>
                  <li><strong>매핑 규칙에 매칭</strong> — 내역명이 규칙과 일치하면 해당 카테고리 적용</li>
                  <li><strong>뱅크샐러드 기본 분류 변환</strong> — 뱅크샐러드의 대분류를 앱 내 카테고리로 변환</li>
                  <li><strong>뱅크샐러드 원본 카테고리</strong> — 위 항목 모두 없을 경우</li>
                </ol>
                <div className="mt-3 p-3 bg-cream-50 rounded-lg text-xs">
                  <strong>수입 / 저축 / 지출 구분 로직:</strong>
                  <ul className="mt-1 space-y-1 list-disc list-inside">
                    <li>카테고리가 <strong>저축 · 투자</strong>이면 → <span className="text-blue-600">저축</span>으로 분류 (금액 부호 무관)</li>
                    <li>금액이 <strong>양수(+)</strong>이고 저축 카테고리가 아니면 → <span className="text-emerald-600">수입</span></li>
                    <li>금액이 <strong>음수(−)</strong>이고 저축 카테고리가 아니면 → <span className="text-red-500">지출</span></li>
                  </ul>
                </div>
                <div className="mt-2 p-3 bg-blue-50 rounded-lg text-xs">
                  <strong>저축 넷(net) 계산:</strong> 저축 카테고리 거래는 입금(+)과 출금(−)을 모두 합산합니다. 예: −87M 출금 + 63M 재입금 = 순 저축 24M으로 표시됩니다.
                </div>
              </>
            }
          />

          {/* 3. 카테고리 변경 */}
          <SectionBlock
            title="3. 카테고리 변경 — 어디서, 어디까지 바뀌나요?"
            content={
              <>
                <p className="font-medium text-cream-800">방법 A: 전체 내역 탭의 카테고리 드롭다운</p>
                <ul className="list-disc list-inside space-y-1 mt-1">
                  <li>「전체 내역」 탭에서 거래의 카테고리 뱃지를 클릭하면 드롭다운이 열립니다.</li>
                  <li>드롭다운 상단에 <strong>적용 범위 옵션 2가지</strong>가 있습니다:</li>
                </ul>
                <div className="mt-2 ml-4 space-y-2 text-xs">
                  <div className="p-2.5 bg-cream-50 rounded-lg">
                    <strong>☑ 같은 내역 전체 변경</strong> (기본 켜짐) — 동일한 내역명을 가진 <strong>과거 거래 전부</strong>가 한 번에 바뀝니다. 끄면 클릭한 거래 1건만 바뀝니다.
                  </div>
                  <div className="p-2.5 bg-cream-50 rounded-lg">
                    <strong>☑ 매핑 규칙에 저장</strong> (기본 켜짐) — 이 내역명에 대한 규칙이 자동 생성되어, <strong>앞으로 업로드되는 거래</strong>에도 같은 카테고리가 적용됩니다. 끄면 규칙 없이 지금 있는 거래만 바뀝니다.
                  </div>
                </div>
                <p className="font-medium text-cream-800 mt-3">방법 B: 매핑 규칙 탭에서 규칙 추가</p>
                <ul className="list-disc list-inside space-y-1 mt-1">
                  <li>키워드 기반 규칙을 직접 만듭니다. 규칙은 저장 즉시 기존 거래 집계에 반영되고, 향후 업로드에도 적용됩니다.</li>
                </ul>
                <div className="mt-3 p-3 bg-amber-50 rounded-lg text-xs">
                  <strong>변경 효과 범위:</strong> 카테고리가 바뀌면 대시보드 KPI, 월별 요약, 카테고리별 차트, 파이 차트, 전체 내역 등 <strong>모든 화면의 집계에 즉시 반영</strong>됩니다. 별도 새로고침이 필요 없습니다.
                </div>
                <div className="mt-2 p-3 bg-cream-50 rounded-lg text-xs">
                  <strong>우선순위 주의:</strong> 드롭다운으로 직접 바꾼 카테고리는 매핑 규칙보다 <strong>항상 우선</strong>합니다. 직접 바꾼 거래는 나중에 규칙을 추가·삭제해도 바뀌지 않습니다. 규칙을 모든 거래에 강제로 다시 적용하려면 매핑 규칙 탭의 「전체 거래 규칙 재적용」 버튼을 사용하세요 (직접 변경한 것도 덮어씁니다).
                </div>
              </>
            }
          />

          {/* 4. 매핑 규칙 탭 */}
          <SectionBlock
            title="4. 매핑 규칙 탭 — 자동 분류 설정"
            content={
              <>
                <p>「매핑 규칙」 탭에서 <strong>내역명 키워드 → 카테고리</strong> 규칙을 관리합니다. 규칙은 수입 · 저축 · 투자 · 지출 그룹별로 나뉘어 표시됩니다.</p>
                <ul className="list-disc list-inside space-y-2 mt-2">
                  <li><strong>매칭 방식 2가지:</strong> <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-600 text-[10px]">포함</span> — 내역명에 키워드가 포함되면 매칭 (예: 「스타벅스」→ "스타벅스 강남점"도 매칭) / <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 text-[10px]">완전일치</span> — 내역명이 키워드와 정확히 같아야 매칭</li>
                  <li><strong>즉시 반영:</strong> 규칙을 추가·삭제·비활성화하면 기존 거래의 집계가 곧바로 바뀝니다. (단, 드롭다운으로 직접 변경한 거래는 규칙보다 우선하므로 영향받지 않습니다.)</li>
                  <li><strong>활성 체크박스:</strong> 규칙을 삭제하지 않고 잠시 꺼둘 수 있습니다.</li>
                  <li><strong>미래 적용:</strong> 이후 CSV를 업로드할 때도 활성 규칙이 자동 적용됩니다.</li>
                </ul>
                <p className="font-medium text-cream-800 mt-3">상단 버튼 3가지</p>
                <ul className="list-disc list-inside space-y-1 mt-1 text-xs">
                  <li><strong className="text-emerald-600">전체 거래 규칙 재적용:</strong> 모든 거래에 규칙을 강제로 다시 적용합니다. 직접 변경한 카테고리도 규칙과 매칭되면 덮어씁니다.</li>
                  <li><strong className="text-blue-600">거래내역에서 자동 생성:</strong> 기존 거래 내역명을 분석해 규칙 후보를 자동으로 만들어줍니다.</li>
                  <li><strong>기본 규칙 불러오기:</strong> 자주 쓰는 기본 규칙 세트를 한 번에 추가합니다.</li>
                </ul>
                <div className="mt-3 p-3 bg-cream-50 rounded-lg text-xs">
                  <strong>활용 예시:</strong> 「스타벅스」 → 「카페」, 「PWC컨설팅」 → 「급여」, 「황동현」 → 「저축」 등으로 설정해두면 매달 반복되는 거래를 수동으로 바꿀 필요가 없습니다.
                </div>
              </>
            }
          />

          {/* 5. 각 탭 설명 */}
          <SectionBlock
            title="5. 각 탭(화면) 설명"
            content={
              <div className="space-y-3">
                <div>
                  <p className="font-semibold text-cream-800">📊 대시보드</p>
                  <p className="text-xs mt-0.5">총 수입 · 저축/투자 · 지출 · 순자산 증감 KPI 카드, 카테고리별 파이 차트, 월별 항목 피벗 테이블을 한눈에 볼 수 있습니다. 각 KPI 아래 메모를 남길 수 있습니다.</p>
                </div>
                <div>
                  <p className="font-semibold text-cream-800">📅 월별 요약</p>
                  <p className="text-xs mt-0.5">월별로 수입 · 지출 · 저축 · 순자산 흐름을 막대 그래프와 표로 확인합니다. 월을 클릭하면 해당 월의 카테고리별 상세 내역을 볼 수 있습니다.</p>
                </div>
                <div>
                  <p className="font-semibold text-cream-800">🗂️ 카테고리별</p>
                  <p className="text-xs mt-0.5">카테고리별 지출·수입 합계를 파이 차트와 목록으로 보여줍니다. 카테고리를 클릭하면 해당 카테고리의 거래 목록을 드릴다운해서 볼 수 있습니다.</p>
                </div>
                <div>
                  <p className="font-semibold text-cream-800">📋 전체 내역</p>
                  <p className="text-xs mt-0.5">모든 거래를 날짜 역순으로 표시합니다. 날짜 범위 · 카테고리 · 키워드로 검색 가능하고, 각 거래의 카테고리를 직접 변경하거나 오른쪽 끝의 메모 칸에 비고를 입력할 수 있습니다.</p>
                </div>
                <div>
                  <p className="font-semibold text-cream-800">⚙️ 매핑 규칙</p>
                  <p className="text-xs mt-0.5">자동 카테고리 분류 규칙을 관리합니다. 내역명 키워드와 카테고리를 지정해두면 해당 키워드가 포함된 거래가 자동으로 분류됩니다.</p>
                </div>
              </div>
            }
          />

          {/* 6. 필터 옵션 */}
          <SectionBlock
            title="6. 필터 옵션 (월별 요약 · 카테고리별 탭)"
            content={
              <ul className="list-disc list-inside space-y-2">
                <li><strong>이체 포함:</strong> 「이체」 카테고리 거래를 집계에 포함할지 여부입니다. 계좌 간 이동 금액이 지출/수입으로 잡히는 것이 싫다면 제외(기본값)로 두세요.</li>
                <li><strong>카테고리 제외:</strong> 특정 카테고리를 집계에서 완전히 빼고 싶을 때 사용합니다. 예: 내부 이체로 잡히는 대규모 거래를 숨길 때.</li>
                <li>설정은 자동 저장되어 다음 방문 시에도 유지됩니다.</li>
              </ul>
            }
          />

          {/* 7. 메모 기능 */}
          <SectionBlock
            title="7. 메모 기능"
            content={
              <ul className="list-disc list-inside space-y-2">
                <li><strong>KPI 메모 (대시보드):</strong> 총 수입 · 저축/투자 · 지출 · 순자산 증감 카드 하단의 텍스트 박스에 자유롭게 메모를 입력하세요. 입력 후 박스 밖을 클릭하면 자동 저장됩니다.</li>
                <li><strong>거래별 메모 (전체 내역):</strong> 「전체 내역」 탭의 각 거래 오른쪽 끝에 메모 입력란이 있습니다. 클릭해서 입력 후 Enter 또는 포커스 이탈 시 저장됩니다.</li>
                <li>메모는 서버에 저장되어 페이지를 새로 고침해도 유지됩니다.</li>
              </ul>
            }
          />

          {/* 8. 주의사항 */}
          <SectionBlock
            title="8. 알아두면 좋은 점 &amp; 주의사항"
            content={
              <ul className="list-disc list-inside space-y-2">
                <li><strong>수입은 단일 카테고리:</strong> 카테고리별 화면에서 수입은 항상 「수입」 하나로 집계됩니다. 저축·투자 카테고리가 아닌 한, 금액이 양수(+)이면 카테고리와 무관하게 수입으로 분류됩니다 (환급·복지카드 입금 포함).</li>
                <li><strong>저축 순계산:</strong> 저축/투자 카테고리의 플러스·마이너스 거래는 모두 합산해 순 저축액으로 표시됩니다. 내 계좌 간 이동이 저축으로 잡힌 경우 양방향 거래가 상계됩니다.</li>
                <li><strong>복지카드 거래:</strong> 입금(+)은 수입으로, 카드 결제(−)는 지출로 각각 독립적으로 집계됩니다. 두 건 모두 집계에 반영됩니다.</li>
                <li><strong>중복 업로드:</strong> 같은 거래를 포함한 CSV를 다시 올려도 중복 저장되지 않습니다.</li>
                <li><strong>카테고리 변경 → 전체 반영:</strong> 카테고리를 바꾸면 대시보드, 월별, 카테고리별 탭 집계가 모두 실시간으로 업데이트됩니다.</li>
              </ul>
            }
          />
        </div>
      )}
    </div>
  );
}
