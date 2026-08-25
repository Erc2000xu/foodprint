"use client";
import { useEffect, useRef, useState } from "react";
import { reportClientMetric } from "@/lib/performance/client";

const updateWindowMs = 15 * 60 * 1_000;

export function PwaRegister() {
  const [updateReady, setUpdateReady] = useState(false);
  const [updating, setUpdating] = useState(false);
  const reloadAfterControllerChange = useRef(false);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const hadControllerAtRegistration = Boolean(navigator.serviceWorker.controller);
    let registration: ServiceWorkerRegistration | undefined;
    let lastUpdateAt = 0;
    const updateRegistration = () => {
      if (!registration || Date.now() - lastUpdateAt < updateWindowMs) return;
      lastUpdateAt = Date.now();
      void registration.update().catch(() => undefined);
    };
    const onControllerChange = () => {
      reportClientMetric("service_worker_controllerchange", 0, hadControllerAtRegistration ? "update" : "first_install");
      if (!reloadAfterControllerChange.current) return;
      reloadAfterControllerChange.current = false;
      reportClientMetric("pwa_reload", 0, "user_confirmed");
      window.location.reload();
    };
    const onMessage = (event: MessageEvent<{ source?: string; type?: string }>) => {
      if (event.data?.source !== "foodprint-service-worker") return;
      if (event.data.type === "install") reportClientMetric("service_worker_install", 0, hadControllerAtRegistration ? "update" : "first_install");
      if (event.data.type === "activate") reportClientMetric("service_worker_activate", 0, hadControllerAtRegistration ? "update" : "first_install");
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    navigator.serviceWorker.addEventListener("message", onMessage);
    void navigator.serviceWorker.register("/service-worker.js", { updateViaCache: "none" }).then((nextRegistration) => {
      registration = nextRegistration;
      updateRegistration();
      if (nextRegistration.waiting && hadControllerAtRegistration) {
        setUpdateReady(true);
        reportClientMetric("service_worker_update_ready", 0, "update");
      }
      nextRegistration.addEventListener("updatefound", () => {
        const worker = nextRegistration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            setUpdateReady(true);
            reportClientMetric("service_worker_update_ready", 0, "update");
          }
        });
      });
    }).catch(() => reportClientMetric("service_worker_install", 0, "error"));
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") updateRegistration();
    };
    const onFocus = () => updateRegistration();
    const intervalId = window.setInterval(updateRegistration, updateWindowMs);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, []);
  if (!updateReady) return null;
  return <aside className="pwa-update" role="status"><span>{updating ? "正在更新食迹…" : "食迹有新版本可用"}</span>{!updating && <button type="button" onClick={() => { reloadAfterControllerChange.current = Boolean(navigator.serviceWorker.controller); setUpdating(true); setUpdateReady(false); void navigator.serviceWorker.getRegistration().then((registration) => registration?.waiting?.postMessage("SKIP_WAITING")); }}>刷新更新</button>}</aside>;
}
