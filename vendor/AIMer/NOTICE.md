# Third-party code — AIMer reference implementation

The contents of this `vendor/AIMer/` directory are **third-party code**, included
here unmodified for reproducible builds. They are **not** authored by this
repository's maintainers.

- **Project:** AIMer — a post-quantum digital signature scheme
- **Authors / origin:** the AIMer team (Samsung SDS), as submitted to the Korean
  Post-Quantum Cryptography (KpqC) Competition and the NIST Additional Digital
  Signature Schemes process. See <https://www.kpqc.or.kr/>.
- **Status:** vendored as-is. No source files in `Reference_Implementation/` or
  `KAT/` have been altered.

## Licensing

- Most source files (`Reference_Implementation/*.c`, `*.h`, …) carry an
  `SPDX-License-Identifier: MIT` header and are licensed under the **MIT License**.
- A few files were produced from NIST templates (`api.h`, `common/rng.c`,
  `common/rng.h`, `test/PQCgenKAT_sign.c`) and carry the **NIST public-domain
  notice** reproduced in their headers (NIST-developed software, not subject to
  U.S. copyright protection, provided "AS IS").

Redistribution is permitted under these terms provided the original license
headers and notices remain intact, which they do.

## How it is used

This repository compiles the AIMer reference C into WebAssembly (see
`scripts/build-wasm.mjs`). The published npm package ships only the resulting
`.wasm` and the TypeScript wrapper — it does **not** redistribute these C
sources. This directory exists so the wasm can be rebuilt and re-verified
against the official Known Answer Tests.
