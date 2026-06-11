import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 120000,
    hookTimeout: 120000,
  },
  // The Emscripten glue is a prebuilt artifact; don't let Vite transform it.
  ssr: {
    external: ["../wasm/ntruplus.mjs"],
  },
});
