// Low-level access to the HAETAE wasm module: lazy single-instance loading plus
// small helpers for moving bytes across the wasm heap boundary. This module is
// internal; the public API lives in index.ts.

/** Minimal shape of the Emscripten module instance we rely on. */
export interface HaetaeModule {
  _malloc(size: number): number;
  _free(ptr: number): void;
  _randombytes_init(entropy: number, perso: number, strength: number): void;
  _haetae_use_secure_rng(): void;
  getValue(ptr: number, type: "i32"): number;
  HEAPU8: Uint8Array;
  // Namespaced API exports, e.g.
  // _cryptolab_haetae_mode2_signature(sig, siglen, m, mlen, ctx, ctxlen, sk).
  [exported: string]: unknown;
}

let modulePromise: Promise<HaetaeModule> | undefined;

/** Instantiate (once) and return the shared wasm module instance. */
export async function loadHaetae(): Promise<HaetaeModule> {
  if (!modulePromise) {
    modulePromise = import("../wasm/haetae.mjs").then((m) => m.default());
  }
  return modulePromise;
}

/** Call `fn` with freshly allocated heap pointers, freeing them afterwards. */
export function withHeap<T>(
  mod: HaetaeModule,
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

export const writeBytes = (mod: HaetaeModule, ptr: number, bytes: Uint8Array) =>
  mod.HEAPU8.set(bytes, ptr);

export const readBytes = (mod: HaetaeModule, ptr: number, len: number) =>
  mod.HEAPU8.slice(ptr, ptr + len);

/** Resolve a namespaced exported function by name. */
export function fn(
  mod: HaetaeModule,
  name: string,
): (...args: number[]) => number {
  const f = mod[name];
  if (typeof f !== "function") {
    throw new Error(`HAETAE wasm export not found: ${name}`);
  }
  return f as (...args: number[]) => number;
}
