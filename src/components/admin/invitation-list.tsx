"use client";

import { useActionState } from "react";
import { revokeInvitation, type ManagementResult } from "@/app/admin/actions";

export type InvitationSummary = {
  id: string;
  createdAt: string;
  expiresAt: string;
  maxUses: number;
  useCount: number;
  status: "可使用" | "已用完" | "已过期" | "已撤销";
};

const initial: ManagementResult = {};
const formatter = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

function RevokeInvitationButton({ invitationId }: { invitationId: string }) {
  const [state, action, pending] = useActionState(revokeInvitation, initial);
  return (
    <form className="inline-action" action={action}>
      <input type="hidden" name="invitation_id" value={invitationId} />
      <button className="text-button text-button--danger" disabled={pending}>{pending ? "正在撤销…" : "撤销"}</button>
      {state.error && <span className="inline-action__error">{state.error}</span>}
      {state.success && <span className="inline-action__success">{state.success}</span>}
    </form>
  );
}

export function InvitationList({ invitations }: { invitations: InvitationSummary[] }) {
  if (invitations.length === 0) return <p className="empty-note">还没有生成过邀请链接。</p>;
  return <ul className="invitation-list">
    {invitations.map((invitation) => (
      <li key={invitation.id}>
        <span>
          <strong>{invitation.status}</strong>
          <small>创建于 {formatter.format(new Date(invitation.createdAt))} · 已使用 {invitation.useCount}/{invitation.maxUses} 人</small>
          <small>有效至 {formatter.format(new Date(invitation.expiresAt))}</small>
        </span>
        {invitation.status === "可使用" && <RevokeInvitationButton invitationId={invitation.id} />}
      </li>
    ))}
  </ul>;
}
