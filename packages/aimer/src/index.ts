// @kpqc/aimer — AIMer post-quantum digital signature (KpqC), compiled to
// WebAssembly. Works in Node.js and browsers.
//
// AIMer is a stateless hash-/MPC-in-the-head signature scheme submitted by
// Samsung SDS to the Korean Post-Quantum Cryptography (KpqC) Competition.
//
// SECURITY NOTE: This package wraps the AIMer *reference* implementation. It is
// validated against the official Known Answer Tests but has NOT undergone an
// independent security audit, and WebAssembly/JS cannot guarantee constant-time
// execution. Evaluate carefully before production use.

import { fn, loadAimer, readBytes, withHeap, writeBytes } from "./wasm.js";

export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface SignOptions {
  /** Optional context string bound into the signature (max 255 bytes). */
  context?: Uint8Array;
}

export interface SignatureScheme {
  /** Algorithm name, e.g. "aimer-128f". */
  readonly name: string;
  readonly publicKeyBytes: number;
  readonly secretKeyBytes: number;
  /** Maximum (and, for AIMer, exact) detached signature size in bytes. */
  readonly signatureBytes: number;
  /** Generate a fresh keypair using the platform's secure RNG. */
  keygen(): Promise<KeyPair>;
  /** Produce a detached signature over `message`. */
  sign(
    message: Uint8Array,
    secretKey: Uint8Array,
    options?: SignOptions,
  ): Promise<Uint8Array>;
  /** Verify a detached signature. Returns true iff valid. */
  verify(
    message: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array,
    options?: SignOptions,
  ): Promise<boolean>;
}

interface Sizes {
  pk: number;
  sk: number;
  sig: number;
}

const PARAMS = {
  aimer128f: { pk: 32, sk: 48, sig: 5888 },
  aimer128s: { pk: 32, sk: 48, sig: 4160 },
  aimer192f: { pk: 48, sk: 72, sig: 13056 },
  aimer192s: { pk: 48, sk: 72, sig: 9120 },
  aimer256f: { pk: 64, sk: 96, sig: 25120 },
  aimer256s: { pk: 64, sk: 96, sig: 17056 },
} satisfies Record<string, Sizes>;

export type ParameterSet = keyof typeof PARAMS;

export const PARAMETER_SETS = Object.keys(PARAMS) as ParameterSet[];

function assertLen(name: string, got: number, want: number): void {
  if (got !== want) {
    throw new Error(`${name} must be ${want} bytes, got ${got}`);
  }
}

function createScheme(set: ParameterSet): SignatureScheme {
  const { pk, sk, sig } = PARAMS[set];
  const ns = `_samsungsds_${set.replace(/^aimer/, "aimer_")}_ref_`;
  const name = `aimer-${set.slice("aimer".length)}`;

  return {
    name,
    publicKeyBytes: pk,
    secretKeyBytes: sk,
    signatureBytes: sig,

    async keygen(): Promise<KeyPair> {
      const mod = await loadAimer();
      mod._aimer_use_secure_rng();
      const keypair = fn(mod, ns + "crypto_sign_keypair");
      return withHeap(mod, [pk, sk], (pkPtr, skPtr) => {
        const rc = keypair(pkPtr, skPtr);
        if (rc !== 0) throw new Error(`keygen failed (rc=${rc})`);
        return {
          publicKey: readBytes(mod, pkPtr, pk),
          secretKey: readBytes(mod, skPtr, sk),
        };
      });
    },

    async sign(message, secretKey, options): Promise<Uint8Array> {
      assertLen("secretKey", secretKey.length, sk);
      const ctx = options?.context ?? new Uint8Array(0);
      if (ctx.length > 255) throw new Error("context must be <= 255 bytes");
      const mod = await loadAimer();
      mod._aimer_use_secure_rng();
      const signature = fn(mod, ns + "crypto_sign_signature");
      return withHeap(
        mod,
        [sig, 4, message.length, sk, ctx.length || 1],
        (sigPtr, sigLenPtr, mPtr, skPtr, ctxPtr) => {
          writeBytes(mod, mPtr, message);
          writeBytes(mod, skPtr, secretKey);
          if (ctx.length) writeBytes(mod, ctxPtr, ctx);
          const rc = signature(
            sigPtr,
            sigLenPtr,
            mPtr,
            message.length,
            ctxPtr,
            ctx.length,
            skPtr,
          );
          if (rc !== 0) throw new Error(`sign failed (rc=${rc})`);
          const len = mod.getValue(sigLenPtr, "i32");
          return readBytes(mod, sigPtr, len);
        },
      );
    },

    async verify(message, signature, publicKey, options): Promise<boolean> {
      assertLen("publicKey", publicKey.length, pk);
      const ctx = options?.context ?? new Uint8Array(0);
      if (ctx.length > 255) throw new Error("context must be <= 255 bytes");
      const mod = await loadAimer();
      const verify = fn(mod, ns + "crypto_sign_verify");
      return withHeap(
        mod,
        [signature.length || 1, message.length || 1, pk, ctx.length || 1],
        (sigPtr, mPtr, pkPtr, ctxPtr) => {
          if (signature.length) writeBytes(mod, sigPtr, signature);
          if (message.length) writeBytes(mod, mPtr, message);
          writeBytes(mod, pkPtr, publicKey);
          if (ctx.length) writeBytes(mod, ctxPtr, ctx);
          const rc = verify(
            sigPtr,
            signature.length,
            mPtr,
            message.length,
            ctxPtr,
            ctx.length,
            pkPtr,
          );
          return rc === 0;
        },
      );
    },
  };
}

export const aimer128f = createScheme("aimer128f");
export const aimer128s = createScheme("aimer128s");
export const aimer192f = createScheme("aimer192f");
export const aimer192s = createScheme("aimer192s");
export const aimer256f = createScheme("aimer256f");
export const aimer256s = createScheme("aimer256s");

export const aimer: Record<ParameterSet, SignatureScheme> = {
  aimer128f,
  aimer128s,
  aimer192f,
  aimer192s,
  aimer256f,
  aimer256s,
};
