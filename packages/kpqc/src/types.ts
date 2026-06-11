// Shared public types for all KpqC schemes in this package.

export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface SignOptions {
  /** Optional context string bound into the signature (max 255 bytes). */
  context?: Uint8Array;
}

/** A detached-signature scheme (AIMer, HAETAE). */
export interface SignatureScheme {
  /** Algorithm name, e.g. "aimer-128f" or "haetae-mode2". */
  readonly name: string;
  readonly publicKeyBytes: number;
  readonly secretKeyBytes: number;
  /** Maximum (and, for these reference builds, exact) signature size in bytes. */
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

export interface Encapsulation {
  /** Send this to the holder of the secret key. */
  ciphertext: Uint8Array;
  /** Keep this; the recipient derives the same bytes via decapsulate(). */
  sharedSecret: Uint8Array;
}

/** A key encapsulation mechanism (NTRU+). */
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
