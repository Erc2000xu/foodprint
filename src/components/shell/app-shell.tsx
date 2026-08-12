import type { ReactNode } from "react";
import Image from "next/image";
import { PendingNavigationLink } from "@/components/shell/pending-navigation-link";
import { AppShellMetrics } from "@/components/performance/app-shell-metrics";

const navigation = [
  { label: "发现", icon: "/nav-icons/discover.png", href: "/" },
  { label: "去试试", icon: "/nav-icons/map.png", href: "/try" },
  { label: "记一顿", icon: "/nav-icons/mark.png", href: "/mark", add: true },
  { label: "饭后聊", icon: "/nav-icons/activity.png", href: "/activity" },
  { label: "我的", icon: "/nav-icons/profile.png", href: "/admin" },
];

export function AppShell({ children, activeNav = "发现", groupName }: { children: ReactNode; activeNav?: string; groupName?: string | null }) {
  const displayedGroupName = groupName?.trim() || "共同地图";
  return (
    <div className="app-shell">
      <AppShellMetrics />
      <header className="app-header">
        <PendingNavigationLink className="brand" href="/" aria-label="食迹首页" prefetch={false}>
          <Image className="brand__badge" src="/mascot/icon-192.png" width={34} height={34} alt="" priority />
          <span className="brand__name">食迹</span>
        </PendingNavigationLink>
        <button className="group-status" type="button" aria-label={`当前共同地图：${displayedGroupName}`}>
          <span className="status-dot" aria-hidden="true" />
          {displayedGroupName}
        </button>
      </header>
      <main className="app-main">{children}</main>
      <nav className="bottom-nav" aria-label="主导航">
        {navigation.map(({ label, icon, href, add }) => (
          <PendingNavigationLink
            aria-current={label === activeNav ? "page" : undefined}
            className={`nav-item${label === activeNav ? " nav-item--active" : ""}${add ? " nav-item--add" : ""}`}
            href={href}
            key={label}
            pendingLabel="正在打开…"
            navigationSource="bottom-nav"
          >
            <Image className="nav-item__icon" src={icon} width={40} height={40} alt="" />
            <span>{label}</span>
          </PendingNavigationLink>
        ))}
      </nav>
    </div>
  );
}
