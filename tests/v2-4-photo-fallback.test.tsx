import fs from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiscoveryCardPhoto } from "@/components/photo/discovery-card-photo";
import { selectPhotoResource } from "@/lib/photos/photo-resource";

const migrationPath = path.join(process.cwd(), "supabase/migrations/20260816100000_v2_4_discovery_photo_fallback.sql");
const signRoute = fs.readFileSync(path.join(process.cwd(), "src/app/api/photos/sign/route.ts"), "utf8");
const migration = fs.readFileSync(migrationPath, "utf8");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("V2.4 private photo recovery", () => {
  it("prefers a thumbnail but safely falls back to the canonical object", () => {
    expect(selectPhotoResource({ id: "photo-1", object_key: "canonical/1.webp", width: 1200, height: 800, thumbnail_object_key: "thumb/1.webp", thumbnail_width: 640, thumbnail_height: 427 })).toMatchObject({ resource: "thumbnail", key: "thumb/1.webp", width: 640, height: 427 });
    expect(selectPhotoResource({ id: "photo-2", object_key: "canonical/2.webp", width: 1200, height: 800, thumbnail_object_key: null })).toMatchObject({ resource: "canonical", key: "canonical/2.webp", width: 1200, height: 800 });
  });

  it("treats a row without either visible resource as unavailable, not as a real no-photo state", () => {
    expect(selectPhotoResource({ id: "photo-3", object_key: null, thumbnail_object_key: null })).toBeNull();
    expect(signRoute).toContain("unavailablePhotoIds");
    expect(signRoute).toContain("object_key, width, height, thumbnail_object_key");
  });

  it("keeps the discovery cover visible when only the canonical image exists", () => {
    expect(migration).toContain("and photo.deleted_at is null");
    expect(migration).toContain("and photo.hidden_at is null");
    expect(migration).toContain("coalesce(cover.thumbnail_width, cover.width)");
    expect(migration).not.toContain("and photo.thumbnail_object_key is not null");
  });

  it("does not expose an object key in the sign response shape", () => {
    expect(signRoute).toContain("signedUrl");
    expect(signRoute).not.toContain("return Response.json({ photos: resources");
  });

  it("keeps no-photo, signing failure and no-permission states distinct", async () => {
    const { rerender } = render(<DiscoveryCardPhoto alt="没有照片的地点" />);
    expect(screen.getByText("暂无照片")).toBeInTheDocument();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }));
    rerender(<DiscoveryCardPhoto photoId="11111111-1111-4111-8111-111111111111" alt="签名失败的地点" />);
    expect(await screen.findByText("照片暂时无法加载")).toBeInTheDocument();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) }));
    rerender(<DiscoveryCardPhoto photoId="22222222-2222-4222-8222-222222222222" alt="无权限的地点" />);
    expect(await screen.findByText("照片暂时不可见")).toBeInTheDocument();
  });
});
