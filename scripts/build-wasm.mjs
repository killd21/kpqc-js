// SPDX-License-Identifier: MIT
//
// Builds the AIMer reference C into a single WebAssembly module exposing all six
// parameter sets. Each parameter set is compiled separately (the reference uses
// the -DPARAMS macro), then everything is linked into one aimer.wasm.
//
// Symbols are namespaced as `samsungsds_aimer_<param>_ref_*`, so the six builds
// do not collide. AES, SHA3 (fips202) and the RNG shim are parameter-independent
// and compiled once.
//
// Usage: node scripts/build-wasm.mjs
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

const refDir = join(repoRoot, "vendor", "AIMer", "Reference_Implementation");
const commonDir = join(refDir, "common");
const pkgDir = join(repoRoot, "packages", "kpqc");
const csrcDir = join(pkgDir, "csrc", "aimer");
const buildDir = join(repoRoot, "build-wasm");
const outDir = join(pkgDir, "wasm");

const PARAMS = ["128f", "128s", "192f", "192s", "256f", "256s"];

// Per-parameter sources (compiled once per parameter set, with -DPARAMS).
const perParamSources = ["aim2.c", "hash.c", "sign.c", "tree.c"];
const fieldSourceFor = (p) =>
  p.startsWith("128")
    ? "field128.c"
    : p.startsWith("192")
      ? "field192.c"
      : "field256.c";

// Parameter-independent sources (compiled once, shared across all sets).
const sharedSources = [
  join(commonDir, "aes.c"),
  join(commonDir, "fips202.c"),
  join(csrcDir, "randombytes.c"),
];

// Public C API exported from each parameter namespace.
const apiFns = [
  "crypto_sign_keypair",
  "crypto_sign_signature",
  "crypto_sign",
  "crypto_sign_verify",
  "crypto_sign_open",
];

const env = { ...process.env, EM_CONFIG };

function emcc(args) {
  execFileSync(PYTHON, [EMCC_PY, ...args], { stdio: "inherit", env });
}

// A few helper functions in sign.c have external linkage but are NOT routed
// through AIMER_NAMESPACE, so compiling sign.c for all six parameter sets would
// produce duplicate symbols at link time. They are used only within sign.c and
// are not declared in any header, so we namespace them at compile time with -D.
const internalSymbols = [
  "crypto_sign_keypair_internal",
  "crypto_sign_signature_internal",
  "crypto_sign_verify_internal",
];

function compile(src, out, params) {
  const args = [
    "-O3",
    "-flto",
    `-I${refDir}`,
    `-I${commonDir}`,
  ];
  if (params) {
    args.push(`-DPARAMS=${params}`);
    for (const sym of internalSymbols) {
      args.push(`-D${sym}=samsungsds_aimer_${params}_ref_${sym}`);
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

  // Per-parameter objects.
  for (const p of PARAMS) {
    const pDir = join(buildDir, p);
    mkdirSync(pDir, { recursive: true });
    const sources = [...perParamSources, fieldSourceFor(p)];
    for (const s of sources) {
      const out = join(pDir, s.replace(/\.c$/, ".o"));
      console.log(`[${p}] ${s}`);
      compile(join(refDir, s), out, p);
      objects.push(out);
    }
  }

  // Exported function list: namespaced API per parameter set + RNG controls +
  // allocator. Names are prefixed with '_' in the wasm export table.
  const exported = ["_malloc", "_free", "_randombytes_init", "_aimer_use_secure_rng"];
  for (const p of PARAMS) {
    for (const fn of apiFns) {
      exported.push(`_samsungsds_aimer_${p}_ref_${fn}`);
    }
  }

  const outJs = join(outDir, "aimer.mjs");
  console.log("[link] aimer.mjs + aimer.wasm");
  emcc([
    "-O3",
    "-flto",
    ...objects,
    "--js-library",
    join(csrcDir, "randombytes.lib.js"),
    "-sMODULARIZE=1",
    "-sEXPORT_ES6=1",
    "-sEXPORT_NAME=createAimerModule",
    "-sENVIRONMENT=web,node,worker",
    "-sALLOW_MEMORY_GROWTH=1",
    "-sFILESYSTEM=0",
    "-sEXPORTED_RUNTIME_METHODS=ccall,cwrap,HEAPU8,getValue,setValue",
    `-sEXPORTED_FUNCTIONS=${exported.join(",")}`,
    "-o",
    outJs,
  ]);

  console.log("\nDone. Output in packages/kpqc/wasm/");
}

main();
