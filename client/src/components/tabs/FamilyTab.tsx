import React, { useState } from "react";
import { trpc } from "../../lib/trpc";
import { toast } from "sonner";

export function FamilyTab() {
  const utils = trpc.useUtils();
  const { data: group, isLoading } = trpc.budget.getGroup.useQuery();
  const [code, setCode] = useState("");

  // 그룹 변경 시 데이터셋(dataUserId)이 바뀌므로 전체 캐시를 새로고침
  const refreshAll = () => utils.invalidate();

  const createM = trpc.budget.createGroup.useMutation({
    onSuccess: () => { utils.budget.getGroup.invalidate(); toast.success("가족 그룹을 만들었습니다."); },
    onError: () => toast.error("그룹 생성 실패"),
  });
  const joinM = trpc.budget.joinGroup.useMutation({
    onSuccess: (r) => {
      if (!r.ok) return toast.error(r.error ?? "참여 실패");
      toast.success("가족 그룹에 참여했습니다. 이제 같은 가계부를 함께 봅니다.");
      refreshAll();
    },
    onError: () => toast.error("참여 실패"),
  });
  const leaveM = trpc.budget.leaveGroup.useMutation({
    onSuccess: () => { toast.success("그룹에서 나왔습니다."); refreshAll(); },
    onError: () => toast.error("나가기 실패"),
  });
  const regenM = trpc.budget.regenerateInviteCode.useMutation({
    onSuccess: (r) => {
      if (r.inviteCode) { toast.success("초대 코드를 재발급했습니다."); utils.budget.getGroup.invalidate(); }
      else toast.error(r.error ?? "재발급 실패");
    },
    onError: () => toast.error("재발급 실패"),
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="font-serif text-lg font-bold text-cream-800">가족 공유 가계부</h2>
        <p className="text-sm text-cream-500 mt-1">
          가족을 초대하면 <b>같은 가계부(거래·예산·규칙)를 함께</b> 보고 관리합니다.
        </p>
      </div>

      {isLoading ? (
        <p className="text-cream-500 text-sm">불러오는 중…</p>
      ) : group?.inGroup ? (
        <div className="space-y-4">
          <div className="bg-white border border-cream-200 rounded-xl p-5">
            <div className="text-sm text-cream-500">초대 코드</div>
            <div className="flex items-center gap-3 mt-1">
              <code className="text-2xl font-bold tracking-widest text-cream-800">{group.inviteCode}</code>
              <button
                onClick={() => { navigator.clipboard?.writeText(group.inviteCode ?? ""); toast.success("코드를 복사했습니다."); }}
                className="px-3 py-1.5 rounded-lg border border-cream-200 text-sm text-cream-600 hover:bg-cream-100"
              >
                복사
              </button>
            </div>
            <div className="text-sm text-cream-500 mt-3">
              현재 <b>{group.memberCount}명</b> 참여 중 · 내 역할: {group.isOwner ? "관리자(데이터 소유자)" : "구성원"}
            </div>
            {group.inviteExpired && (
              <p className="text-xs text-red-500 mt-2">⚠️ 초대 코드가 만료되었습니다. {group.isOwner ? "재발급하세요." : "관리자에게 재발급을 요청하세요."}</p>
            )}
            <p className="text-xs text-cream-400 mt-2">
              가족에게 이 코드를 알려주고, 그 사람 앱의 "가족" 탭에서 코드를 입력하면 함께 보게 됩니다.
              초대 코드는 발급 후 72시간 동안 유효합니다.
            </p>
            {group.isOwner && (
              <button
                onClick={() => regenM.mutate()}
                disabled={regenM.isPending}
                className="mt-3 text-sm px-3 py-1.5 rounded-lg border border-cream-200 text-cream-600 hover:bg-cream-100 disabled:opacity-60"
              >
                초대 코드 재발급
              </button>
            )}
          </div>
          <button
            onClick={() => {
              if (confirm(group.isOwner
                ? "관리자가 나가면 그룹이 해체됩니다(데이터는 내 계정에 남습니다). 계속할까요?"
                : "그룹에서 나가면 내 개인 가계부로 돌아갑니다. 계속할까요?")) {
                leaveM.mutate();
              }
            }}
            className="text-sm text-red-500 hover:underline"
          >
            {group.isOwner ? "그룹 해체하기" : "그룹에서 나가기"}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white border border-cream-200 rounded-xl p-5">
            <div className="font-semibold text-cream-800 text-sm">새로 만들기</div>
            <p className="text-xs text-cream-500 mt-1 mb-3">
              내 가계부를 공유 가계부로 만들고 초대 코드를 발급합니다.
            </p>
            <button
              onClick={() => createM.mutate()}
              disabled={createM.isPending}
              className="px-4 py-2 rounded-lg bg-cream-700 text-white text-sm font-semibold hover:bg-cream-800 disabled:opacity-60"
            >
              가족 그룹 만들기
            </button>
          </div>

          <div className="bg-white border border-cream-200 rounded-xl p-5">
            <div className="font-semibold text-cream-800 text-sm">초대 코드로 참여</div>
            <p className="text-xs text-cream-500 mt-1 mb-3">
              ⚠️ 참여하면 <b>가족의 공유 가계부</b>를 보게 되고, 내 기존 개인 데이터는 그동안 숨겨집니다(나가면 복구).
            </p>
            <div className="flex items-center gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="초대 코드 (예: A1B2C3D4)"
                className="px-3 py-2 rounded-lg border border-cream-200 text-sm flex-1 tracking-widest"
              />
              <button
                onClick={() => code.trim() && joinM.mutate({ inviteCode: code.trim() })}
                disabled={joinM.isPending}
                className="px-4 py-2 rounded-lg bg-cream-700 text-white text-sm font-semibold hover:bg-cream-800 disabled:opacity-60"
              >
                참여
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
