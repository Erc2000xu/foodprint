import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { FOODPRINT_ICP_RECORD, MIIT_FILING_URL } from "@/lib/compliance/icp";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("V2.4 compliance build gate", () => {
  it("keeps the footer unconditional at the root layout boundary", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain("<SiteComplianceFooter />");
    expect(layout).not.toMatch(/NEXT_PUBLIC_ICP_RECORD[\s\S]*return null/);
  });

  it("requires the exact filing value in release and container paths", () => {
    const dockerfile = read("Dockerfile");
    const workflow = read(".github/workflows/release.yml");
    const verifier = read("scripts/verify-icp-record.mjs");
    const buildVerifier = read("scripts/verify-icp-build.mjs");
    expect(dockerfile).toContain("node scripts/verify-icp-record.mjs --required");
    expect(workflow).toContain("npm run verify:icp -- --required");
    expect(workflow).toContain("PRODUCTION_NEXT_PUBLIC_ICP_RECORD");
    expect(verifier).toContain(FOODPRINT_ICP_RECORD);
    expect(buildVerifier).toContain(MIIT_FILING_URL);
  });

  it("passes the exact override and rejects missing or mismatched required values", () => {
    const script = path.join(root, "scripts/verify-icp-record.mjs");
    const run = (value?: string) => execFileSync(process.execPath, [script, "--required"], {
      cwd: root,
      env: value === undefined ? { ...process.env, NEXT_PUBLIC_ICP_RECORD: "" } : { ...process.env, NEXT_PUBLIC_ICP_RECORD: value },
      stdio: "pipe",
    }).toString();

    expect(run(FOODPRINT_ICP_RECORD)).toContain('"valid":true');
    expect(() => run()).toThrow();
    expect(() => run("京ICP备12345678号-1")).toThrow();
  });
});
