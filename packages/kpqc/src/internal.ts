// Internal helpers shared by the per-algorithm modules: a minimal Emscripten
// module shape plus utilities for moving bytes across the wasm heap boundary.
// Not part of the public API.

/** Minimal shape of an Emscripten module instance we rely on. */
export interface EmscriptenModule {
  _malloc(size: number): number;
  _free(ptr: number): void;
  _randombytes_init(entropy: number, perso: number, strength: number): void;
  getValue(ptr: number, type: "i32"): number;
  HEAPU8: Uint8Array;
  // Namespaced API exports plus per-algorithm RNG controls, resolved by name.
  [exported: string]: unknown;
}

/** Call `body` with freshly allocated heap pointers, freeing them afterwards. */
export function withHeap<T>(
  mod: EmscriptenModule,
  sizes: number[],
  body: (...ptrs: number[]) => T,
): T {
  const ptrs = sizes.map((s) => mod._malloc(s));
  try {
    return body(...ptrs);
  } finally {
    for (const p of ptrs) mod._free(p);
  }
}

export const writeBytes = (
  mod: EmscriptenModule,
  ptr: number,
  bytes: Uint8Array,
) => mod.HEAPU8.set(bytes, ptr);

export const readBytes = (mod: EmscriptenModule, ptr: number, len: number) =>
  mod.HEAPU8.slice(ptr, ptr + len);

/** Resolve an exported function by name. */
export function fn(
  mod: EmscriptenModule,
  name: string,
): (...args: number[]) => number {
  const f = mod[name];
  if (typeof f !== "function") {
    throw new Error(`wasm export not found: ${name}`);
  }
  return f as (...args: number[]) => number;
}

export function assertLen(name: string, got: number, want: number): void {
  if (got !== want) {
    throw new Error(`${name} must be ${want} bytes, got ${got}`);
  }
}
