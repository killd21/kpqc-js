# @killd21/aimer

> AIMer post-quantum digital signatures for JavaScript & TypeScript — Node.js and the browser.

[![npm](https://img.shields.io/npm/v/@killd21/aimer.svg)](https://www.npmjs.com/package/@killd21/aimer)
[![license](https://img.shields.io/npm/l/@killd21/aimer.svg)](./LICENSE)
[![types](https://img.shields.io/npm/types/@killd21/aimer.svg)](https://www.npmjs.com/package/@killd21/aimer)

**AIMer** is a post-quantum (quantum-resistant) digital signature scheme from the
Korean Post-Quantum Cryptography ([KpqC](https://www.kpqc.or.kr/)) Competition.
This package ships the official reference implementation compiled to WebAssembly,
wrapped in a small, fully-typed API.

- 🔐 **Post-quantum secure** — signatures that resist attacks by quantum computers
- 🌐 **Runs everywhere** — Node.js, Deno, Bun, and browsers from one portable `.wasm`
- 📦 **Zero dependencies** — no native build step, nothing to compile on install
- 🧩 **All six parameter sets** — pick your security level / size trade-off
- 🔎 **Verified** — matches all 600 official Known Answer Test vectors, byte-for-byte
- 🟦 **First-class TypeScript** — ESM + CommonJS, types included

## Install

```sh
npm install @killd21/aimer
```

```sh
pnpm add @killd21/aimer    # or: yarn add @killd21/aimer / bun add @killd21/aimer
```

## Quick start

```ts
import { aimer128f } from "@killd21/aimer";

const message = new TextEncoder().encode("hello post-quantum world");

// 1. Generate a keypair (uses the platform's secure random source).
const { publicKey, secretKey } = await aimer128f.keygen();

// 2. Sign.
const signature = await aimer128f.sign(message, secretKey);

// 3. Verify.
const isValid = await aimer128f.verify(message, signature, publicKey);
console.log(isValid); // true
```

That's it. `publicKey`, `secretKey`, and `signature` are plain `Uint8Array`s, so
you can store or transmit them however you like (base64, hex, files, …).

## Choosing a parameter set

Every set is exported by name. The number is the security level (128/192/256
bits); `f` is **faster** signing with larger signatures, `s` produces **smaller**
signatures more slowly.

```ts
import {
  aimer128f, aimer128s,
  aimer192f, aimer192s,
  aimer256f, aimer256s,
} from "@killd21/aimer";
```

| Parameter set | Security | Public key | Secret key | Signature | Pick when…                       |
| ------------- | -------- | ---------: | ---------: | --------: | -------------------------------- |
| `aimer128f`   | 128-bit  |   32 bytes |   48 bytes |  5.9 KB   | balanced default                 |
| `aimer128s`   | 128-bit  |   32 bytes |   48 bytes |  4.2 KB   | smaller signatures               |
| `aimer192f`   | 192-bit  |   48 bytes |   72 bytes | 13.1 KB   | higher security, faster signing  |
| `aimer192s`   | 192-bit  |   48 bytes |   72 bytes |  9.1 KB   | higher security, smaller sigs    |
| `aimer256f`   | 256-bit  |   64 bytes |   96 bytes | 25.1 KB   | maximum security, faster signing |
| `aimer256s`   | 256-bit  |   64 bytes |   96 bytes | 17.1 KB   | maximum security, smaller sigs   |

You can also look them up dynamically:

```ts
import { aimer, PARAMETER_SETS } from "@killd21/aimer";

PARAMETER_SETS;        // ["aimer128f", "aimer128s", ..., "aimer256s"]
const scheme = aimer["aimer192s"];
```

## Context strings

Bind a signature to a domain / protocol with an optional context (≤ 255 bytes).
Verification must use the **same** context or it fails — handy for separating
signatures across features so one can't be replayed in another.

```ts
const ctx = new TextEncoder().encode("login-token-v1");

const sig = await aimer128f.sign(message, secretKey, { context: ctx });

await aimer128f.verify(message, sig, publicKey, { context: ctx }); // true
await aimer128f.verify(message, sig, publicKey);                   // false (no context)
```

## API

Each parameter set is a `SignatureScheme`:

```ts
interface SignatureScheme {
  readonly name: string;          // e.g. "aimer-128f"
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

| Environment   | Supported        |
| ------------- | ---------------- |
| Node.js ≥ 18  | ✅               |
| Browsers (ESM)| ✅ (WebAssembly) |
| Deno / Bun    | ✅               |
| Web Workers   | ✅               |

The secure random source is the Web Crypto API, falling back to Node's `crypto`
module. In bundlers (Vite, webpack, esbuild, …) the `.wasm` is loaded as an asset
next to the module — no special configuration is typically required.

## Security notice

This package wraps the AIMer **reference** implementation. It is validated
against the official Known Answer Tests, but:

- it has **not** undergone an independent security audit, and
- WebAssembly / JavaScript cannot guarantee constant-time execution.

Evaluate carefully before using it to protect high-value secrets in production.

## About AIMer

AIMer is a stateless signature scheme that proves knowledge of a symmetric
one-way function preimage (the AIM2 primitive) in zero knowledge, using the
MPC-in-the-head paradigm. It was submitted by Samsung SDS to the KpqC Competition
and the NIST Additional Digital Signature Schemes process.

## License

[MIT](./LICENSE). Distributes and builds upon the AIMer reference implementation
(© Samsung SDS).
