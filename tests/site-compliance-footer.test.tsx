import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SiteComplianceFooter } from "@/components/compliance/site-compliance-footer";
import { FOODPRINT_ICP_RECORD, isValidIcpRecord } from "@/lib/compliance/icp";

const filingUrl = "https://beian.miit.gov.cn/";

describe("SiteComplianceFooter", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("always renders the confirmed filing record when the environment is empty", () => {
    vi.stubEnv("NEXT_PUBLIC_ICP_RECORD", "");
    render(<SiteComplianceFooter />);
    expect(screen.getByRole("link", { name: FOODPRINT_ICP_RECORD })).toBeInTheDocument();
  });

  it("centers the confirmed filing number and links it to MIIT", () => {
    vi.stubEnv("NEXT_PUBLIC_ICP_RECORD", FOODPRINT_ICP_RECORD);
    render(<SiteComplianceFooter />);

    const record = screen.getByRole("link", { name: FOODPRINT_ICP_RECORD });
    const queryLink = screen.getByRole("link", { name: "工信部备案查询" });
    expect(record).toHaveAttribute("href", filingUrl);
    expect(record).toHaveAttribute("target", "_blank");
    expect(record).toHaveAttribute("rel", "noopener noreferrer");
    expect(queryLink).toHaveAttribute("href", filingUrl);
    expect(screen.getByRole("contentinfo", { name: "网站备案信息" })).toBeInTheDocument();
  });

  it("rejects a mismatched deployment override", () => {
    vi.stubEnv("NEXT_PUBLIC_ICP_RECORD", "京ICP备12345678号-1");
    expect(() => render(<SiteComplianceFooter />)).toThrow(/NEXT_PUBLIC_ICP_RECORD/);
  });

  it("only accepts the exact public filing value", () => {
    expect(isValidIcpRecord(FOODPRINT_ICP_RECORD)).toBe(true);
    expect(isValidIcpRecord("京ICP备2026047829号")).toBe(false);
    expect(isValidIcpRecord(undefined)).toBe(false);
  });

  it("keeps the app footer above the fixed bottom navigation", async () => {
    const css = await import("node:fs").then(({ readFileSync }) => readFileSync("src/app/globals.css", "utf8"));

    expect(css).toContain(".app-shell + .site-compliance-footer");
    expect(css).toContain("margin-bottom: calc(68px + env(safe-area-inset-bottom))");
  });
});
