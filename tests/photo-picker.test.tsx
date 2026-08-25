import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PhotoPicker, type PhotoPickerHandle } from "@/components/mark/photo-picker";
import fs from "node:fs";
import path from "node:path";

const preparePhotoSafely = vi.hoisted(() => vi.fn());

vi.mock("@/lib/photos/prepare-photo", () => ({
  photoFormat: () => "jpeg",
  photoPixelBucket: () => "0_12mp",
  preparePhotoSafely,
  photoPrepareFailureMessage: (code: string) => code === "decode_failed" ? "当前设备暂时无法读取这张照片，请重试或换一张。" : "这张照片暂时没有处理好，请重试或换一张。",
}));
vi.mock("@/lib/performance/client", () => ({ clientDeploymentVersion: () => "test-version", clientDisplayMode: () => "browser", reportClientMetric: vi.fn() }));

function prepared(id: string) {
  return {
    ok: true,
    photo: {
      id,
      displayFile: new File(["display"], `foodprint-${id}.webp`, { type: "image/webp" }),
      thumbnailFile: new File(["thumbnail"], `foodprint-${id}-thumb.webp`, { type: "image/webp" }),
      width: 1_280,
      height: 960,
      thumbnailWidth: 640,
      thumbnailHeight: 480,
      sourceWidth: 3_000,
      sourceHeight: 2_000,
      encoderPath: "native" as const,
    },
  };
}

describe("PhotoPicker recovery state", () => {
  it("does not depend on synthetic FileList submission APIs", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/components/mark/photo-picker.tsx"), "utf8");
    expect(source).not.toContain("DataTransfer");
    expect(source).not.toContain(".files =");
    expect(source).not.toContain("name=\"photo_thumbnails\"");
  });

  it("keeps the first and third preview when the second photo fails", async () => {
    preparePhotoSafely
      .mockResolvedValueOnce(prepared("one"))
      .mockResolvedValueOnce({ ok: false, code: "decode_failed", error: new Error("decode") })
      .mockResolvedValueOnce(prepared("three"));
    const states: Array<{ preparedCount: number; failedCount: number; hasBlockingFailure: boolean }> = [];
    const ref = createRef<PhotoPickerHandle>();
    const user = userEvent.setup();
    render(<PhotoPicker ref={ref} onStateChange={(state) => states.push(state)} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, [
      new File(["one"], "one.jpg", { type: "image/jpeg" }),
      new File(["two"], "two.jpg", { type: "image/jpeg" }),
      new File(["three"], "three.jpg", { type: "image/jpeg" }),
    ]);

    expect(await screen.findAllByAltText("待上传照片预览")).toHaveLength(2);
    expect(screen.getAllByText("当前设备暂时无法读取这张照片，请重试或换一张。")).toHaveLength(1);
    expect(states.at(-1)).toMatchObject({ preparedCount: 2, failedCount: 1, hasBlockingFailure: true });

    await user.click(screen.getByRole("button", { name: "忽略失败照片并继续" }));
    const formData = new FormData();
    expect(ref.current!.appendPreparedPhotos(formData)).toBe(2);
    expect(formData.getAll("photos")).toHaveLength(2);
    expect(formData.getAll("photo_thumbnails")).toHaveLength(2);
  });

  it("uses one raw file input and appends the prepared display/thumbnail pair explicitly", async () => {
    preparePhotoSafely.mockResolvedValue(prepared("explicit-form-data"));
    const ref = createRef<PhotoPickerHandle>();
    const user = userEvent.setup();
    render(<form><PhotoPicker ref={ref} /></form>);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(["photo"], "photo.jpg", { type: "image/jpeg" }));

    await screen.findByAltText("待上传照片预览");
    const formData = new FormData(document.querySelector("form")!);
    const appended = ref.current!.appendPreparedPhotos(formData);

    expect(document.querySelectorAll('input[type="file"]')).toHaveLength(1);
    expect(input).not.toHaveAttribute("name");
    expect(appended).toBe(1);
    expect(ref.current!.preparedCount).toBe(1);
    expect(formData.getAll("photos")).toHaveLength(1);
    expect(formData.getAll("photo_thumbnails")).toHaveLength(1);
    expect(formData.getAll("photo_dimensions")).toEqual(["1280x960"]);
  });

  it("snapshots selected files before clearing the native picker value", async () => {
    preparePhotoSafely.mockResolvedValue(prepared("live-list"));
    render(<PhotoPicker />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["photo"], "live-list.jpg", { type: "image/jpeg" });
    let liveFiles = [file];
    const liveFileList = {
      get 0() { return liveFiles[0]; },
      get length() { return liveFiles.length; },
      item(index: number) { return liveFiles[index] ?? null; },
      [Symbol.iterator]() { return liveFiles[Symbol.iterator](); },
    } as unknown as FileList;
    Object.defineProperty(input, "files", { configurable: true, get: () => liveFileList });
    Object.defineProperty(input, "value", { configurable: true, get: () => "", set: () => { liveFiles = []; } });

    fireEvent.change(input);

    expect(await screen.findByAltText("待上传照片预览")).toBeInTheDocument();
    expect(preparePhotoSafely).toHaveBeenCalledWith(file, expect.any(String), expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("only clears the submit block after the user explicitly ignores a failed photo", async () => {
    preparePhotoSafely.mockResolvedValue({ ok: false, code: "decode_failed", error: new Error("decode") });
    const states: Array<{ hasBlockingFailure: boolean }> = [];
    const user = userEvent.setup();
    render(<PhotoPicker onStateChange={(state) => states.push(state)} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(["bad"], "bad.jpg", { type: "image/jpeg" }));
    await user.click(await screen.findByRole("button", { name: "忽略失败照片并继续" }));

    expect(states.at(-1)).toMatchObject({ hasBlockingFailure: false });
    expect(screen.getByText("失败照片已忽略；其余已准备好的照片仍会上传。")).toBeInTheDocument();
  });
});
