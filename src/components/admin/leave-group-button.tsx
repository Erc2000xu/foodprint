"use client";

import { useActionState } from "react";
import { leaveActiveGroup, type ManagementResult } from "@/app/admin/actions";

const initial: ManagementResult = {};

export function LeaveGroupButton({ groupId, isOwner }: { groupId: string; isOwner: boolean }) {
  const [state, action, pending] = useActionState(leaveActiveGroup, initial);
  if (isOwner) return <p className="account-note">Owner 退出前需先转让所有权；为保留共同地图治理责任，该操作暂由产品支持处理。</p>;
  return <section className="admin-card leave-group-card"><h2>退出共同地图</h2><p>退出后，你将不能再查看或编辑这个共同地图。你留下的地点、笔记、照片和体验会保留，并显示为“已离开成员”。</p><form action={action}><input type="hidden" name="group_id" value={groupId} /><button className="text-button text-button--danger" disabled={pending}>{pending ? "正在退出…" : "退出这个共同地图"}</button>{state.error && <p className="form-error">{state.error}</p>}{state.success && <p className="form-success">{state.success}</p>}</form><p className="account-note">如需注销登录账户，请联系本组 Owner 由产品支持核验并处理；已保留的共同内容不会随账户注销而删除。</p></section>;
}
