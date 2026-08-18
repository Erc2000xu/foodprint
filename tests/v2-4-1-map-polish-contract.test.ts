import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("V2.4.1 map polish and UI-02 asset contract", () => {
  it("renders the map popover outside the horizontally scrolling chip row", () => {
    const browser = read("src/components/map/map-browser.tsx");
    const css = read("src/app/globals.css");
    expect(browser).toContain('className="map-filter-popover-layer"');
    const rowStart = browser.indexOf('className="map-filter-row"');
    const popoverStart = browser.indexOf('className="map-filter-popover-layer"');
    expect(rowStart).toBeGreaterThanOrEqual(0);
    expect(popoverStart).toBeGreaterThan(rowStart);
    expect(browser.slice(rowStart, popoverStart)).not.toContain("renderMapFilterMenu");
    expect(browser).toContain("getBoundingClientRect");
    expect(browser).toContain('window.addEventListener("popstate"');
    expect(css).toContain(".map-filter-popover-layer { position: relative;");
    expect(css).toContain("overscroll-behavior: contain;");
    expect(css).toContain("max-height: 46dvh");
  });

  it("uses the formal locate PNG srcset, SVG fallback, 44px hit target, and safe-area toast", () => {
    const browser = read("src/components/map/map-browser.tsx");
    const css = read("src/app/globals.css");
    const manifest = JSON.parse(read("public/icons/map-controls/locate-current.manifest.json")) as { runtimeContract: { cssWidth: number; cssHeight: number; buttonMinimumWidth: number; buttonMinimumHeight: number; srcSet: string; fallback: string } };
    expect(browser).not.toContain("⌖");
    expect(browser).toContain("locate-current-26.png");
    expect(browser).toContain("locate-current-52.png 2x");
    expect(browser).toContain("locate-current-78.png 3x");
    expect(browser).toContain("locate-current.svg");
    expect(browser).toContain('aria-live="polite"');
    expect(css).toContain("width: 44px; height: 44px; display: grid; place-items: center;");
    expect(css).toContain("--map-sheet-height, 76px");
    expect(css).toContain("--app-bottom-nav-height");
    expect(manifest.runtimeContract).toMatchObject({ cssWidth: 26, cssHeight: 26, buttonMinimumWidth: 44, buttonMinimumHeight: 44 });
    expect(manifest.runtimeContract.srcSet).toContain("locate-current-78.png 3x");
    expect(manifest.runtimeContract.fallback).toBe("/icons/map-controls/locate-current.svg");
  });

  it("keeps all formal PNG exports as true-alpha RGBA files with expected dimensions", () => {
    const assets = [
      ["public/icons/map-controls/locate-current-26.png", 26],
      ["public/icons/map-controls/locate-current-52.png", 52],
      ["public/icons/map-controls/locate-current-78.png", 78],
      ["public/icons/map-controls/locate-current-ui.png", 256],
      ["public/icons/map-controls/locate-current-master.png", 1024],
    ] as const;
    for (const [file, size] of assets) {
      const bytes = fs.readFileSync(path.join(root, file));
      expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(bytes.readUInt32BE(16)).toBe(size);
      expect(bytes.readUInt32BE(20)).toBe(size);
      expect(bytes[25]).toBe(6); // RGBA color type in the IHDR chunk.
    }
  });
});
