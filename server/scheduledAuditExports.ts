import type { Express, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { auditExportSchedules } from "../drizzle/schema";
import { runScheduledEvidenceExport } from "./agentfence/evidenceExportService";
import { getDb } from "./db";
import { sdk } from "./_core/sdk";

export function registerScheduledAuditExports(app: Express) {
  app.post("/api/scheduled/audit-export", async (req: Request, res: Response) => {
    let taskUid: string | undefined;
    try {
      const user = await sdk.authenticateRequest(req);
      taskUid = user.taskUid;
      if (!user.isCron || !taskUid) return res.status(403).json({ error: "cron-only" });
      const db = await getDb();
      if (!db) throw new Error("DATABASE_UNAVAILABLE");
      const [schedule] = await db.select().from(auditExportSchedules).where(eq(auditExportSchedules.scheduleCronTaskUid, taskUid)).limit(1);
      if (!schedule || schedule.status !== "active") return res.json({ ok: true, skipped: "orphan_or_inactive" });
      const result = await runScheduledEvidenceExport(schedule.id);
      return res.json({ ok: true, result });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown_error";
      return res.status(500).json({ error: "audit_export_failed", detail, context: { url: req.originalUrl, taskUid: taskUid ?? null }, timestamp: new Date().toISOString() });
    }
  });
}
