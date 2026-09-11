import "dotenv/config";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import express from "express";
import { appRouter } from "../routers";
import { registerAttachmentRoutes } from "./attachmentRoutes";
import { createContext } from "./context";
import { registerCronRoutes } from "./cronRoutes";
import { registerOAuthRoutes } from "./oauth";

/**
 * Builds the Express app with every API route (tRPC, attachments, OAuth,
 * cron). No `.listen()`, no static file serving, no Vite dev middleware —
 * those differ between a traditional long-running server
 * (server/_core/index.ts) and a Vercel serverless function (api/[...path].ts),
 * so both entry points import this shared app instead of duplicating routes.
 */
export function createApp() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerOAuthRoutes(app);
  registerAttachmentRoutes(app);
  registerCronRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  return app;
}
