import { createApp } from "../server/_core/app";

// Vercel serverless entry point. By itself this filename only matches the
// exact paths /api and /api/index — vercel.json's rewrites forward every
// /api/** request here (tRPC, attachments, OAuth callback, cron) with the
// original path preserved on req.url, and an Express app is a valid
// (req, res) handler, so no adapter is needed. This is Vercel's own
// documented pattern for plain Express apps:
// https://vercel.com/guides/using-express-with-vercel
//
// This does NOT serve the built client or run the dev/production static
// file server (server/_core/index.ts does that for a traditional host) —
// on Vercel, static assets under dist/public are served directly by the
// platform; see vercel.json.
export default createApp();
