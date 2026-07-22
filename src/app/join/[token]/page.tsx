import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

async function join(formData: FormData) {
  "use server";
  const token = z.string().min(32).parse(formData.get("token"));
  const email = z.email().parse(formData.get("email"));
  const password = z.string().min(8).parse(formData.get("password"));
  const displayName = z.string().trim().min(1).max(80).parse(formData.get("display_name"));
  const supabase = await createClient();
  const next = `/join/${encodeURIComponent(token)}`;
  const { error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName }, emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=${encodeURIComponent(next)}` } });
  if (error) redirect(`/join/${token}?error=${encodeURIComponent(error.message)}`);
  redirect(`/join/${token}?check_email=1`);
}

export default async function JoinPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string; check_email?: string }> }) {
  const { token } = await params; const p = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: invitation } = await supabase.rpc("get_invitation_status", { p_token: token });
  const current = invitation?.[0];
  if (!current?.valid) return <main className="auth-page"><section className="auth-card"><p className="eyebrow">食迹邀请</p><h1>这个邀请已失效</h1><p>它可能已过期、被停用或达到使用次数上限。</p><Link href="/login">前往登录</Link></section></main>;
  if (user) { const { error } = await supabase.rpc("accept_invitation", { p_token: token }); if (!error) redirect("/"); return <main className="auth-page"><section className="auth-card"><h1>暂时无法加入</h1><p className="form-error">{error.message}</p></section></main>; }
  return <main className="auth-page"><section className="auth-card"><p className="eyebrow">加入 {current.group_name}</p><h1>先创建你的食迹账号</h1>{p.error && <p className="form-error">{p.error}</p>}{p.check_email ? <p className="form-success">请打开验证邮件；验证后会自动回到此邀请并加入地图。</p> : <form action={join}><input name="token" type="hidden" value={token} /><label>昵称<input name="display_name" required maxLength={80} autoComplete="nickname" /></label><label>邮箱<input name="email" type="email" required autoComplete="email" /></label><label>密码<input name="password" type="password" required minLength={8} autoComplete="new-password" /></label><button className="primary-button">创建账号并接受邀请</button></form>}<p className="auth-note">已有账号？请先 <Link href={`/login?next=${encodeURIComponent(`/join/${token}`)}`}>登录</Link>。</p></section></main>;
}
