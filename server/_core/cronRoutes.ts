import type { Express } from "express";
import { sweepOrphans } from "../attachments";
import { ping } from "../db";

/**
 * Vercel Cron Jobs sign requests with `Authorization: Bearer <CRON_SECRET>`
 * when the CRON_SECRET env var is set on the project — see vercel.json's
 * `crons` entry. On other hosts this route is simply unused (nothing calls
 * it), so it's harmless to always register.
 */
export function registerCronRoutes(app: Express) {
  app.get("/api/cron/sweep-orphans", async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    try {
      // Runs daily even when nobody opens the app, so this query also keeps
      // the Supabase free-plan project from pausing after a week of inactivity.
      await ping();
      const removed = await sweepOrphans();
      res.json({ removed });
    } catch (error) {
      console.error("[Cron] Orphan sweep failed:", error);
      res.status(500).json({ error: "Sweep failed" });
    }
  });
}
