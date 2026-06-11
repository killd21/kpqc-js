// SMAUG-T post-quantum key encapsulation mechanism (KpqC), compiled to
// WebAssembly.
//
// SMAUG-T is a lattice-based KEM (Module-LWE + Module-LWR) selected as a final
// algorithm in Round 2 of the Korean Post-Quantum Cryptography (KpqC)
// Competition. A KEM establishes a shared secret between two parties: the
// sender encapsulates against the recipient's public key, the recipient
// decapsulates with their secret key. The TiMER parameter set is SMAUG-T's
// IoT-oriented security-level-1 variant with D2 encoding.
//
// Unlike NTRU+, SMAUG-T uses *implicit rejection*: decapsulating an invalid
// ciphertext does not fail — it returns a deterministic pseudo-random shared
// secret instead, so a tampered ciphertext is only detected when the two sides'
// secrets disagree.
//
// SECURITY NOTE: This module wraps the SMAUG-T *reference* implementation. It
// is validated against the official Known Answer Tests but has NOT undergone an
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
import type { Encapsulation, KemScheme, KeyPair } from "./types.js";

export type { Encapsulation, KemScheme, KeyPair };

let modulePromise: Promise<EmscriptenModule> | undefined;

/** Instantiate (once) and return the shared wasm module instance. */
async function loadSmaugt(): Promise<EmscriptenModule> {
  if (!modulePromise) {
    modulePromise = import("../wasm/smaugt.mjs").then((m) => m.default());
  }
  return modulePromise;
}

interface Sizes {
  pk: number;
  sk: number;
  ct: number;
  ss: number;
}

const PARAMS = {
  smaugt128: { mode: "mode1", name: "SMAUG-T128", pk: 672, sk: 832, ct: 672, ss: 32 },
  smaugt192: { mode: "mode3", name: "SMAUG-T192", pk: 1088, sk: 1312, ct: 992, ss: 32 },
  smaugt256: { mode: "mode5", name: "SMAUG-T256", pk: 1440, sk: 1728, ct: 1376, ss: 32 },
  timer: { mode: "modet", name: "TiMER", pk: 672, sk: 832, ct: 608, ss: 32 },
} satisfies Record<string, Sizes & { mode: string; name: string }>;

export type ParameterSet = keyof typeof PARAMS;

export const PARAMETER_SETS = Object.keys(PARAMS) as ParameterSet[];

function createScheme(set: ParameterSet): KemScheme {
  const { mode, name, pk, sk, ct, ss } = PARAMS[set];
  const ns = `_cryptolab_smaugt_${mode}_`;

  return {
    name,
    publicKeyBytes: pk,
    secretKeyBytes: sk,
    ciphertextBytes: ct,
    sharedSecretBytes: ss,

    async keygen(): Promise<KeyPair> {
      const mod = await loadSmaugt();
      fn(mod, "_smaugt_use_secure_rng")();
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

    async encapsulate(publicKey): Promise<Encapsulation> {
      assertLen("publicKey", publicKey.length, pk);
      const mod = await loadSmaugt();
      fn(mod, "_smaugt_use_secure_rng")();
      const enc = fn(mod, ns + "enc");
      return withHeap(mod, [ct, ss, pk], (ctPtr, ssPtr, pkPtr) => {
        writeBytes(mod, pkPtr, publicKey);
        const rc = enc(ctPtr, ssPtr, pkPtr);
        if (rc !== 0) throw new Error(`encapsulate failed (rc=${rc})`);
        return {
          ciphertext: readBytes(mod, ctPtr, ct),
          sharedSecret: readBytes(mod, ssPtr, ss),
        };
      });
    },

    // Implicit rejection: an invalid ciphertext yields a pseudo-random shared
    // secret rather than an error (see module note above).
    async decapsulate(ciphertext, secretKey): Promise<Uint8Array> {
      assertLen("ciphertext", ciphertext.length, ct);
      assertLen("secretKey", secretKey.length, sk);
      const mod = await loadSmaugt();
      const dec = fn(mod, ns + "dec");
      return withHeap(mod, [ss, ct, sk], (ssPtr, ctPtr, skPtr) => {
        writeBytes(mod, ctPtr, ciphertext);
        writeBytes(mod, skPtr, secretKey);
        const rc = dec(ssPtr, ctPtr, skPtr);
        if (rc !== 0) throw new Error(`decapsulate failed (rc=${rc})`);
        return readBytes(mod, ssPtr, ss);
      });
    },
  };
}

export const smaugt128 = createScheme("smaugt128");
export const smaugt192 = createScheme("smaugt192");
export const smaugt256 = createScheme("smaugt256");
export const timer = createScheme("timer");

export const smaugt: Record<ParameterSet, KemScheme> = {
  smaugt128,
  smaugt192,
  smaugt256,
  timer,
};
