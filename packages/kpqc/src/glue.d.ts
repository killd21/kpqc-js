// Type declarations for the Emscripten-generated ESM glue files (built
// artifacts, no types of their own). Each factory instantiates its wasm module.
declare module "*/aimer.mjs" {
  const createAimerModule: (
    moduleArg?: Record<string, unknown>,
  ) => Promise<import("./internal.js").EmscriptenModule>;
  export default createAimerModule;
}

declare module "*/haetae.mjs" {
  const createHaetaeModule: (
    moduleArg?: Record<string, unknown>,
  ) => Promise<import("./internal.js").EmscriptenModule>;
  export default createHaetaeModule;
}

declare module "*/ntruplus.mjs" {
  const createNtruplusModule: (
    moduleArg?: Record<string, unknown>,
  ) => Promise<import("./internal.js").EmscriptenModule>;
  export default createNtruplusModule;
}

declare module "*/smaugt.mjs" {
  const createSmaugtModule: (
    moduleArg?: Record<string, unknown>,
  ) => Promise<import("./internal.js").EmscriptenModule>;
  export default createSmaugtModule;
}
