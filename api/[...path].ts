import { createApp } from "../server/_core/app";

// Vercel serverless entry point. The `[...path]` filename is Vercel's
// catch-all convention, so every request under /api/** (tRPC, attachments,
// OAuth callback, cron) is routed to this one function. Vercel passes the
// original request through with req.url intact, and an Express app is a
// valid (req, res) handler, so no adapter is needed — see
// https://vercel.com/guides/using-express-with-vercel.
//
// This does NOT serve the built client or run the dev/production static
// file server (server/_core/index.ts does that for a traditional host) —
// on Vercel, static assets under dist/public are served directly by the
// platform; see vercel.json.
export default createApp();
