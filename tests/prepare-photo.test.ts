import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadImage,
  photoPrepareFailureMessage,
  preparePhoto,
  renderWebp,
  type PhotoPrepareFailureCode,
} from "@/lib/photos/prepare-photo";
import type { WebpWorkerFactory } from "@/lib/photos/webp-encoder-worker-client";

function webpBytes(width = 1_000, height = 800, totalBytes = 30) {
  const bytes = new Uint8Array(Math.max(30, totalBytes));
  bytes.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58, 0x0a, 0, 0, 0]);
  bytes[24] = (width - 1) & 0xff;
  bytes[25] = ((width - 1) >> 8) & 0xff;
  bytes[26] = ((width - 1) >> 16) & 0xff;
  bytes[27] = (height - 1) & 0xff;
  bytes[28] = ((height - 1) >> 8) & 0xff;
  bytes[29] = ((height - 1) >> 16) & 0xff;
  return bytes;
}

function fakeBlob(type: string, width = 1_000, height = 800, totalBytes = 30) {
  const bytes = webpBytes(width, height, totalBytes);
  return {
    type,
    size: bytes.length,
    arrayBuffer: async () => bytes.buffer,
    slice: () => ({ arrayBuffer: async () => bytes.buffer }),
  } as unknown as Blob;
}

function installCanvas(toBlob: (canvas: HTMLCanvasElement) => Blob | null, toDataURL?: (canvas: HTMLCanvasElement) => string) {
  const context = {
    imageSmoothingEnabled: false,
    imageSmoothingQuality: "low",
    drawImage: vi.fn(),
    getImageData: (canvas: HTMLCanvasElement) => ({ data: new Uint8ClampedArray(canvas.width * canvas.height * 4), width: canvas.width, height: canvas.height } as ImageData),
  };
  const createElement = vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
    if (tagName !== "canvas") return document.createElementNS("http://www.w3.org/1999/xhtml", tagName) as unknown as HTMLElement;
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => context,
      toBlob: (callback: BlobCallback) => callback(toBlob(canvas as unknown as HTMLCanvasElement)),
      toDataURL: toDataURL ? () => toDataURL(canvas as unknown as HTMLCanvasElement) : undefined,
    } as unknown as HTMLCanvasElement;
    return canvas;
  });
  return createElement;
}

