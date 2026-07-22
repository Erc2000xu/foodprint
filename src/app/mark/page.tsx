import { redirect } from "next/navigation";
import { MarkFlow } from "@/components/mark/mark-flow";
import { AppShell } from "@/components/shell/app-shell";
import { createClient } from "@/lib/supabase/server";

export default async function MarkPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/mark");
  return <AppShell activeNav="标记"><main className="mark-page"><MarkFlow apiKey={process.env.NEXT_PUBLIC_AMAP_KEY} /></main></AppShell>;
}
