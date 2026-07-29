"use client";

import { useActionState } from "react";
import { deleteMyVisit, type VisitDeleteResult } from "@/app/place/actions";

const initial: VisitDeleteResult = {};

export function VisitDeleteButton({ visitRecordId }: { visitRecordId: string }) {
  const [state, action, pending] = useActionState(deleteMyVisit, initial);
  return <form className="visit-delete" action={action}><input name="visit_record_id" type="hidden" value={visitRecordId} /><button type="submit" disabled={pending}>{pending ? "删除中…" : "删除"}</button>{state.error && <span>{state.error}</span>}</form>;
}
