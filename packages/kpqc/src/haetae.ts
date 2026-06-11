// HAETAE post-quantum digital signature (KpqC), compiled to WebAssembly.
//
// HAETAE is a lattice-based (Module-LWE / Module-SIS) signature scheme using the
// "Fiat-Shamir with aborts" paradigm and bimodal/hyperball Gaussian sampling. It
// was submitted to the Korean Post-Quantum Cryptography (KpqC) Competition.
//
// SECURITY NOTE: This module wraps the HAETAE *reference* implementation. It is
// validated against the official Known Answer Tests but has NOT undergone an
// independent security audit, and WebAssembly/JS cannot guarantee constant-time
// execution. Evaluate carefully before production use.

import {
  assertLen,
  fn,
  readBytes,
  withHeap,
  writeBytes,
  type EmscriptenModule,
} from "./internal.js";
import type { KeyPair, SignatureScheme, SignOptions } from "./types.js";

export type { KeyPair, SignatureScheme, SignOptions };

let modulePromise: Promise<EmscriptenModule> | undefined;

/** Instantiate (once) and return the shared wasm module instance. */
async function loadHaetae(): Promise<EmscriptenModule> {
  if (!modulePromise) {
    modulePromise = import("../wasm/haetae.mjs").then((m) => m.default());
  }
  return modulePromise;
}

interface Sizes {
  pk: number;
  sk: number;
  sig: number;
}

const PARAMS = {
  haetae2: { pk: 992, sk: 1408, sig: 1474 },
  haetae3: { pk: 1472, sk: 2112, sig: 2349 },
  haetae5: { pk: 2080, sk: 2752, sig: 2948 },
} satisfies Record<string, Sizes>;

export type ParameterSet = keyof typeof PARAMS;

export const PARAMETER_SETS = Object.keys(PARAMS) as ParameterSet[];

function createScheme(set: ParameterSet): SignatureScheme {
  const { pk, sk, sig } = PARAMS[set];
  const mode = set.replace(/^haetae/, "mode");
  const ns = `_cryptolab_haetae_${mode}_`;
  const name = `haetae-${mode}`;

  return {
    name,
    publicKeyBytes: pk,
    secretKeyBytes: sk,
    signatureBytes: sig,

    async keygen(): Promise<KeyPair> {
      const mod = await loadHaetae();
      fn(mod, "_haetae_use_secure_rng")();
      const keypair = fn(mod, ns + "keypair");
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
      const mod = await loadHaetae();
      fn(mod, "_haetae_use_secure_rng")();
      const signature = fn(mod, ns + "signature");
      return withHeap(
        mod,
        [sig, 4, message.length || 1, sk, ctx.length || 1],
        (sigPtr, sigLenPtr, mPtr, skPtr, ctxPtr) => {
          if (message.length) writeBytes(mod, mPtr, message);
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
      const mod = await loadHaetae();
      const verify = fn(mod, ns + "verify");
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

export const haetae2 = createScheme("haetae2");
export const haetae3 = createScheme("haetae3");
export const haetae5 = createScheme("haetae5");

export const haetae: Record<ParameterSet, SignatureScheme> = {
  haetae2,
  haetae3,
  haetae5,
};
