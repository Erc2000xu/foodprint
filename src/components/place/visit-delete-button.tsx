"use client";

import { useActionState } from "react";
import { deleteMyVisit, type VisitDeleteResult } from "@/app/place/actions";

const initial: VisitDeleteResult = {};

export function VisitDeleteButton({ visitRecordId }: { visitRecordId: string }) {
  const [state, action, pending] = useActionState(deleteMyVisit, initial);
  return <form className="visit-delete" action={action} onSubmit={(event) => { if (!window.confirm("删除这次到访？这条感受和关联照片会立即从小组中消失。")) event.preventDefault(); }}><input name="visit_record_id" type="hidden" value={visitRecordId} /><button type="submit" disabled={pending}>{pending ? "正在删除…" : "删除这次记录"}</button>{state.error && <span>{state.error}</span>}</form>;
}
