# @killd21/haetae

> HAETAE post-quantum digital signatures for JavaScript & TypeScript — Node.js and the browser.

[![npm](https://img.shields.io/npm/v/@killd21/haetae.svg)](https://www.npmjs.com/package/@killd21/haetae)
[![license](https://img.shields.io/npm/l/@killd21/haetae.svg)](./LICENSE)
[![types](https://img.shields.io/npm/types/@killd21/haetae.svg)](https://www.npmjs.com/package/@killd21/haetae)

**HAETAE** is a lattice-based, post-quantum (quantum-resistant) digital signature
scheme — a winner of the Korean Post-Quantum Cryptography ([KpqC](https://www.kpqc.or.kr/))
Competition. This package ships the official reference implementation compiled to
WebAssembly, wrapped in a small, fully-typed API.

- 🔐 **Post-quantum secure** — signatures that resist attacks by quantum computers
- 🪶 **Compact** — signatures designed to fit in a single network datagram
- 🌐 **Runs everywhere** — Node.js, Deno, Bun, and browsers from one portable `.wasm`
- 📦 **Zero dependencies** — no native build step, nothing to compile on install
- 🧩 **All three parameter sets** — mode2 / mode3 / mode5
- 🔎 **Verified** — matches all 300 official Known Answer Test vectors, byte-for-byte
- 🟦 **First-class TypeScript** — ESM + CommonJS, types included

## Install

```sh
npm install @killd21/haetae
```

```sh
pnpm add @killd21/haetae    # or: yarn add @killd21/haetae / bun add @killd21/haetae
```

## Quick start

```ts
import { haetae2 } from "@killd21/haetae";

const message = new TextEncoder().encode("hello post-quantum world");

// 1. Generate a keypair (uses the platform's secure random source).
const { publicKey, secretKey } = await haetae2.keygen();

// 2. Sign.
const signature = await haetae2.sign(message, secretKey);

// 3. Verify.
const isValid = await haetae2.verify(message, signature, publicKey);
console.log(isValid); // true
```

`publicKey`, `secretKey`, and `signature` are plain `Uint8Array`s, so you can
store or transmit them however you like (base64, hex, files, …).

## Choosing a parameter set

Each set is exported by name. The number is the NIST security category
(2 ≈ 128-bit, 3 ≈ 192-bit, 5 ≈ 256-bit).

```ts
import { haetae2, haetae3, haetae5 } from "@killd21/haetae";
```

| Parameter set | Security | Public key | Secret key | Signature | Pick when…                  |
| ------------- | -------- | ---------: | ---------: | --------: | --------------------------- |
| `haetae2`     | Cat. 2   |  992 bytes | 1408 bytes | 1474 bytes | balanced default           |
| `haetae3`     | Cat. 3   | 1472 bytes | 2112 bytes | 2349 bytes | higher security            |
| `haetae5`     | Cat. 5   | 2080 bytes | 2752 bytes | 2948 bytes | maximum security           |

You can also look them up dynamically:

```ts
import { haetae, PARAMETER_SETS } from "@killd21/haetae";

PARAMETER_SETS;        // ["haetae2", "haetae3", "haetae5"]
const scheme = haetae["haetae3"];
```

## Context strings

Bind a signature to a domain / protocol with an optional context (≤ 255 bytes).
Verification must use the **same** context or it fails — handy for separating
signatures across features so one can't be replayed in another.

```ts
const ctx = new TextEncoder().encode("login-token-v1");

const sig = await haetae2.sign(message, secretKey, { context: ctx });

await haetae2.verify(message, sig, publicKey, { context: ctx }); // true
await haetae2.verify(message, sig, publicKey);                   // false (no context)
```

## API

Each parameter set is a `SignatureScheme`:

```ts
interface SignatureScheme {
  readonly name: string;          // e.g. "haetae-mode2"
  readonly publicKeyBytes: number;
  readonly secretKeyBytes: number;
  readonly signatureBytes: number;

  keygen(): Promise<{ publicKey: Uint8Array; secretKey: Uint8Array }>;

  sign(
    message: Uint8Array,
    secretKey: Uint8Array,
    options?: { context?: Uint8Array },
  ): Promise<Uint8Array>; // detached signature

  verify(
    message: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array,
    options?: { context?: Uint8Array },
  ): Promise<boolean>;
}
```

All methods are `async`: the WebAssembly module is loaded once, lazily, on first
use. Signatures are **detached** (the message is not included), so verification
needs the original message.

## Runtime support

| Environment        | Supported            |
| ------------------ | -------------------- |
| Node.js ≥ 18       | ✅                   |
| Browsers (ESM)     | ✅ (WebAssembly)     |
| Deno / Bun         | ✅                   |
| Web Workers        | ✅                   |

The secure random source is the Web Crypto API, falling back to Node's `crypto`
module. In bundlers (Vite, webpack, esbuild, …) the `.wasm` is loaded as an asset
next to the module — no special configuration is typically required.

## Security notice

This package wraps the HAETAE **reference** implementation. It is validated
against the official Known Answer Tests, but:

- it has **not** undergone an independent security audit, and
- WebAssembly / JavaScript cannot guarantee constant-time execution.

Evaluate carefully before using it to protect high-value secrets in production.

## About HAETAE

HAETAE is a Module-LWE / Module-SIS lattice signature scheme built on the
"Fiat-Shamir with Aborts" paradigm (like Dilithium), but tuned for a better
size / compactness trade-off using bimodal and hyperball Gaussian sampling. It
was submitted to the KpqC Competition by a team led by CryptoLab Inc.

## License

[MIT](./LICENSE). Distributes and builds upon the HAETAE reference implementation,
retained unmodified under `vendor/HAETAE`.
