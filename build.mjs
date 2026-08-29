import * as esbuild from "esbuild";
import { cp, rm, mkdir } from "node:fs/promises";

const watch = process.argv.includes("--watch");

// The Anthropic SDK lazily `await import("node:fs")` when it resolves credentials
// from disk (ant auth profiles, workload identity token files). We always construct
// the client with an explicit apiKey, so those branches never execute in the
// extension. Stubbing the specifiers lets the bundle build; the stub throws a named
// error if one of those paths is ever actually reached, rather than failing silently.
const stubNodeBuiltins = {
  name: "stub-node-builtins",
  setup(build) {
    build.onResolve({ filter: /^node:/ }, (args) => ({ path: args.path, namespace: "node-stub" }));
    build.onLoad({ filter: /.*/, namespace: "node-stub" }, (args) => ({
      loader: "js",
      contents: `
        const unavailable = (prop) => () => {
          throw new Error("[riposte] ${args.path}." + prop + " is not available in a browser extension build.");
        };
        export default new Proxy({}, { get: (_, prop) => unavailable(String(prop)) });
      `,
    }));
  },
};

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await cp("public", "dist", { recursive: true });

const shared = {
  bundle: true,
  platform: "browser",
  target: "chrome120",
  outdir: "dist",
  logLevel: "info",
  plugins: [stubNodeBuiltins],
};

// The MV3 service worker is declared as "type": "module", so it ships as ESM.
// Content scripts and the options page cannot use ESM imports, so they ship as IIFE.
const contexts = await Promise.all([
  esbuild.context({ ...shared, entryPoints: ["src/background.js"], format: "esm" }),
  esbuild.context({ ...shared, entryPoints: ["src/content.js", "src/options.js"], format: "iife" }),
]);

if (watch) {
  await Promise.all(contexts.map((c) => c.watch()));
  console.log("watching, reload the extension in chrome://extensions after each rebuild");
} else {
  await Promise.all(contexts.map((c) => c.rebuild()));
  await Promise.all(contexts.map((c) => c.dispose()));
  console.log("built to dist/");
}
