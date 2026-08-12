import Link from "next/link";
import { AppShell } from "@/components/shell/app-shell";

export function RouteLoading({ label, route }: { label: string; route: string }) {
  return <AppShell><section className="route-loading" data-route={route} aria-busy="true" aria-live="polite"><p className="eyebrow">食迹</p><h1>{label}</h1><p>页面结构已经打开，内容正在从共同地图中回来。</p><div className="route-loading__grid" aria-hidden="true"><span /><span /><span /></div></section></AppShell>;
}

export function RouteError({ label = "页面暂时没有打开", reset }: { label?: string; reset: () => void }) {
  return <AppShell><section className="route-error" role="alert"><p className="eyebrow">食迹</p><h1>{label}</h1><p>网络有点慢或服务正在恢复，已显示的共同地图内容不会因此改变。</p><div><button className="primary-button" type="button" onClick={() => reset()}>重试</button><Link className="secondary-button" href="/">回到发现</Link></div></section></AppShell>;
}
