/**
 * Writes the secrets file for `cf deploy --secrets-file`, so a first deploy needs no manual
 * secret setup. Writes nothing when there is nothing to upload (the file is then absent). Run by `.github/workflows/cloudflare.yml` before every deploy:
 *
 *   deno run -A web/server/cf_secrets.ts <out.json>
 *
 * - `RP_SIGNING_KEY_JWK` — generated when the Worker does not have it yet (a new Worker, or one
 *   deployed before this existed), and left out otherwise, so a deploy never rotates the key. A
 *   deploy keeps the secrets it is not given. Rotate with the `rp-signing-key` workflow.
 * - `TURSO_AUTH_TOKEN` — copied from the env (the repo secret) when set. [feature:turso]
 *
 * Which secrets the Worker has is read from the Cloudflare API with `CLOUDFLARE_API_TOKEN`; the
 * account and Worker come from `cloudflare.config.ts`. Values are never printed, only names.
 */

import config from "../../cloudflare.config.ts";
import { generatePrivateJwk } from "./lib/signing-key.ts"; // [feature:server-send]

/** Names of the secrets the Worker has; empty when the Worker does not exist yet. */
export async function existingSecrets(
  accountId: string,
  worker: string,
  token: string,
): Promise<Set<string>> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${worker}/secrets`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (res.status === 404) {
    await res.body?.cancel();
    return new Set();
  }
  const body = await res.json() as {
    success: boolean;
    errors?: unknown[];
    result?: { name: string }[];
  };
  if (!res.ok || !body.success) {
    throw new Error(
      `Listing secrets of ${worker} failed (${res.status}): ${
        JSON.stringify(body.errors)
      }`,
    );
  }
  return new Set((body.result ?? []).map((s) => s.name));
}

/** The secrets to upload, given the ones the Worker already has and the env. */
export async function secretsToUpload(
  have: ReadonlySet<string>,
  env: { TURSO_AUTH_TOKEN?: string },
): Promise<Record<string, string>> {
  const secrets: Record<string, string> = {};
  // [feature:server-send]
  if (!have.has("RP_SIGNING_KEY_JWK")) {
    secrets.RP_SIGNING_KEY_JWK = await generatePrivateJwk();
  }
  if (env.TURSO_AUTH_TOKEN) secrets.TURSO_AUTH_TOKEN = env.TURSO_AUTH_TOKEN; // [feature:turso]
  return secrets;
}

if (import.meta.main) {
  const out = Deno.args[0];
  if (!out) throw new Error("usage: cf_secrets.ts <out.json>");
  const token = Deno.env.get("CLOUDFLARE_API_TOKEN");
  if (!token) throw new Error("CLOUDFLARE_API_TOKEN is not set");

  const { accountId, worker } = config as {
    accountId: string;
    worker: { name: string };
  };
  const have = await existingSecrets(accountId, worker.name, token);
  const secrets = await secretsToUpload(have, {
    TURSO_AUTH_TOKEN: Deno.env.get("TURSO_AUTH_TOKEN"),
  });
  if (Object.keys(secrets).length > 0) {
    await Deno.writeTextFile(out, JSON.stringify(secrets), { mode: 0o600 });
  }
  console.log(
    `Worker ${worker.name}: has ${[...have].join(", ") || "no secrets"}; ` +
      `uploading ${Object.keys(secrets).join(", ") || "nothing"}.`,
  );
}
