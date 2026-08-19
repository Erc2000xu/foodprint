"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import { reportClientMetric } from "@/lib/performance/client";
import { photoPrepareFailureMessage, preparePhotoSafely, type PhotoPrepareFailureCode, type PreparedPhoto } from "@/lib/photos/prepare-photo";
import type { ClientMetricDimensions } from "@/lib/performance/metrics";

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
  return durationMs === undefined ? { sizeBucket } : { sizeBucket, durationBucket: durationBucket(durationMs) };
}

function replaceEntry(entries: PhotoEntry[], id: string, update: (entry: PhotoEntry) => PhotoEntry | null) {
  return entries.flatMap((entry) => {
    if (entry.id !== id) return [entry];
    const next = update(entry);
    return next ? [next] : [];
  });
}

export function PhotoPicker({
  onStateChange,
  onProcessingChange,
}: {
  onStateChange?: (state: PhotoPickerState) => void;
  /** Kept for existing callers while the richer state rolls out. */
  onProcessingChange?: (processing: boolean) => void;
} = {}) {
  const displayInputRef = useRef<HTMLInputElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const entriesRef = useRef<PhotoEntry[]>([]);
  const mountedRef = useRef(true);
  const processingRef = useRef(false);
  const [entries, setEntries] = useState<PhotoEntry[]>([]);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState("");

  const syncInputs = (nextEntries = entriesRef.current) => {
    const ready = nextEntries.filter((entry) => entry.status === "ready" && entry.prepared);
    try {
      if (typeof DataTransfer !== "function") return;
      const displayTransfer = new DataTransfer();
      const thumbnailTransfer = new DataTransfer();
      ready.forEach((entry) => {
        displayTransfer.items.add(entry.prepared!.displayFile);
        thumbnailTransfer.items.add(entry.prepared!.thumbnailFile);
      });
      if (displayInputRef.current) displayInputRef.current.files = displayTransfer.files;
      if (thumbnailInputRef.current) thumbnailInputRef.current.files = thumbnailTransfer.files;
    } catch {
      // A browser may expose a read-only FileList. Supported browsers use
      // DataTransfer; the visible list remains usable when it is unavailable.
    }
  };

  const updateEntries = (next: PhotoEntry[]) => {
    entriesRef.current = next;
    if (mountedRef.current) setEntries(next);
    syncInputs(next);
  };

  const revokeEntryUrl = (entry: PhotoEntry) => {
    if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      entriesRef.current.forEach(revokeEntryUrl);
    };
  }, []);

  const preparedCount = entries.filter((entry) => entry.status === "ready").length;
  const failedCount = entries.filter((entry) => entry.status === "failed").length;
  const hasBlockingFailure = entries.some((entry) => entry.status === "failed" && !entry.ignored);

  useEffect(() => {
    onProcessingChange?.(processing);
    onStateChange?.({ processing, preparedCount, failedCount, hasBlockingFailure });
  }, [failedCount, hasBlockingFailure, onProcessingChange, onStateChange, preparedCount, processing]);

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
      const result = await preparePhotoSafely(entry.sourceFile, entry.id);
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
          reportClientMetric("photo_prepare_succeeded", 1, undefined, { ...metricDimensions(entry.sourceFile, elapsed), pixelsBucket: "unknown" });
        }
      } else {
        updateEntries(replaceEntry(entriesRef.current, entry.id, (current) => ({ ...current, status: "failed", prepared: undefined, previewUrl: undefined, failureCode: result.code, ignored: false })));
        reportClientMetric("photo_prepare_failed", 1, result.code === "source_too_large" ? "error" : undefined, { ...metricDimensions(entry.sourceFile, elapsed), reason: result.code });
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
    const availableSlots = Math.max(0, 9 - entriesRef.current.length);
    const incoming = Array.from(files).slice(0, availableSlots);
    if (incoming.length < files.length) setMessage("这次到访最多保留 9 张照片。");
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
    <div><strong>照片 <span className="optional-mark">可选，最多 9 张</span></strong><p>会同时生成展示图（最长边 1280px，≤600KiB）和小尺寸缩略图（最长边 640px，≤120KiB）。</p><p>上传前会压缩图片，并移除拍摄信息；预览来自最终展示图。</p></div>
    <input ref={displayInputRef} className="photo-picker__input" name="photos" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple onChange={(event) => { const selectedFiles = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; void choosePhotos(selectedFiles); }} />
    <input ref={thumbnailInputRef} className="photo-picker__input photo-picker__input--thumbnail" name="photo_thumbnails" type="file" accept="image/webp" multiple tabIndex={-1} aria-hidden="true" />
    {entries.filter((entry) => entry.status === "ready" && entry.prepared).map((entry) => <span key={`meta-${entry.id}`}><input type="hidden" name="photo_dimensions" value={`${entry.prepared!.width}x${entry.prepared!.height}`} /><input type="hidden" name="thumbnail_dimensions" value={`${entry.prepared!.thumbnailWidth}x${entry.prepared!.thumbnailHeight}`} /></span>)}
    {processing && <p className="photo-picker__state" role="status" aria-live="polite">照片正在逐张生成两种尺寸…</p>}
    {message && <p className="photo-picker__message" role="status">{message}</p>}
    {hasBlockingFailure && <div className="photo-picker__actions"><button type="button" className="text-button" onClick={ignoreFailures}>忽略失败照片并继续</button><small>忽略后只会上传已准备好的照片。</small></div>}
    {entries.length > 0 && <div className="photo-picker__grid">{entries.map((entry) => <figure className={`photo-picker__item photo-picker__item--${entry.status}`} key={entry.id}>
      {entry.previewUrl ? <img src={entry.previewUrl} alt="待上传照片预览" /> : <span className="photo-picker__item-state">{entry.status === "processing" ? "处理中…" : entry.status === "failed" ? "处理失败" : "待处理"}</span>}
      {entry.status === "failed" && <p>{photoPrepareFailureMessage(entry.failureCode ?? "decode_failed")}</p>}
      <div className="photo-picker__item-actions">{entry.status === "failed" && <button type="button" disabled={processing} onClick={() => void prepareEntry(entry)}>重试</button>}<button type="button" onClick={() => remove(entry.id)} aria-label={`移除照片 ${entry.id}`}>移除</button></div>
    </figure>)}</div>}
    {entries.length >= 9 && <small className="photo-picker__limit">已选择 {entries.length} / 9 张。</small>}
  </section>;
}
