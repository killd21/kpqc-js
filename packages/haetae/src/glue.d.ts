// Type declaration for the Emscripten-generated ESM glue (built artifact, no
// types of its own). The factory instantiates the wasm module.
declare module "*/haetae.mjs" {
  const createHaetaeModule: (
    moduleArg?: Record<string, unknown>,
  ) => Promise<import("./wasm.js").HaetaeModule>;
  export default createHaetaeModule;
}
