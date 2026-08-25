"use client";
/* eslint-disable @next/next/no-img-element */

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { clientDeploymentVersion, clientDisplayMode, reportClientMetric } from "@/lib/performance/client";
import type { ClientMetricDimensions } from "@/lib/performance/metrics";
import { photoFormat, photoPixelBucket, photoPrepareFailureMessage, preparePhotoSafely, type PhotoPrepareFailureCode, type PreparedPhoto } from "@/lib/photos/prepare-photo";

export type PhotoPickerState = {
  processing: boolean;
  preparedCount: number;
  failedCount: number;
  hasBlockingFailure: boolean;
};

type PhotoEntry = {
  id: string;
  sourceFile: File;
  sourceKey: string;
  status: "processing" | "ready" | "failed";
  prepared?: PreparedPhoto;
  previewUrl?: string;
  failureCode?: PhotoPrepareFailureCode;
  ignored?: boolean;
};

export class PhotoSubmissionError extends Error {
  readonly code = "prepared_photo_count_mismatch" as const;

  constructor() {
    super("prepared_photo_count_mismatch");
    this.name = "PhotoSubmissionError";
  }
}

export type PhotoPickerHandle = {
  readonly preparedCount: number;
  appendPreparedPhotos(formData: FormData): number;
};

function newEntryId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `photo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sourceKey(file: File) {
  return [file.name, file.size, file.lastModified, file.type].join("|");
}

function durationBucket(durationMs: number) {
  if (durationMs < 500) return "lt_500ms" as const;
  if (durationMs < 2_000) return "500ms_2s" as const;
  if (durationMs < 10_000) return "2_10s" as const;
  return "over_10s" as const;
}

function elapsedNow() {
  return typeof performance === "undefined" ? 0 : performance.now();
}

function metricDimensions(file: File, durationMs?: number): ClientMetricDimensions {
  const sizeBucket = (file.size <= 1 * 1024 * 1024 ? "0_1mb" : file.size <= 3 * 1024 * 1024 ? "1_3mb" : file.size <= 6 * 1024 * 1024 ? "3_6mb" : file.size <= 20 * 1024 * 1024 ? "6_20mb" : "over_20mb") as ClientMetricDimensions["sizeBucket"];
  return {
    sizeBucket,
    format: photoFormat(file),
    browserMode: clientDisplayMode(),
    deploymentVersion: clientDeploymentVersion(),
    ...(durationMs === undefined ? {} : { durationBucket: durationBucket(durationMs) }),
  };
}

function replaceEntry(entries: PhotoEntry[], id: string, update: (entry: PhotoEntry) => PhotoEntry | null) {
  return entries.flatMap((entry) => {
    if (entry.id !== id) return [entry];
    const next = update(entry);
    return next ? [next] : [];
  });
}

export const PhotoPicker = forwardRef<PhotoPickerHandle, {
  onStateChange?: (state: PhotoPickerState) => void;
  /** Kept for existing callers while the richer state rolls out. */
  onProcessingChange?: (processing: boolean) => void;
  maxPhotos?: number;
  /** Only the guarded browser harness uses this to exercise the real fallback. */
  forceWasm?: boolean;
}>(function PhotoPicker({ onStateChange, onProcessingChange, maxPhotos = 9, forceWasm = false }, ref) {
  const photoLimit = Math.min(9, Math.max(0, Math.floor(maxPhotos)));
  const abortControllerRef = useRef<AbortController | null>(null);
  const entriesRef = useRef<PhotoEntry[]>([]);
  const mountedRef = useRef(true);
  const processingRef = useRef(false);
  const [entries, setEntries] = useState<PhotoEntry[]>([]);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState("");

  const updateEntries = (next: PhotoEntry[]) => {
    entriesRef.current = next;
    if (mountedRef.current) setEntries(next);
  };

  const revokeEntryUrl = (entry: PhotoEntry) => {
    if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
  };

  useEffect(() => {
    abortControllerRef.current = new AbortController();
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
      entriesRef.current.forEach(revokeEntryUrl);
    };
  }, []);

  const preparedCount = entries.filter((entry) => entry.status === "ready" && entry.prepared).length;
  const failedCount = entries.filter((entry) => entry.status === "failed").length;
  const hasBlockingFailure = entries.some((entry) => entry.status === "failed" && !entry.ignored);

  useEffect(() => {
    onProcessingChange?.(processing);
    onStateChange?.({ processing, preparedCount, failedCount, hasBlockingFailure });
  }, [failedCount, hasBlockingFailure, onProcessingChange, onStateChange, preparedCount, processing]);

  useImperativeHandle(ref, () => ({
    get preparedCount() {
      return entriesRef.current.filter((entry) => entry.status === "ready" && entry.prepared).length;
    },
    appendPreparedPhotos(formData) {
      const ready = entriesRef.current.filter((entry) => entry.status === "ready" && entry.prepared);
      ready.forEach((entry) => {
        const prepared = entry.prepared!;
        formData.append("photos", prepared.displayFile);
        formData.append("photo_thumbnails", prepared.thumbnailFile);
        formData.append("photo_dimensions", `${prepared.width}x${prepared.height}`);
        formData.append("thumbnail_dimensions", `${prepared.thumbnailWidth}x${prepared.thumbnailHeight}`);
      });
      return ready.length;
    },
  }), []);

  const prepareEntry = async (entry: PhotoEntry, manageProcessing = true) => {
    if (!mountedRef.current) return;
    if (manageProcessing && processingRef.current) return;
    if (manageProcessing) {
      processingRef.current = true;
      setProcessing(true);
    }
    try {
      updateEntries(replaceEntry(entriesRef.current, entry.id, (current) => ({ ...current, status: "processing", failureCode: undefined, ignored: false })));
      const startedAt = elapsedNow();
      reportClientMetric("photo_prepare_started", 1, undefined, metricDimensions(entry.sourceFile));
      const result = await preparePhotoSafely(entry.sourceFile, entry.id, { signal: abortControllerRef.current?.signal, forceWasm });
      if (!mountedRef.current) return;
      const elapsed = startedAt === 0 ? 0 : elapsedNow() - startedAt;
      if (result.ok) {
        const previewUrl = URL.createObjectURL(result.photo.displayFile);
        const exists = entriesRef.current.some((candidate) => candidate.id === entry.id);
        if (!exists) {
          URL.revokeObjectURL(previewUrl);
        } else {
          updateEntries(replaceEntry(entriesRef.current, entry.id, (current) => {
            revokeEntryUrl(current);
            return { ...current, status: "ready", prepared: result.photo, previewUrl, failureCode: undefined, ignored: false };
          }));
          reportClientMetric("photo_prepare_succeeded", 1, undefined, { ...metricDimensions(entry.sourceFile, elapsed), pixelsBucket: photoPixelBucket(result.photo.sourceWidth * result.photo.sourceHeight), encoderPath: result.photo.encoderPath });
        }
      } else {
        updateEntries(replaceEntry(entriesRef.current, entry.id, (current) => ({ ...current, status: "failed", prepared: undefined, previewUrl: undefined, failureCode: result.code, ignored: false })));
        reportClientMetric("photo_prepare_failed", 1, result.error.timedOut ? "timeout" : "error", { ...metricDimensions(entry.sourceFile, elapsed), reason: result.code, ...(result.error.encoderPath ? { encoderPath: result.error.encoderPath } : {}), pixelsBucket: "unknown" });
      }
    } finally {
      if (manageProcessing) {
        processingRef.current = false;
        if (mountedRef.current) setProcessing(false);
      }
    }
  };

  const choosePhotos = async (files: File[] | null) => {
    if (!files?.length || processingRef.current) return;
    const availableSlots = Math.max(0, photoLimit - entriesRef.current.length);
    const incoming = Array.from(files).slice(0, availableSlots);
    if (incoming.length < files.length) setMessage(`这次到访最多保留 ${photoLimit} 张照片。`);
    const seen = new Set(entriesRef.current.map((entry) => entry.sourceKey));
    const uniqueIncoming = incoming.filter((file) => {
      const key = sourceKey(file);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (uniqueIncoming.length < incoming.length) setMessage("相同照片已经在列表中，可点击失败项重试或先移除。");
    processingRef.current = true;
    setProcessing(true);
    try {
      for (const file of uniqueIncoming) {
        const entry: PhotoEntry = { id: newEntryId(), sourceFile: file, sourceKey: sourceKey(file), status: "processing" };
        updateEntries([...entriesRef.current, entry]);
        await prepareEntry(entry, false);
      }
    } finally {
      processingRef.current = false;
      if (mountedRef.current) setProcessing(false);
    }
  };

  const remove = (id: string) => {
    const entry = entriesRef.current.find((candidate) => candidate.id === id);
    if (!entry) return;
    revokeEntryUrl(entry);
    updateEntries(entriesRef.current.filter((candidate) => candidate.id !== id));
  };

  const ignoreFailures = () => {
    updateEntries(entriesRef.current.map((entry) => entry.status === "failed" ? { ...entry, ignored: true } : entry));
    setMessage("失败照片已忽略；其余已准备好的照片仍会上传。");
  };

  return <section className="photo-picker" aria-label="照片上传">
    <div><strong>照片 <span className="optional-mark">可选，最多 {photoLimit} 张</span></strong><p>会同时生成展示图（最长边 1280px，≤600KiB）和小尺寸缩略图（最长边 640px，≤120KiB）。</p><p>上传前会压缩图片，并移除拍摄信息；预览来自最终展示图。</p></div>
    <input className="photo-picker__input" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple disabled={photoLimit === 0} onChange={(event) => { const selectedFiles = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; void choosePhotos(selectedFiles); }} />
    {processing && <p className="photo-picker__state" role="status" aria-live="polite">照片正在逐张生成两种尺寸…</p>}
    {message && <p className="photo-picker__message" role="status">{message}</p>}
    {hasBlockingFailure && <div className="photo-picker__actions"><button type="button" className="text-button" onClick={ignoreFailures}>忽略失败照片并继续</button><small>忽略后只会上传已准备好的照片。</small></div>}
    {entries.length > 0 && <div className="photo-picker__grid">{entries.map((entry) => <figure className={`photo-picker__item photo-picker__item--${entry.status}`} key={entry.id}>
      {entry.previewUrl ? <img src={entry.previewUrl} alt="待上传照片预览" /> : <span className="photo-picker__item-state">{entry.status === "processing" ? "处理中…" : entry.status === "failed" ? "处理失败" : "待处理"}</span>}
      {entry.status === "failed" && <p>{photoPrepareFailureMessage(entry.failureCode ?? "decode_failed")}</p>}
      <div className="photo-picker__item-actions">{entry.status === "failed" && <button type="button" disabled={processing} onClick={() => void prepareEntry(entry)}>重试</button>}<button type="button" onClick={() => remove(entry.id)} aria-label={`移除照片 ${entry.id}`}>移除</button></div>
    </figure>)}</div>}
    {photoLimit > 0 && entries.length >= photoLimit && <small className="photo-picker__limit">已选择 {entries.length} / {photoLimit} 张。</small>}
  </section>;
});

PhotoPicker.displayName = "PhotoPicker";
