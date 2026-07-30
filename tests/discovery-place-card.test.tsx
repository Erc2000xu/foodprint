import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DiscoveryPlaceCard } from "@/components/discover/discovery-place-card";
import type { MapPlace } from "@/components/map/amap-map";

const basePlace: MapPlace = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "一间名字很长但值得专门去吃的餐厅",
  category: "restaurant",
  latitude: 39.9,
  longitude: 116.4,
  averageRating: 5,
  markCount: 3,
  recommendCount: 3,
  sceneTags: ["friends_gathering"],
  city: "北京市",
  district: "北京市顺义区",
  businessAreaName: "后沙峪",
  pricePerPerson: 0,
  recommendedItems: ["烧鹅", "虾饺", "叉烧"],
  bowlStrength: 3,
  goodTagCounts: { tasty: 3, comfortable: 2, good_for_chat: 1, good_value: 1 },
};

describe("V1.3.1 discovery place card", () => {
  it("shows the normalized location, all opinion dimensions and a bounded dish preview", () => {
    render(<DiscoveryPlaceCard place={basePlace} href="/place/1" cuisineLabel="粤菜" categoryLabel="餐厅" />);

    expect(screen.getByText("粤菜 · 北京市 · 顺义区 · 后沙峪")).toBeInTheDocument();
    expect(screen.getByText("人均 ¥0")).toBeInTheDocument();
    expect(screen.getByText(/会专门去/)).toBeInTheDocument();
    const opinionCounts = screen.getByLabelText("朋友觉得好在哪儿");
    expect(opinionCounts).toHaveTextContent("吃得香");
    expect(opinionCounts).toHaveTextContent("坐得住");
    expect(opinionCounts).toHaveTextContent("聊得开");
    expect(opinionCounts).toHaveTextContent("花得值");
    expect(screen.getByText("烧鹅、虾饺，等 1 道")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "加入下回吃" })).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps legacy scenes separate when no new opinion counts exist", () => {
    render(<DiscoveryPlaceCard place={{ ...basePlace, goodTagCounts: {}, bowlStrength: null, recommendedItems: [] }} href="/place/1" categoryLabel="餐厅" />);

    expect(screen.queryByLabelText("朋友觉得好在哪儿")).not.toBeInTheDocument();
    expect(screen.getByText("适合：朋友聚会")).toBeInTheDocument();
  });
});
