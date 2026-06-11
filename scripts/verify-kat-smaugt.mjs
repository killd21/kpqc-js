// KAT gate: regenerate every official SMAUG-T Known Answer Test vector through
// the wasm module and compare byte-for-byte. Exits non-zero on any mismatch.
//
// Drives the deterministic NIST CTR-DRBG (randombytes_init) exactly as the
// reference PQCgenKAT_kem harness does, then checks pk, sk, ct and ss. The
// public API draws its randomness (d, seed, mu) from randombytes() in the same
// order as the harness's *_internal calls, so the byte streams line up:
//
//   randombytes_init(seed)   // 48-byte per-record seed
//   crypto_kem_keypair(pk, sk)
//   crypto_kem_enc(ct, ss, pk)
//   crypto_kem_dec(ss1, ct, sk); ss1 must equal ss
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import createSmaugtModule from "../packages/kpqc/wasm/smaugt.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repo = join(__dirname, "..");

const MODES = {
  mode1: { pk: 672, sk: 832, ct: 672, ss: 32 },
  mode3: { pk: 1088, sk: 1312, ct: 992, ss: 32 },
  mode5: { pk: 1440, sk: 1728, ct: 1376, ss: 32 },
  modet: { pk: 672, sk: 832, ct: 608, ss: 32 },
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
    records.push({
      count: parseInt(block, 10),
      seed: toBytes(field("seed")),
      pk: toBytes(field("pk")),
      sk: toBytes(field("sk")),
      ct: toBytes(field("ct")),
      ss: toBytes(field("ss")),
    });
  }
  return records;
}

const M = await createSmaugtModule();
const put = (ptr, b) => M.HEAPU8.set(b, ptr);
const read = (ptr, n) => M.HEAPU8.slice(ptr, ptr + n);

function checkMode(mode) {
  const s = MODES[mode];
  const ns = `_cryptolab_smaugt_${mode}_`;
  const keypair = M[ns + "keypair"];
  const enc = M[ns + "enc"];
  const dec = M[ns + "dec"];

  const rsp = readFileSync(
    join(repo, `vendor/SMAUG-T/kat/PQCkemKAT_smaugt_${mode}.rsp`),
    "utf8",
  );
  const records = parseRsp(rsp);

  let pass = 0;
  for (const r of records) {
    const seedP = M._malloc(48);
    const pkP = M._malloc(s.pk);
    const skP = M._malloc(s.sk);
    const ctP = M._malloc(s.ct);
    const ssP = M._malloc(s.ss);
    const ss1P = M._malloc(s.ss);
    try {
      put(seedP, r.seed);
      M._randombytes_init(seedP, 0, 256);

      if (keypair(pkP, skP) !== 0) throw new Error("keypair rc");
      if (hex(read(pkP, s.pk)) !== hex(r.pk)) throw new Error("pk mismatch");
      if (hex(read(skP, s.sk)) !== hex(r.sk)) throw new Error("sk mismatch");

      if (enc(ctP, ssP, pkP) !== 0) throw new Error("enc rc");
      if (hex(read(ctP, s.ct)) !== hex(r.ct)) throw new Error("ct mismatch");
      if (hex(read(ssP, s.ss)) !== hex(r.ss)) throw new Error("ss mismatch");

      // round-trip decapsulation
      if (dec(ss1P, ctP, skP) !== 0) throw new Error("dec rc");
      if (hex(read(ss1P, s.ss)) !== hex(r.ss)) throw new Error("dec ss mismatch");
      pass++;
    } catch (e) {
      console.error(`  FAIL smaugt_${mode} #${r.count}: ${e.message}`);
      return { total: records.length, pass };
    } finally {
      for (const ptr of [seedP, pkP, skP, ctP, ssP, ss1P]) M._free(ptr);
    }
  }
  return { total: records.length, pass };
}

let allOk = true;
for (const mode of Object.keys(MODES)) {
  const { total, pass } = checkMode(mode);
  const ok = pass === total && total > 0;
  allOk &&= ok;
  console.log(`smaugt_${mode}: ${pass}/${total} ${ok ? "PASS" : "FAIL"}`);
}

console.log(allOk ? "\nKAT GATE: ALL PASS" : "\nKAT GATE: FAILED");
process.exit(allOk ? 0 : 1);
