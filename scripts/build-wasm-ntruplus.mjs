// SPDX-License-Identifier: MIT
//
// Builds the NTRU+ reference C into a single WebAssembly module exposing all
// three parameter sets (768 / 864 / 1152). Upstream does not namespace any
// symbols (each set is meant to be built alone), so EVERY extern symbol defined
// by the per-set sources is renamed at compile time with -D so the three builds
// can be linked into one ntruplus.wasm (prefix `ntruplus<N>_`).
//
// SHAKE/FIPS202 is parameter-independent and not renamed: it is compiled once
// and shared, together with the portable AES from the vendored kat/ harness
// (used by the deterministic NIST CTR-DRBG that reproduces the KAT vectors).
//
// Usage: node scripts/build-wasm-ntruplus.mjs
//   EMSDK   - path to the emsdk checkout (default: <repo>/emsdk)

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const EMSDK = process.env.EMSDK || join(repoRoot, "emsdk");
const EM_CONFIG = join(EMSDK, ".emscripten");
const EMCC_PY = join(EMSDK, "upstream", "emscripten", "emcc.py");
const PYTHON = process.env.PYTHON || "python";

const refDir = join(repoRoot, "vendor", "NTRUplus", "Reference_Implementation");
const pkgDir = join(repoRoot, "packages", "kpqc");
const csrcDir = join(pkgDir, "csrc", "ntruplus");
const buildDir = join(repoRoot, "build-wasm-ntruplus");
const outDir = join(pkgDir, "wasm");

// set name -> upstream directory
const SETS = {
  768: join(refDir, "NTRU+768"),
  864: join(refDir, "NTRU+864"),
  1152: join(refDir, "NTRU+1152"),
};

// Sources compiled once per set. kem.c / symmetric.c are byte-identical across
// sets but depend on the set's params.h (quoted-include resolution), so they
// are compiled from each set's own directory.
const perSetSources = ["kem.c", "ntt.c", "poly.c", "symmetric.c"];

// Parameter-independent sources, compiled once and shared:
//  - fips202.c: SHAKE/SHA3 (identical across sets, not renamed)
//  - kat/aes.c: portable AES backing the deterministic KAT DRBG
//  - csrc/randombytes.c: secure RNG (WebCrypto/Node) + NIST CTR-DRBG shim
const sharedSources = [
  join(SETS[768], "fips202", "fips202.c"),
  join(SETS[768], "kat", "aes.c"),
  join(csrcDir, "randombytes.c"),
];

// Every extern symbol defined by the per-set objects (authoritative union
// reported by llvm-nm across all three set builds). All of them are renamed
// per set; references to fips202 / randombytes stay unrenamed and resolve to
// the shared objects.
const setSymbols = [
  "baseinv",
  "basemul",
  "basemul_add",
  "crypto_kem_dec",
  "crypto_kem_enc",
  "crypto_kem_keypair",
  "hash_f",
  "hash_g",
  "hash_h",
  "invntt",
  "ntt",
  "poly_baseinv",
  "poly_basemul",
  "poly_basemul_add",
  "poly_cbd1",
  "poly_crepmod3",
  "poly_frombytes",
  "poly_invntt",
  "poly_ntt",
  "poly_sotp_decode",
  "poly_sotp_encode",
  "poly_sub",
  "poly_tobytes",
  "poly_triple",
  "zetas",
];

// Public C API exported from each set's namespace.
const apiFns = ["crypto_kem_keypair", "crypto_kem_enc", "crypto_kem_dec"];

const env = { ...process.env, EM_CONFIG };

function emcc(args) {
  execFileSync(PYTHON, [EMCC_PY, ...args], { stdio: "inherit", env });
}

function compile(src, out, set) {
  const args = ["-O3", "-flto"];
  if (set !== null) {
    args.push(`-I${SETS[set]}`);
    for (const sym of setSymbols) {
      args.push(`-D${sym}=ntruplus${set}_${sym}`);
    }
  } else {
    // shared sources only need the AES header dir for the RNG shim
    args.push(`-I${join(SETS[768], "kat")}`);
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
    const out = join(buildDir, basename(src).replace(/\.c$/, ".o"));
    console.log(`[shared] ${basename(src)}`);
    compile(src, out, null);
    objects.push(out);
  }

  // Per-set objects.
  for (const set of Object.keys(SETS)) {
    const sDir = join(buildDir, set);
    mkdirSync(sDir, { recursive: true });
    for (const s of perSetSources) {
      const out = join(sDir, s.replace(/\.c$/, ".o"));
      console.log(`[${set}] ${s}`);
      compile(join(SETS[set], s), out, set);
      objects.push(out);
    }
  }

  // Exported function list: namespaced API per set + RNG controls + allocator.
  // Names are prefixed with '_' in the wasm export table.
  const exported = [
    "_malloc",
    "_free",
    "_randombytes",
    "_randombytes_init",
    "_ntruplus_use_secure_rng",
  ];
  for (const set of Object.keys(SETS)) {
    for (const fn of apiFns) {
      exported.push(`_ntruplus${set}_${fn}`);
    }
  }

  const outJs = join(outDir, "ntruplus.mjs");
  console.log("[link] ntruplus.mjs + ntruplus.wasm");
  emcc([
    "-O3",
    "-flto",
    ...objects,
    "--js-library",
    join(csrcDir, "randombytes.lib.js"),
    "-sMODULARIZE=1",
    "-sEXPORT_ES6=1",
    "-sEXPORT_NAME=createNtruplusModule",
    "-sENVIRONMENT=web,node,worker",
    "-sALLOW_MEMORY_GROWTH=1",
    // NTRU+ stack use is modest, but keep the generous stack used across this
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
