// Low-level access to the AIMer wasm module: lazy single-instance loading plus
// small helpers for moving bytes across the wasm heap boundary. This module is
// internal; the public API lives in index.ts.

/** Minimal shape of the Emscripten module instance we rely on. */
export interface AimerModule {
  _malloc(size: number): number;
  _free(ptr: number): void;
  _randombytes_init(entropy: number, perso: number, strength: number): void;
  _aimer_use_secure_rng(): void;
  getValue(ptr: number, type: "i32"): number;
  HEAPU8: Uint8Array;
  // Namespaced crypto_sign_* exports, e.g.
  // _samsungsds_aimer_128f_ref_crypto_sign_keypair(pk, sk).
  [exported: string]: unknown;
}

let modulePromise: Promise<AimerModule> | undefined;

/** Instantiate (once) and return the shared wasm module instance. */
export async function loadAimer(): Promise<AimerModule> {
  if (!modulePromise) {
    modulePromise = import("../wasm/aimer.mjs").then((m) => m.default());
  }
  return modulePromise;
}

/** Call `fn` with freshly allocated heap pointers, freeing them afterwards. */
export function withHeap<T>(
  mod: AimerModule,
  sizes: number[],
  fn: (...ptrs: number[]) => T,
): T {
  const ptrs = sizes.map((s) => mod._malloc(s));
  try {
    return fn(...ptrs);
  } finally {
    for (const p of ptrs) mod._free(p);
  }
}

export const writeBytes = (mod: AimerModule, ptr: number, bytes: Uint8Array) =>
  mod.HEAPU8.set(bytes, ptr);

export const readBytes = (mod: AimerModule, ptr: number, len: number) =>
  mod.HEAPU8.slice(ptr, ptr + len);

/** Resolve a namespaced exported function by name. */
export function fn(
  mod: AimerModule,
  name: string,
): (...args: number[]) => number {
  const f = mod[name];
  if (typeof f !== "function") {
    throw new Error(`AIMer wasm export not found: ${name}`);
  }
  return f as (...args: number[]) => number;
}
