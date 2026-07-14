import React, { useMemo } from "react";
import { trpc } from "../../lib/trpc";
import { formatKRW, formatDate } from "../../lib/format";

function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dateStr);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - now.getTime()) / 86_400_000);
}

export function SubscriptionTab() {
  const { data: subs, isLoading } = trpc.budget.getSubscriptions.useQuery();

  const monthlyTotal = useMemo(
    () => (subs ?? []).reduce((sum, s) => sum + s.amount, 0),
    [subs]
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="font-serif text-lg font-bold text-cream-800">정기결제 · 구독</h2>
        <p className="text-sm text-cream-500 mt-1">
          같은 가맹점에 매월 비슷한 금액이 반복 결제되는 항목을 자동으로 찾아줍니다.
        </p>
      </div>

      {isLoading ? (
        <p className="text-cream-500 text-sm">불러오는 중…</p>
      ) : (subs ?? []).length === 0 ? (
        <p className="text-cream-500 text-sm py-8 text-center">
          감지된 정기결제가 없습니다. (같은 가맹점이 3개월 이상 월 간격으로 결제되면 표시됩니다.)
        </p>
      ) : (
        <>
          <div className="bg-cream-700 text-white rounded-xl p-4 flex items-center justify-between">
            <span className="text-sm">매월 고정 지출(추정)</span>
            <span className="text-xl font-bold">{formatKRW(monthlyTotal)}</span>
          </div>

          <div className="space-y-2">
            {(subs ?? []).map((s, i) => {
              const d = daysUntil(s.nextDue);
              const soon = d >= 0 && d <= 3;
              return (
                <div
                  key={`${s.merchant}-${s.amount}-${i}`}
                  className="bg-white border border-cream-200 rounded-xl p-4 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-cream-800 text-sm truncate">{s.merchant}</div>
                    <div className="text-xs text-cream-500 mt-0.5">
                      약 {s.cycleDays}일 주기 · {s.count}회 결제 · 최근 {formatDate(s.lastCharged)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-cream-800">{formatKRW(s.amount)}</div>
                    <div className={`text-xs mt-0.5 ${soon ? "text-red-500 font-semibold" : "text-cream-500"}`}>
                      {d < 0 ? `다음 결제 ${formatDate(s.nextDue)}` : d === 0 ? "오늘 결제 예정" : `${d}일 후 결제`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-cream-400">
            ※ 자동 추정입니다. 실제 해지·변경 여부는 각 서비스에서 확인하세요. 안 쓰는 구독이 있다면 정리해보세요.
          </p>
        </>
      )}
    </div>
  );
}
