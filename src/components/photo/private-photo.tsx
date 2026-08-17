"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { clientDisplayMode, clientNetworkType, reportClientMetric } from "@/lib/performance/client";

type PrivatePhotoProps = {
  src: string;
  photoId?: string;
  alt: string;
  width?: number | null;
  height?: number | null;
  className?: string;
  priority?: boolean;
  decorative?: boolean;
  resource?: "thumbnail" | "display";
};

type PhotoState = { src: string; status: "placeholder" | "loaded" | "error" };
type PhotoSourceState = { source: string; refreshed: string | null };

export function PrivatePhoto({ src, photoId, alt, width, height, className, priority = false, decorative = false, resource = "thumbnail" }: PrivatePhotoProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const enteredAt = useRef<number | undefined>(undefined);
  const refreshAttempted = useRef(false);
  const [sourceState, setSourceState] = useState<PhotoSourceState>({ source: src, refreshed: null });
  const [retryNonce, setRetryNonce] = useState(0);
  const [photoState, setPhotoState] = useState<PhotoState>({ src, status: "placeholder" });
  const activeSourceState = sourceState.source === src ? sourceState : { source: src, refreshed: null };
  const currentSrc = activeSourceState.refreshed ?? src;
  const state = photoState.src === currentSrc ? photoState.status : "placeholder";

  useEffect(() => { enteredAt.current = undefined; refreshAttempted.current = false; }, [src]);

  useEffect(() => {
    const image = imageRef.current;
    if (!image) return;
    let disposed = false;
    let loadHandled = false;
    const metricDimensions = { browserMode: clientDisplayMode(), resource, network: clientNetworkType(), outcome: "success" as const };
    const requestStartedAt = performance.now();
    reportClientMetric("private_image_request_start", 0, clientDisplayMode(), metricDimensions);
    const onLoad = () => {
      if (loadHandled) return;
      loadHandled = true;
      const startedAt = enteredAt.current ?? performance.now();
      reportClientMetric("private_image_load", Math.max(0, performance.now() - requestStartedAt), clientDisplayMode(), metricDimensions);
      const decode = typeof image.decode === "function" ? image.decode().catch(() => undefined) : Promise.resolve();
      void decode.finally(() => {
        if (disposed) return;
        setPhotoState({ src: currentSrc, status: "loaded" });
        reportClientMetric("private_image_decode", Math.max(0, performance.now() - requestStartedAt), clientDisplayMode(), metricDimensions);
        reportClientMetric("private_image_visible_to_decode", Math.max(0, performance.now() - startedAt), clientDisplayMode(), { browserMode: clientDisplayMode(), resource, network: clientNetworkType(), outcome: "success" });
      });
    };
    const observer = "IntersectionObserver" in window ? new IntersectionObserver((entries, observerInstance) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        enteredAt.current ??= performance.now();
        reportClientMetric("private_image_visible", 0, clientDisplayMode(), metricDimensions);
        observerInstance.disconnect();
      }
    }, { rootMargin: "200px" }) : null;
    if (observer) observer.observe(image);
    else enteredAt.current ??= performance.now();
    image.addEventListener("load", onLoad);
    if (image.complete && image.naturalWidth > 0) onLoad();
    return () => { disposed = true; observer?.disconnect(); image.removeEventListener("load", onLoad); };
  }, [currentSrc, resource, retryNonce]);

  const refreshSignedUrl = async () => {
    if (!photoId || refreshAttempted.current) return false;
    refreshAttempted.current = true;
    const startedAt = performance.now();
    reportClientMetric("private_image_signed_url_refresh", 0, clientDisplayMode(), { browserMode: clientDisplayMode(), resource, network: clientNetworkType(), outcome: "success" });
    try {
      const response = await fetch("/api/photos/sign", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ photoIds: [photoId] }), cache: "no-store" });
      const payload = await response.json() as { photos?: Array<{ id: string; signedUrl?: string }> };
      const nextUrl = payload.photos?.find((photo) => photo.id === photoId)?.signedUrl;
      if (!response.ok || !nextUrl) throw new Error("photo_refresh_failed");
      enteredAt.current = undefined;
      setPhotoState({ src: nextUrl, status: "placeholder" });
      setSourceState({ source: src, refreshed: nextUrl });
      reportClientMetric("private_image_signed_url_refresh", performance.now() - startedAt, clientDisplayMode(), { browserMode: clientDisplayMode(), resource, network: clientNetworkType(), outcome: "success" });
      return true;
    } catch {
      reportClientMetric("private_image_signed_url_refresh", performance.now() - startedAt, "error", { browserMode: clientDisplayMode(), resource, network: clientNetworkType(), outcome: "error" });
      return false;
    }
  };

  const onError = () => {
    setPhotoState({ src: currentSrc, status: "error" });
    reportClientMetric("private_image_error", Math.max(0, performance.now() - (enteredAt.current ?? performance.now())), clientDisplayMode(), { browserMode: clientDisplayMode(), resource, network: clientNetworkType(), outcome: "error" });
    void refreshSignedUrl();
  };
  const retry = () => {
    setPhotoState({ src: currentSrc, status: "placeholder" });
    if (photoId && !refreshAttempted.current) void refreshSignedUrl();
    else setRetryNonce((value) => value + 1);
  };
  const safeWidth = width && width > 0 ? width : 1;
  const safeHeight = height && height > 0 ? height : 1;
  return <figure className={`private-photo ${className ?? ""}${state === "loaded" ? " private-photo--loaded" : ""}`} style={{ aspectRatio: `${safeWidth} / ${safeHeight}` }}>
    {state !== "loaded" && <span className="private-photo__placeholder" aria-hidden="true">{state === "error" ? "照片暂时无法加载" : "照片加载中…"}</span>}
    <img key={`${currentSrc}-${retryNonce}`} ref={imageRef} src={currentSrc} alt={decorative ? "" : alt} width={safeWidth} height={safeHeight} loading={priority ? "eager" : "lazy"} decoding="async" fetchPriority={priority ? "high" : "auto"} onError={onError} />
    {state === "error" && <button className="private-photo__retry" type="button" onClick={retry}>重新加载照片</button>}
  </figure>;
}
