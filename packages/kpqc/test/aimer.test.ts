import { describe, expect, it } from "vitest";
import {
  aimer,
  PARAMETER_SETS,
  type ParameterSet,
  type SignatureScheme,
} from "../src/aimer.js";

const SIZES: Record<ParameterSet, { pk: number; sk: number; sig: number }> = {
  aimer128f: { pk: 32, sk: 48, sig: 5888 },
  aimer128s: { pk: 32, sk: 48, sig: 4160 },
  aimer192f: { pk: 48, sk: 72, sig: 13056 },
  aimer192s: { pk: 48, sk: 72, sig: 9120 },
  aimer256f: { pk: 64, sk: 96, sig: 25120 },
  aimer256s: { pk: 64, sk: 96, sig: 17056 },
};

const msg = new TextEncoder().encode("the quick brown fox");

describe("PARAMETER_SETS", () => {
  it("exposes all six AIMer parameter sets", () => {
    expect(PARAMETER_SETS).toHaveLength(6);
    for (const set of PARAMETER_SETS) {
      expect(aimer[set]).toBeDefined();
    }
  });
});

describe.each(PARAMETER_SETS)("%s", (set) => {
  const scheme: SignatureScheme = aimer[set];
  const sizes = SIZES[set];

  it("reports correct constants", () => {
    expect(scheme.name).toBe(`aimer-${set.slice(5)}`);
    expect(scheme.publicKeyBytes).toBe(sizes.pk);
    expect(scheme.secretKeyBytes).toBe(sizes.sk);
    expect(scheme.signatureBytes).toBe(sizes.sig);
  });

  it("generates keys of the right size", async () => {
    const { publicKey, secretKey } = await scheme.keygen();
    expect(publicKey).toHaveLength(sizes.pk);
    expect(secretKey).toHaveLength(sizes.sk);
  });

  it("signs and verifies a round trip", async () => {
    const { publicKey, secretKey } = await scheme.keygen();
    const sig = await scheme.sign(msg, secretKey);
    expect(sig).toHaveLength(sizes.sig);
    expect(await scheme.verify(msg, sig, publicKey)).toBe(true);
  });

  it("rejects a tampered message", async () => {
    const { publicKey, secretKey } = await scheme.keygen();
    const sig = await scheme.sign(msg, secretKey);
    const tampered = new TextEncoder().encode("the quick brown FOX");
    expect(await scheme.verify(tampered, sig, publicKey)).toBe(false);
  });

  it("rejects a tampered signature", async () => {
    const { publicKey, secretKey } = await scheme.keygen();
    const sig = await scheme.sign(msg, secretKey);
    sig[0] ^= 0xff;
    expect(await scheme.verify(msg, sig, publicKey)).toBe(false);
  });

  it("rejects a signature from a different key", async () => {
    const a = await scheme.keygen();
    const b = await scheme.keygen();
    const sig = await scheme.sign(msg, a.secretKey);
    expect(await scheme.verify(msg, sig, b.publicKey)).toBe(false);
  });

  it("binds the context string", async () => {
    const { publicKey, secretKey } = await scheme.keygen();
    const ctx = new TextEncoder().encode("ctx-A");
    const sig = await scheme.sign(msg, secretKey, { context: ctx });
    expect(await scheme.verify(msg, sig, publicKey, { context: ctx })).toBe(true);
    expect(await scheme.verify(msg, sig, publicKey)).toBe(false);
    const other = new TextEncoder().encode("ctx-B");
    expect(
      await scheme.verify(msg, sig, publicKey, { context: other }),
    ).toBe(false);
  });

  it("validates key lengths", async () => {
    const { publicKey, secretKey } = await scheme.keygen();
    const sig = await scheme.sign(msg, secretKey);
    await expect(scheme.sign(msg, secretKey.slice(1))).rejects.toThrow();
    await expect(
      scheme.verify(msg, sig, publicKey.slice(1)),
    ).rejects.toThrow();
  });

  it("handles empty messages", async () => {
    const { publicKey, secretKey } = await scheme.keygen();
    const empty = new Uint8Array(0);
    const sig = await scheme.sign(empty, secretKey);
    expect(await scheme.verify(empty, sig, publicKey)).toBe(true);
  });
});
