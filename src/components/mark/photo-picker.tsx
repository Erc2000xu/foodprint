"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";

type PreparedPhoto = { file: File; width: number; height: number };
type Preview = { id: string; url: string; name: string; width: number; height: number };

async function compressPhoto(file: File): Promise<PreparedPhoto> {
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("图片无法读取"));
      element.src = sourceUrl;
    });
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前浏览器无法处理图片");
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.8));
    if (!blob || blob.size > 1_572_864) throw new Error("压缩后的图片仍超过 1.5MB");
    return { file: new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "photo"}.webp`, { type: "image/webp" }), width, height };
  } finally { URL.revokeObjectURL(sourceUrl); }
}

export function PhotoPicker() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const filesRef = useRef<File[]>([]);
  const urlsRef = useRef<string[]>([]);

  useEffect(() => () => urlsRef.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const syncInput = (files: File[]) => {
    const transfer = new DataTransfer(); files.forEach((file) => transfer.items.add(file));
    if (inputRef.current) inputRef.current.files = transfer.files;
  };
  const choosePhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(""); setProcessing(true);
    try {
      const incoming = Array.from(files).slice(0, 9 - filesRef.current.length);
      if (incoming.length < files.length) setError("每条真实标记最多上传 9 张照片。");
      if (incoming.some((file) => !file.type.startsWith("image/"))) throw new Error("只能选择图片文件。");
      const compressed = await Promise.all(incoming.map(compressPhoto));
      const next = [...filesRef.current, ...compressed.map((item) => item.file)]; filesRef.current = next; syncInput(next);
      setPreviews((current) => [...current, ...compressed.map(({ file, width, height }) => {
        const url = URL.createObjectURL(file); urlsRef.current.push(url);
        return { id: crypto.randomUUID(), url, name: file.name, width, height };
      })]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "图片处理失败，请重试。"); }
    finally { setProcessing(false); }
  };
  const remove = (id: string) => setPreviews((current) => {
    const index = current.findIndex((preview) => preview.id === id); if (index < 0) return current;
    URL.revokeObjectURL(current[index].url); urlsRef.current = urlsRef.current.filter((url) => url !== current[index].url); filesRef.current = filesRef.current.filter((_, itemIndex) => itemIndex !== index); syncInput(filesRef.current);
    return current.filter((preview) => preview.id !== id);
  });

  return <section className="photo-picker"><div><strong>照片 <span className="optional-mark">可选，最多 9 张</span></strong><p>上传前会压缩为 WebP，并移除拍摄信息。</p></div><input ref={inputRef} className="photo-picker__input" name="photos" type="file" accept="image/*" multiple onChange={(event) => void choosePhotos(event.target.files)} />{previews.map((preview) => <input key={`meta-${preview.id}`} type="hidden" name="photo_dimensions" value={`${preview.width}x${preview.height}`} />)}{processing && <p className="photo-picker__state">正在压缩图片…</p>}{error && <p className="form-error">{error}</p>}{previews.length > 0 && <div className="photo-picker__grid">{previews.map((preview) => <figure key={preview.id}><img src={preview.url} alt="待上传照片预览" /><button type="button" onClick={() => remove(preview.id)} aria-label={`移除 ${preview.name}`}>×</button></figure>)}</div>}</section>;
}
