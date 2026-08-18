// @vitest-environment node

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parsePhotoPairs } from "@/app/mark/actions";

const root = process.cwd();
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260818100000_v2_4_1_visit_photo_limit.sql"), "utf8");
const actions = fs.readFileSync(path.join(root, "src/app/mark/actions.ts"), "utf8");

function webpFile(name: string, width = 1_280, height = 960, type = "image/webp") {
  const bytes = new Uint8Array(30);
  bytes.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58, 0x0a, 0, 0, 0]);
  bytes[24] = (width - 1) & 0xff;
  bytes[25] = ((width - 1) >> 8) & 0xff;
  bytes[26] = ((width - 1) >> 16) & 0xff;
  bytes[27] = (height - 1) & 0xff;
  bytes[28] = ((height - 1) >> 8) & 0xff;
  bytes[29] = ((height - 1) >> 16) & 0xff;
  return new File([bytes], name, { type });
}

describe("V2.4.1 photo upload and recovery contract", () => {
  it("raises only the V1.3 visit_record guard to nine and leaves legacy visits at six", () => {
    expect(migration).toContain("new.visit_record_id is not null");
    expect(migration).toContain(") >= 9");
    expect(migration).toContain("new.visit_id is not null");
    expect(migration).toContain(") >= 6");
  });

  it("returns independent display/thumbnail pairs and rejects mismatched or fake MIME data", async () => {
    const valid = new FormData();
    valid.append("photos", webpFile("display.webp"));
    valid.append("photo_thumbnails", webpFile("thumb.webp", 640, 480));
    await expect(parsePhotoPairs(valid)).resolves.toMatchObject({ pairs: [{ displayMetadata: { width: 1_280, height: 960 }, thumbnailMetadata: { width: 640, height: 480 } }] });

    const mismatch = new FormData();
    mismatch.append("photos", webpFile("display.webp"));
    await expect(parsePhotoPairs(mismatch)).resolves.toMatchObject({ error: "照片展示图与缩略图数量不一致，请重新选择。" });

    const fakeMime = new FormData();
    fakeMime.append("photos", webpFile("display.png", 1_280, 960, "image/png"));
    fakeMime.append("photo_thumbnails", webpFile("thumb.webp", 640, 480));
    await expect(parsePhotoPairs(fakeMime)).resolves.toMatchObject({ error: "第 1 张照片不是 WebP 格式。" });
  });

  it("rejects the tenth pair before any business RPC and exposes a repair-only action", async () => {
    const form = new FormData();
    for (let index = 0; index < 10; index += 1) {
      form.append("photos", webpFile(`display-${index}.webp`));
      form.append("photo_thumbnails", webpFile(`thumb-${index}.webp`, 640, 480));
    }
    await expect(parsePhotoPairs(form)).resolves.toMatchObject({ error: "这次到访最多保留 9 张照片。" });
    expect(actions).toContain("export async function repairVisitPhotos");
    expect(actions).toContain('formData.get("visit_record_id")');
    expect(actions).toContain("status: \"photo_repair_required\"");
    expect(actions).toContain("The ID is content-stable within one visit");
  });
});
