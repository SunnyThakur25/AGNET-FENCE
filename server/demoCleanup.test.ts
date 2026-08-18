import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectFile = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));

describe("temporary CRM demo cleanup", () => {
  it("does not retain the development-only target server, test fixture, report, or guarded-call example", () => {
    expect(existsSync(projectFile("server/demoCrmTarget.ts"))).toBe(false);
    expect(existsSync(projectFile("server/demoCrmTarget.test.ts"))).toBe(false);
    expect(existsSync(projectFile("GATEWAY_PROXY_DEMO_REPORT.md"))).toBe(false);
    expect(existsSync(projectFile("examples/guarded-external-api-call.ts"))).toBe(false);
  });

  it("does not mount the removed demo target from the production server entry point", () => {
    const serverEntry = readFileSync(projectFile("server/_core/index.ts"), "utf8");
    expect(serverEntry).not.toContain("registerDemoCrmTarget");
    expect(serverEntry).not.toContain("demoCrmTarget");
  });
});
