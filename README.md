# kpqc-js

> **[@killd21/kpqc](https://www.npmjs.com/package/@killd21/kpqc)** — KpqC (Korean Post-Quantum Cryptography) for JavaScript & TypeScript, in Node.js and the browser.

[![npm](https://img.shields.io/npm/v/@killd21/kpqc.svg)](https://www.npmjs.com/package/@killd21/kpqc)
[![license](https://img.shields.io/npm/l/@killd21/kpqc.svg)](./LICENSE)
[![types](https://img.shields.io/npm/types/@killd21/kpqc.svg)](https://www.npmjs.com/package/@killd21/kpqc)

One package, three [KpqC](https://www.kpqc.or.kr/) algorithms — the official
reference implementations compiled to WebAssembly, wrapped in small, fully-typed
APIs:

| Algorithm  | Kind              | Basis                       | Import                   |
| ---------- | ----------------- | --------------------------- | ------------------------ |
| **AIMer**  | Digital signature | Symmetric / MPC-in-the-head | `@killd21/kpqc/aimer`    |
| **HAETAE** | Digital signature | Lattice (Module-LWE/SIS)    | `@killd21/kpqc/haetae`   |
| **NTRU+**  | Key encapsulation | Lattice (NTRU)              | `@killd21/kpqc/ntruplus` |

- 🔐 **Post-quantum secure** — primitives that resist attacks by quantum computers
- 🌐 **Runs everywhere** — Node.js, Deno, Bun, and browsers from portable `.wasm`
- 📦 **Zero dependencies** — no native build step, nothing to compile on install
- 💤 **Lazy loading** — each algorithm's wasm loads on first use; import what you need
- 🔎 **Verified** — matches all 900 official Known Answer Test vectors, byte-for-byte
- 🟦 **First-class TypeScript** — ESM + CommonJS, types included

## Install

```sh
npm install @killd21/kpqc
```

## Quick start

```ts
// Signatures (HAETAE shown; AIMer is identical in shape)
import { haetae2 } from "@killd21/kpqc/haetae";

const msg = new TextEncoder().encode("hello post-quantum world");
const { publicKey, secretKey } = await haetae2.keygen();
const signature = await haetae2.sign(msg, secretKey);
await haetae2.verify(msg, signature, publicKey); // true
```

```ts
// Key encapsulation (NTRU+)
import { ntruplus768 } from "@killd21/kpqc/ntruplus";

const { publicKey, secretKey } = await ntruplus768.keygen();
const { ciphertext, sharedSecret } = await ntruplus768.encapsulate(publicKey);
const recovered = await ntruplus768.decapsulate(ciphertext, secretKey);
// recovered ≡ sharedSecret (32 bytes — e.g. an AES-256-GCM key)
```

Full usage — parameter-set tables, context strings, the complete API, runtime
support and the migration guide from the former standalone `@killd21/aimer` /
`@killd21/haetae` packages — lives in the
**[package README](packages/kpqc/README.md)**.

## Security notice

This project wraps the official **reference** implementations. They are
validated against the official Known Answer Tests, but they have **not**
undergone an independent security audit, and WebAssembly / JavaScript cannot
guarantee constant-time execution. Evaluate carefully before using this to
protect high-value secrets in production.

## Repository layout

```
packages/kpqc/      # @killd21/kpqc — TypeScript wrappers + built wasm
  src/              #   aimer.ts / haetae.ts / ntruplus.ts (+ shared internals)
  csrc/             #   per-algorithm RNG shims (secure RNG + KAT DRBG)
  wasm/             #   aimer|haetae|ntruplus .wasm + Emscripten glue
vendor/AIMer/       # upstream AIMer reference (MIT), unmodified
vendor/HAETAE/      # upstream HAETAE reference (MIT), unmodified
vendor/NTRUplus/    # upstream NTRU+ reference (MIT), symlinks dereferenced
scripts/            # build-wasm*.mjs (Emscripten) + verify-kat*.mjs (KAT gates)
```

## Building from source

Building the wasm requires the Emscripten toolchain (and Python 3); everything
else is Node ≥ 18 with pnpm.

```sh
corepack enable

# One-time: install the Emscripten SDK locally
git clone --depth 1 https://github.com/emscripten-core/emsdk.git emsdk
python emsdk/emsdk.py install latest
python emsdk/emsdk.py activate latest

pnpm install
pnpm build:wasm     # compile all three references -> packages/kpqc/wasm/
pnpm test:kat       # KAT gate: 900 official vectors, byte-for-byte
pnpm build          # build the TS package (ESM + CJS + types)
pnpm test           # unit tests
```

Per-algorithm variants exist too: `build:wasm:aimer|haetae|ntruplus` and
`test:kat:aimer|haetae|ntruplus`.

`pnpm test:kat` is the correctness contract: it regenerates every official
Known Answer Test vector through the wasm builds and compares the bytes.

## License

[MIT](./LICENSE). Distributes and builds upon the AIMer (© Samsung SDS),
HAETAE (CryptoLab Inc. and collaborators) and NTRU+ (© NTRU+ TEAM) reference
implementations — see the `NOTICE.md` in each `vendor/` subdirectory.
