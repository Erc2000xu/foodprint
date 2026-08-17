import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("V2.4 map-first layout contracts", () => {
  it("uses the map shell variant and removes the legacy card frame in map mode", () => {
    const css = read("src/app/globals.css");
    const browser = read("src/components/map/map-browser.tsx");
    const shell = read("src/components/shell/app-shell.tsx");
    expect(shell).toContain('variant === "map" ? " app-shell--map"');
    expect(browser).toContain('className={`home-explorer${mapMode ? " home-explorer--map" : ""}`}');
    expect(css).toContain(".dynamic-map-shell { z-index: 0; height: 100dvh; min-height: 560px; margin: 0; overflow: hidden; border: 0; border-radius: 0;");
    expect(css).toContain("backdrop-filter: blur(16px) saturate(1.04)");
  });

  it("keeps the three semantic states, real hit targets and isolated list scrolling", () => {
    const reducer = read("src/components/map/viewport-place-sheet-reducer.ts");
    const css = read("src/app/globals.css");
    expect(reducer).toContain('"summary" | "place_preview" | "viewport_list"');
    expect(css).toContain(".viewport-sheet--summary { height: 76px; }");
    expect(css).toContain(".viewport-sheet--place_preview { height: 190px; }");
    expect(css).toContain(".viewport-sheet--viewport_list { height: clamp(320px, 46dvh, 420px); }");
    expect(css).not.toMatch(/viewport-sheet--(peek|card|half|expanded)/);
    expect(css).toContain(".viewport-sheet__content { min-height: 0; flex: 1; overflow-y: auto;");
    expect(css).toContain(".viewport-sheet__place-row > a { min-width: 44px; min-height: 44px;");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("does not style or move provider-owned attribution DOM", () => {
    const source = `${read("src/app/globals.css")}\n${read("src/components/map/map-adapter.tsx")}`;
    expect(source).not.toMatch(/\.amap-(logo|copyright)/);
  });
});
