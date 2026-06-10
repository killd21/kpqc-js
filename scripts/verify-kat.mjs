// KAT gate: regenerate every official AIMer Known Answer Test vector through the
// wasm module and compare byte-for-byte. Exits non-zero on any mismatch.
//
// Drives the deterministic NIST CTR-DRBG (randombytes_init) exactly as the
// reference PQCgenKAT_sign harness does, then checks pk, sk, smlen and sm.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import createAimerModule from "../packages/aimer/wasm/aimer.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repo = join(__dirname, "..");

const SETS = {
  "128f": { kat: 48, pk: 32, sk: 48, sig: 5888 },
  "128s": { kat: 48, pk: 32, sk: 48, sig: 4160 },
  "192f": { kat: 72, pk: 48, sk: 72, sig: 13056 },
  "192s": { kat: 72, pk: 48, sk: 72, sig: 9120 },
  "256f": { kat: 96, pk: 64, sk: 96, sig: 25120 },
  "256s": { kat: 96, pk: 64, sk: 96, sig: 17056 },
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
    const num = (k) => parseInt(block.match(new RegExp(`^${k} = (\\d+)`, "m"))[1], 10);
    records.push({
      count: parseInt(block, 10),
      seed: toBytes(field("seed")),
      mlen: num("mlen"),
      msg: toBytes(field("msg")),
      pk: toBytes(field("pk")),
      sk: toBytes(field("sk")),
      smlen: num("smlen"),
      sm: toBytes(field("sm")),
    });
  }
  return records;
}

const M = await createAimerModule();
const put = (ptr, b) => M.HEAPU8.set(b, ptr);
const read = (ptr, n) => M.HEAPU8.slice(ptr, ptr + n);

function checkSet(p) {
  const s = SETS[p];
  const ns = `_samsungsds_aimer_${p}_ref_`;
  const keypair = M[ns + "crypto_sign_keypair"];
  const sign = M[ns + "crypto_sign"];
  const open = M[ns + "crypto_sign_open"];

  const rsp = readFileSync(
    join(repo, `vendor/AIMer/KAT/aimer-${p}/PQCsignKAT_${s.kat}.rsp`),
    "utf8",
  );
  const records = parseRsp(rsp);

  let pass = 0;
  for (const r of records) {
    const seedP = M._malloc(48);
    const pkP = M._malloc(s.pk);
    const skP = M._malloc(s.sk);
    const mP = M._malloc(r.mlen || 1);
    const smP = M._malloc(r.mlen + s.sig);
    const smlenP = M._malloc(4);
    const m2P = M._malloc(r.mlen + s.sig);
    const mlen2P = M._malloc(4);
    try {
      put(seedP, r.seed);
      M._randombytes_init(seedP, 0, 256);
      if (keypair(pkP, skP) !== 0) throw new Error("keypair rc");
      if (hex(read(pkP, s.pk)) !== hex(r.pk)) throw new Error("pk mismatch");
      if (hex(read(skP, s.sk)) !== hex(r.sk)) throw new Error("sk mismatch");

      put(mP, r.msg);
      if (sign(smP, smlenP, mP, r.mlen, 0, 0, skP) !== 0) throw new Error("sign rc");
      const smlen = M.getValue(smlenP, "i32");
      if (smlen !== r.smlen) throw new Error(`smlen ${smlen}!=${r.smlen}`);
      if (hex(read(smP, smlen)) !== hex(r.sm)) throw new Error("sm mismatch");

      // round-trip
      if (open(m2P, mlen2P, smP, smlen, 0, 0, pkP) !== 0) throw new Error("open rc");
      if (M.getValue(mlen2P, "i32") !== r.mlen) throw new Error("open mlen");
      pass++;
    } catch (e) {
      console.error(`  FAIL aimer-${p} #${r.count}: ${e.message}`);
      return { total: records.length, pass };
    } finally {
      for (const ptr of [seedP, pkP, skP, mP, smP, smlenP, m2P, mlen2P]) M._free(ptr);
    }
  }
  return { total: records.length, pass };
}

let allOk = true;
for (const p of Object.keys(SETS)) {
  const { total, pass } = checkSet(p);
  const ok = pass === total && total > 0;
  allOk &&= ok;
  console.log(`aimer-${p}: ${pass}/${total} ${ok ? "PASS" : "FAIL"}`);
}

console.log(allOk ? "\nKAT GATE: ALL PASS" : "\nKAT GATE: FAILED");
process.exit(allOk ? 0 : 1);
