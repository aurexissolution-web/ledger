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
// The build command bundles this file to dist/vercel/index.js, and the
// committed api/index.js re-exports it: Vercel only creates functions for
// files that exist in the repo, so the bundle can't be written to api/
// directly. index.html is inlined as a string at build time (esbuild's
// --loader:.html=text) so the function never reads it from disk.
app.get("*", (_req, res) => {
  res.set("Content-Type", "text/html").send(indexHtml);
});

export default app;
