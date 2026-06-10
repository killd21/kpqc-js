import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // HAETAE signing uses rejection sampling and can take a while, especially
    // for the higher security modes.
    testTimeout: 120000,
    hookTimeout: 120000,
  },
  // The Emscripten glue is a prebuilt artifact; don't let Vite transform it.
  ssr: {
    external: ["../wasm/haetae.mjs"],
  },
});
