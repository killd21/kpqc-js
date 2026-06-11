import { describe, expect, it } from "vitest";
import {
  ntruplus,
  PARAMETER_SETS,
  type KemScheme,
  type ParameterSet,
} from "../src/index.js";

const SIZES: Record<
  ParameterSet,
  { pk: number; sk: number; ct: number; ss: number }
> = {
  ntruplus768: { pk: 1152, sk: 2336, ct: 1152, ss: 32 },
  ntruplus864: { pk: 1296, sk: 2624, ct: 1296, ss: 32 },
  ntruplus1152: { pk: 1728, sk: 3488, ct: 1728, ss: 32 },
};

describe("PARAMETER_SETS", () => {
  it("exposes all three NTRU+ parameter sets", () => {
    expect(PARAMETER_SETS).toHaveLength(3);
    for (const set of PARAMETER_SETS) {
      expect(ntruplus[set]).toBeDefined();
    }
  });
});

describe.each(PARAMETER_SETS)("%s", (set) => {
  const scheme: KemScheme = ntruplus[set];
  const sizes = SIZES[set];

  it("reports correct constants", () => {
    expect(scheme.name).toBe(`NTRU+${set.slice("ntruplus".length)}`);
    expect(scheme.publicKeyBytes).toBe(sizes.pk);
    expect(scheme.secretKeyBytes).toBe(sizes.sk);
    expect(scheme.ciphertextBytes).toBe(sizes.ct);
    expect(scheme.sharedSecretBytes).toBe(sizes.ss);
  });

  it("generates keys of the right size", async () => {
    const { publicKey, secretKey } = await scheme.keygen();
    expect(publicKey).toHaveLength(sizes.pk);
    expect(secretKey).toHaveLength(sizes.sk);
  });

  it("encapsulates and decapsulates to the same shared secret", async () => {
    const { publicKey, secretKey } = await scheme.keygen();
    const { ciphertext, sharedSecret } = await scheme.encapsulate(publicKey);
    expect(ciphertext).toHaveLength(sizes.ct);
    expect(sharedSecret).toHaveLength(sizes.ss);
    const recovered = await scheme.decapsulate(ciphertext, secretKey);
    expect(recovered).toEqual(sharedSecret);
  });

  it("produces a fresh secret per encapsulation", async () => {
    const { publicKey } = await scheme.keygen();
    const a = await scheme.encapsulate(publicKey);
    const b = await scheme.encapsulate(publicKey);
    expect(a.sharedSecret).not.toEqual(b.sharedSecret);
    expect(a.ciphertext).not.toEqual(b.ciphertext);
  });

  it("rejects a tampered ciphertext", async () => {
    const { publicKey, secretKey } = await scheme.keygen();
    const { ciphertext } = await scheme.encapsulate(publicKey);
    ciphertext[0] ^= 0xff;
    await expect(
      scheme.decapsulate(ciphertext, secretKey),
    ).rejects.toThrow();
  });

  it("does not decapsulate with a different key", async () => {
    const a = await scheme.keygen();
    const b = await scheme.keygen();
    const { sharedSecret, ciphertext } = await scheme.encapsulate(a.publicKey);
    // Wrong-key decapsulation must never yield the right secret; depending on
    // the unpacked values it either throws or returns garbage.
    let recovered: Uint8Array | undefined;
    try {
      recovered = await scheme.decapsulate(ciphertext, b.secretKey);
    } catch {
      recovered = undefined;
    }
    if (recovered) expect(recovered).not.toEqual(sharedSecret);
  });

  it("validates input lengths", async () => {
    const { publicKey, secretKey } = await scheme.keygen();
    const { ciphertext } = await scheme.encapsulate(publicKey);
    await expect(scheme.encapsulate(publicKey.slice(1))).rejects.toThrow();
    await expect(
      scheme.decapsulate(ciphertext.slice(1), secretKey),
    ).rejects.toThrow();
    await expect(
      scheme.decapsulate(ciphertext, secretKey.slice(1)),
    ).rejects.toThrow();
  });
});
