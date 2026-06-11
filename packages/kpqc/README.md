# @killd21/kpqc

> KpqC (Korean Post-Quantum Cryptography) for JavaScript & TypeScript — Node.js and the browser.

[![npm](https://img.shields.io/npm/v/@killd21/kpqc.svg)](https://www.npmjs.com/package/@killd21/kpqc)
[![license](https://img.shields.io/npm/l/@killd21/kpqc.svg)](./LICENSE)
[![types](https://img.shields.io/npm/types/@killd21/kpqc.svg)](https://www.npmjs.com/package/@killd21/kpqc)

One package, three [KpqC](https://www.kpqc.or.kr/) algorithms — the official
reference implementations compiled to WebAssembly, wrapped in small, fully-typed
APIs:

| Algorithm  | Kind                | Basis                        | Import                    |
| ---------- | ------------------- | ---------------------------- | ------------------------- |
| **AIMer**  | Digital signature   | Symmetric / MPC-in-the-head  | `@killd21/kpqc/aimer`     |
| **HAETAE** | Digital signature   | Lattice (Module-LWE/SIS)     | `@killd21/kpqc/haetae`    |
| **NTRU+**  | Key encapsulation   | Lattice (NTRU)               | `@killd21/kpqc/ntruplus`  |

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

```sh
pnpm add @killd21/kpqc    # or: yarn add @killd21/kpqc / bun add @killd21/kpqc
```

## Quick start

### Signatures (HAETAE, AIMer)

```ts
import { haetae2 } from "@killd21/kpqc/haetae";
// AIMer works identically: import { aimer128f } from "@killd21/kpqc/aimer";

const message = new TextEncoder().encode("hello post-quantum world");

const { publicKey, secretKey } = await haetae2.keygen();
const signature = await haetae2.sign(message, secretKey);
const isValid = await haetae2.verify(message, signature, publicKey);
console.log(isValid); // true
```

### Key encapsulation (NTRU+)

```ts
import { ntruplus768 } from "@killd21/kpqc/ntruplus";

// Recipient: generate a keypair, publish the public key.
const { publicKey, secretKey } = await ntruplus768.keygen();

// Sender: encapsulate a fresh 32-byte shared secret against the public key.
const { ciphertext, sharedSecret } = await ntruplus768.encapsulate(publicKey);

// Recipient: recover the same shared secret (e.g. to key AES-256-GCM).
const recovered = await ntruplus768.decapsulate(ciphertext, secretKey);
// recovered ≡ sharedSecret
```

Everything is a plain `Uint8Array`, so you can store or transmit values however
you like (base64, hex, files, …). All methods are `async`: each algorithm's
wasm module loads once, lazily, on first use.

You can also import everything from the root (parameter-set lists get
algorithm-prefixed names there to avoid clashes):

```ts
import {
  aimer128f, haetae2, ntruplus768,
  AIMER_PARAMETER_SETS, HAETAE_PARAMETER_SETS, NTRUPLUS_PARAMETER_SETS,
} from "@killd21/kpqc";
```

## Parameter sets

### AIMer — `@killd21/kpqc/aimer`

`f` = faster signing / larger signatures, `s` = smaller signatures / slower.

| Set         | Security | Public key | Secret key | Signature |
| ----------- | -------- | ---------: | ---------: | --------: |
| `aimer128f` | 128-bit  |       32 B |       48 B |    5.9 KB |
| `aimer128s` | 128-bit  |       32 B |       48 B |    4.2 KB |
| `aimer192f` | 192-bit  |       48 B |       72 B |   13.1 KB |
| `aimer192s` | 192-bit  |       48 B |       72 B |    9.1 KB |
| `aimer256f` | 256-bit  |       64 B |       96 B |   25.1 KB |
| `aimer256s` | 256-bit  |       64 B |       96 B |   17.1 KB |

### HAETAE — `@killd21/kpqc/haetae`

| Set       | Security | Public key | Secret key | Signature |
| --------- | -------- | ---------: | ---------: | --------: |
| `haetae2` | Cat. 2   |      992 B |     1408 B |    1474 B |
| `haetae3` | Cat. 3   |     1472 B |     2112 B |    2349 B |
| `haetae5` | Cat. 5   |     2080 B |     2752 B |    2948 B |

### NTRU+ — `@killd21/kpqc/ntruplus`

| Set            | Security | Public key | Secret key | Ciphertext | Shared secret |
| -------------- | -------- | ---------: | ---------: | ---------: | ------------: |
| `ntruplus768`  | Cat. 1   |     1152 B |     2336 B |     1152 B |          32 B |
| `ntruplus864`  | Cat. 3   |     1296 B |     2624 B |     1296 B |          32 B |
| `ntruplus1152` | Cat. 5   |     1728 B |     3488 B |     1728 B |          32 B |

Each subpath also exports `PARAMETER_SETS` and a lookup map
(`aimer` / `haetae` / `ntruplus`) for dynamic selection:

```ts
import { haetae, PARAMETER_SETS } from "@killd21/kpqc/haetae";

PARAMETER_SETS;               // ["haetae2", "haetae3", "haetae5"]
const scheme = haetae["haetae3"];
```

## Context strings (signatures)

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

Signature schemes (AIMer, HAETAE) implement `SignatureScheme`; NTRU+ implements
`KemScheme`:

```ts
interface SignatureScheme {
  readonly name: string;
  readonly publicKeyBytes: number;
  readonly secretKeyBytes: number;
  readonly signatureBytes: number;

  keygen(): Promise<{ publicKey: Uint8Array; secretKey: Uint8Array }>;
  sign(message: Uint8Array, secretKey: Uint8Array,
       options?: { context?: Uint8Array }): Promise<Uint8Array>; // detached
  verify(message: Uint8Array, signature: Uint8Array, publicKey: Uint8Array,
         options?: { context?: Uint8Array }): Promise<boolean>;
}

interface KemScheme {
  readonly name: string;
  readonly publicKeyBytes: number;
  readonly secretKeyBytes: number;
  readonly ciphertextBytes: number;
  readonly sharedSecretBytes: number; // 32

  keygen(): Promise<{ publicKey: Uint8Array; secretKey: Uint8Array }>;
  encapsulate(publicKey: Uint8Array):
    Promise<{ ciphertext: Uint8Array; sharedSecret: Uint8Array }>;
  decapsulate(ciphertext: Uint8Array, secretKey: Uint8Array):
    Promise<Uint8Array>; // throws on an invalid ciphertext
}
```

## Runtime support

| Environment        | Supported            |
| ------------------ | -------------------- |
| Node.js ≥ 18       | ✅                   |
| Browsers (ESM)     | ✅ (WebAssembly)     |
| Deno / Bun         | ✅                   |
| Web Workers        | ✅                   |

The secure random source is the Web Crypto API, falling back to Node's `crypto`
module. In bundlers (Vite, webpack, esbuild, …) each `.wasm` is loaded as an
asset next to the module — no special configuration is typically required.

## Migrating from @killd21/aimer / @killd21/haetae

The subpath entries are drop-in replacements — only the import specifier
changes:

```diff
- import { aimer128f } from "@killd21/aimer";
+ import { aimer128f } from "@killd21/kpqc/aimer";

- import { haetae2 } from "@killd21/haetae";
+ import { haetae2 } from "@killd21/kpqc/haetae";
```

## Security notice

This package wraps the official **reference** implementations. They are
validated against the official Known Answer Tests, but:

- they have **not** undergone an independent security audit, and
- WebAssembly / JavaScript cannot guarantee constant-time execution.

Evaluate carefully before using this to protect high-value secrets in
production.

## License

[MIT](./LICENSE). Distributes and builds upon the AIMer (© Samsung SDS),
HAETAE (CryptoLab Inc. and collaborators) and NTRU+ (© NTRU+ TEAM) reference
implementations, retained under `vendor/` in the
[source repository](https://github.com/killd21/kpqc-js).
