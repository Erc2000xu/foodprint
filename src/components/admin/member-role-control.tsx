"use client";

import { useActionState } from "react";
import { setMemberRole, type ManagementResult } from "@/app/admin/actions";

const initial: ManagementResult = {};

export function MemberRoleControl({ groupId, userId, role }: { groupId: string; userId: string; role: "admin" | "member" }) {
  const [state, action, pending] = useActionState(setMemberRole, initial);
  return <form className="member-role-control" action={action}>
    <input type="hidden" name="group_id" value={groupId} />
    <input type="hidden" name="user_id" value={userId} />
    <label>
      <span className="sr-only">成员角色</span>
      <select name="role" defaultValue={role} aria-label="成员角色">
        <option value="member">成员</option>
        <option value="admin">Admin</option>
      </select>
    </label>
    <button className="text-button" disabled={pending}>{pending ? "保存中…" : "更新身份"}</button>
    {state.error && <span className="inline-action__error">{state.error}</span>}
    {state.success && <span className="inline-action__success">{state.success}</span>}
  </form>;
}
