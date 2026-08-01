// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient }));

describe("mark server actions", () => {
  it("returns a retryable form error when the first-mark dependency fails", async () => {
    createClient.mockRejectedValueOnce(new Error("network unavailable"));
    const { savePlaceMark } = await import("@/app/mark/actions");

    const result = await savePlaceMark({}, new FormData());

    expect(result).toEqual({ error: "保存失败，请检查网络后重试。" });
  });

  it("returns a retryable form error when a visit dependency fails", async () => {
    createClient.mockRejectedValueOnce(new Error("network unavailable"));
    const { recordPlaceVisit } = await import("@/app/mark/actions");
    const formData = new FormData();
    formData.set("group_place_id", "00000000-0000-4000-8000-000000000000");
    formData.set("visited_on", "2026-08-01");
    formData.set("opinion_changed", "true");
    formData.set("strength", "1");
    formData.append("tags", "tasty");

    const result = await recordPlaceVisit({}, formData);

    expect(result).toEqual({ error: "保存失败，请检查网络后重试。" });
  });
});
