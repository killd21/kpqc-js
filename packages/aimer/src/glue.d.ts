// Type declaration for the Emscripten-generated ESM glue (built artifact, no
// types of its own). The factory instantiates the wasm module.
declare module "*/aimer.mjs" {
  const createAimerModule: (
    moduleArg?: Record<string, unknown>,
  ) => Promise<import("./wasm.js").AimerModule>;
  export default createAimerModule;
}
