import type { ReactNode } from "react";
import Link from "next/link";

const navigation = [
  { label: "地图", icon: "⌖", href: "/" },
  { label: "发现", icon: "◫", href: "/discover" },
  { label: "标记", icon: "+", href: "/mark", add: true },
  { label: "动态", icon: "◌", href: "/activity" },
  { label: "我的", icon: "◉", href: "/admin" },
];

export function AppShell({ children, activeNav = "地图" }: { children: ReactNode; activeNav?: string }) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link className="brand" href="/" aria-label="食迹 Foodprint 首页">
          <span className="brand__badge" aria-hidden="true">FP</span>
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
            <span className="nav-item__icon" aria-hidden="true">{icon}</span>
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
