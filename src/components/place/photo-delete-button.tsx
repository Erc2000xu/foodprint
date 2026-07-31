"use client";

import { useActionState } from "react";
import { deleteMyPhoto } from "@/app/place/actions";

export function PhotoDeleteButton({ photoId }: { photoId: string }) {
  const [state, action, pending] = useActionState(deleteMyPhoto, {});
  return <form action={action} className="photo-delete" onSubmit={(event) => { if (!window.confirm("删除这张照片？它会立即从小组中消失。")) event.preventDefault(); }}><input type="hidden" name="photo_id" value={photoId} /><button type="submit" disabled={pending}>{pending ? "删除中…" : "删除照片"}</button>{state.error && <span>{state.error}</span>}</form>;
}
