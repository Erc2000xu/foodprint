"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { userFacingError } from "@/lib/user-facing-error";

const credentials = z.object({ email: z.email(), password: z.string().min(8) });
export async function signIn(formData: FormData) { const parsed = credentials.safeParse(Object.fromEntries(formData)); if (!parsed.success) redirect(`/login?error=${encodeURIComponent("请输入有效邮箱和至少 8 位密码")}`); const supabase = await createClient(); const { error } = await supabase.auth.signInWithPassword(parsed.data); if (error) redirect(`/login?error=${encodeURIComponent(userFacingError(error, "邮箱或密码不正确，请再试一次。"))}`); redirect("/"); }
export async function requestReset(formData: FormData) { const email = z.email().safeParse(formData.get("email")); if (!email.success) redirect("/forgot-password?error=请输入有效邮箱"); const supabase = await createClient(); const appUrl = process.env.NEXT_PUBLIC_APP_URL!; const { error } = await supabase.auth.resetPasswordForEmail(email.data, { redirectTo: `${appUrl}/auth/callback?next=/reset-password` }); redirect(error ? `/forgot-password?error=${encodeURIComponent(userFacingError(error))}` : "/forgot-password?sent=1"); }
export async function updatePassword(formData: FormData) { const password = z.string().min(8).safeParse(formData.get("password")); if (!password.success) redirect("/reset-password?error=密码至少%208%20位"); const supabase = await createClient(); const { error } = await supabase.auth.updateUser({ password: password.data }); redirect(error ? `/reset-password?error=${encodeURIComponent(userFacingError(error))}` : "/login?reset=1"); }
export async function signOut() { const supabase = await createClient(); await supabase.auth.signOut(); redirect("/login"); }
export async function acceptInvitation(token: string) { const supabase = await createClient(); const { error } = await supabase.rpc("accept_invitation", { p_token: token }); if (error) return { error: userFacingError(error) }; return { error: null }; }
