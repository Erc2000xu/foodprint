import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DiscoveryBrowser } from "@/components/map/map-browser";

const replace = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ replace, refresh }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/amap/poi-client", () => ({
  backfillAmapBusinessAreas: vi.fn().mockResolvedValue({ processed: 0, updated: 0 }),
  getAmapBeijingDistricts: vi.fn().mockResolvedValue({ districts: [{ adcode: "110113", name: "顺义区" }] }),
  searchAmapPoiTips: vi.fn().mockResolvedValue({ candidates: [] }),
}));

vi.mock("@/components/map/map-adapter", () => ({
  StaticMapAdapter: () => <div>地图</div>,
}));

describe("V1.3.1 controlled discovery filter menus", () => {
  beforeEach(() => {
    replace.mockClear();
    refresh.mockClear();
  });

  it("keeps only one menu open and excludes uncontrolled scene values", async () => {
    const user = userEvent.setup();
    render(<DiscoveryBrowser places={[]} cuisineOptions={[["cantonese", "粤菜"]]} />);

    await user.click(screen.getByRole("button", { name: "按地点找" }));
    expect(await screen.findByText("行政区 · 来自高德")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "按地点找" })).toHaveAttribute("aria-expanded", "true");

    await user.click(screen.getByRole("button", { name: "按菜系找" }));
    expect(screen.queryByText("行政区 · 来自高德")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "粤菜" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "找灵感" }));
    expect(screen.getByRole("button", { name: "朋友聚会" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下午茶" })).not.toBeInTheDocument();
  });

  it("closes on Escape, outside click and completed selection", async () => {
    const user = userEvent.setup();
    render(<DiscoveryBrowser places={[]} cuisineOptions={[["cantonese", "粤菜"]]} />);

    await user.click(screen.getByRole("button", { name: "找灵感" }));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "找灵感" })).toHaveAttribute("aria-expanded", "false");

    await user.click(screen.getByRole("button", { name: "按菜系找" }));
    await user.click(screen.getByRole("heading", { name: "今天想去哪儿吃？" }));
    expect(screen.getByRole("button", { name: "按菜系找" })).toHaveAttribute("aria-expanded", "false");

    await user.click(screen.getByRole("button", { name: "按地点找" }));
    await user.click(await screen.findByRole("button", { name: "顺义区" }));
    expect(screen.getByRole("button", { name: "按地点找" })).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(replace).toHaveBeenCalledWith(expect.stringContaining("locationName=%E9%A1%BA%E4%B9%89%E5%8C%BA"), { scroll: false }));
  });
});
