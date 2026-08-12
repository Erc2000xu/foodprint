import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { userFacingError } from "@/lib/user-facing-error";

const root = process.cwd();
const read = (file: string) => readFileSync(resolve(root, file), "utf8");

describe("V1.4 typography and copy contract", () => {
  it("ships both local font assets and wires them through the global tokens", () => {
    const css = read("src/app/globals.css");
    expect(statSync(resolve(root, "public/fonts/source-han-sans-sc-v2.005.woff2")).size).toBeGreaterThan(100_000);
    expect(statSync(resolve(root, "public/fonts/zcool-xiaowei-v15-subset.woff2")).size).toBeGreaterThan(1_000);
    expect(css).toContain("--font-ui");
    expect(css).toContain("--font-display");
    expect(css).toContain("/fonts/source-han-sans-sc-ui-v2-2.woff2");
    expect(css).toContain("/fonts/zcool-xiaowei-v15-subset.woff2");
  });

  it("keeps creative typography limited to the four approved page headings", () => {
    const files = ["src/components/map/map-browser.tsx", "src/components/try/try-list.tsx", "src/components/mark/mark-flow.tsx", "src/app/activity/page.tsx"];
    const source = files.map(read).join("\n");
    expect(source.match(/className="creative-title"/g)).toHaveLength(4);
    for (const title of ["今天想去哪儿吃？", "想去的地方，先记在这里。", "把这一顿，好好记下来。", "吃过以后，留下几句话。"]) expect(source).toContain(title);
  });

  it("maps technical failures to stable Chinese UI messages", () => {
    expect(userFacingError(new Error("JWT expired"))).toBe("请先登录后再继续。");
    expect(userFacingError(new Error("network timeout"))).toBe("网络有点忙，请稍后再试。");
    expect(userFacingError(new Error("database constraint failed"))).toBe("操作没有完成，请再试一次。");
  });
});
