"use client";

import { useEffect } from "react";
import { clientDisplayMode, clientNetworkType, elapsedFromClientPerformance, reportClientMetric } from "@/lib/performance/client";

export function AppShellMetrics() {
  useEffect(() => {
    const displayMode = clientDisplayMode();
    const value = elapsedFromClientPerformance("foodprint:pwa-boot-navigation-start");
    reportClientMetric("pwa_app_shell_visible", value, displayMode, { browserMode: displayMode, network: clientNetworkType(), outcome: "success" });
  }, []);
  return null;
}
