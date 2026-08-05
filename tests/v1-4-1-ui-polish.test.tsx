import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlaceManagementControl } from "@/components/place/place-management-control";

const root = process.cwd();
const read = (file: string) => readFileSync(resolve(root, file), "utf8");

describe("V1.4.1 UI polish contract", () => {
  it("keeps the management control native and accessible while using the selected local asset", () => {
    const { container } = render(<PlaceManagementControl groupPlaceId="place-1" placeName="示例地点" />);
    const button = container.querySelector<HTMLButtonElement>(".management-menu-button");
    const image = button?.querySelector<HTMLImageElement>("img");

    expect(button).not.toBeNull();
    expect(button).toHaveAttribute("aria-label", "管理示例地点");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-haspopup", "menu");
    expect(image).not.toBeNull();
    expect(image).toHaveAttribute("src", "/images/v1-4-1/place-management-button.png");
    expect(image).toHaveAttribute("alt", "");
    expect(image).toHaveAttribute("aria-hidden", "true");
  });

  it("keeps the chosen asset and alignment rules in the repository", () => {
    const component = read("src/components/place/place-management-control.tsx");
    const css = read("src/app/globals.css");

    expect(statSync(resolve(root, "public/images/v1-4-1/place-management-button.png")).size).toBeGreaterThan(1_000);
    expect(component).toContain("/images/v1-4-1/place-management-button.png");
    expect(component).not.toContain(">···</button>");
    expect(css).toContain(".ui-action,");
    expect(css).toContain(".text-button,");
    expect(css).toContain(".secondary-button,");
    expect(css).toContain(".primary-button,");
    expect(css).toContain("display: inline-flex;");
    expect(css).toContain("align-items: center;");
    expect(css).toContain("justify-content: center;");
    expect(css).toContain(".management-menu-button img");
    expect(css).toContain("pointer-events: none;");
  });
});
