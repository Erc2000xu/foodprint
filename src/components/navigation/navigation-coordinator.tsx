"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, type ComponentProps, type MouseEvent, type ReactNode, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { clientDisplayMode, clientNetworkType, elapsedFromClientPerformance, markClientPerformance, reportClientMetric, shouldSkipIntentPrefetch } from "@/lib/performance/client";

type NavigationSource = "bottom-nav" | "place-card" | "back" | "programmatic";
type NavigationStatus = "intent" | "pending" | "shell-visible" | "content-ready" | "error";
type NavigationState = { fromRoute: string; toRoute: string; startedAt: number; source: NavigationSource; status: NavigationStatus };

type NavigationContextValue = {
  navigation: NavigationState | null;
  beginNavigation: (href: string, source?: NavigationSource) => void;
  prefetchIntent: (href: string) => void;
  markContentReady: (routeTemplate: string) => void;
};

const defaultNavigationContext: NavigationContextValue = {
  navigation: null,
  beginNavigation: () => undefined,
  prefetchIntent: () => undefined,
  markContentReady: () => undefined,
};

const NavigationContext = createContext<NavigationContextValue>(defaultNavigationContext);

function routePath(value: string) {
  try { return new URL(value, window.location.origin).pathname; } catch { return value.split("?", 1)[0] || "/"; }
}

function routeTemplate(pathname: string) {
  if (pathname === "/") return "/";
  if (/^\/place\/[^/]+/.test(pathname)) return "/place/:id";
  if (/^\/join\/[^/]+/.test(pathname)) return "/join/:token";
  return pathname;
}

function sameRoute(left: string, right: string) {
  try {
    const leftUrl = new URL(left, window.location.origin);
    const rightUrl = new URL(right, window.location.origin);
    return leftUrl.pathname === rightUrl.pathname && leftUrl.search === rightUrl.search;
  } catch { return left === right; }
}

