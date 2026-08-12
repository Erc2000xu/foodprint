"use client";

import { useEffect } from "react";
import { clientDisplayMode, reportClientMetric } from "@/lib/performance/client";

function positive(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function PerformanceObserver() {
  useEffect(() => {
    const reported = new Set<string>();
    const displayMode = clientDisplayMode();
    const reportOnce = (name: Parameters<typeof reportClientMetric>[0], value: number, detail = displayMode) => {
      if (reported.has(name)) return;
      reported.add(name);
      reportClientMetric(name, value, detail);
    };

    const frame = window.requestAnimationFrame(() => {
      if (document.querySelector(".launch-page")) reportOnce("pwa_launch_shell_visible", Math.max(0, performance.now()), displayMode);
    });

    let largestContentfulPaint = 0;
    let layoutShift = 0;
    let interactionToNextPaint = 0;
    const observers: PerformanceObserver[] = [];
    const observe = (type: string, callback: (entries: PerformanceObserverEntryList) => void, options?: PerformanceObserverInit) => {
      if (!("PerformanceObserver" in window)) return;
      try {
        const observer = new window.PerformanceObserver((list) => callback(list));
        observer.observe(options ?? { type, buffered: true });
        observers.push(observer);
      } catch {
        // Browser support is intentionally optional; navigation timing still works.
      }
    };

    observe("paint", (entries) => {
      const fcp = entries.getEntriesByName("first-contentful-paint")[0]?.startTime;
      if (fcp !== undefined) reportOnce("browser_fcp", fcp, displayMode);
    }, { type: "paint", buffered: true });
    observe("largest-contentful-paint", (entries) => {
      const entry = entries.getEntries().at(-1);
      if (entry) largestContentfulPaint = entry.startTime;
    }, { type: "largest-contentful-paint", buffered: true });
    observe("layout-shift", (entries) => {
      entries.getEntries().forEach((entry) => {
        const shift = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
        if (!shift.hadRecentInput) layoutShift += shift.value ?? 0;
      });
    }, { type: "layout-shift", buffered: true });
    observe("event", (entries) => {
      entries.getEntries().forEach((entry) => { interactionToNextPaint = Math.max(interactionToNextPaint, entry.duration); });
    }, { type: "event", buffered: true, durationThreshold: 40 } as PerformanceObserverInit);

    const flushVitals = () => {
      if (largestContentfulPaint > 0) reportOnce("browser_lcp", largestContentfulPaint);
      reportOnce("browser_cls", layoutShift);
      if (interactionToNextPaint > 0) reportOnce("browser_inp", interactionToNextPaint);
    };
    const flushTimer = window.setTimeout(flushVitals, 5_000);
    const onVisibilityChange = () => { if (document.visibilityState === "hidden") flushVitals(); };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const reportNavigation = () => {
      const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      if (!navigation) return;
      const dns = positive(navigation.domainLookupEnd - navigation.domainLookupStart);
      const connect = positive(navigation.connectEnd - navigation.connectStart);
      const tls = navigation.secureConnectionStart > 0 ? positive(navigation.connectEnd - navigation.secureConnectionStart) : undefined;
      const ttfb = positive(navigation.responseStart - navigation.requestStart);
      if (dns !== undefined) reportOnce("browser_dns", dns);
      if (connect !== undefined) reportOnce("browser_connect", connect);
      if (tls !== undefined) reportOnce("browser_tls", tls);
      if (ttfb !== undefined) reportOnce("browser_ttfb", ttfb);
    };
    if (document.readyState === "complete") reportNavigation();
    else window.addEventListener("load", reportNavigation, { once: true });

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(flushTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("load", reportNavigation);
      observers.forEach((observer) => observer.disconnect());
    };
  }, []);

  return null;
}
