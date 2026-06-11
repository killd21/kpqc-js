// SPDX-License-Identifier: MIT
//
// RNG shim for the WebAssembly build of AIMer.
//
// AIMer's reference code calls randombytes() / randombytes_init(). The original
// rng.c implements only the NIST AES-256 CTR-DRBG, which is deterministic and
// exists solely to reproduce the Known Answer Tests (KAT). For a real library we
// also need a cryptographically secure source. This shim provides BOTH and lets
// the JS wrapper switch between them:
//
//   * Secure mode (default): randombytes() defers to aimer_js_random_fill(),
//     which is provided by csrc/randombytes.lib.js (WebCrypto / Node crypto).
//   * DRBG mode: randombytes_init(seed, NULL, 256) switches to the deterministic
//     NIST CTR-DRBG so we can regenerate and verify the official KAT vectors.
//
// The DRBG implementation below is a faithful copy of the reference rng.c so the
// KAT bytes match exactly. This file replaces common/rng.c in the wasm build.

#include <string.h>
#include <stddef.h>
#include <emscripten.h>
#include "aes.h"

// Provided by the Emscripten JS library (csrc/randombytes.lib.js). Fills
// [x, x + xlen) with cryptographically secure random bytes.
extern void aimer_js_random_fill(unsigned char *x, size_t xlen);

typedef struct {
  unsigned char Key[32];
  unsigned char V[16];
  int reseed_counter;
} drbg_state;

static drbg_state DRBG_ctx;
static int g_use_drbg = 0; // 0 = secure (JS), 1 = deterministic DRBG

static void AES256_ECB(unsigned char *key, unsigned char *ctr,
                       unsigned char *buffer) {
  aes256ctx ctx;
  aes256_ecb_keyexp(&ctx, key);
  aes256_ecb(buffer, ctr, 1, &ctx);
  aes256_ctx_release(&ctx);
}

static void AES256_CTR_DRBG_Update(unsigned char *provided_data,
                                   unsigned char *Key, unsigned char *V) {
  unsigned char temp[48];

  for (int i = 0; i < 3; i++) {
    for (int j = 15; j >= 0; j--) {
      if (V[j] == 0xff)
        V[j] = 0x00;
      else {
        V[j]++;
        break;
      }
    }
    AES256_ECB(Key, V, temp + 16 * i);
  }
  if (provided_data != NULL)
    for (int i = 0; i < 48; i++)
      temp[i] ^= provided_data[i];
  memcpy(Key, temp, 32);
  memcpy(V, temp + 32, 16);
}

// Switch to deterministic DRBG mode (KAT reproduction).
EMSCRIPTEN_KEEPALIVE
void randombytes_init(unsigned char *entropy_input,
                      unsigned char *personalization_string,
                      int security_strength) {
  (void)security_strength;
  unsigned char seed_material[48];

  memcpy(seed_material, entropy_input, 48);
  if (personalization_string)
    for (int i = 0; i < 48; i++)
      seed_material[i] ^= personalization_string[i];
  memset(DRBG_ctx.Key, 0x00, 32);
  memset(DRBG_ctx.V, 0x00, 16);
  AES256_CTR_DRBG_Update(seed_material, DRBG_ctx.Key, DRBG_ctx.V);
  DRBG_ctx.reseed_counter = 1;
  g_use_drbg = 1;
}

// Switch back to the secure (JS-provided) RNG. This is the default for normal
// keygen/signing use.
EMSCRIPTEN_KEEPALIVE
void aimer_use_secure_rng(void) { g_use_drbg = 0; }

int randombytes(unsigned char *x, unsigned long long xlen) {
  if (!g_use_drbg) {
    aimer_js_random_fill(x, (size_t)xlen);
    return 0;
  }

  unsigned char block[16];
  int i = 0;

  while (xlen > 0) {
    for (int j = 15; j >= 0; j--) {
      if (DRBG_ctx.V[j] == 0xff)
        DRBG_ctx.V[j] = 0x00;
      else {
        DRBG_ctx.V[j]++;
        break;
      }
    }
    AES256_ECB(DRBG_ctx.Key, DRBG_ctx.V, block);
    if (xlen > 15) {
      memcpy(x + i, block, 16);
      i += 16;
      xlen -= 16;
    } else {
      memcpy(x + i, block, (size_t)xlen);
      xlen = 0;
    }
  }
  AES256_CTR_DRBG_Update(NULL, DRBG_ctx.Key, DRBG_ctx.V);
  DRBG_ctx.reseed_counter++;
  return 0;
}
