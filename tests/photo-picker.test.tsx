import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PhotoPicker } from "@/components/mark/photo-picker";

const preparePhotoSafely = vi.hoisted(() => vi.fn());

vi.mock("@/lib/photos/prepare-photo", () => ({
  preparePhotoSafely,
  photoPrepareFailureMessage: (code: string) => code === "decode_failed" ? "当前设备暂时无法读取这张照片，请重试或换一张。" : "这张照片暂时没有处理好，请重试或换一张。",
}));
vi.mock("@/lib/performance/client", () => ({ reportClientMetric: vi.fn() }));

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
    },
  };
}

describe("PhotoPicker recovery state", () => {
  it("keeps the first and third preview when the second photo fails", async () => {
    preparePhotoSafely
      .mockResolvedValueOnce(prepared("one"))
      .mockResolvedValueOnce({ ok: false, code: "decode_failed", error: new Error("decode") })
      .mockResolvedValueOnce(prepared("three"));
    const states: Array<{ preparedCount: number; failedCount: number; hasBlockingFailure: boolean }> = [];
    const user = userEvent.setup();
    render(<PhotoPicker onStateChange={(state) => states.push(state)} />);
    const input = document.querySelector('input[name="photos"]') as HTMLInputElement;
    await user.upload(input, [
      new File(["one"], "one.jpg", { type: "image/jpeg" }),
      new File(["two"], "two.jpg", { type: "image/jpeg" }),
      new File(["three"], "three.jpg", { type: "image/jpeg" }),
    ]);

    expect(await screen.findAllByAltText("待上传照片预览")).toHaveLength(2);
    expect(screen.getAllByText("当前设备暂时无法读取这张照片，请重试或换一张。")).toHaveLength(2);
    expect(states.at(-1)).toMatchObject({ preparedCount: 2, failedCount: 1, hasBlockingFailure: true });
  });

  it("snapshots the selected files before clearing a live native FileList", async () => {
    preparePhotoSafely.mockResolvedValue(prepared("live-list"));
    render(<PhotoPicker />);
    const input = document.querySelector('input[name="photos"]') as HTMLInputElement;
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
    expect(preparePhotoSafely).toHaveBeenCalledWith(file, expect.any(String));
  });

  it("only clears the submit block after the user explicitly ignores a failed photo", async () => {
    preparePhotoSafely.mockResolvedValue({ ok: false, code: "decode_failed", error: new Error("decode") });
    const states: Array<{ hasBlockingFailure: boolean }> = [];
    const user = userEvent.setup();
    render(<PhotoPicker onStateChange={(state) => states.push(state)} />);
    const input = document.querySelector('input[name="photos"]') as HTMLInputElement;
    await user.upload(input, new File(["bad"], "bad.jpg", { type: "image/jpeg" }));
    await user.click(await screen.findByRole("button", { name: "忽略失败照片并继续" }));

    expect(states.at(-1)).toMatchObject({ hasBlockingFailure: false });
    expect(screen.getByText("失败照片已忽略；其余已准备好的照片仍会上传。")).toBeInTheDocument();
  });
});
