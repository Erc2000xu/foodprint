"use client";

import { useRef, useState, type FormEvent } from "react";
import { PhotoPicker, type PhotoPickerHandle, type PhotoPickerState } from "@/components/mark/photo-picker";

type WorkerCheck = { id: number; ok: boolean; data?: ArrayBuffer; error?: string };

function isRealWebp(data: ArrayBuffer) {
  const bytes = new Uint8Array(data);
  return bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}

export function PhotoUploadE2eHarness({ forceWasm = false }: { forceWasm?: boolean }) {
  const pickerRef = useRef<PhotoPickerHandle>(null);
  const [pickerState, setPickerState] = useState<PhotoPickerState>({ processing: false, preparedCount: 0, failedCount: 0, hasBlockingFailure: false });
  const [uploadResult, setUploadResult] = useState<unknown>(null);
  const [workerResult, setWorkerResult] = useState("未验证");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const picker = pickerRef.current;
    const expected = picker?.preparedCount ?? 0;
    const appended = picker?.appendPreparedPhotos(formData) ?? 0;
    if (appended !== expected || pickerState.processing || pickerState.hasBlockingFailure) return;
    const response = await fetch("/api/e2e/photo-upload", { method: "POST", body: formData });
    setUploadResult(await response.json());
  };

  const checkWorker = () => {
    const worker = new Worker("/workers/webp-encoder.worker.js", { type: "module" });
    const pixels = new Uint8ClampedArray([
      255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 255, 255, 255, 255,
    ]);
    worker.onmessage = (event: MessageEvent<WorkerCheck>) => {
      worker.terminate();
      setWorkerResult(event.data.ok && event.data.data && isRealWebp(event.data.data) ? `真实 WebP（${event.data.data.byteLength} bytes）` : `失败：${event.data.error ?? "invalid_output"}`);
    };
    worker.onerror = () => {
      worker.terminate();
      setWorkerResult("失败：worker_error");
    };
    worker.postMessage({ type: "encode", id: 1, data: pixels.buffer, width: 2, height: 2, quality: 80 }, [pixels.buffer]);
  };

  return <main data-testid="photo-upload-e2e"><h1>Photo upload E2E harness</h1><form onSubmit={submit}><PhotoPicker ref={pickerRef} forceWasm={forceWasm} onStateChange={setPickerState} /><button type="submit" disabled={pickerState.processing || pickerState.hasBlockingFailure}>提交 multipart</button></form><button type="button" data-testid="worker-check" onClick={checkWorker}>验证 Worker/WASM</button><p data-testid="worker-result">{workerResult}</p><p data-testid="encoder-mode">{forceWasm ? "强制 WASM 回退" : "原生优先"}</p><pre data-testid="upload-result">{uploadResult ? JSON.stringify(uploadResult) : "未提交"}</pre></main>;
}
