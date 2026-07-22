"use client";
import { useActionState } from "react";
import { createInvitation, type InviteResult } from "@/app/admin/actions";

const initial: InviteResult = {};
export function InviteForm({ groupId }: { groupId: string }) {
  const [state, action, pending] = useActionState(createInvitation, initial);
  return <form className="invite-form" action={action}><input type="hidden" name="group_id" value={groupId} /><label>有效期<select name="expires_in_days" defaultValue="7"><option value="1">1 天</option><option value="7">7 天</option><option value="14">14 天</option><option value="30">30 天</option></select></label><label>最多使用<select name="max_uses" defaultValue="1"><option value="1">1 人</option><option value="3">3 人</option><option value="10">10 人</option></select></label><button className="primary-button" disabled={pending}>{pending ? "正在生成…" : "生成邀请链接"}</button>{state.error && <p className="form-error">{state.error}</p>}{state.inviteUrl && <div className="invite-result"><strong>仅此一次显示，请立即复制：</strong><code>{state.inviteUrl}</code></div>}</form>;
}
