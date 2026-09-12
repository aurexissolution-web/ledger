import type { Express } from "express";
import { ping } from "../db";

/**
 * Public health check for uptime monitors (e.g. UptimeRobot every 5 minutes).
 * It runs one tiny database query — which also keeps the Supabase free-plan
 * project from pausing — and returns only up/down, never any data.
 */
export function registerHealthRoutes(app: Express) {
  app.get("/api/health", async (_req, res) => {
    const started = Date.now();
    res.set("Cache-Control", "no-store");
    try {
      await ping();
      res.json({ ok: true, database: "up", ms: Date.now() - started });
    } catch (error) {
      console.error("[Health] Database check failed:", error);
      res.status(503).json({ ok: false, database: "down" });
    }
  });
}
