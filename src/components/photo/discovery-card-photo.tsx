"use client";

import { useEffect, useRef, useState } from "react";
import { PrivatePhoto } from "@/components/photo/private-photo";

type DiscoveryPhotoStatus = "missing" | "loading" | "ready" | "error" | "unavailable";
type DiscoveryPhotoState = { key: string; signedUrl: string; status: DiscoveryPhotoStatus };

export function DiscoveryCardPhoto({
  photoId,
  initialUrl,
  width,
  height,
  alt,
  priority = false,
}: {
  photoId?: string | null;
  initialUrl?: string | null;
  width?: number | null;
  height?: number | null;
  alt: string;
  priority?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const resourceKey = `${photoId ?? ""}|${initialUrl ?? ""}`;
  const [photoState, setPhotoState] = useState<DiscoveryPhotoState>(() => ({ key: resourceKey, signedUrl: initialUrl ?? "", status: initialUrl ? "ready" : photoId ? "loading" : "missing" }));
  const currentPhotoState = photoState.key === resourceKey ? photoState : { key: resourceKey, signedUrl: initialUrl ?? "", status: initialUrl ? "ready" as const : photoId ? "loading" as const : "missing" as const };
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (initialUrl || !photoId) return;
    const root = rootRef.current;
    if (!root) return;
    let disposed = false;
    const request = async () => {
      setPhotoState({ key: resourceKey, signedUrl: "", status: "loading" });
      try {
        const response = await fetch("/api/photos/sign", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ photoIds: [photoId] }), cache: "no-store" });
        const payload = await response.json() as { photos?: Array<{ id: string; signedUrl?: string }>; unavailablePhotoIds?: string[] };
        const nextUrl = payload.photos?.find((photo) => photo.id === photoId)?.signedUrl;
        if (disposed) return;
        if (response.ok && nextUrl) {
          setPhotoState({ key: resourceKey, signedUrl: nextUrl, status: "ready" });
        } else if (response.status === 401 || response.status === 403 || payload.unavailablePhotoIds?.includes(photoId)) {
          setPhotoState({ key: resourceKey, signedUrl: "", status: "unavailable" });
        } else {
          setPhotoState({ key: resourceKey, signedUrl: "", status: "error" });
        }
      } catch {
        if (!disposed) setPhotoState({ key: resourceKey, signedUrl: "", status: "error" });
      } finally {
        // The card remains usable when a private photo cannot be signed.
      }
    };
    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) { observer.disconnect(); void request(); }
      }, { rootMargin: "240px" });
      observer.observe(root);
      return () => { disposed = true; observer.disconnect(); };
    }
    void request();
    return () => { disposed = true; };
  }, [initialUrl, photoId, resourceKey, retryNonce]);

  const safeWidth = width && width > 0 ? width : 640;
  const safeHeight = height && height > 0 ? height : 640;
  return <div ref={rootRef} className="discovery-card-photo-loader" style={{ aspectRatio: `${safeWidth} / ${safeHeight}` }}>
    {currentPhotoState.signedUrl ? <PrivatePhoto src={currentPhotoState.signedUrl} photoId={photoId ?? undefined} alt={alt} width={safeWidth} height={safeHeight} priority={priority} /> : <><span>{currentPhotoState.status === "loading" ? "照片加载中…" : currentPhotoState.status === "unavailable" ? "照片暂时不可见" : currentPhotoState.status === "error" ? "照片暂时无法加载" : "暂无照片"}</span>{(currentPhotoState.status === "error" || currentPhotoState.status === "unavailable") && <button className="discovery-card-photo-loader__retry" type="button" onClick={() => setRetryNonce((value) => value + 1)}>重新加载照片</button>}</>}
  </div>;
}
