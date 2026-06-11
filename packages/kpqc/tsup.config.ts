import { defineConfig } from "tsup";

export default defineConfig({
  // Flat entries: every output sits directly in dist/, so the runtime-relative
  // "../wasm/<algo>.mjs" import resolves identically from source (src/) and
  // from the built files (dist/).
  entry: {
    index: "src/index.ts",
    aimer: "src/aimer.ts",
    haetae: "src/haetae.ts",
    ntruplus: "src/ntruplus.ts",
    smaugt: "src/smaugt.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  esbuildPlugins: [
    {
      // Keep the Emscripten glue out of the bundle. It is loaded at runtime via
      // dynamic import() so its `import.meta.url` keeps pointing at wasm/, where
      // the .wasm files live beside it. Bundling it would break wasm resolution.
      name: "external-wasm-glue",
      setup(build) {
        build.onResolve({ filter: /\/(aimer|haetae|ntruplus|smaugt)\.mjs$/ }, (args) => ({
          path: args.path,
          external: true,
        }));
      },
    },
  ],
});
