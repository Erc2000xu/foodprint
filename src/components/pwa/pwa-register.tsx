"use client";
import { useEffect, useState } from "react";

export function PwaRegister({ buildId }: { buildId: string }) {
  const [updateReady, setUpdateReady] = useState(false);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (!reloaded) { reloaded = true; window.location.reload(); } });
    void navigator.serviceWorker.register(`/service-worker.js?v=${encodeURIComponent(buildId)}`).then((registration) => {
      if (registration.waiting) setUpdateReady(true);
      registration.addEventListener("updatefound", () => { const worker = registration.installing; worker?.addEventListener("statechange", () => { if (worker.state === "installed" && navigator.serviceWorker.controller) setUpdateReady(true); }); });
    }).catch(() => undefined);
  }, [buildId]);
  if (!updateReady) return null;
  return <aside className="pwa-update" role="status"><span>食迹有新版本可用</span><button type="button" onClick={() => navigator.serviceWorker.getRegistration().then((registration) => registration?.waiting?.postMessage("SKIP_WAITING"))}>刷新更新</button></aside>;
}
