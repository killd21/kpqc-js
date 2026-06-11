import { describe, expect, it } from "vitest";
import {
  smaugt,
  PARAMETER_SETS,
  type KemScheme,
  type ParameterSet,
} from "../src/smaugt.js";

const SIZES: Record<
  ParameterSet,
  { name: string; pk: number; sk: number; ct: number; ss: number }
> = {
  smaugt128: { name: "SMAUG-T128", pk: 672, sk: 832, ct: 672, ss: 32 },
  smaugt192: { name: "SMAUG-T192", pk: 1088, sk: 1312, ct: 992, ss: 32 },
  smaugt256: { name: "SMAUG-T256", pk: 1440, sk: 1728, ct: 1376, ss: 32 },
  timer: { name: "TiMER", pk: 672, sk: 832, ct: 608, ss: 32 },
};

describe("PARAMETER_SETS", () => {
  it("exposes all four SMAUG-T parameter sets", () => {
    expect(PARAMETER_SETS).toHaveLength(4);
    for (const set of PARAMETER_SETS) {
      expect(smaugt[set]).toBeDefined();
    }
  });
});

describe.each(PARAMETER_SETS)("%s", (set) => {
  const scheme: KemScheme = smaugt[set];
  const sizes = SIZES[set];

  it("reports correct constants", () => {
    expect(scheme.name).toBe(sizes.name);
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

  it("implicitly rejects a tampered ciphertext", async () => {
    const { publicKey, secretKey } = await scheme.keygen();
    const { ciphertext, sharedSecret } = await scheme.encapsulate(publicKey);
    ciphertext[0] ^= 0xff;
    // SMAUG-T uses implicit rejection: decapsulation never throws, it returns
    // a pseudo-random secret that cannot match the encapsulated one.
    const recovered = await scheme.decapsulate(ciphertext, secretKey);
    expect(recovered).toHaveLength(sizes.ss);
    expect(recovered).not.toEqual(sharedSecret);
  });

  it("does not decapsulate with a different key", async () => {
    const a = await scheme.keygen();
    const b = await scheme.keygen();
    const { sharedSecret, ciphertext } = await scheme.encapsulate(a.publicKey);
    const recovered = await scheme.decapsulate(ciphertext, b.secretKey);
    expect(recovered).not.toEqual(sharedSecret);
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
