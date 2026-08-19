import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadImage,
  photoPrepareFailureMessage,
  preparePhoto,
  renderWebp,
  type PhotoPrepareFailureCode,
} from "@/lib/photos/prepare-photo";

const webpHeader = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50,
]);

function fakeBlob(type: string, bytes = webpHeader) {
  return {
    type,
    size: bytes.length,
    slice: () => ({ arrayBuffer: async () => bytes.buffer }),
  } as unknown as Blob;
}

function installCanvas(toBlob: (canvas: HTMLCanvasElement) => Blob | null) {
  const context = { imageSmoothingEnabled: false, imageSmoothingQuality: "low", drawImage: vi.fn() };
  const createElement = vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
    if (tagName !== "canvas") return document.createElementNS("http://www.w3.org/1999/xhtml", tagName) as unknown as HTMLElement;
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => context,
      toBlob: (callback: BlobCallback) => callback(toBlob(canvas as unknown as HTMLCanvasElement)),
    } as unknown as HTMLCanvasElement;
    return canvas;
  });
  return createElement;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("M0/M1 photo preparation contract", () => {
  it.each<[PhotoPrepareFailureCode, string]>([
    ["source_too_large", "这张原图超过 20MB，请先在相册中缩小后再试。"],
    ["decode_unsupported", "当前设备暂时无法读取这张照片，请换用 JPG、PNG 或 WebP。"],
    ["webp_encoder_unavailable", "这张照片暂时没有处理好，请重试或换一张。"],
    ["output_budget_unmet", "这张照片暂时没有处理好，请重试或换一张。"],
  ])("keeps %s errors user-facing and stage-specific", (code, message) => {
    expect(photoPrepareFailureMessage(code)).toBe(message);
  });

  it("accepts a 6MB source boundary without treating the source size as output size", async () => {
    const file = new File([new Uint8Array(6 * 1024 * 1024)], "phone.jpg", { type: "image/jpeg" });
    const bitmap = { width: 3_000, height: 2_000, close: vi.fn() };
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
    installCanvas(() => fakeBlob("image/webp"));

    const prepared = await preparePhoto(file, "photo-6mb");

    expect(prepared.id).toBe("photo-6mb");
    expect(prepared.displayFile.type).toBe("image/webp");
    expect(prepared.thumbnailFile.type).toBe("image/webp");
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

  it("falls back to a valid WebP data URL when toBlob returns a non-WebP blob", async () => {
    const validWebpDataUrl = `data:image/webp;base64,${btoa(String.fromCharCode(...webpHeader))}`;
    const createElement = vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName !== "canvas") return document.createElementNS("http://www.w3.org/1999/xhtml", tagName) as unknown as HTMLElement;
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({ imageSmoothingEnabled: false, imageSmoothingQuality: "low", drawImage: vi.fn() }),
        toBlob: (callback: BlobCallback) => callback(fakeBlob("image/png", new Uint8Array([1, 2, 3]))),
        toDataURL: () => validWebpDataUrl,
      } as unknown as HTMLCanvasElement;
      return canvas;
    });
    const image = { source: {} as CanvasImageSource, width: 1_000, height: 800, dispose: vi.fn() };

    const rendered = await renderWebp(image, "data-url-fallback", 1_280, 720, 600 * 1024, 0.8);

    expect(rendered.file.type).toBe("image/webp");
    expect(createElement).toHaveBeenCalled();
  });

  it("rejects a non-WebP canvas fallback instead of relabeling it", async () => {
    installCanvas(() => fakeBlob("image/png", new Uint8Array([1, 2, 3])));
    const image = { source: {} as CanvasImageSource, width: 1_000, height: 800, dispose: vi.fn() };

    await expect(renderWebp(image, "bad-encoder", 1_280, 720, 600 * 1024, 0.8)).rejects.toMatchObject({ code: "webp_encoder_unavailable" });
  });

  it("rejects sources above the memory pixel guard before allocating a canvas", async () => {
    const file = new File(["synthetic"], "large.jpg", { type: "image/jpeg" });
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 8_000, height: 8_000, close: vi.fn() }));

    await expect(loadImage(file)).rejects.toMatchObject({ code: "source_too_many_pixels" });
  });
});
