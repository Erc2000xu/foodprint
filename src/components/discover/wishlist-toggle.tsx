"use client";

import { useState, useTransition } from "react";
import { toggleWishlistItem } from "@/app/discover/actions";

export function WishlistToggle({ groupPlaceId, initialWanted }: { groupPlaceId: string; initialWanted: boolean }) {
  const [savedForLater, setSavedForLater] = useState(initialWanted);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  return <div className="wishlist-control">
    <button type="button" className={`wishlist-button${savedForLater ? " wishlist-button--active" : ""}`} disabled={pending} onClick={() => startTransition(async () => {
      const result = await toggleWishlistItem(groupPlaceId, !savedForLater);
      if (result.error) { setMessage(result.error); return; }
      setSavedForLater(Boolean(result.wanted));
      setMessage(result.wanted ? "已加入下回吃" : "已从下回吃移除");
    })}>{pending ? "保存中…" : savedForLater ? "♥ 下回吃" : "♡ 下回吃"}</button>
    {message && <span>{message}</span>}
  </div>;
}
