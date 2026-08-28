import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("V2.4.2 mobile viewport contracts", () => {
  it("keeps the selected action row fixed and gives every action a real target", () => {
    const css = read("src/app/globals.css");
    const sheet = read("src/components/map/viewport-place-sheet.tsx");
    expect(css).toContain(".viewport-sheet--place_preview { height: clamp(260px, 34dvh, 360px);");
    expect(css).toContain("max-height: calc(100dvh - 124px - var(--app-bottom-nav-height)");
    expect(css).toContain(".viewport-sheet__preview-content { min-height: 0; flex: 1 1 auto; overflow-y: auto;");
    expect(css).toContain(".viewport-sheet__selected-actions { display: grid;");
    expect(css).toContain(".viewport-sheet__selected-actions .primary-link { min-width: 0; min-height: 44px;");
    expect(css).toContain(".viewport-sheet__selected-actions .text-button { min-width: 0; min-height: 44px;");
    expect(sheet.indexOf("</div><div className=\"viewport-sheet__selected-actions\">")).toBeGreaterThan(sheet.indexOf("viewport-sheet__preview-content"));
    expect(sheet).toContain("查看详情");
    expect(sheet).toContain("看看附近另外");
  });
});
