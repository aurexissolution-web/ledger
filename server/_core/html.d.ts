// Lets vercelEntry.ts import the built index.html as a plain string (via
// esbuild's --loader:.html=text, configured in vercel.json's buildCommand).
// The wildcard pattern means TypeScript trusts this without the file needing
// to exist on disk during `tsc` — dist/public/index.html only exists after
// `vite build` has run.
declare module "*.html" {
  const content: string;
  export default content;
}
