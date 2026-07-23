import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

const navigation = [
  { label: "地图", icon: "/nav-icons/map.png", href: "/" },
  { label: "发现", icon: "/nav-icons/discover.png", href: "/discover" },
  { label: "标记", icon: "/nav-icons/mark.png", href: "/mark", add: true },
  { label: "动态", icon: "/nav-icons/activity.png", href: "/activity" },
  { label: "我的", icon: "/nav-icons/profile.png", href: "/admin" },
];

export function AppShell({ children, activeNav = "地图" }: { children: ReactNode; activeNav?: string }) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link className="brand" href="/" aria-label="食迹 Foodprint 首页">
          <Image className="brand__badge" src="/mascot/icon-192.png" width={34} height={34} alt="" priority />
          <span className="brand__name">食迹</span>
        </Link>
        <button className="group-status" type="button" aria-label="当前共同地图：食迹 Foodprint">
          <span className="status-dot" aria-hidden="true" />
          食迹 Foodprint
        </button>
      </header>
      <main className="app-main">{children}</main>
      <nav className="bottom-nav" aria-label="主导航">
        {navigation.map(({ label, icon, href, add }) => (
          <Link
            aria-current={label === activeNav ? "page" : undefined}
            className={`nav-item${label === activeNav ? " nav-item--active" : ""}${add ? " nav-item--add" : ""}`}
            href={href}
            key={label}
          >
            <Image className="nav-item__icon" src={icon} width={40} height={40} alt="" />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
