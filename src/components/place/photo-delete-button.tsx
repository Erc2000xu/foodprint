"use client";

import { useActionState } from "react";
import { deleteMyPhoto } from "@/app/place/actions";

export function PhotoDeleteButton({ photoId }: { photoId: string }) {
  const [state, action, pending] = useActionState(deleteMyPhoto, {});
  return <form action={action} className="photo-delete"><input type="hidden" name="photo_id" value={photoId} /><button type="submit" disabled={pending}>{pending ? "删除中…" : "删除"}</button>{state.error && <span>{state.error}</span>}</form>;
}
