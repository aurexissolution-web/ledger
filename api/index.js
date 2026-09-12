// Vercel only deploys functions for files committed under api/, so this file
// must live in the repo. It re-exports the server bundle that the build
// command (see vercel.json) writes to dist/vercel/ from
// server/_core/vercelEntry.ts.
export { default } from "../dist/vercel/index.js";
