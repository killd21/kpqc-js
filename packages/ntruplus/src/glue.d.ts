// Type declaration for the Emscripten-generated ESM glue (built artifact, no
// types of its own). The factory instantiates the wasm module.
declare module "*/ntruplus.mjs" {
  const createNtruplusModule: (
    moduleArg?: Record<string, unknown>,
  ) => Promise<import("./wasm.js").NtruplusModule>;
  export default createNtruplusModule;
}
