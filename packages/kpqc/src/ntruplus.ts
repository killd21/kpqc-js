// NTRU+ post-quantum key encapsulation mechanism (KpqC), compiled to
// WebAssembly.
//
// NTRU+ is a lattice-based KEM selected as a final algorithm in Round 2 of the
// Korean Post-Quantum Cryptography (KpqC) Competition. A KEM establishes a
// shared secret between two parties: the sender encapsulates against the
// recipient's public key, the recipient decapsulates with their secret key.
//
// SECURITY NOTE: This module wraps the NTRU+ *reference* implementation. It is
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
import type { Encapsulation, KemScheme, KeyPair } from "./types.js";

export type { Encapsulation, KemScheme, KeyPair };

let modulePromise: Promise<EmscriptenModule> | undefined;

/** Instantiate (once) and return the shared wasm module instance. */
async function loadNtruplus(): Promise<EmscriptenModule> {
  if (!modulePromise) {
    modulePromise = import("../wasm/ntruplus.mjs").then((m) => m.default());
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
  ntruplus768: { pk: 1152, sk: 2336, ct: 1152, ss: 32 },
  ntruplus864: { pk: 1296, sk: 2624, ct: 1296, ss: 32 },
  ntruplus1152: { pk: 1728, sk: 3488, ct: 1728, ss: 32 },
} satisfies Record<string, Sizes>;

export type ParameterSet = keyof typeof PARAMS;

export const PARAMETER_SETS = Object.keys(PARAMS) as ParameterSet[];

function createScheme(set: ParameterSet): KemScheme {
  const { pk, sk, ct, ss } = PARAMS[set];
  const n = set.slice("ntruplus".length);
  const ns = `_ntruplus${n}_`;
  const name = `NTRU+${n}`;

  return {
    name,
    publicKeyBytes: pk,
    secretKeyBytes: sk,
    ciphertextBytes: ct,
    sharedSecretBytes: ss,

    async keygen(): Promise<KeyPair> {
      const mod = await loadNtruplus();
      fn(mod, "_ntruplus_use_secure_rng")();
      const keypair = fn(mod, ns + "crypto_kem_keypair");
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
      const mod = await loadNtruplus();
      fn(mod, "_ntruplus_use_secure_rng")();
      const enc = fn(mod, ns + "crypto_kem_enc");
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

    async decapsulate(ciphertext, secretKey): Promise<Uint8Array> {
      assertLen("ciphertext", ciphertext.length, ct);
      assertLen("secretKey", secretKey.length, sk);
      const mod = await loadNtruplus();
      const dec = fn(mod, ns + "crypto_kem_dec");
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

export const ntruplus768 = createScheme("ntruplus768");
export const ntruplus864 = createScheme("ntruplus864");
export const ntruplus1152 = createScheme("ntruplus1152");

export const ntruplus: Record<ParameterSet, KemScheme> = {
  ntruplus768,
  ntruplus864,
  ntruplus1152,
};
