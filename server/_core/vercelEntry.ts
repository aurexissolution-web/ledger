import path from "node:path";
import { createApp } from "./app";

const app = createApp();

// vercel.json rewrites every non-static-file request to this one function
// (the exact pattern Vercel's own Express guide documents:
// https://vercel.com/guides/using-express-with-vercel). Any request that
// reaches here without matching an API route above is a client-side route
// (e.g. /subcon) or the app shell itself — serve the built SPA's
// index.html so wouter can take over. Real static assets
// (dist/public/assets/*) are served directly by Vercel's CDN via
// static-file priority before this function is ever invoked; only
// index.html itself is force-included into this function's deployment via
// vercel.json's functions.includeFiles, since it isn't reachable through a
// JS import for Vercel's bundler to trace automatically.
app.get("*", (_req, res) => {
  res.sendFile(path.resolve(process.cwd(), "dist/public/index.html"));
});

export default app;
