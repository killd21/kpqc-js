# Third-party code — HAETAE reference implementation

The contents of this `vendor/HAETAE/` directory are **third-party code**, included
here unmodified for reproducible builds. They are **not** authored by this
repository's maintainers.

- **Project:** HAETAE — a lattice-based post-quantum digital signature scheme
- **Authors / origin:** the HAETAE team (CryptoLab Inc. and collaborators), as
  submitted to and selected by the Korean Post-Quantum Cryptography (KpqC)
  Competition. See <https://www.kpqc.cryptolab.co.kr/haetae>.
- **Status:** vendored as-is. No source files in `reference_implementation/` or
  `kat/` have been altered.

## Licensing

- The HAETAE source files (`reference_implementation/src/*.c`, `include/*.h`, …)
  carry an `SPDX-License-Identifier: MIT` header and are licensed under the
  **MIT License**.
- A few files in `reference_implementation/kat/` were produced from NIST
  templates (`PQCgenKAT_sign.c`, `rng.c`, `rng.h`) and carry the corresponding
  notices in their headers.

Redistribution is permitted under these terms provided the original license
headers and notices remain intact, which they do.

## How it is used

This repository compiles the HAETAE reference C into WebAssembly (see
`scripts/build-wasm-haetae.mjs`). The published npm package ships only the
resulting `.wasm` and the TypeScript wrapper — it does **not** redistribute these
C sources. This directory exists so the wasm can be rebuilt and re-verified
against the official Known Answer Tests (`scripts/verify-kat-haetae.mjs`).

### Build notes

- SHAKE/FIPS202 and the `symmetric-shake` helpers are not namespaced upstream, so
  they are compiled once and shared across the three modes; everything routed
  through `HAETAE_NAMESPACE` is compiled per mode (`mode2` / `mode3` / `mode5`).
- A handful of un-namespaced helper symbols (`sample_gauss`, `brv8`, `fix_round`,
  `polyfixfix_sub`, `start_cube`, `start_times_threehalves`) are namespaced at
  compile time with `-D` to avoid duplicate-symbol clashes between modes.
- The deterministic NIST CTR-DRBG used to reproduce the KAT vectors is provided
  by `packages/haetae/csrc/randombytes.c`, reusing the portable AES from
  `vendor/AIMer/` (the upstream KAT `rng.c` depends on OpenSSL, which is not
  available under Emscripten).
