// SPDX-License-Identifier: MIT
//
// Builds the HAETAE reference C into a single WebAssembly module exposing all
// three parameter sets (mode2 / mode3 / mode5). Each set is compiled separately
// with -DHAETAE_CONFIG_MODE so its symbols land in a distinct namespace
// (`cryptolab_haetae_mode<N>_*`), then everything is linked into one haetae.wasm.
//
// SHAKE/FIPS202, the symmetric-shake helpers and the (mode-independent) Gaussian
// FFT are NOT namespaced upstream, so they are compiled once and shared across
// the three sets. The deterministic NIST CTR-DRBG used to reproduce the KAT
// vectors reuses the portable AES from vendor/AIMer.
//
// Usage: node scripts/build-wasm-haetae.mjs
//   EMSDK   - path to the emsdk checkout (default: <repo>/emsdk)

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const EMSDK = process.env.EMSDK || join(repoRoot, "emsdk");
const EM_CONFIG = join(EMSDK, ".emscripten");
const EMCC_PY = join(EMSDK, "upstream", "emscripten", "emcc.py");
const PYTHON = process.env.PYTHON || "python";

const refDir = join(repoRoot, "vendor", "HAETAE", "reference_implementation");
const incDir = join(refDir, "include");
const srcDir = join(refDir, "src");
const aimerCommon = join(
  repoRoot,
  "vendor",
  "AIMer",
  "Reference_Implementation",
  "common",
);
const pkgDir = join(repoRoot, "packages", "kpqc");
const csrcDir = join(pkgDir, "csrc", "haetae");
const buildDir = join(repoRoot, "build-wasm-haetae");
const outDir = join(pkgDir, "wasm");

// mode name -> HAETAE_CONFIG_MODE numeric value (see include/config.h).
const MODES = { mode2: 0, mode3: 1, mode5: 2 };

// Per-parameter sources: everything whose exported symbols are routed through
// HAETAE_NAMESPACE (compiled once per mode, with -DHAETAE_CONFIG_MODE).
const perModeSources = [
  "decompose.c",
  "encoding.c",
  "fft.c",
  "fixpoint.c",
  "ntt.c",
  "packing.c",
  "poly.c",
  "polyfix.c",
  "polymat.c",
  "polyvec.c",
  "reduce.c",
  "sampler.c",
  "sign.c",
];

// Parameter-independent sources whose symbols are NOT namespaced upstream;
// compiled once and shared across all three modes. (fft.c looks parameter
// independent but its symbols ARE routed through HAETAE_NAMESPACE, so it is
// compiled per-mode above.)
const sharedSources = [
  join(srcDir, "fips202.c"),
  join(srcDir, "symmetric-shake.c"),
  join(aimerCommon, "aes.c"), // portable AES for the KAT DRBG
  join(csrcDir, "randombytes.c"),
];

// Public + internal C API exported from each parameter namespace. The internal
// variants take an explicit seed / rnd / prefix and are used by the KAT gate to
// reproduce the deterministic test vectors.
const apiFns = [
  "keypair",
  "signature",
  "verify",
  "keypair_internal",
  "signature_internal",
  "verify_internal",
];

// A handful of helper functions and Gaussian-sampler constant tables in the
// per-mode sources have external linkage but are NOT routed through
// HAETAE_NAMESPACE, so compiling them for all three modes would produce
// duplicate symbols at link time. They are used only within their own
// translation units, so we namespace them at compile time with -D (the same set
// is applied to every per-mode object, keeping definitions and call sites in
// sync). The list is the authoritative set of un-namespaced defined globals
// reported by llvm-nm across all three mode builds.
const straySymbols = [
  "brv8",
  "fix_round",
  "hammingWeight_8",
  "polyfixfix_sub",
  "sample_gauss",
  "start_cube",
  "start_times_threehalves",
];

const env = { ...process.env, EM_CONFIG };

function emcc(args) {
  execFileSync(PYTHON, [EMCC_PY, ...args], { stdio: "inherit", env });
}

function compile(src, out, mode) {
  const args = ["-O3", "-flto", `-I${incDir}`, `-I${aimerCommon}`];
  if (mode !== null) {
    args.push(`-DHAETAE_CONFIG_MODE=${MODES[mode]}`);
    for (const sym of straySymbols) {
      args.push(`-D${sym}=cryptolab_haetae_${mode}_${sym}`);
    }
  }
  args.push("-c", src, "-o", out);
  emcc(args);
}

function main() {
  if (!existsSync(EMCC_PY)) {
    throw new Error(
      `emcc not found at ${EMCC_PY}. Set EMSDK to your emsdk checkout.`,
    );
  }

  rmSync(buildDir, { recursive: true, force: true });
  mkdirSync(buildDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });

  const objects = [];

  // Shared, parameter-independent objects.
  for (const src of sharedSources) {
    const base = src.split(/[\\/]/).pop().replace(/\.c$/, ".o");
    const out = join(buildDir, base);
    console.log(`[shared] ${base}`);
    compile(src, out, null);
    objects.push(out);
  }

  // Per-mode objects.
  for (const mode of Object.keys(MODES)) {
    const mDir = join(buildDir, mode);
    mkdirSync(mDir, { recursive: true });
    for (const s of perModeSources) {
      const out = join(mDir, s.replace(/\.c$/, ".o"));
      console.log(`[${mode}] ${s}`);
      compile(join(srcDir, s), out, mode);
      objects.push(out);
    }
  }

  // Exported function list: namespaced API per mode + RNG controls + allocator.
  // Names are prefixed with '_' in the wasm export table.
  const exported = [
    "_malloc",
    "_free",
    "_randombytes",
    "_randombytes_init",
    "_haetae_use_secure_rng",
  ];
  for (const mode of Object.keys(MODES)) {
    for (const fn of apiFns) {
      exported.push(`_cryptolab_haetae_${mode}_${fn}`);
    }
  }

  const outJs = join(outDir, "haetae.mjs");
  console.log("[link] haetae.mjs + haetae.wasm");
  emcc([
    "-O3",
    "-flto",
    ...objects,
    "--js-library",
    join(csrcDir, "randombytes.lib.js"),
    "-sMODULARIZE=1",
    "-sEXPORT_ES6=1",
    "-sEXPORT_NAME=createHaetaeModule",
    "-sENVIRONMENT=web,node,worker",
    "-sALLOW_MEMORY_GROWTH=1",
    // HAETAE signing places large polynomial vectors (polyfixvec*, fp96_76
    // coefficients) on the stack; the higher modes need well over the default
    // 64 KB. Use a generous 8 MB stack to cover mode5 with margin.
    "-sSTACK_SIZE=8388608",
    "-sFILESYSTEM=0",
    "-sEXPORTED_RUNTIME_METHODS=ccall,cwrap,HEAPU8,getValue,setValue",
    `-sEXPORTED_FUNCTIONS=${exported.join(",")}`,
    "-o",
    outJs,
  ]);

  console.log("\nDone. Output in packages/kpqc/wasm/");
}

main();
