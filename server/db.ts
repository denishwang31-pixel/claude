// ── DB 배럴 ────────────────────────────────────────────────────
// 2,300줄 모놀리스를 dbmodules/ 아래 기능별 모듈로 분해했다(FIX-12).
// 기존 `from "./db"` 임포트가 전부 그대로 동작하도록 전 모듈을 재-export 한다.
// 새 코드는 가급적 dbmodules/의 개별 모듈에 추가할 것.
export * from "./dbmodules/core";
export * from "./dbmodules/users";
export * from "./dbmodules/transactions";
export * from "./dbmodules/rules";
export * from "./dbmodules/stats";
export * from "./dbmodules/budgets";
export * from "./dbmodules/subscriptions";
export * from "./dbmodules/accounts";
export * from "./dbmodules/groups";
