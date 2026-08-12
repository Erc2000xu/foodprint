"use client";

import Link from "next/link";
import { startTransition, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useNavigationCoordinator } from "@/components/navigation/navigation-coordinator";
import { clientDisplayMode, clientNetworkType, markClientPerformance, reportClientMetric } from "@/lib/performance/client";

export function LaunchGate() {
  const router = useRouter();
  const pathname = usePathname();
  const { beginNavigation } = useNavigationCoordinator();
  const isDeepLinkFallback = pathname !== "/launch";
  const [status, setStatus] = useState<"connecting" | "slow" | "failed">("connecting");

  useEffect(() => {
    if (isDeepLinkFallback) return;

    markClientPerformance("foodprint:pwa-boot-navigation-start");
    reportClientMetric("pwa_boot_navigation_start", 0, clientDisplayMode(), {
      browserMode: clientDisplayMode(),
      network: clientNetworkType(),
      outcome: "success",
    });
    const slowTimer = window.setTimeout(() => setStatus("slow"), 2_500);
    const failureTimer = window.setTimeout(() => setStatus("failed"), 6_000);
    void router.prefetch("/");
    beginNavigation("/", "programmatic");
    startTransition(() => router.replace("/"));
    return () => { window.clearTimeout(slowTimer); window.clearTimeout(failureTimer); };
  }, [beginNavigation, isDeepLinkFallback, router]);

  if (isDeepLinkFallback) {
    return <div className="launch-page__status" role="status" aria-live="polite"><strong>网络响应有点慢</strong><span>目标页面暂时没有回来，当前地址会保留；可以重试连接，或查看离线说明。</span><button className="primary-button" type="button" onClick={() => window.location.assign(`${window.location.pathname}${window.location.search}`)}>强制重新连接</button><Link href="/offline">查看离线说明</Link></div>;
  }

  const copy = status === "failed"
    ? { title: "还在等网络回应", body: "连接时间比平时长；可以继续等待，或稍后重试进入食迹。" }
    : status === "slow"
      ? { title: "网络响应较慢", body: "启动壳会一直留在这里，食迹正在继续连接。" }
      : { title: "正在打开共同地图…", body: "先把这一页留在这里，网络恢复后会继续进入食迹。" };

  return <div className="launch-page__status" role="status" aria-live="polite"><strong>{copy.title}</strong><span>{copy.body}</span>{status === "failed" && <button className="primary-button" type="button" onClick={() => { setStatus("connecting"); startTransition(() => router.replace("/")); }}>重试进入食迹</button>}<Link href="/offline">查看离线说明</Link></div>;
}
