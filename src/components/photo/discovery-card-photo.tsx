"use client";

import { useEffect, useRef, useState } from "react";
import { PrivatePhoto } from "@/components/photo/private-photo";

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
  const [signedUrl, setSignedUrl] = useState(initialUrl ?? "");
  const [loading, setLoading] = useState(Boolean(photoId && !initialUrl));

  useEffect(() => {
    if (initialUrl || !photoId) return;
    const root = rootRef.current;
    if (!root) return;
    let disposed = false;
    const request = async () => {
      try {
        const response = await fetch("/api/photos/sign", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ photoIds: [photoId] }), cache: "no-store" });
        const payload = await response.json() as { photos?: Array<{ id: string; signedUrl?: string }> };
        const nextUrl = payload.photos?.find((photo) => photo.id === photoId)?.signedUrl;
        if (!disposed && response.ok && nextUrl) setSignedUrl(nextUrl);
      } catch {
        // Keep the text card usable when a private photo cannot be signed.
      } finally {
        if (!disposed) setLoading(false);
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
  }, [initialUrl, photoId]);

  const safeWidth = width && width > 0 ? width : 640;
  const safeHeight = height && height > 0 ? height : 640;
  return <div ref={rootRef} className="discovery-card-photo-loader" style={{ aspectRatio: `${safeWidth} / ${safeHeight}` }}>
    {signedUrl ? <PrivatePhoto src={signedUrl} photoId={photoId ?? undefined} alt={alt} width={safeWidth} height={safeHeight} priority={priority} /> : <span>{loading ? "照片加载中…" : "暂无照片"}</span>}
  </div>;
}
