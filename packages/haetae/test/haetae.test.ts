import { describe, expect, it } from "vitest";
import {
  haetae,
  PARAMETER_SETS,
  type ParameterSet,
  type SignatureScheme,
} from "../src/index.js";

const SIZES: Record<ParameterSet, { pk: number; sk: number; sig: number }> = {
  haetae2: { pk: 992, sk: 1408, sig: 1474 },
  haetae3: { pk: 1472, sk: 2112, sig: 2349 },
  haetae5: { pk: 2080, sk: 2752, sig: 2948 },
};

const msg = new TextEncoder().encode("the quick brown fox");

describe("PARAMETER_SETS", () => {
  it("exposes all three HAETAE parameter sets", () => {
    expect(PARAMETER_SETS).toHaveLength(3);
    for (const set of PARAMETER_SETS) {
      expect(haetae[set]).toBeDefined();
    }
  });
});

describe.each(PARAMETER_SETS)("%s", (set) => {
  const scheme: SignatureScheme = haetae[set];
  const sizes = SIZES[set];

  it("reports correct constants", () => {
    expect(scheme.name).toBe(`haetae-${set.replace("haetae", "mode")}`);
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
    expect(await scheme.verify(msg, sig, publicKey, { context: ctx })).toBe(
      true,
    );
    expect(await scheme.verify(msg, sig, publicKey)).toBe(false);
    const other = new TextEncoder().encode("ctx-B");
    expect(await scheme.verify(msg, sig, publicKey, { context: other })).toBe(
      false,
    );
  });

  it("validates key lengths", async () => {
    const { publicKey, secretKey } = await scheme.keygen();
    const sig = await scheme.sign(msg, secretKey);
    await expect(scheme.sign(msg, secretKey.slice(1))).rejects.toThrow();
    await expect(scheme.verify(msg, sig, publicKey.slice(1))).rejects.toThrow();
  });

  it("handles empty messages", async () => {
    const { publicKey, secretKey } = await scheme.keygen();
    const empty = new Uint8Array(0);
    const sig = await scheme.sign(empty, secretKey);
    expect(await scheme.verify(empty, sig, publicKey)).toBe(true);
  });
});
