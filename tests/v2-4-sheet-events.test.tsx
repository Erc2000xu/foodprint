import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ViewportPlaceSheet } from "@/components/map/viewport-place-sheet";
import type { DiscoveryPlace } from "@/lib/discovery/types";

const place: DiscoveryPlace = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "河畔小馆",
  category: "restaurant",
  latitude: 39.9,
  longitude: 116.4,
  city: "北京市",
  district: "顺义区",
  sceneTags: [],
  bowlStrength: 3,
  markCount: 2,
};

function props(status: "summary" | "place_preview" | "viewport_list") {
  return {
    places: [place],
    selectedPlace: status === "place_preview" ? place : undefined,
    status,
    filterSummary: "餐厅 · 推荐等级 1",
    onStatusChange: vi.fn(),
    onSelectPlace: vi.fn(),
    onClearSelection: vi.fn(),
    onOpenDetail: vi.fn(),
    onOpenViewportList: vi.fn(),
    onOpenAll: vi.fn(),
  };
}

describe("V2.4 semantic viewport sheet events", () => {
  it("uses the summary tap as an alternative to an upward gesture", () => {
    const sheetProps = props("summary");
    render(<ViewportPlaceSheet {...sheetProps} />);

    expect(screen.getByText("当前范围 · 1 家")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /上拉查看列表/ }));
    expect(sheetProps.onOpenViewportList).toHaveBeenCalledTimes(1);
  });

  it("keeps preview and viewport list mutually exclusive", () => {
    const previewProps = props("place_preview");
    const { rerender } = render(<ViewportPlaceSheet {...previewProps} />);
    expect(screen.getByRole("heading", { name: "河畔小馆" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "选择 河畔小馆" })).not.toBeInTheDocument();

    const listProps = props("viewport_list");
    rerender(<ViewportPlaceSheet {...listProps} />);
    fireEvent.click(screen.getByRole("button", { name: "选择 河畔小馆" }));
    expect(listProps.onSelectPlace).toHaveBeenCalledWith(place.id);
  });
});
