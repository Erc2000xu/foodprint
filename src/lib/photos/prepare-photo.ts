export const PHOTO_PREPARE_LIMITS = {
  sourceMaxBytes: 20 * 1024 * 1024,
  sourceMaxPixels: 60_000_000,
  displayMaxEdge: 1_280,
  displayMinEdge: 720,
  displayMaxBytes: 600 * 1024,
  thumbnailMaxEdge: 640,
  thumbnailMinEdge: 320,
  thumbnailMaxBytes: 120 * 1024,
} as const;

export type PhotoPrepareFailureCode =
  | "source_too_large"
  | "source_too_many_pixels"
  | "decode_unsupported"
  | "decode_failed"
  | "webp_encoder_unavailable"
  | "output_budget_unmet";

export type PreparedPhoto = {
  id: string;
  displayFile: File;
  thumbnailFile: File;
  width: number;
  height: number;
  thumbnailWidth: number;
  thumbnailHeight: number;
};

export type PhotoPrepareResult =
  | { ok: true; photo: PreparedPhoto }
  | { ok: false; code: PhotoPrepareFailureCode; error: PhotoPrepareError };

export class PhotoPrepareError extends Error {
  readonly code: PhotoPrepareFailureCode;

  constructor(code: PhotoPrepareFailureCode, message = code) {
    super(message);
    this.name = "PhotoPrepareError";
    this.code = code;
  }
}

type LoadedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  dispose: () => void;
};

type RenderedWebp = { file: File; width: number; height: number };

const supportedMimeTypes = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"]);
const supportedExtensions = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"]);

function extensionOf(file: File) {
  return file.name.trim().toLowerCase().split(".").pop() ?? "";
}

export function photoFormat(file: Pick<File, "name" | "type">) {
  const type = file.type.trim().toLowerCase();
  if (type === "image/jpeg" || type === "image/jpg") return "jpeg" as const;
  if (type === "image/png") return "png" as const;
  if (type === "image/webp") return "webp" as const;
  if (type === "image/heic" || type === "image/heif") return "heic" as const;
  const extension = extensionOf(file as File);
  if (extension === "jpg" || extension === "jpeg") return "jpeg" as const;
  if (extension === "png") return "png" as const;
  if (extension === "webp") return "webp" as const;
  if (extension === "heic" || extension === "heif") return "heic" as const;
  return "unknown" as const;
}

function sourceLooksSupported(file: File) {
  const type = file.type.trim().toLowerCase();
  return (type && supportedMimeTypes.has(type)) || (!type && supportedExtensions.has(extensionOf(file)));
}

function isHeic(file: File) {
  return file.type.toLowerCase().includes("heic") || file.type.toLowerCase().includes("heif") || /\.(heic|heif)$/i.test(file.name);
}

function assertPixelBudget(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) throw new PhotoPrepareError("decode_failed");
  if (width * height > PHOTO_PREPARE_LIMITS.sourceMaxPixels) throw new PhotoPrepareError("source_too_many_pixels");
}

function imageElementSource(file: File) {
  const sourceUrl = URL.createObjectURL(file);
  return new Promise<LoadedImage>((resolve, reject) => {
    const image = new Image();
    let settled = false;
    const disposeUrl = () => URL.revokeObjectURL(sourceUrl);
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      disposeUrl();
      reject(error instanceof PhotoPrepareError ? error : new PhotoPrepareError("decode_failed"));
    };
    const finish = () => {
      if (settled) return;
      try {
        assertPixelBudget(image.naturalWidth, image.naturalHeight);
      } catch (error) {
        fail(error);
        return;
      }
      settled = true;
      resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        dispose: disposeUrl,
      });
    };
    image.decoding = "async";
    image.onload = () => {
      if (typeof image.decode !== "function") {
        finish();
        return;
      }
      // WebKit can report a rejected decode() promise after onload for HEIF
      // and large camera images even though the image element is drawable.
      // Let finish() make the final decision from naturalWidth/naturalHeight.
      void image.decode().then(finish).catch(finish);
    };
    image.onerror = () => fail(new PhotoPrepareError(isHeic(file) ? "decode_unsupported" : "decode_failed"));
    image.src = sourceUrl;
  });
}

