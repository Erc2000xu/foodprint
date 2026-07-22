"use client";

import { useActionState } from "react";
import { updateMemberStatus, type ManagementResult } from "@/app/admin/actions";

const initial: ManagementResult = {};

export function MemberStatusButton({ groupId, userId, status }: { groupId: string; userId: string; status: "active" | "suspended" }) {
  const [state, action, pending] = useActionState(updateMemberStatus, initial);
  const isSuspending = status === "active";
  return (
    <form className="inline-action" action={action}>
      <input type="hidden" name="group_id" value={groupId} />
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="status" value={isSuspending ? "suspended" : "active"} />
      <button className={isSuspending ? "text-button text-button--danger" : "text-button"} disabled={pending}>
        {pending ? "正在保存…" : isSuspending ? "暂停" : "恢复"}
      </button>
      {state.error && <span className="inline-action__error">{state.error}</span>}
      {state.success && <span className="inline-action__success">{state.success}</span>}
    </form>
  );
}
