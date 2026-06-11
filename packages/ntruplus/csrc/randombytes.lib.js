// SPDX-License-Identifier: MIT
//
// Emscripten JS library that backs the secure-mode randombytes() in
// csrc/randombytes.c. Linked via `emcc --js-library`.
//
// It fills a region of the wasm heap with cryptographically secure random bytes,
// using the Web Crypto API in browsers / modern Node, and falling back to the
// Node `crypto` module otherwise.

mergeInto(LibraryManager.library, {
  ntruplus_js_random_fill: function (ptr, len) {
    var view = HEAPU8.subarray(ptr, ptr + len);
    var g = typeof globalThis !== "undefined" ? globalThis : this;

    if (g.crypto && typeof g.crypto.getRandomValues === "function") {
      // getRandomValues rejects requests larger than 65536 bytes; chunk it.
      var off = 0;
      while (off < len) {
        var n = Math.min(65536, len - off);
        g.crypto.getRandomValues(view.subarray(off, off + n));
        off += n;
      }
      return;
    }

    // Node.js without a global WebCrypto (older runtimes).
    var nodeCrypto = require("crypto");
    var buf = nodeCrypto.randomBytes(len);
    view.set(buf);
  },
});
