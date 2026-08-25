import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

const sourceFixture = fs.readFileSync(path.join(process.cwd(), "public/mascot/empty-map.jpg"));

function paddedJpeg(sizeBytes: number, name: string) {
  return {
    name,
    mimeType: "image/jpeg",
    buffer: Buffer.concat([sourceFixture, Buffer.alloc(Math.max(0, sizeBytes - sourceFixture.length))]),
  };
}

for (const count of [1, 3, 9]) {
  test(`submits ${count} prepared display/thumbnail pairs as multipart`, async ({ page }) => {
    await page.goto("/e2e/photo-upload");
    await page.getByTestId("worker-check").click();
    await expect(page.getByTestId("worker-result")).toContainText("真实 WebP");

    await page.locator('input[type="file"]').setInputFiles(
      Array.from({ length: count }, (_, index) => paddedJpeg(3 * 1024 * 1024, `fixture-${count}-${index}.jpg`)),
    );
    await expect(page.locator('img[alt="待上传照片预览"]')).toHaveCount(count);
    await page.getByRole("button", { name: "提交 multipart" }).click();

    const result = page.getByTestId("upload-result");
    await expect(result).not.toHaveText("未提交");
    const payload = JSON.parse((await result.textContent()) ?? "{}");
    expect(payload.photos).toBe(count);
    expect(payload.thumbnails).toBe(count);
    expect(payload.photoTypes).toEqual(Array(count).fill("image/webp"));
    expect(payload.thumbnailTypes).toEqual(Array(count).fill("image/webp"));
    expect(payload.dimensions).toHaveLength(count);
    expect(payload.thumbnailDimensions).toHaveLength(count);
    expect(payload.photoBytes.every((size: number) => size <= 600 * 1024)).toBe(true);
    expect(payload.thumbnailBytes.every((size: number) => size <= 120 * 1024)).toBe(true);
  });
}

test("forces the real PhotoPicker through the Worker/WASM fallback", async ({ page }) => {
  await page.goto("/e2e/photo-upload?force_wasm=1");
  await expect(page.getByTestId("encoder-mode")).toHaveText("强制 WASM 回退");
  await page.locator('input[type="file"]').setInputFiles([paddedJpeg(3 * 1024 * 1024, "fixture-force-wasm.jpg")]);
  await expect(page.locator('img[alt="待上传照片预览"]')).toHaveCount(1);
  await page.getByRole("button", { name: "提交 multipart" }).click();

  const result = page.getByTestId("upload-result");
  await expect(result).not.toHaveText("未提交");
  const payload = JSON.parse((await result.textContent()) ?? "{}");
  expect(payload.photos).toBe(1);
  expect(payload.thumbnails).toBe(1);
  expect(payload.photoTypes).toEqual(["image/webp"]);
  expect(payload.thumbnailTypes).toEqual(["image/webp"]);
});
