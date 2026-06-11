// KAT gate: regenerate every official NTRU+ Known Answer Test vector through
// the wasm module and compare byte-for-byte. Exits non-zero on any mismatch.
//
// Drives the deterministic NIST CTR-DRBG (randombytes_init) exactly as the
// reference PQCgenKAT_kem harness does, then checks pk, sk, ct and ss:
//
//   randombytes_init(seed)   // 48-byte per-record seed
//   crypto_kem_keypair(pk, sk)
//   crypto_kem_enc(ct, ss, pk)
//   crypto_kem_dec(ss1, ct, sk); ss1 must equal ss
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import createNtruplusModule from "../packages/kpqc/wasm/ntruplus.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repo = join(__dirname, "..");

const SETS = {
  768: { pk: 1152, sk: 2336, ct: 1152, ss: 32 },
  864: { pk: 1296, sk: 2624, ct: 1296, ss: 32 },
  1152: { pk: 1728, sk: 3488, ct: 1728, ss: 32 },
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

const M = await createNtruplusModule();
const put = (ptr, b) => M.HEAPU8.set(b, ptr);
const read = (ptr, n) => M.HEAPU8.slice(ptr, ptr + n);

function checkSet(set) {
  const s = SETS[set];
  const ns = `_ntruplus${set}_`;
  const keypair = M[ns + "crypto_kem_keypair"];
  const enc = M[ns + "crypto_kem_enc"];
  const dec = M[ns + "crypto_kem_dec"];

  const rsp = readFileSync(
    join(repo, `vendor/NTRUplus/KAT/NTRU+${set}/PQCkemKAT_${s.sk}.rsp`),
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
      console.error(`  FAIL ntruplus${set} #${r.count}: ${e.message}`);
      return { total: records.length, pass };
    } finally {
      for (const ptr of [seedP, pkP, skP, ctP, ssP, ss1P]) M._free(ptr);
    }
  }
  return { total: records.length, pass };
}

let allOk = true;
for (const set of Object.keys(SETS)) {
  const { total, pass } = checkSet(set);
  const ok = pass === total && total > 0;
  allOk &&= ok;
  console.log(`ntruplus${set}: ${pass}/${total} ${ok ? "PASS" : "FAIL"}`);
}

console.log(allOk ? "\nKAT GATE: ALL PASS" : "\nKAT GATE: FAILED");
process.exit(allOk ? 0 : 1);
