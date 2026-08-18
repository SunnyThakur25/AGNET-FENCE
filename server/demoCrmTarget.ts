import type { Express, Request, Response } from "express";
import { randomUUID } from "crypto";

type DemoTargetLog = {
  id: string;
  operation: "case.read" | "customer.export";
  receivedAt: string;
  requestSummary: Record<string, unknown>;
};

const demoTargetLogs: DemoTargetLog[] = [];
const maximumDemoTargetLogs = 50;

function safeRequestSummary(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { payload: "invalid" };
  const payload = value as Record<string, unknown>;
  return {
    fields: Object.keys(payload).sort(),
    customerCount: Array.isArray(payload.customerIds) ? payload.customerIds.length : undefined,
    caseId: typeof payload.caseId === "string" ? payload.caseId : undefined,
  };
}

function record(operation: DemoTargetLog["operation"], req: Request) {
  const entry: DemoTargetLog = {
    id: randomUUID(),
    operation,
    receivedAt: new Date().toISOString(),
    requestSummary: safeRequestSummary(req.body),
  };
  demoTargetLogs.unshift(entry);
  demoTargetLogs.splice(maximumDemoTargetLogs);
  return entry;
}

function sendDisabled(res: Response) {
  return res.status(404).json({ error: "Safe demo target is available only during development." });
}

/**
 * A non-production target used only to demonstrate that AgentFence invokes an
 * integration callback after an allow decision and leaves it untouched after a
 * block. It intentionally retains only a bounded, payload-redacted request log.
 */
export function registerDemoCrmTarget(app: Express) {
  app.get("/api/demo-crm-target/logs", (_req, res) => {
    if (process.env.NODE_ENV === "production") return sendDisabled(res);
    return res.status(200).json({ entries: demoTargetLogs });
  });

  app.delete("/api/demo-crm-target/logs", (_req, res) => {
    if (process.env.NODE_ENV === "production") return sendDisabled(res);
    demoTargetLogs.splice(0);
    return res.status(204).send();
  });

  app.post("/api/demo-crm-target/cases/read", (req, res) => {
    if (process.env.NODE_ENV === "production") return sendDisabled(res);
    const entry = record("case.read", req);
    return res.status(200).json({ requestId: entry.id, case: { id: "CASE-DEMO-001", status: "open", synthetic: true } });
  });

  app.post("/api/demo-crm-target/exports", (req, res) => {
    if (process.env.NODE_ENV === "production") return sendDisabled(res);
    const entry = record("customer.export", req);
    return res.status(202).json({ requestId: entry.id, accepted: true, synthetic: true });
  });
}
