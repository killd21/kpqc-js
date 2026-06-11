# Third-party code — SMAUG-T reference implementation

The contents of this `vendor/SMAUG-T/` directory are **third-party code**,
included here for reproducible builds. They are **not** authored by this
repository's maintainers.

- **Project:** SMAUG-T — a lattice-based post-quantum key encapsulation
  mechanism (KEM) based on Module-LWE and Module-LWR, including the TiMER
  parameter set (IoT-oriented, security level 1, D2 encoding).
- **Authors / origin:** Team SMAUG-T (Seoul National University, CryptoLab
  Inc., DCC and collaborators — see `README.md`), as submitted to and selected
  as a final algorithm by the Korean Post-Quantum Cryptography (KpqC)
  Competition. See <https://www.kpqc.cryptolab.co.kr/smaug-t>.
- **Status:** vendored from the upstream `reference_implementation/` and `kat/`
  directories, unmodified.

The optimized (AVX2) implementation is not vendored — only the portable
reference C is used for the wasm build.

## Licensing

- The SMAUG-T sources and KAT files are licensed under the **MIT License**
  (see `LICENSE`, © 2026 Team SMAUG-T); the source files carry
  `SPDX-License-Identifier: MIT` headers.

Redistribution is permitted under these terms provided the original license
headers and notices remain intact, which they do.

## How it is used

This repository compiles the SMAUG-T reference C into WebAssembly (see
`scripts/build-wasm-smaugt.mjs`). The published npm package ships only the
resulting `.wasm` and the TypeScript wrapper — it does **not** redistribute
these C sources. This directory exists so the wasm can be rebuilt and
re-verified against the official Known Answer Tests
(`scripts/verify-kat-smaugt.mjs`).

### Build notes

- Upstream routes every extern symbol through the `SMAUGT_NAMESPACE` macro
  (prefix `cryptolab_smaugt_mode<N>_`), so each of the four parameter sets
  (mode1 / mode3 / mode5 / modet a.k.a. TiMER) is compiled with its own
  `-DSMAUGT_CONFIG_MODE` and all four link cleanly into one `.wasm` — no
  symbol renaming needed (verified with llvm-nm: zero un-namespaced globals).
- `src/fips202.c` is parameter-independent and compiled once and shared.
- The deterministic NIST CTR-DRBG used to reproduce the KAT vectors is
  provided by `packages/kpqc/csrc/smaugt/randombytes.c` (replacing the
  upstream `src/randombytes.c`), reusing the portable AES from
  `vendor/AIMer/Reference_Implementation/common/aes.c` (the upstream
  `kat/rng.c` flow, minus OpenSSL).
