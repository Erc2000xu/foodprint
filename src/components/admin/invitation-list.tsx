"use client";

import { useActionState, useState } from "react";
import { revokeInvitation, type ManagementResult } from "@/app/admin/actions";

export type InvitationSummary = {
  id: string;
  createdAt: string;
  expiresAt: string;
  maxUses: number;
  useCount: number;
  status: "可使用" | "已用完" | "已过期" | "已撤销";
  inviteUrl?: string;
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

function CopyInvitationLink({ inviteUrl }: { inviteUrl: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true); setError("");
    } catch {
      setError("复制失败，请长按链接手动复制。");
    }
  }
  return <div className="invitation-link"><code>{inviteUrl}</code><button className="text-button" type="button" onClick={copy}>{copied ? "已复制" : "复制链接"}</button>{error && <small className="inline-action__error">{error}</small>}</div>;
}

export function InvitationList({ invitations }: { invitations: InvitationSummary[] }) {
  if (invitations.length === 0) return <p className="empty-note">还没有生成过邀请链接。</p>;
  return <ul className="invitation-list">
    {invitations.map((invitation) => (
      <li key={invitation.id}>
        <div className="invitation-list__content">
          <strong>{invitation.status}</strong>
          <small>创建于 {formatter.format(new Date(invitation.createdAt))} · 已使用 {invitation.useCount}/{invitation.maxUses} 人</small>
          <small>有效至 {formatter.format(new Date(invitation.expiresAt))}</small>
          {invitation.inviteUrl ? <CopyInvitationLink inviteUrl={invitation.inviteUrl} /> : <small>此链接创建于旧版本，无法重新显示；请新建一条邀请替代。</small>}
        </div>
        {invitation.status === "可使用" && <RevokeInvitationButton invitationId={invitation.id} />}
      </li>
    ))}
  </ul>;
}
