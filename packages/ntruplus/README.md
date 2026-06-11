# @killd21/ntruplus

> NTRU+ post-quantum key encapsulation (KEM) for JavaScript & TypeScript — Node.js and the browser.

[![npm](https://img.shields.io/npm/v/@killd21/ntruplus.svg)](https://www.npmjs.com/package/@killd21/ntruplus)
[![license](https://img.shields.io/npm/l/@killd21/ntruplus.svg)](./LICENSE)
[![types](https://img.shields.io/npm/types/@killd21/ntruplus.svg)](https://www.npmjs.com/package/@killd21/ntruplus)

**NTRU+** is a lattice-based, post-quantum (quantum-resistant) **key encapsulation
mechanism** — a final algorithm of Round 2 of the Korean Post-Quantum Cryptography
([KpqC](https://www.kpqc.or.kr/)) Competition. This package ships the official
reference implementation compiled to WebAssembly, wrapped in a small, fully-typed
API.

A KEM establishes a shared secret between two parties: the sender *encapsulates*
against the recipient's public key, the recipient *decapsulates* with their
secret key — both end up with the same 32 bytes, ready to key an AEAD cipher.

- 🔐 **Post-quantum secure** — key exchange that resists attacks by quantum computers
- 🌐 **Runs everywhere** — Node.js, Deno, Bun, and browsers from one portable `.wasm`
- 📦 **Zero dependencies** — no native build step, nothing to compile on install
- 🧩 **All three parameter sets** — 768 / 864 / 1152
- 🔎 **Verified** — matches all 300 official Known Answer Test vectors, byte-for-byte
- 🟦 **First-class TypeScript** — ESM + CommonJS, types included

## Install

```sh
npm install @killd21/ntruplus
```

```sh
pnpm add @killd21/ntruplus    # or: yarn add @killd21/ntruplus / bun add @killd21/ntruplus
```

## Quick start

```ts
import { ntruplus768 } from "@killd21/ntruplus";

// Recipient: generate a keypair, publish the public key.
const { publicKey, secretKey } = await ntruplus768.keygen();

// Sender: encapsulate a fresh shared secret against the public key.
const { ciphertext, sharedSecret } = await ntruplus768.encapsulate(publicKey);
// -> send `ciphertext` to the recipient; use `sharedSecret` (32 bytes) locally,
//    e.g. as an AES-256-GCM key.

// Recipient: recover the same shared secret.
const recovered = await ntruplus768.decapsulate(ciphertext, secretKey);
// recovered ≡ sharedSecret
```

All values are plain `Uint8Array`s, so you can store or transmit them however
you like (base64, hex, files, …).

## Choosing a parameter set

```ts
import { ntruplus768, ntruplus864, ntruplus1152 } from "@killd21/ntruplus";
```

| Parameter set  | Security | Public key | Secret key | Ciphertext | Shared secret |
| -------------- | -------- | ---------: | ---------: | ---------: | ------------: |
| `ntruplus768`  | Cat. 1   | 1152 bytes | 2336 bytes | 1152 bytes | 32 bytes      |
| `ntruplus864`  | Cat. 3   | 1296 bytes | 2624 bytes | 1296 bytes | 32 bytes      |
| `ntruplus1152` | Cat. 5   | 1728 bytes | 3488 bytes | 1728 bytes | 32 bytes      |

You can also look them up dynamically:

```ts
import { ntruplus, PARAMETER_SETS } from "@killd21/ntruplus";

PARAMETER_SETS;        // ["ntruplus768", "ntruplus864", "ntruplus1152"]
const scheme = ntruplus["ntruplus864"];
```

## API

Each parameter set is a `KemScheme`:

```ts
interface KemScheme {
  readonly name: string;          // e.g. "NTRU+768"
  readonly publicKeyBytes: number;
  readonly secretKeyBytes: number;
  readonly ciphertextBytes: number;
  readonly sharedSecretBytes: number; // 32

  keygen(): Promise<{ publicKey: Uint8Array; secretKey: Uint8Array }>;

  encapsulate(
    publicKey: Uint8Array,
  ): Promise<{ ciphertext: Uint8Array; sharedSecret: Uint8Array }>;

  decapsulate(
    ciphertext: Uint8Array,
    secretKey: Uint8Array,
  ): Promise<Uint8Array>; // throws on an invalid ciphertext
}
```

All methods are `async`: the WebAssembly module is loaded once, lazily, on first
use. `decapsulate` throws if the ciphertext fails the re-encryption check.

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

This package wraps the NTRU+ **reference** implementation. It is validated
against the official Known Answer Tests, but:

- it has **not** undergone an independent security audit, and
- WebAssembly / JavaScript cannot guarantee constant-time execution.

Evaluate carefully before using it to protect high-value secrets in production.

## About NTRU+

NTRU+ is an NTRU-lattice KEM with an NTT-friendly ring, combining the classic
NTRU trapdoor with modern Kyber-style FO-transform techniques (SOTP encoding,
re-encryption check) for CCA security. See <https://www.ntruplus.org/>.

## License

[MIT](./LICENSE). Distributes and builds upon the NTRU+ reference implementation
(© NTRU+ TEAM), retained under `vendor/NTRUplus`.
