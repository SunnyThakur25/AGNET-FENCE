import express from "express";
import { createServer } from "http";
import { afterEach, describe, expect, it } from "vitest";
import { registerDemoCrmTarget } from "./demoCrmTarget";

async function withTarget<T>(run: (baseUrl: string) => Promise<T>) {
  const app = express();
  app.use(express.json());
  registerDemoCrmTarget(app);
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP address.");
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

describe("demo CRM target", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("records only an accepted development safe-demo request with a redacted summary", async () => {
    process.env.NODE_ENV = "development";
    await withTarget(async baseUrl => {
      await fetch(`${baseUrl}/api/demo-crm-target/logs`, { method: "DELETE" });
      const response = await fetch(`${baseUrl}/api/demo-crm-target/cases/read`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caseId: "CASE-DEMO-001", internalNote: "do-not-store" }),
      });
      expect(response.status).toBe(200);
      const logs = await (await fetch(`${baseUrl}/api/demo-crm-target/logs`)).json() as { entries: Array<{ operation: string; requestSummary: Record<string, unknown> }> };
      expect(logs.entries).toHaveLength(1);
      expect(logs.entries[0]).toMatchObject({ operation: "case.read", requestSummary: { caseId: "CASE-DEMO-001", fields: ["caseId", "internalNote"] } });
      expect(JSON.stringify(logs.entries[0])).not.toContain("do-not-store");
    });
  });

  it("does not expose the target in production mode", async () => {
    process.env.NODE_ENV = "production";
    await withTarget(async baseUrl => {
      const response = await fetch(`${baseUrl}/api/demo-crm-target/logs`);
      expect(response.status).toBe(404);
    });
  });
});
