"use client";

import { useTransition } from "react";
import { signOut } from "@/app/(auth)/actions";
import { clearLocationConsent } from "@/lib/discovery/location-session";

export function LogoutButton({ userId }: { userId: string }) {
  const [pending, startTransition] = useTransition();
  const logout = () => {
    clearLocationConsent(userId);
    window.dispatchEvent(new CustomEvent("foodprint:session-ending"));
    startTransition(() => {
      void signOut();
    });
  };

  return <button className="text-button logout-button" disabled={pending} onClick={logout} type="button">{pending ? "正在退出…" : "退出登录"}</button>;
}
