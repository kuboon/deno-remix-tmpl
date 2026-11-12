/**
 * Prints a fresh ES256 private JWK (one line of JSON) for `RP_SIGNING_KEY_JWK`.
 *
 * `deno task gen:signing-key` locally, or the `rp-signing-key` workflow, which pipes the output
 * straight into the Worker secret without logging it. The public half (and its `kid`) is derived
 * at runtime by `lib/signing-key.ts`, so only the private JWK is stored.
 */

import { exportJWK, generateKeyPair } from "jose";

const { privateKey } = await generateKeyPair("ES256", { extractable: true });
console.log(JSON.stringify(await exportJWK(privateKey)));
