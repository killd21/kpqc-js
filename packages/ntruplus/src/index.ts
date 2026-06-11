// @killd21/ntruplus — NTRU+ post-quantum key encapsulation mechanism (KpqC),
// compiled to WebAssembly. Works in Node.js and browsers.
//
// NTRU+ is a lattice-based KEM selected as a final algorithm in Round 2 of the
// Korean Post-Quantum Cryptography (KpqC) Competition. A KEM establishes a
// shared secret between two parties: the sender encapsulates against the
// recipient's public key, the recipient decapsulates with their secret key.
//
// SECURITY NOTE: This package wraps the NTRU+ *reference* implementation. It is
// validated against the official Known Answer Tests but has NOT undergone an
// independent security audit, and WebAssembly/JS cannot guarantee constant-time
// execution. Evaluate carefully before production use.

import { fn, loadNtruplus, readBytes, withHeap, writeBytes } from "./wasm.js";

export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface Encapsulation {
  /** Send this to the holder of the secret key. */
  ciphertext: Uint8Array;
  /** Keep this; the recipient derives the same bytes via decapsulate(). */
  sharedSecret: Uint8Array;
}

export interface KemScheme {
  /** Algorithm name, e.g. "NTRU+768". */
  readonly name: string;
  readonly publicKeyBytes: number;
  readonly secretKeyBytes: number;
  readonly ciphertextBytes: number;
  readonly sharedSecretBytes: number;
  /** Generate a fresh keypair using the platform's secure RNG. */
  keygen(): Promise<KeyPair>;
  /** Encapsulate a fresh shared secret against `publicKey`. */
  encapsulate(publicKey: Uint8Array): Promise<Encapsulation>;
  /** Recover the shared secret from `ciphertext` using `secretKey`. */
  decapsulate(
    ciphertext: Uint8Array,
    secretKey: Uint8Array,
  ): Promise<Uint8Array>;
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

function assertLen(name: string, got: number, want: number): void {
  if (got !== want) {
    throw new Error(`${name} must be ${want} bytes, got ${got}`);
  }
}

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
      mod._ntruplus_use_secure_rng();
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
      mod._ntruplus_use_secure_rng();
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
