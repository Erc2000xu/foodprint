import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SiteComplianceFooter } from "@/components/compliance/site-compliance-footer";

const filingUrl = "https://beian.miit.gov.cn/";

describe("SiteComplianceFooter", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stays invisible until an exact ICP number is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_ICP_RECORD", "");
    const { container } = render(<SiteComplianceFooter />);

    expect(container).toBeEmptyDOMElement();
  });

  it("centers the configured filing number and links it to MIIT", () => {
    vi.stubEnv("NEXT_PUBLIC_ICP_RECORD", "京ICP备12345678号-1");
    render(<SiteComplianceFooter />);

    const record = screen.getByRole("link", { name: "京ICP备12345678号-1" });
    const queryLink = screen.getByRole("link", { name: "工信部备案查询" });
    expect(record).toHaveAttribute("href", filingUrl);
    expect(record).toHaveAttribute("target", "_blank");
    expect(record).toHaveAttribute("rel", "noopener noreferrer");
    expect(queryLink).toHaveAttribute("href", filingUrl);
    expect(screen.getByRole("contentinfo", { name: "网站备案信息" })).toBeInTheDocument();
  });

  it("keeps the app footer above the fixed bottom navigation", async () => {
    const css = await import("node:fs").then(({ readFileSync }) => readFileSync("src/app/globals.css", "utf8"));

    expect(css).toContain(".app-shell + .site-compliance-footer");
    expect(css).toContain("margin-bottom: calc(68px + env(safe-area-inset-bottom))");
  });
});
