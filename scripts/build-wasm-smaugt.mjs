// SPDX-License-Identifier: MIT
//
// Builds the SMAUG-T reference C into a single WebAssembly module exposing all
// four parameter sets (mode1 / mode3 / mode5 / modet a.k.a. TiMER). Each set is
// compiled separately with -DSMAUGT_CONFIG_MODE so its symbols land in a
// distinct namespace (`cryptolab_smaugt_mode<N>_*`), then everything is linked
// into one smaugt.wasm.
//
// SHAKE/FIPS202 is NOT namespaced upstream, so it is compiled once and shared
// across the four sets. The deterministic NIST CTR-DRBG used to reproduce the
// KAT vectors reuses the portable AES from vendor/AIMer.
//
// Usage: node scripts/build-wasm-smaugt.mjs
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

const refDir = join(repoRoot, "vendor", "SMAUG-T", "reference_implementation");
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
const csrcDir = join(pkgDir, "csrc", "smaugt");
const buildDir = join(repoRoot, "build-wasm-smaugt");
const outDir = join(pkgDir, "wasm");

// mode name -> SMAUGT_CONFIG_MODE numeric value (see include/config.h).
const MODES = { mode1: 0, mode3: 1, mode5: 2, modet: 3 };

// Per-parameter sources: everything whose exported symbols are routed through
// SMAUGT_NAMESPACE (compiled once per mode, with -DSMAUGT_CONFIG_MODE).
const perModeSources = [
  "cbd.c",
  "ciphertext.c",
  "dg.c",
  "hash.c",
  "hwt.c",
  "indcpa.c",
  "kem.c",
  "key.c",
  "pack.c",
  "packring.c",
  "poly.c",
  "toomcook.c",
  "verify.c",
];

// Parameter-independent sources whose symbols are NOT namespaced upstream;
// compiled once and shared across all four modes. The upstream
// src/randombytes.c is replaced by the csrc shim (secure WebCrypto RNG +
// deterministic NIST CTR-DRBG for KAT reproduction).
const sharedSources = [
  join(srcDir, "fips202.c"),
  join(aimerCommon, "aes.c"), // portable AES for the KAT DRBG
  join(csrcDir, "randombytes.c"),
];

// Public C API exported from each parameter namespace. The public functions
// draw their randomness from randombytes() in exactly the order the KAT
// harness does, so the KAT gate needs no *_internal exports.
const apiFns = ["keypair", "enc", "dec"];

// Symbols in the per-mode sources with external linkage that are NOT routed
// through SMAUGT_NAMESPACE; compiling them for all four modes would produce
// duplicate symbols at link time, so they are namespaced at compile time with
// -D. The list is the authoritative set of un-namespaced defined globals
// reported by llvm-nm across all four mode builds.
const straySymbols = [];

const env = { ...process.env, EM_CONFIG };

function emcc(args) {
  execFileSync(PYTHON, [EMCC_PY, ...args], { stdio: "inherit", env });
}

function compile(src, out, mode) {
  const args = ["-O3", "-flto", `-I${incDir}`, `-I${aimerCommon}`];
  if (mode !== null) {
    args.push(`-DSMAUGT_CONFIG_MODE=${MODES[mode]}`);
    for (const sym of straySymbols) {
      args.push(`-D${sym}=cryptolab_smaugt_${mode}_${sym}`);
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
    "_smaugt_use_secure_rng",
  ];
  for (const mode of Object.keys(MODES)) {
    for (const fn of apiFns) {
      exported.push(`_cryptolab_smaugt_${mode}_${fn}`);
    }
  }

  const outJs = join(outDir, "smaugt.mjs");
  console.log("[link] smaugt.mjs + smaugt.wasm");
  emcc([
    "-O3",
    "-flto",
    ...objects,
    "--js-library",
    join(csrcDir, "randombytes.lib.js"),
    "-sMODULARIZE=1",
    "-sEXPORT_ES6=1",
    "-sEXPORT_NAME=createSmaugtModule",
    "-sENVIRONMENT=web,node,worker",
    "-sALLOW_MEMORY_GROWTH=1",
    // SMAUG-T stack use is modest, but keep the generous stack used across this
    // repo's KpqC builds so deep call chains can never overflow silently.
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
