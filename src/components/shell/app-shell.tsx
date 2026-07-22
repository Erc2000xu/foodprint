import type { ReactNode } from "react";
import Link from "next/link";

const navigation = [
  { label: "地图", icon: "⌖", active: true },
  { label: "发现", icon: "◫" },
  { label: "标记", icon: "+", add: true },
  { label: "动态", icon: "◌" },
  { label: "我的", icon: "◉" },
];

export function AppShell({ children }: { children: ReactNode }) {
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
        {navigation.map(({ label, icon, active, add }) => (
          <Link
            aria-current={active ? "page" : undefined}
            className={`nav-item${active ? " nav-item--active" : ""}${add ? " nav-item--add" : ""}`}
            href={add ? "/#add-mark" : "/"}
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
