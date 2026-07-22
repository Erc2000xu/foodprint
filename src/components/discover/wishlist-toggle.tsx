"use client";

import { useState, useTransition } from "react";
import { toggleWishlistItem } from "@/app/discover/actions";

export function WishlistToggle({ groupPlaceId, initialWanted }: { groupPlaceId: string; initialWanted: boolean }) {
  const [wanted, setWanted] = useState(initialWanted);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  return <div className="wishlist-control">
    <button type="button" className={`wishlist-button${wanted ? " wishlist-button--active" : ""}`} disabled={pending} onClick={() => startTransition(async () => {
      const result = await toggleWishlistItem(groupPlaceId, !wanted);
      if (result.error) { setMessage(result.error); return; }
      setWanted(Boolean(result.wanted));
      setMessage(result.wanted ? "已加入想去" : "已从想去移除");
    })}>{pending ? "保存中…" : wanted ? "♥ 想去" : "♡ 想去"}</button>
    {message && <span>{message}</span>}
  </div>;
}
