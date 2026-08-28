import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ContentManagementCenter } from "@/components/admin/content-management-center";
import type { ManagementCounts } from "@/components/admin/place-content-management";
import { ContentReadyMarker } from "@/components/navigation/content-ready-marker";
import { AppShell } from "@/components/shell/app-shell";
import { getActiveGroupContext } from "@/lib/auth/active-group-context";
import { createClient } from "@/lib/supabase/server";
import { loadContentManagement } from "@/app/admin/actions";

export default async function ContentManagementPage() {
  const supabase = await createClient();
  const context = await getActiveGroupContext(supabase, "/admin/content");
  if (!context) redirect("/login?next=/admin/content");
  if (![
    "owner",
    "admin",
  ].includes(context.role)) notFound();

  const countsResult = await supabase.rpc("get_group_content_management_counts_v2_4_2");
  const countRow = countsResult.data?.[0] as Record<string, unknown> | undefined;
  const counts: ManagementCounts | null = countsResult.error || !countRow ? null : {
    activePlaceCount: Number(countRow.active_place_count ?? 0),
    archivedPlaceCount: Number(countRow.archived_place_count ?? 0),
    candidateCount: Number(countRow.candidate_count ?? 0),
    hiddenContentCount: Number(countRow.hidden_content_count ?? 0),
  };
  const initialPage = await loadContentManagement({ tab: "active", limit: 20 });

  return <AppShell activeNav="我的" groupName={context.groupName}><section className="admin-page admin-content-page"><header><Link className="text-button admin-content-page__back" href="/admin">← 返回我的</Link><p className="eyebrow">{context.groupName}</p><h1>地点与内容管理</h1><p>仅当前共同地图的 Owner 和 Admin 可见。</p></header><ContentManagementCenter initialCounts={counts} initialPage={initialPage} /><ContentReadyMarker route="/admin/content" /></section></AppShell>;
}
