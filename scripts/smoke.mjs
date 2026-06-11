// Quick correctness smoke test for the freshly built wasm module.
// 1) secure-mode keygen/sign/open round trip
// 2) first KAT vector (aimer-128f) byte-for-byte check
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import createAimerModule from "../packages/kpqc/wasm/aimer.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repo = join(__dirname, "..");

const M = await createAimerModule();
const NS = "_samsungsds_aimer_128f_ref_";
const keypair = M[NS + "crypto_sign_keypair"];
const sign = M[NS + "crypto_sign"];
const open = M[NS + "crypto_sign_open"];

const PK = 32, SK = 48, SIG = 5888;

function withMem(sizes, fn) {
  const ptrs = sizes.map((s) => M._malloc(s));
  try {
    return fn(...ptrs);
  } finally {
    ptrs.forEach((p) => M._free(p));
  }
}
const put = (ptr, bytes) => M.HEAPU8.set(bytes, ptr);
const get = (ptr, len) => M.HEAPU8.slice(ptr, ptr + len);
const hex = (b) => Buffer.from(b).toString("hex").toUpperCase();

// ---- 1) secure-mode round trip ----
M._aimer_use_secure_rng();
{
  const msg = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const mlen = msg.length;
  const ok = withMem([PK, SK, mlen + SIG, mlen, 4, mlen + SIG, 4], (pk, sk, sm, m, smlen, m2, mlen2) => {
    keypair(pk, sk);
    put(m, msg);
    sign(sm, smlen, m, mlen, 0, 0, sk);
    const smLen = M.getValue(smlen, "i32");
    const r = open(m2, mlen2, sm, smLen, 0, 0, pk);
    const outLen = M.getValue(mlen2, "i32");
    const recovered = get(m2, outLen);
    return r === 0 && outLen === mlen && hex(recovered) === hex(msg);
  });
  console.log(`[secure round-trip 128f] ${ok ? "PASS" : "FAIL"}`);
  if (!ok) process.exit(1);
}

// ---- 2) first KAT vector ----
function parseFirst(rsp) {
  const get1 = (key) => {
    const m = rsp.match(new RegExp(`^${key} = ([0-9A-Fa-f]*)`, "m"));
    return m ? m[1] : null;
  };
  const mlen = parseInt(rsp.match(/^mlen = (\d+)/m)[1], 10);
  const smlen = parseInt(rsp.match(/^smlen = (\d+)/m)[1], 10);
  const toB = (h) => Uint8Array.from(Buffer.from(h, "hex"));
  return {
    seed: toB(get1("seed")), mlen, msg: toB(get1("msg")),
    pk: toB(get1("pk")), sk: toB(get1("sk")), smlen, sm: toB(get1("sm")),
  };
}
{
  const rsp = readFileSync(join(repo, "vendor/AIMer/KAT/aimer-128f/PQCsignKAT_48.rsp"), "utf8");
  const v = parseFirst(rsp);
  const res = withMem([48, PK, SK, v.mlen, v.mlen + SIG, 4], (seedP, pk, sk, m, sm, smlen) => {
    put(seedP, v.seed);
    M._randombytes_init(seedP, 0, 256); // deterministic DRBG mode
    keypair(pk, sk);
    const gpk = get(pk, PK), gsk = get(sk, SK);
    put(m, v.msg);
    sign(sm, smlen, m, v.mlen, 0, 0, sk);
    const gsmlen = M.getValue(smlen, "i32");
    const gsm = get(sm, gsmlen);
    return {
      pk: hex(gpk) === hex(v.pk),
      sk: hex(gsk) === hex(v.sk),
      smlen: gsmlen === v.smlen,
      sm: hex(gsm) === hex(v.sm),
    };
  });
  console.log(`[KAT 128f #0] pk=${res.pk} sk=${res.sk} smlen=${res.smlen} sm=${res.sm}`);
  if (!(res.pk && res.sk && res.smlen && res.sm)) process.exit(1);
}
console.log("\nALL SMOKE CHECKS PASSED");