/** Decode with the fast path first, then always retry through a browser image element. */
export async function loadImage(file: File): Promise<LoadedImage> {
  if (!sourceLooksSupported(file)) throw new PhotoPrepareError("decode_unsupported");
  if (file.size > PHOTO_PREPARE_LIMITS.sourceMaxBytes) throw new PhotoPrepareError("source_too_large");

  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      try {
        assertPixelBudget(bitmap.width, bitmap.height);
      } catch (error) {
        bitmap.close();
        throw error;
      }
      return { source: bitmap, width: bitmap.width, height: bitmap.height, dispose: () => bitmap.close() };
    } catch (error) {
      if (error instanceof PhotoPrepareError && error.code === "source_too_many_pixels") throw error;
      // Some iOS image types and large HEIF files reject createImageBitmap even
      // though the browser <img> decoder can still read them.
    }
  }

  try {
    return await imageElementSource(file);
  } catch (error) {
    if (error instanceof PhotoPrepareError) throw error;
    throw new PhotoPrepareError(isHeic(file) ? "decode_unsupported" : "decode_failed");
  }
}

function isWebpMagic(bytes: Uint8Array) {
  return bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}

async function hasWebpMagic(blob: Blob) {
  const header = blob.slice(0, 12);
  if (typeof header.arrayBuffer === "function") return isWebpMagic(new Uint8Array(await header.arrayBuffer()));
  if (typeof FileReader !== "function") return false;
  const bytes = await new Promise<Uint8Array>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result instanceof ArrayBuffer ? new Uint8Array(reader.result) : new Uint8Array());
    reader.onerror = () => resolve(new Uint8Array());
    reader.readAsArrayBuffer(header);
  });
  return isWebpMagic(bytes);
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    let settled = false;
    const finish = (blob: Blob | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve(blob);
    };
    const timeoutId = setTimeout(() => finish(null), 5_000);
    try {
      canvas.toBlob(finish, "image/webp", quality);
    } catch {
      finish(null);
    }
  });
}

function canvasDataUrlToBlob(canvas: HTMLCanvasElement, quality: number) {
  if (typeof canvas.toDataURL !== "function" || typeof atob !== "function") return null;
  try {
    const dataUrl = canvas.toDataURL("image/webp", quality);
    const [metadata, payload] = dataUrl.split(",", 2);
    if (!/^data:image\/webp(?:;[^,]*)?;base64$/i.test(metadata ?? "") || !payload) return null;
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: "image/webp" });
  } catch {
    return null;
  }
}

async function encodeCanvasAsWebp(canvas: HTMLCanvasElement, quality: number) {
  const nativeBlob = await canvasToBlob(canvas, quality);
  if (nativeBlob?.type.toLowerCase() === "image/webp" && await hasWebpMagic(nativeBlob)) return nativeBlob;

  // A few WebKit versions expose a working data-URL encoder while toBlob()
  // returns null or silently falls back to PNG. Keep this as a small fallback;
  // the MIME and RIFF/WEBP checks still apply before the file is accepted.
  const dataUrlBlob = canvasDataUrlToBlob(canvas, quality);
  if (dataUrlBlob && await hasWebpMagic(dataUrlBlob)) return dataUrlBlob;
  throw new PhotoPrepareError("webp_encoder_unavailable");
}

/**
 * Render one output independently. A real MIME and RIFF/WEBP header are both
 * required; a browser that silently falls back to PNG/JPEG is not accepted.
 */
