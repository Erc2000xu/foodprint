import { RouteLoading } from "@/components/shell/route-loading";

export function AppLoading({ label = "正在打开食迹…" }: { label?: string }) {
  return <RouteLoading label={label} route="/" />;
}
