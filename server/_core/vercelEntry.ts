import indexHtml from "../../dist/public/index.html";
import { createApp } from "./app";

const app = createApp();

// vercel.json rewrites every non-static-file request to this one function
// (the exact pattern Vercel's own Express guide documents:
// https://vercel.com/guides/using-express-with-vercel). Any request that
// reaches here without matching an API route above is a client-side route
// (e.g. /subcon) or the app shell itself — serve the built SPA's
// index.html so wouter can take over. Real static assets
// (dist/public/assets/*) are served directly by Vercel's CDN via
// static-file priority before this function is ever invoked.
//
// index.html is imported above and inlined into this bundle as a plain
// string at build time (esbuild's --loader:.html=text) rather than read
// from disk at runtime — Vercel's `functions.includeFiles` config requires
// the target to be a committed source file, which api/index.js isn't (it's
// generated fresh by the build), so runtime file access isn't an option.
app.get("*", (_req, res) => {
  res.set("Content-Type", "text/html").send(indexHtml);
});

export default app;
