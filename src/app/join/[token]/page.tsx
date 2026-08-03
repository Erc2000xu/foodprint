import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { userFacingError } from "@/lib/user-facing-error";

async function join(formData: FormData) {
  "use server";
  const token = z.string().min(32).safeParse(formData.get("token"));
  const email = z.email().safeParse(formData.get("email"));
  const password = z.string().min(8).safeParse(formData.get("password"));
  const displayName = z.string().trim().min(1).max(80).safeParse(formData.get("display_name"));
  const rawToken = String(formData.get("token") ?? "");
  if (!token.success || !email.success || !password.success || !displayName.success) {
    redirect(`/join/${encodeURIComponent(rawToken)}?error=${encodeURIComponent("请检查邀请链接和注册信息。")}`);
  }
  const supabase = await createClient();
  const next = `/join/${encodeURIComponent(token.data)}`;
  const { error } = await supabase.auth.signUp({ email: email.data, password: password.data, options: { data: { display_name: displayName.data }, emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=${encodeURIComponent(next)}` } });
  if (error) redirect(`/join/${encodeURIComponent(token.data)}?error=${encodeURIComponent(userFacingError(error))}`);
  redirect(`/join/${encodeURIComponent(token.data)}?check_email=1`);
}

export default async function JoinPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string; check_email?: string }> }) {
  const { token } = await params; const p = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: invitation } = await supabase.rpc("get_invitation_status", { p_token: token });
  const current = invitation?.[0];
  if (!current?.valid) return <main className="auth-page"><section className="auth-card"><p className="eyebrow">食迹邀请</p><h1>这个邀请已经失效</h1><p>它可能已经过期、被撤销，或使用次数已满。</p><Link href="/login">返回登录</Link></section></main>;
  if (user) { const { error } = await supabase.rpc("accept_invitation", { p_token: token }); if (!error) redirect("/"); return <main className="auth-page"><section className="auth-card"><h1>暂时无法加入</h1><p className="form-error">{userFacingError(error)}</p></section></main>; }
  return <main className="auth-page"><section className="auth-card"><p className="eyebrow">加入 {current.group_name}</p><h1>创建食迹账号</h1>{p.error && <p className="form-error">{p.error}</p>}{p.check_email ? <p className="form-success">请打开验证邮件。完成验证后，会回到这里并加入共同地图。</p> : <form action={join}><input name="token" type="hidden" value={token} /><label>昵称<input name="display_name" required maxLength={80} autoComplete="nickname" /></label><label>邮箱<input name="email" type="email" required autoComplete="email" /></label><label>密码<input name="password" type="password" required minLength={8} autoComplete="new-password" /></label><button className="primary-button">创建账号并加入共同地图</button></form>}<p className="auth-note">已有账号？<Link href={`/login?next=${encodeURIComponent(`/join/${token}`)}`}>登录</Link></p></section></main>;
}
