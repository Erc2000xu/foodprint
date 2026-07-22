"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function ConfirmedRedirect({ next }: { next: string }) {
  const router = useRouter();
  useEffect(() => { const timer = window.setTimeout(() => router.replace(next), 900); return () => window.clearTimeout(timer); }, [next, router]);
  return <p className="auth-note">正在安全地完成加入… 若没有自动跳转，请 <a href={next}>继续</a>。</p>;
}
