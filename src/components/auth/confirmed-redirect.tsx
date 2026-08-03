"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function ConfirmedRedirect({ next }: { next: string }) {
  const router = useRouter();
  useEffect(() => { const timer = window.setTimeout(() => router.replace(next), 900); return () => window.clearTimeout(timer); }, [next, router]);
  return <p className="auth-note">正在完成加入… 如果没有自动跳转，请 <a href={next}>点击这里继续</a>。</p>;
}