function NavigationRuntime({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentLocation = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
  const [navigation, setNavigation] = useState<NavigationState | null>(null);
  const navigationRef = useRef<NavigationState | null>(null);
  const timeoutRef = useRef<number | undefined>(undefined);
  const prefetchedRef = useRef(new Set<string>());
  const prefetchInFlightRef = useRef(false);
  const initialContentReadyRef = useRef(new Set<string>());

  const clearNavigation = useCallback(() => {
    if (timeoutRef.current !== undefined) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = undefined;
    navigationRef.current = null;
    setNavigation(null);
  }, []);

  const beginNavigation = useCallback((href: string, source: NavigationSource = "programmatic") => {
    if (sameRoute(href, window.location.href)) return;
    if (navigationRef.current && navigationRef.current.status !== "intent" && sameRoute(href, navigationRef.current.toRoute)) return;
    const next: NavigationState = { fromRoute: currentLocation, toRoute: href, startedAt: performance.now(), source, status: "pending" };
    navigationRef.current = next;
    setNavigation(next);
    markClientPerformance("foodprint:navigation-start");
    reportClientMetric("navigation_pending_feedback", 0, clientDisplayMode(), { browserMode: clientDisplayMode(), network: clientNetworkType(), outcome: "success" });
    reportClientMetric("navigation_feedback_visible", 0, clientDisplayMode(), { browserMode: clientDisplayMode(), network: clientNetworkType(), outcome: "success" });
    timeoutRef.current = window.setTimeout(() => {
      const current = navigationRef.current;
      if (!current || current !== next) return;
      reportClientMetric("navigation_route_committed", Math.max(0, performance.now() - current.startedAt), clientDisplayMode(), { browserMode: clientDisplayMode(), network: clientNetworkType(), outcome: "timeout" });
      const timedOut = { ...current, status: "error" as const };
      navigationRef.current = timedOut;
      setNavigation(timedOut);
    }, 10_000);
  }, [currentLocation]);

  const prefetchIntent = useCallback((href: string) => {
    if (shouldSkipIntentPrefetch() || prefetchedRef.current.has(href) || prefetchInFlightRef.current) return;
    if (!navigationRef.current || navigationRef.current.status === "intent") {
      const intent: NavigationState = { fromRoute: currentLocation, toRoute: href, startedAt: performance.now(), source: href.startsWith("/place/") ? "place-card" : "programmatic", status: "intent" };
      navigationRef.current = intent;
      setNavigation(intent);
      window.setTimeout(() => {
        if (navigationRef.current === intent) {
          navigationRef.current = null;
          setNavigation(null);
        }
      }, 3_000);
    }
    prefetchedRef.current.add(href);
    prefetchInFlightRef.current = true;
    reportClientMetric("prefetch_started", 0, clientDisplayMode(), { browserMode: clientDisplayMode(), network: clientNetworkType(), outcome: "success" });
    try {
      router.prefetch(href);
      reportClientMetric("prefetch_hit", 0, clientDisplayMode(), { browserMode: clientDisplayMode(), network: clientNetworkType(), outcome: "success" });
    } catch {
      reportClientMetric("prefetch_cancelled", 0, "error", { browserMode: clientDisplayMode(), network: clientNetworkType(), outcome: "error" });
    } finally {
      window.setTimeout(() => { prefetchInFlightRef.current = false; }, 0);
    }
  }, [currentLocation, router]);

  useEffect(() => {
    if (shouldSkipIntentPrefetch()) return;
    const neighbor = pathname === "/" ? "/activity" : pathname === "/activity" ? "/" : null;
    if (!neighbor || prefetchedRef.current.has(neighbor)) return;
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const run = () => {
      if (prefetchedRef.current.has(neighbor) || prefetchInFlightRef.current) return;
      prefetchedRef.current.add(neighbor);
      prefetchInFlightRef.current = true;
      reportClientMetric("prefetch_started", 0, clientDisplayMode(), { browserMode: clientDisplayMode(), network: clientNetworkType(), outcome: "success" });
      try {
        router.prefetch(neighbor);
        reportClientMetric("prefetch_hit", 0, clientDisplayMode(), { browserMode: clientDisplayMode(), network: clientNetworkType(), outcome: "success" });
      } catch {
        reportClientMetric("prefetch_cancelled", 0, "error", { browserMode: clientDisplayMode(), network: clientNetworkType(), outcome: "error" });
      } finally {
        prefetchInFlightRef.current = false;
      }
    };
    let idleHandle: number | undefined;
    let timerHandle: number | undefined;
    if (idleWindow.requestIdleCallback) idleHandle = idleWindow.requestIdleCallback(run, { timeout: 1_500 });
    else timerHandle = window.setTimeout(run, 1_000);
    return () => {
      if (idleHandle !== undefined) idleWindow.cancelIdleCallback?.(idleHandle);
      if (timerHandle !== undefined) window.clearTimeout(timerHandle);
    };
  }, [pathname, router]);

  const markContentReady = useCallback((readyRoute: string) => {
    const current = navigationRef.current;
    if (current && routeTemplate(routePath(current.toRoute)) === readyRoute) {
      const value = Math.max(0, performance.now() - current.startedAt);
      reportClientMetric("navigation_content_ready", value, clientDisplayMode(), { browserMode: clientDisplayMode(), network: clientNetworkType(), outcome: "success" });
      if (readyRoute === "/") reportClientMetric("pwa_home_content_ready", value, clientDisplayMode(), { browserMode: clientDisplayMode(), network: clientNetworkType(), outcome: "success" });
      const ready = { ...current, status: "content-ready" as const };
      navigationRef.current = ready;
      setNavigation(ready);
      window.setTimeout(() => { if (navigationRef.current === ready) clearNavigation(); }, 0);
    } else if (!current && readyRoute === "/" && !initialContentReadyRef.current.has(readyRoute)) {
      initialContentReadyRef.current.add(readyRoute);
      reportClientMetric("pwa_home_content_ready", elapsedFromClientPerformance("foodprint:pwa-boot-navigation-start"), clientDisplayMode(), { browserMode: clientDisplayMode(), network: clientNetworkType(), outcome: "success" });
    }
  }, [clearNavigation]);

  useEffect(() => {
    const current = navigationRef.current;
    if (!current || !sameRoute(current.toRoute, currentLocation)) {
      // A browser back/forward or an outside router update can invalidate the
      // old intent. Never leave its timeout and pending feedback behind.
      if (current) clearNavigation();
      return;
    }
    window.requestAnimationFrame(() => {
      const active = navigationRef.current;
      if (!active || !sameRoute(active.toRoute, window.location.href)) return;
      reportClientMetric("navigation_route_committed", Math.max(0, performance.now() - active.startedAt), clientDisplayMode(), { browserMode: clientDisplayMode(), network: clientNetworkType(), outcome: "success" });
      const committed = { ...active, status: "shell-visible" as const };
      navigationRef.current = committed;
      setNavigation(committed);
    });
  }, [clearNavigation, currentLocation]);

  useEffect(() => () => {
    if (timeoutRef.current !== undefined) window.clearTimeout(timeoutRef.current);
  }, []);

  const value = useMemo(() => ({ navigation, beginNavigation, prefetchIntent, markContentReady }), [beginNavigation, markContentReady, navigation, prefetchIntent]);
  const retry = () => {
    const current = navigationRef.current;
    if (!current) return;
    clearNavigation();
    beginNavigation(current.toRoute, current.source);
    router.push(current.toRoute);
  };

  return <NavigationContext.Provider value={value}>{children}{navigation?.status === "error" && <aside className="navigation-feedback" role="status" aria-live="polite"><span>网络响应有点慢，页面还在连接。</span><button type="button" onClick={retry}>重试</button></aside>}</NavigationContext.Provider>;
}

export function NavigationCoordinator({ children }: { children: ReactNode }) {
  return <Suspense fallback={children}><NavigationRuntime>{children}</NavigationRuntime></Suspense>;
}

export function useNavigationCoordinator() {
  return useContext(NavigationContext);
}

export function NavigationContentReadyMarker({ route }: { route: string }) {
  const { markContentReady } = useNavigationCoordinator();
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => markContentReady(route));
    return () => window.cancelAnimationFrame(frame);
  }, [markContentReady, route]);
  return <span className="content-ready-marker" data-content-ready={route} aria-hidden="true" />;
}

export function NavigationIntentLink({ href, children, source = "programmatic", ...props }: { href: string; children: ReactNode; source?: NavigationSource } & Omit<ComponentProps<typeof Link>, "href" | "children">) {
  const { beginNavigation, prefetchIntent } = useNavigationCoordinator();
  return <Link {...props} href={href} prefetch={false} onPointerEnter={() => prefetchIntent(href)} onFocus={() => prefetchIntent(href)} onPointerDown={() => prefetchIntent(href)} onTouchStart={() => prefetchIntent(href)} onClick={(event: MouseEvent<HTMLAnchorElement>) => {
    props.onClick?.(event);
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    if (sameRoute(href, window.location.href)) { event.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    beginNavigation(href, source);
  }}>{children}</Link>;
}
