"use client";

import { useActionState } from "react";
import { runBusinessAreaBackfill, type ManagementResult } from "@/app/admin/actions";

const initialState: ManagementResult = {};

export function BusinessAreaBackfill() {
  const [state, action, pending] = useActionState(runBusinessAreaBackfill, initialState);
  return <section className="admin-card"><h2>整理地点商圈</h2><p>仅 Owner 可手动执行受控整理任务。它不会在普通成员打开首页时运行，失败也不会影响已有地点和记录。</p><form action={action}><button className="secondary-button" disabled={pending} type="submit">{pending ? "整理中…" : "整理待补充商圈"}</button></form>{state.error && <p className="form-error">{state.error}</p>}{state.success && <p className="form-success">{state.success}</p>}</section>;
}
