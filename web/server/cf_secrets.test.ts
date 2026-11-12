import { assert, assertEquals } from "@std/assert";
import { existingSecrets, secretsToUpload } from "./cf_secrets.ts";

Deno.test("a new Worker gets a generated signing key", async () => {
  const secrets = await secretsToUpload(new Set(), {});
  assertEquals(Object.keys(secrets), ["RP_SIGNING_KEY_JWK"]);
  const jwk = JSON.parse(secrets.RP_SIGNING_KEY_JWK);
  assertEquals([jwk.kty, jwk.crv], ["EC", "P-256"]);
  assert(jwk.d, "a private JWK");
});

Deno.test("an existing signing key is never rotated by a deploy", async () => {
  const secrets = await secretsToUpload(new Set(["RP_SIGNING_KEY_JWK"]), {});
  assertEquals(secrets, {});
});

Deno.test("TURSO_AUTH_TOKEN is uploaded from the env when set", async () => {
  const secrets = await secretsToUpload(new Set(["RP_SIGNING_KEY_JWK"]), {
    TURSO_AUTH_TOKEN: "t",
  });
  assertEquals(secrets, { TURSO_AUTH_TOKEN: "t" });
});

Deno.test("existingSecrets: a missing Worker has none, an API error throws", async () => {
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = () =>
      Promise.resolve(new Response("{}", { status: 404 }));
    assertEquals((await existingSecrets("a", "w", "t")).size, 0);

    globalThis.fetch = () =>
      Promise.resolve(Response.json({
        success: true,
        result: [{ name: "RP_SIGNING_KEY_JWK", type: "secret_text" }],
      }));
    assertEquals([...await existingSecrets("a", "w", "t")], [
      "RP_SIGNING_KEY_JWK",
    ]);

    globalThis.fetch = () =>
      Promise.resolve(
        Response.json({ success: false, errors: [{ code: 10000 }] }, {
          status: 403,
        }),
      );
    let threw = false;
    try {
      await existingSecrets("a", "w", "t");
    } catch {
      threw = true;
    }
    assert(threw);
  } finally {
    globalThis.fetch = realFetch;
  }
});