export async function renderWebp(image: LoadedImage, id: string, maxEdge: number, minEdge: number, maxBytes: number, startQuality: number): Promise<RenderedWebp> {
  const sourceEdge = Math.max(image.width, image.height);
  const scale = Math.min(1, maxEdge / sourceEdge);
  let width = Math.max(1, Math.round(image.width * scale));
  let height = Math.max(1, Math.round(image.height * scale));
  const floorEdge = Math.min(minEdge, sourceEdge);
  const qualitySteps = Array.from(new Set([
    startQuality,
    startQuality - 0.07,
    startQuality - 0.14,
    startQuality - 0.21,
    startQuality - 0.28,
    startQuality - 0.35,
    0.3,
    0.22,
    0.16,
    0.1,
    0.08,
  ].map((quality) => Math.max(0.08, quality))));

  for (let resizePass = 0; resizePass < 12; resizePass += 1) {
    for (const quality of qualitySteps) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      try {
        const context = canvas.getContext("2d");
        if (!context) throw new PhotoPrepareError("webp_encoder_unavailable");
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(image.source, 0, 0, width, height);
        const blob = await encodeCanvasAsWebp(canvas, quality);
        if (blob.size <= maxBytes) {
          return {
            file: new File([blob], `foodprint-${id}.webp`, { type: "image/webp" }),
            width,
            height,
          };
        }
      } finally {
        // Release the backing store between attempts, which matters on iOS for
        // 12–48MP sources and when a user selects several images in a row.
        canvas.width = 0;
        canvas.height = 0;
      }
    }
    const edge = Math.max(width, height);
    if (edge <= floorEdge) break;
    const nextScale = Math.max(floorEdge / edge, 0.84);
    width = Math.max(1, Math.round(width * nextScale));
    height = Math.max(1, Math.round(height * nextScale));
  }
  throw new PhotoPrepareError("output_budget_unmet");
}

function newPhotoId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `photo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function preparePhoto(file: File, id = newPhotoId()): Promise<PreparedPhoto> {
  if (file.size > PHOTO_PREPARE_LIMITS.sourceMaxBytes) throw new PhotoPrepareError("source_too_large");
  const image = await loadImage(file);
  try {
    const display = await renderWebp(image, `${id}-display`, PHOTO_PREPARE_LIMITS.displayMaxEdge, PHOTO_PREPARE_LIMITS.displayMinEdge, PHOTO_PREPARE_LIMITS.displayMaxBytes, 0.8);
    const thumbnail = await renderWebp(image, `${id}-thumbnail`, PHOTO_PREPARE_LIMITS.thumbnailMaxEdge, PHOTO_PREPARE_LIMITS.thumbnailMinEdge, PHOTO_PREPARE_LIMITS.thumbnailMaxBytes, 0.74);
    return {
      id,
      displayFile: display.file,
      thumbnailFile: thumbnail.file,
      width: display.width,
      height: display.height,
      thumbnailWidth: thumbnail.width,
      thumbnailHeight: thumbnail.height,
    };
  } finally {
    image.dispose();
  }
}

export async function preparePhotoSafely(file: File, id = newPhotoId()): Promise<PhotoPrepareResult> {
  try {
    return { ok: true, photo: await preparePhoto(file, id) };
  } catch (error) {
    const prepareError = error instanceof PhotoPrepareError ? error : new PhotoPrepareError("decode_failed");
    return { ok: false, code: prepareError.code, error: prepareError };
  }
}

export function photoPrepareFailureMessage(code: PhotoPrepareFailureCode) {
  switch (code) {
    case "source_too_large": return "这张原图超过 20MB，请先在相册中缩小后再试。";
    case "source_too_many_pixels": return "这张照片像素过高，设备暂时无法安全处理，请换一张或先缩小。";
    case "decode_unsupported": return "当前设备暂时无法读取这张照片，请换用 JPG、PNG 或 WebP。";
    case "decode_failed": return "当前设备暂时无法读取这张照片，请重试或换一张。";
    case "webp_encoder_unavailable":
    case "output_budget_unmet": return "这张照片暂时没有处理好，请重试或换一张。";
  }
}

export function photoSourceSizeBucket(bytes: number) {
  if (bytes <= 1 * 1024 * 1024) return "0_1mb" as const;
  if (bytes <= 3 * 1024 * 1024) return "1_3mb" as const;
  if (bytes <= 6 * 1024 * 1024) return "3_6mb" as const;
  if (bytes <= 20 * 1024 * 1024) return "6_20mb" as const;
  return "over_20mb" as const;
}

export function photoPixelBucket(pixels: number) {
  if (pixels <= 12_000_000) return "0_12mp" as const;
  if (pixels <= 24_000_000) return "12_24mp" as const;
  if (pixels <= 48_000_000) return "24_48mp" as const;
  return "over_48mp" as const;
}