function fakeWorkerFactory(outputBytes = (width: number, height: number) => webpBytes(width, height)) {
  const factory = vi.fn(() => {
    let onMessage: ((event: MessageEvent) => void) | undefined;
    return {
      postMessage(message: { id: number; width: number; height: number }) {
        queueMicrotask(() => onMessage?.({ data: { id: message.id, ok: true, data: outputBytes(message.width, message.height).buffer } } as MessageEvent));
      },
      addEventListener(type: "message" | "error", listener: (event: MessageEvent | ErrorEvent) => void) {
        if (type === "message") onMessage = listener as (event: MessageEvent) => void;
        else void listener;
      },
      removeEventListener(type: "message" | "error") {
        if (type === "message") onMessage = undefined;
        else void type;
      },
      terminate: vi.fn(),
    };
  });
  return factory as unknown as WebpWorkerFactory;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("M0/M1 photo preparation contract", () => {
  it.each<[PhotoPrepareFailureCode, string]>([
    ["source_too_large", "这张原图超过 20MB，请先在相册中缩小后再试。"],
    ["decode_unsupported", "当前设备暂时无法读取这张照片，请换用 JPG、PNG 或 WebP。"],
    ["webp_encoder_unavailable", "当前设备暂时无法生成 WebP，请重试或换一张。"],
    ["output_budget_unmet", "这张照片压缩后仍然过大，请换一张尺寸较小的照片。"],
  ])("keeps %s errors user-facing and stage-specific", (code, message) => {
    expect(photoPrepareFailureMessage(code)).toBe(message);
  });

  it("accepts a 6MB source boundary without treating the source size as output size", async () => {
    const file = new File([new Uint8Array(6 * 1024 * 1024)], "phone.jpg", { type: "image/jpeg" });
    const bitmap = { width: 3_000, height: 2_000, close: vi.fn() };
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
    installCanvas((canvas) => fakeBlob("image/webp", canvas.width, canvas.height));

    const prepared = await preparePhoto(file, "photo-6mb");

    expect(prepared.id).toBe("photo-6mb");
    expect(prepared.displayFile.type).toBe("image/webp");
    expect(prepared.thumbnailFile.type).toBe("image/webp");
    expect(prepared.encoderPath).toBe("native");
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it("falls back to browser image decoding after createImageBitmap rejects", async () => {
    const file = new File(["synthetic"], "phone.heic", { type: "image/heic" });
    const createImageBitmap = vi.fn().mockRejectedValue(new Error("bitmap decoder unavailable"));
    vi.stubGlobal("createImageBitmap", createImageBitmap);
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:photo"), revokeObjectURL: vi.fn() });
    class MockImage {
      naturalWidth = 2_000;
      naturalHeight = 1_500;
      decoding = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      decode = vi.fn().mockResolvedValue(undefined);
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal("Image", MockImage);

    const loaded = await loadImage(file);

    expect(createImageBitmap).toHaveBeenCalledOnce();
    expect(loaded.width).toBe(2_000);
    expect(loaded.height).toBe(1_500);
    loaded.dispose();
  });

  it("keeps a drawable iOS image when decode() rejects after onload", async () => {
    const file = new File(["synthetic"], "camera.jpg", { type: "image/jpeg" });
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("bitmap decoder unavailable")));
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:photo"), revokeObjectURL: vi.fn() });
    class MockImage {
      naturalWidth = 2_000;
      naturalHeight = 1_500;
      decoding = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      decode = vi.fn().mockRejectedValue(new Error("WebKit decode promise rejected"));
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal("Image", MockImage);

    const loaded = await loadImage(file);

    expect(loaded.width).toBe(2_000);
    expect(loaded.height).toBe(1_500);
    loaded.dispose();
  });

  it("uses a valid native data URL only as a same-engine compatibility attempt", async () => {
    const validWebpDataUrl = `data:image/webp;base64,${btoa(String.fromCharCode(...webpBytes(1_000, 800)))}`;
    const createElement = installCanvas(
      () => fakeBlob("image/png", 1_000, 800, 30),
      () => validWebpDataUrl,
    );
    const image = { source: {} as CanvasImageSource, width: 1_000, height: 800, dispose: vi.fn() };
    const workerFactory = fakeWorkerFactory();

    const rendered = await renderWebp(image, "data-url-fallback", 1_280, 720, 600 * 1024, 0.8, { workerFactory });

    expect(rendered.file.type).toBe("image/webp");
    expect(rendered.encoderPath).toBe("native");
    expect(workerFactory).not.toHaveBeenCalled();
    expect(createElement).toHaveBeenCalled();
  });

  it("does not load the worker for a native WebP and enters WASM worker fallback for a PNG result", async () => {
    const image = { source: {} as CanvasImageSource, width: 1_000, height: 800, dispose: vi.fn() };
    const workerFactory = fakeWorkerFactory();
    installCanvas((canvas) => fakeBlob("image/png", canvas.width, canvas.height, 30));

    const rendered = await renderWebp(image, "wasm-fallback", 1_280, 720, 600 * 1024, 0.8, { workerFactory });

    expect(rendered.file.type).toBe("image/webp");
    expect(rendered.encoderPath).toBe("wasm");
    expect(workerFactory).toHaveBeenCalledOnce();
  });

  it("rejects a non-WebP native result instead of relabeling it", async () => {
    installCanvas((canvas) => fakeBlob("image/png", canvas.width, canvas.height, 30));
    const image = { source: {} as CanvasImageSource, width: 1_000, height: 800, dispose: vi.fn() };
    const workerFactory = vi.fn(() => { throw new Error("WASM unavailable"); });

    await expect(renderWebp(image, "bad-encoder", 1_280, 720, 600 * 1024, 0.8, { workerFactory })).rejects.toMatchObject({ code: "webp_encoder_unavailable", encoderPath: "wasm" });
  });

  it("rejects worker output with a fake magic header or wrong dimensions", async () => {
    const image = { source: {} as CanvasImageSource, width: 1_000, height: 800, dispose: vi.fn() };
    installCanvas((canvas) => fakeBlob("image/png", canvas.width, canvas.height, 30));
    const fakeMagic = fakeWorkerFactory(() => new Uint8Array(30));
    await expect(renderWebp(image, "fake-worker-output", 1_280, 720, 600 * 1024, 0.8, { workerFactory: fakeMagic })).rejects.toMatchObject({ code: "webp_encoder_unavailable", encoderPath: "wasm" });

    const wrongDimensions = fakeWorkerFactory(() => webpBytes(999, 799));
    await expect(renderWebp(image, "wrong-worker-dimensions", 1_280, 720, 600 * 1024, 0.8, { workerFactory: wrongDimensions })).rejects.toMatchObject({ code: "webp_encoder_unavailable", encoderPath: "wasm" });
  });

  it("reports a distinct output-budget failure after bounded resize and quality attempts", async () => {
    const image = { source: {} as CanvasImageSource, width: 1_000, height: 800, dispose: vi.fn() };
    installCanvas((canvas) => fakeBlob("image/webp", canvas.width, canvas.height, 700 * 1024));

    await expect(renderWebp(image, "budget-unmet", 1_280, 720, 600 * 1024, 0.8)).rejects.toMatchObject({ code: "output_budget_unmet", encoderPath: "native" });
  });

  it("rejects sources above the memory pixel guard before allocating a canvas", async () => {
    const file = new File(["synthetic"], "large.jpg", { type: "image/jpeg" });
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 8_000, height: 8_000, close: vi.fn() }));

    await expect(loadImage(file)).rejects.toMatchObject({ code: "source_too_many_pixels" });
  });
});
