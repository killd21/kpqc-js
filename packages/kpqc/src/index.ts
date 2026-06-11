// @killd21/kpqc — KpqC (Korean Post-Quantum Cryptography) for JavaScript &
// TypeScript: the AIMer and HAETAE signature schemes and the NTRU+ KEM,
// compiled to WebAssembly. Works in Node.js and browsers.
//
// Root entry: everything re-exported under one roof. Per-algorithm subpath
// entries are also available and are drop-in replacements for the former
// standalone packages:
//
//   import { aimer128f }    from "@killd21/kpqc/aimer";
//   import { haetae2 }      from "@killd21/kpqc/haetae";
//   import { ntruplus768 }  from "@killd21/kpqc/ntruplus";
//
// Each wasm module is loaded lazily on first use, so importing the root entry
// does not pull in algorithms you never call.

export type {
  Encapsulation,
  KemScheme,
  KeyPair,
  SignatureScheme,
  SignOptions,
} from "./types.js";

export {
  aimer,
  aimer128f,
  aimer128s,
  aimer192f,
  aimer192s,
  aimer256f,
  aimer256s,
  PARAMETER_SETS as AIMER_PARAMETER_SETS,
  type ParameterSet as AimerParameterSet,
} from "./aimer.js";

export {
  haetae,
  haetae2,
  haetae3,
  haetae5,
  PARAMETER_SETS as HAETAE_PARAMETER_SETS,
  type ParameterSet as HaetaeParameterSet,
} from "./haetae.js";

export {
  ntruplus,
  ntruplus768,
  ntruplus864,
  ntruplus1152,
  PARAMETER_SETS as NTRUPLUS_PARAMETER_SETS,
  type ParameterSet as NtruplusParameterSet,
} from "./ntruplus.js";
