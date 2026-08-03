import { ConfirmedRedirect } from "@/components/auth/confirmed-redirect";

export default async function ConfirmedPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next?.startsWith("/") ? next : "/";
  return <main className="auth-page"><section className="auth-card"><p className="eyebrow">食迹</p><h1>邮箱验证成功</h1><p className="form-success">账号已激活，可以登录了。</p><ConfirmedRedirect next={safeNext} /></section></main>;
}
