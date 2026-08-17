import type { Express, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { siemDeliverySettings } from "../drizzle/schema";
import { runSiemDelivery } from "./agentfence/siemDelivery";
import { getDb } from "./db";
import { sdk } from "./_core/sdk";

export function registerScheduledSiemDelivery(app: Express) {
  app.post("/api/scheduled/siem-delivery", async (req: Request, res: Response) => {
    let taskUid: string | undefined;
    try {
      const user = await sdk.authenticateRequest(req);
      taskUid = user.taskUid;
      if (!user.isCron || !taskUid) return res.status(403).json({ error: "cron-only" });
      const db = await getDb();
      if (!db) throw new Error("DATABASE_UNAVAILABLE");
      const [setting] = await db.select().from(siemDeliverySettings).where(eq(siemDeliverySettings.scheduleCronTaskUid, taskUid)).limit(1);
      if (!setting || !setting.enabled) return res.json({ ok: true, skipped: "orphan_or_disabled" });
      const result = await runSiemDelivery(setting.id);
      return res.json({ ok: true, result });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown_error";
      return res.status(500).json({ error: "siem_delivery_failed", detail, context: { url: req.originalUrl, taskUid: taskUid ?? null }, timestamp: new Date().toISOString() });
    }
  });
}
