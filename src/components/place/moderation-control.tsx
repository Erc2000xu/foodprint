"use client";

import { useActionState, useState } from "react";
import { hideGroupContent, type ModerationResult } from "@/app/place/actions";

const initial: ModerationResult = {};

export function ModerationControl({ contentId, contentType }: { contentId: string; contentType: "visit" | "photo" }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(hideGroupContent, initial);
  if (!open) return <button className="moderation-trigger" type="button" onClick={() => setOpen(true)}>隐藏</button>;
  return <form className="moderation-form" action={action} onSubmit={(event) => { if (!window.confirm("内容会从普通小组视图隐藏，原文不会被改写；可在管理后台恢复。")) event.preventDefault(); }}><input name="content_type" type="hidden" value={contentType} /><input name="content_id" type="hidden" value={contentId} /><label>隐藏原因<textarea name="reason" maxLength={280} minLength={1} required /></label><div><button className="text-button text-button--danger" disabled={pending} type="submit">{pending ? "正在隐藏…" : "确认隐藏"}</button><button className="text-button" type="button" onClick={() => setOpen(false)}>取消</button></div>{state.error && <p className="form-error">{state.error}</p>}{state.success && <p className="form-success">{state.success}</p>}</form>;
}
