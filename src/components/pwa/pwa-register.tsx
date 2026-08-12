"use client";
import { useEffect, useRef, useState } from "react";
import { reportClientMetric } from "@/lib/performance/client";

export function PwaRegister({ buildId }: { buildId: string }) {
  const [updateReady, setUpdateReady] = useState(false);
  const [updating, setUpdating] = useState(false);
  const reloadAfterControllerChange = useRef(false);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const hadControllerAtRegistration = Boolean(navigator.serviceWorker.controller);
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
    void navigator.serviceWorker.register(`/service-worker.js?v=${encodeURIComponent(buildId)}`).then((registration) => {
      if (registration.waiting && hadControllerAtRegistration) {
        setUpdateReady(true);
        reportClientMetric("service_worker_update_ready", 0, "update");
      }
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            setUpdateReady(true);
            reportClientMetric("service_worker_update_ready", 0, "update");
          }
        });
      });
    }).catch(() => reportClientMetric("service_worker_install", 0, "error"));
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, [buildId]);
  if (!updateReady) return null;
  return <aside className="pwa-update" role="status"><span>{updating ? "正在更新食迹…" : "食迹有新版本可用"}</span>{!updating && <button type="button" onClick={() => { reloadAfterControllerChange.current = Boolean(navigator.serviceWorker.controller); setUpdating(true); setUpdateReady(false); void navigator.serviceWorker.getRegistration().then((registration) => registration?.waiting?.postMessage("SKIP_WAITING")); }}>刷新更新</button>}</aside>;
}
