import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  esbuildPlugins: [
    {
      // Keep the Emscripten glue out of the bundle. It is loaded at runtime via
      // dynamic import() so its `import.meta.url` keeps pointing at wasm/, where
      // ntruplus.wasm lives beside it. Bundling it would break wasm resolution.
      name: "external-wasm-glue",
      setup(build) {
        build.onResolve({ filter: /ntruplus\.mjs$/ }, (args) => ({
          path: args.path,
          external: true,
        }));
      },
    },
  ],
});
