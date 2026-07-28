import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShell } from "../src/components/shell/app-shell";

describe("AppShell", () => {
  it("keeps all five main navigation destinations accessible", () => {
    render(<AppShell><p>内容</p></AppShell>);

    expect(screen.getByRole("navigation", { name: "主导航" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /发现/ })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /发现/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /去试试/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /记一顿/ })).toBeInTheDocument();
    expect(screen.getByText("内容")).toBeInTheDocument();
  });
});
