import { Capacitor } from "@capacitor/core";
import { toast } from "sonner";
import { formatKRW } from "./format";
import { categoryDisplay } from "./categories";

export interface BudgetAlert {
  category: string;
  threshold: number;
  spent: number;
  target: number;
  percent: number;
}

function message(a: BudgetAlert): { title: string; body: string } {
  const name = categoryDisplay(a.category);
  const amount = `${formatKRW(a.spent)} / ${formatKRW(a.target)}`;
  if (a.threshold >= 100) {
    return { title: `⚠️ '${name}' 예산 초과`, body: `이번 달 예산을 넘었어요 (${amount})` };
  }
  return { title: `'${name}' 예산의 ${a.threshold}% 사용`, body: `${amount} (${a.percent}%)` };
}

/** 예산 임계치 알림을 표시한다. 네이티브면 로컬 알림, 웹이면 토스트. */
export async function notifyBudgetAlerts(alerts: BudgetAlert[]): Promise<void> {
  if (alerts.length === 0) return;

  // 웹에서는 항상 토스트로도 보여준다(가시성).
  for (const a of alerts) {
    const m = message(a);
    if (a.threshold >= 100) toast.error(`${m.title} — ${m.body}`);
    else toast.warning(`${m.title} — ${m.body}`);
  }

  if (!Capacitor.isNativePlatform()) return;

  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== "granted") {
      const req = await LocalNotifications.requestPermissions();
      if (req.display !== "granted") return;
    }
    await LocalNotifications.schedule({
      notifications: alerts.map((a, i) => {
        const m = message(a);
        return {
          id: Date.now() % 100000 + i,
          title: m.title,
          body: m.body,
          schedule: { at: new Date(Date.now() + 500) },
        };
      }),
    });
  } catch {
    // 로컬 알림 실패해도 토스트로는 이미 표시됨 — 조용히 무시.
  }
}
