import { createApp } from "./app";

// Source for the Vercel serverless function. Built by `vercel.json`'s
// buildCommand into a single self-contained api/index.js (via esbuild
// --bundle), rather than shipping this as api/index.ts directly — Vercel's
// own per-file TypeScript compiler + file tracer failed to include our local
// server/shared files in the deployed function (ERR_MODULE_NOT_FOUND at
// runtime for server/_core/app), even though the build itself succeeded.
// Pre-bundling avoids depending on that tracer working correctly at all.
export default createApp();
