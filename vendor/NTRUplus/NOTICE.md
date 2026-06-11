# Third-party code — NTRU+ reference implementation

The contents of this `vendor/NTRUplus/` directory are **third-party code**,
included here for reproducible builds. They are **not** authored by this
repository's maintainers.

- **Project:** NTRU+ — a lattice-based post-quantum key encapsulation mechanism (KEM)
- **Authors / origin:** the NTRU+ team, as submitted to and selected as a final
  algorithm by the Korean Post-Quantum Cryptography (KpqC) Competition.
  See <https://www.ntruplus.org/> and <https://github.com/ntruplus/ntruplus>.
- **Status:** vendored from the upstream `Reference_Implementation/` and `KAT/`
  directories. Source file *contents* are unmodified; see the layout note below.

## Layout note (symlink dereferencing)

Upstream uses git symlinks to share files between the three parameter-set
directories (`NTRU+864/kem.c -> ../NTRU+768/kem.c`, etc.). On Windows checkouts
those symlinks materialize as broken one-line text stubs, and the quoted
`#include "params.h"` resolution requires each set's sources to live next to its
own `params.h`. The symlinks were therefore **dereferenced to real copies** when
vendoring: `NTRU+864/` and `NTRU+1152/` contain byte-identical copies of the
NTRU+768 shared files (`api.h`, `kem.c`, `poly.h`, `symmetric.c/h`,
`randombytes.c/h`, `fips202/`, `kat/`, `test/`, `Makefile`) plus their own
genuine per-set files (`params.h`, `ntt.c`, `ntt.h`, `poly.c`).

The `Optimized_Implementation/` and `Additional_Implementation/` (AVX2 / NEON)
trees are not vendored — only the portable reference C is used for the wasm
build.

## Licensing

- The NTRU+ sources are licensed under the **MIT License** (see `LICENSE`,
  © 2024–2026 NTRU+ TEAM).
- The KAT harness files (`kat/PQCgenKAT_kem.c`, `kat/rng.c`, `kat/rng.h`) were
  produced from NIST templates and carry the NIST public-domain notice
  reproduced in their headers.

Redistribution is permitted under these terms provided the original license
headers and notices remain intact, which they do.

## How it is used

This repository compiles the NTRU+ reference C into WebAssembly (see
`scripts/build-wasm-ntruplus.mjs`). The published npm package ships only the
resulting `.wasm` and the TypeScript wrapper — it does **not** redistribute these
C sources. This directory exists so the wasm can be rebuilt and re-verified
against the official Known Answer Tests (`scripts/verify-kat-ntruplus.mjs`).

### Build notes

- Upstream does **not** namespace any symbols (each parameter set is a separate
  build), so the build script renames every extern symbol per set with `-D`
  (prefix `ntruplus<N>_`) to link all three sets into one `.wasm`.
- `fips202.c` is parameter-independent and compiled once; `kem.c`, `ntt.c`,
  `poly.c`, `symmetric.c` are compiled per set.
- The deterministic NIST CTR-DRBG used to reproduce the KAT vectors is provided
  by `packages/ntruplus/csrc/randombytes.c`, reusing the portable AES from this
  directory's own `kat/aes.c` (the upstream `kat/rng.c` flow, minus OpenSSL).
