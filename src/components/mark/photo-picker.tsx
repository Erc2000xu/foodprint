"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";

type PreparedPhoto = { displayFile: File; thumbnailFile: File; width: number; height: number; thumbnailWidth: number; thumbnailHeight: number };
type Preview = { id: string; url: string; name: string; width: number; height: number; thumbnailWidth: number; thumbnailHeight: number };
type LoadedImage = { source: CanvasImageSource; width: number; height: number; dispose: () => void };

function loadImage(file: File) {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file, { imageOrientation: "from-image" }).then((bitmap) => ({ source: bitmap, width: bitmap.width, height: bitmap.height, dispose: () => bitmap.close() } satisfies LoadedImage));
  }
  const sourceUrl = URL.createObjectURL(file);
  return new Promise<LoadedImage>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight, dispose: () => URL.revokeObjectURL(sourceUrl) });
    image.onerror = () => { URL.revokeObjectURL(sourceUrl); reject(new Error("图片无法读取")); };
    image.src = sourceUrl;
  });
}

async function renderWebp(image: LoadedImage, sourceName: string, maxEdge: number, maxBytes: number, startQuality: number) {
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  let width = Math.max(1, Math.round(image.width * scale));
  let height = Math.max(1, Math.round(image.height * scale));
  for (const quality of [startQuality, startQuality - 0.08, startQuality - 0.16, startQuality - 0.24, startQuality - 0.32]) {
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前浏览器无法处理图片");
    context.drawImage(image.source, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", Math.max(0.35, quality)));
    if (blob && blob.size <= maxBytes) return { file: new File([blob], `${sourceName}.webp`, { type: "image/webp" }), width, height };
    width = Math.max(1, Math.round(width * 0.84));
    height = Math.max(1, Math.round(height * 0.84));
  }
  throw new Error("图片压缩后仍超过限制");
}

async function compressPhoto(file: File): Promise<PreparedPhoto> {
  const image = await loadImage(file);
  try {
    const sourceName = file.name.replace(/\.[^.]+$/, "") || "photo";
    const display = await renderWebp(image, sourceName, 1_280, 600 * 1024, 0.78);
    const thumbnail = await renderWebp(image, `${sourceName}-thumb`, 640, 120 * 1024, 0.72);
    return { displayFile: display.file, thumbnailFile: thumbnail.file, width: display.width, height: display.height, thumbnailWidth: thumbnail.width, thumbnailHeight: thumbnail.height };
  } finally { image.dispose(); }
}

export function PhotoPicker({ onProcessingChange }: { onProcessingChange?: (processing: boolean) => void } = {}) {
  const displayInputRef = useRef<HTMLInputElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const displaysRef = useRef<File[]>([]);
  const thumbnailsRef = useRef<File[]>([]);
  const urlsRef = useRef<string[]>([]);

  useEffect(() => () => urlsRef.current.forEach((url) => URL.revokeObjectURL(url)), []);
  useEffect(() => { onProcessingChange?.(processing); }, [onProcessingChange, processing]);

  const syncInputs = () => {
    const displayTransfer = new DataTransfer(); displaysRef.current.forEach((file) => displayTransfer.items.add(file));
    const thumbnailTransfer = new DataTransfer(); thumbnailsRef.current.forEach((file) => thumbnailTransfer.items.add(file));
    if (displayInputRef.current) displayInputRef.current.files = displayTransfer.files;
    if (thumbnailInputRef.current) thumbnailInputRef.current.files = thumbnailTransfer.files;
  };

  const choosePhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(""); setProcessing(true);
    try {
      const incoming = Array.from(files).slice(0, 9 - displaysRef.current.length);
      if (incoming.length < files.length) setError("每条记录最多上传 9 张照片。");
      if (incoming.some((file) => !file.type.startsWith("image/"))) throw new Error("只能选择图片文件。");
      const compressed = await Promise.all(incoming.map(compressPhoto));
      displaysRef.current = [...displaysRef.current, ...compressed.map((item) => item.displayFile)];
      thumbnailsRef.current = [...thumbnailsRef.current, ...compressed.map((item) => item.thumbnailFile)];
      syncInputs();
      setPreviews((current) => [...current, ...compressed.map(({ displayFile, width, height, thumbnailWidth, thumbnailHeight }) => {
        const url = URL.createObjectURL(displayFile); urlsRef.current.push(url);
        return { id: crypto.randomUUID(), url, name: displayFile.name, width, height, thumbnailWidth, thumbnailHeight };
      })]);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "";
      setError(message.includes("限制") ? "照片压缩后仍超过单张限制，请换一张照片后重试。" : message.includes("只能选择图片") ? "只能选择图片文件。" : "图片处理失败，请换一张照片后重试。");
    } finally { setProcessing(false); }
  };

  const remove = (id: string) => setPreviews((current) => {
    const index = current.findIndex((preview) => preview.id === id); if (index < 0) return current;
    URL.revokeObjectURL(current[index].url); urlsRef.current = urlsRef.current.filter((url) => url !== current[index].url);
    displaysRef.current = displaysRef.current.filter((_, itemIndex) => itemIndex !== index);
    thumbnailsRef.current = thumbnailsRef.current.filter((_, itemIndex) => itemIndex !== index);
    syncInputs();
    return current.filter((preview) => preview.id !== id);
  });

  return <section className="photo-picker"><div><strong>照片 <span className="optional-mark">可选，最多 9 张</span></strong><p>会同时生成展示图（最长边 1280px，≤600KiB）和小尺寸缩略图（最长边 640px，≤120KiB）。</p><p>上传前会压缩图片，并移除拍摄信息；动态内容不会因为字体或图片子集而被改写。</p></div><input ref={displayInputRef} className="photo-picker__input" name="photos" type="file" accept="image/*" multiple onChange={(event) => void choosePhotos(event.target.files)} /><input ref={thumbnailInputRef} className="photo-picker__input" name="photo_thumbnails" type="file" accept="image/webp" multiple tabIndex={-1} aria-hidden="true" />{previews.map((preview) => <span key={`meta-${preview.id}`}><input type="hidden" name="photo_dimensions" value={`${preview.width}x${preview.height}`} /><input type="hidden" name="thumbnail_dimensions" value={`${preview.thumbnailWidth}x${preview.thumbnailHeight}`} /></span>)}{processing && <p className="photo-picker__state">照片正在生成两种尺寸…</p>}{error && <p className="form-error">{error}</p>}{previews.length > 0 && <div className="photo-picker__grid">{previews.map((preview) => <figure key={preview.id}><img src={preview.url} alt="待上传照片预览" /><button type="button" onClick={() => remove(preview.id)} aria-label={`移除 ${preview.name}`}>×</button></figure>)}</div>}</section>;
}
