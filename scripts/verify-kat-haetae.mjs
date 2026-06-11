// KAT gate: regenerate every official HAETAE Known Answer Test vector through
// the wasm module and compare byte-for-byte. Exits non-zero on any mismatch.
//
// Drives the deterministic NIST CTR-DRBG (randombytes_init) exactly as the
// reference PQCgenKAT_sign harness does, then checks pk, sk, siglen and the
// detached signature. HAETAE's KAT uses the *internal* API, which takes the
// keygen seed and signing randomness explicitly so the run is reproducible:
//
//   randombytes_init(seed)            // 48-byte seed
//   randombytes(keygen_seed, 32)      // -> keypair_internal(pk, sk, keygen_seed)
//   randombytes(rnd, 32)              // signing randomness
//   randombytes(ctx, 1); ctxlen=ctx[0]
//   randombytes(ctx, ctxlen)
//   pre = (ctxlen, ctx)               // -> signature_internal(.., pre, rnd, sk)
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import createHaetaeModule from "../packages/kpqc/wasm/haetae.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repo = join(__dirname, "..");

const SEEDBYTES = 32;

const SETS = {
  mode2: { pk: 992, sk: 1408, sig: 1474 },
  mode3: { pk: 1472, sk: 2112, sig: 2349 },
  mode5: { pk: 2080, sk: 2752, sig: 2948 },
};

const toBytes = (h) => Uint8Array.from(Buffer.from(h, "hex"));
const hex = (b) => Buffer.from(b).toString("hex").toUpperCase();

function parseRsp(text) {
  const records = [];
  const blocks = text.split(/^count = /m).slice(1);
  for (const block of blocks) {
    const field = (k) => {
      const m = block.match(new RegExp(`^${k} = ([0-9A-Fa-f]*)\\s*$`, "m"));
      return m ? m[1] : "";
    };
    const num = (k) =>
      parseInt(block.match(new RegExp(`^${k} = (\\d+)`, "m"))[1], 10);
    records.push({
      count: parseInt(block, 10),
      seed: toBytes(field("seed")),
      mlen: num("mlen"),
      msg: toBytes(field("msg")),
      pk: toBytes(field("pk")),
      sk: toBytes(field("sk")),
      siglen: num("siglen"),
      sig: toBytes(field("sig")),
    });
  }
  return records;
}

const M = await createHaetaeModule();
const put = (ptr, b) => M.HEAPU8.set(b, ptr);
const read = (ptr, n) => M.HEAPU8.slice(ptr, ptr + n);

function checkSet(mode) {
  const s = SETS[mode];
  const ns = `_cryptolab_haetae_${mode}_`;
  const keypair = M[ns + "keypair_internal"];
  const sign = M[ns + "signature_internal"];
  const verify = M[ns + "verify_internal"];

  const rsp = readFileSync(
    join(repo, `vendor/HAETAE/kat/PQCsignKAT_haetae_${mode}.rsp`),
    "utf8",
  );
  const records = parseRsp(rsp);

  let pass = 0;
  for (const r of records) {
    const seedP = M._malloc(48);
    const kseedP = M._malloc(SEEDBYTES);
    const rndP = M._malloc(SEEDBYTES);
    const ctxP = M._malloc(256);
    const preP = M._malloc(256);
    const pkP = M._malloc(s.pk);
    const skP = M._malloc(s.sk);
    const mP = M._malloc(r.mlen || 1);
    const sigP = M._malloc(s.sig);
    const siglenP = M._malloc(4);
    try {
      // Seed the deterministic DRBG, then consume randomness in the exact order
      // the reference KAT harness does.
      put(seedP, r.seed);
      M._randombytes_init(seedP, 0, 256);

      // keygen seed -> deterministic keypair
      M._randombytes(kseedP, SEEDBYTES);
      if (keypair(pkP, skP, kseedP) !== 0) throw new Error("keypair rc");
      if (hex(read(pkP, s.pk)) !== hex(r.pk)) throw new Error("pk mismatch");
      if (hex(read(skP, s.sk)) !== hex(r.sk)) throw new Error("sk mismatch");

      // signing randomness, then context (length byte + context bytes)
      M._randombytes(rndP, SEEDBYTES);
      M._randombytes(ctxP, 1);
      const ctxlen = M.HEAPU8[ctxP];
      M._randombytes(ctxP, ctxlen);
      // pre = (ctxlen, ctx)
      M.HEAPU8[preP] = ctxlen;
      M.HEAPU8.copyWithin(preP + 1, ctxP, ctxP + ctxlen);
      const prelen = 1 + ctxlen;

      put(mP, r.msg);
      if (sign(sigP, siglenP, mP, r.mlen, preP, prelen, rndP, skP) !== 0)
        throw new Error("sign rc");
      const siglen = M.getValue(siglenP, "i32");
      if (siglen !== r.siglen) throw new Error(`siglen ${siglen}!=${r.siglen}`);
      if (hex(read(sigP, siglen)) !== hex(r.sig)) throw new Error("sig mismatch");

      // round-trip verify
      if (verify(sigP, siglen, mP, r.mlen, preP, prelen, pkP) !== 0)
        throw new Error("verify rc");
      pass++;
    } catch (e) {
      console.error(`  FAIL haetae-${mode} #${r.count}: ${e.message}`);
      return { total: records.length, pass };
    } finally {
      for (const ptr of [
        seedP, kseedP, rndP, ctxP, preP, pkP, skP, mP, sigP, siglenP,
      ])
        M._free(ptr);
    }
  }
  return { total: records.length, pass };
}

let allOk = true;
for (const mode of Object.keys(SETS)) {
  const { total, pass } = checkSet(mode);
  const ok = pass === total && total > 0;
  allOk &&= ok;
  console.log(`haetae-${mode}: ${pass}/${total} ${ok ? "PASS" : "FAIL"}`);
}

console.log(allOk ? "\nKAT GATE: ALL PASS" : "\nKAT GATE: FAILED");
process.exit(allOk ? 0 : 1);
